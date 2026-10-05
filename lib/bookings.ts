import type { DatabaseSync } from "node:sqlite";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import {
  DEFAULT_CHECK_IN, DEFAULT_CHECK_OUT, validateStay, type Stay, type StayError,
} from "./dates.ts";

export type Kind = "stay" | "blocked";

export type Booking = Stay & {
  id: string;
  kind: Kind;
  name: string;
  guests: number;
  note: string;
  createdAt: string;
};

export type NewBooking = {
  kind?: Kind;
  checkIn: unknown;
  checkInTime?: unknown;
  checkOut: unknown;
  checkOutTime?: unknown;
  name: unknown;
  guests?: unknown;
  note?: unknown;
};

export type CreateResult =
  | { ok: true; booking: Booking; cancelCode: string | null }
  | { ok: false; error: FieldError | "dates_taken"; clash?: Booking };

type Row = {
  id: string;
  kind: Kind;
  check_in: string;
  check_in_time: string;
  check_out: string;
  check_out_time: string;
  name: string;
  guests: number;
  note: string;
  created_at: string;
};

const COLUMNS =
  "id, kind, check_in, check_in_time, check_out, check_out_time, name, guests, note, created_at";

const toBooking = (r: Row): Booking => ({
  id: r.id,
  kind: r.kind,
  checkIn: r.check_in,
  checkInTime: r.check_in_time,
  checkOut: r.check_out,
  checkOutTime: r.check_out_time,
  name: r.name,
  guests: r.guests,
  note: r.note,
  createdAt: r.created_at,
});

const hash = (code: string) => createHash("sha256").update(code).digest("hex");

/** Short, readable code a guest uses to cancel their own stay. */
function newCancelCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return Array.from(randomBytes(6), (b) => alphabet[b % alphabet.length]).join("");
}

/** Bookings whose check-out day is today or later, earliest first. */
export function listBookings(db: DatabaseSync, from: string): Booking[] {
  const rows = db
    .prepare(`SELECT ${COLUMNS} FROM bookings WHERE check_out >= ? ORDER BY check_in, check_in_time`)
    .all(from) as unknown as Row[];
  return rows.map(toBooking);
}

type Fields = Omit<Booking, "id" | "createdAt">;
type FieldError = StayError | "missing_name" | "bad_guests";

/** Validate and clean booking input. `kind` decides the rules (blocked = whole days). */
function cleanFields(input: NewBooking, kind: Kind, today: string): { ok: true; fields: Fields } | { ok: false; error: FieldError } {
  const stay = {
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    // Blocked dates cover whole days.
    checkInTime: kind === "blocked" ? "00:00" : (input.checkInTime ?? DEFAULT_CHECK_IN),
    checkOutTime: kind === "blocked" ? "23:59" : (input.checkOutTime ?? DEFAULT_CHECK_OUT),
  };
  const stayError = validateStay(stay, today);
  if (stayError) return { ok: false, error: stayError };

  const name = typeof input.name === "string" ? input.name.trim().slice(0, 80) : "";
  if (!name) return { ok: false, error: "missing_name" };

  const guests = kind === "blocked" ? 0 : Number(input.guests ?? 1);
  if (kind === "stay" && (!Number.isInteger(guests) || guests < 1 || guests > 30)) {
    return { ok: false, error: "bad_guests" };
  }
  const note = typeof input.note === "string" ? input.note.trim().slice(0, 500) : "";
  return { ok: true, fields: { kind, ...(stay as Stay), name, guests, note } };
}

/** Another booking (not `exceptId`) whose time span overlaps `s`, if any. Call inside a write transaction. */
function findClash(db: DatabaseSync, s: Stay, exceptId: string | null): Booking | null {
  const row = db
    .prepare(
      `SELECT ${COLUMNS} FROM bookings
        WHERE check_in || 'T' || check_in_time < ?
          AND ? < check_out || 'T' || check_out_time
          AND id IS NOT ?
        LIMIT 1`,
    )
    .get(`${s.checkOut}T${s.checkOutTime}`, `${s.checkIn}T${s.checkInTime}`, exceptId) as Row | undefined;
  return row ? toBooking(row) : null;
}

/** Run `fn` holding SQLite's write lock, so overlap checks and writes can't interleave. */
function withWriteLock<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function createBooking(
  db: DatabaseSync,
  input: NewBooking,
  today: string,
): CreateResult {
  const kind: Kind = input.kind === "blocked" ? "blocked" : "stay";
  const cleaned = cleanFields(input, kind, today);
  if (!cleaned.ok) return cleaned;
  const booking: Booking = { id: randomUUID(), ...cleaned.fields, createdAt: new Date().toISOString() };
  const cancelCode = kind === "stay" ? newCancelCode() : null;

  return withWriteLock(db, (): CreateResult => {
    const clash = findClash(db, booking, null);
    if (clash) return { ok: false, error: "dates_taken", clash };
    db.prepare(
      `INSERT INTO bookings (id, kind, check_in, check_in_time, check_out, check_out_time, name, guests, note, cancel_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      booking.id, kind, booking.checkIn, booking.checkInTime, booking.checkOut, booking.checkOutTime,
      booking.name, booking.guests, booking.note, cancelCode ? hash(cancelCode) : null, booking.createdAt,
    );
    return { ok: true, booking, cancelCode };
  });
}

export type UpdateResult =
  | { ok: true; booking: Booking }
  | { ok: false; error: FieldError | "dates_taken" | "not_found" | "wrong_code"; clash?: Booking };

function checkAuth(row: { cancel_hash: string | null }, auth: { admin: true } | { code: string }): boolean {
  if ("admin" in auth) return true;
  const given = Buffer.from(hash(auth.code.trim().toUpperCase()));
  const stored = Buffer.from(row.cancel_hash ?? "");
  return given.length === stored.length && timingSafeEqual(given, stored);
}

/**
 * Change a booking's dates, times, name, guests or note. Same rules as
 * creating one, except it may overlap its own old dates, and a stay that
 * has already started can still be edited (e.g. to leave later).
 */
export function updateBooking(
  db: DatabaseSync,
  id: string,
  input: Partial<NewBooking>,
  auth: { admin: true } | { code: string },
  today: string,
): UpdateResult {
  return withWriteLock(db, (): UpdateResult => {
    const row = db.prepare(`SELECT ${COLUMNS}, cancel_hash FROM bookings WHERE id = ?`).get(id) as
      | (Row & { cancel_hash: string | null })
      | undefined;
    if (!row) return { ok: false, error: "not_found" };
    if (!checkAuth(row, auth)) return { ok: false, error: "wrong_code" };
    const current = toBooking(row);
    const merged: NewBooking = {
      checkIn: input.checkIn ?? current.checkIn,
      checkInTime: input.checkInTime ?? current.checkInTime,
      checkOut: input.checkOut ?? current.checkOut,
      checkOutTime: input.checkOutTime ?? current.checkOutTime,
      name: input.name ?? current.name,
      guests: input.guests ?? current.guests,
      note: input.note ?? current.note,
    };
    const startedAlready = merged.checkIn === current.checkIn && current.checkIn < today;
    const cleaned = cleanFields(merged, current.kind, startedAlready ? current.checkIn : today);
    if (!cleaned.ok) return cleaned;
    const f = cleaned.fields;
    const clash = findClash(db, f, id);
    if (clash) return { ok: false, error: "dates_taken", clash };
    db.prepare(
      `UPDATE bookings SET check_in = ?, check_in_time = ?, check_out = ?, check_out_time = ?, name = ?, guests = ?, note = ?
        WHERE id = ?`,
    ).run(f.checkIn, f.checkInTime, f.checkOut, f.checkOutTime, f.name, f.guests, f.note, id);
    return { ok: true, booking: { ...current, ...f } };
  });
}

/**
 * Cancel a booking. Admins can cancel anything; everyone else needs the
 * cancel code they were shown when they booked.
 */
export function cancelBooking(
  db: DatabaseSync,
  id: string,
  auth: { admin: true } | { code: string },
): "cancelled" | "not_found" | "wrong_code" {
  const row = db
    .prepare("SELECT cancel_hash FROM bookings WHERE id = ?")
    .get(id) as { cancel_hash: string | null } | undefined;
  if (!row) return "not_found";
  if (!checkAuth(row, auth)) return "wrong_code";
  db.prepare("DELETE FROM bookings WHERE id = ?").run(id);
  return "cancelled";
}
