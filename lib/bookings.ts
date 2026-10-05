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
  | { ok: false; error: StayError | "missing_name" | "bad_guests" | "dates_taken"; clash?: Booking };

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

export function createBooking(
  db: DatabaseSync,
  input: NewBooking,
  today: string,
): CreateResult {
  const kind: Kind = input.kind === "blocked" ? "blocked" : "stay";
  const stay = {
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    // Blocked dates cover whole days.
    checkInTime: kind === "blocked" ? "00:00" : (input.checkInTime ?? DEFAULT_CHECK_IN),
    checkOutTime: kind === "blocked" ? "23:59" : (input.checkOutTime ?? DEFAULT_CHECK_OUT),
  };
  const stayError = validateStay(stay, today);
  if (stayError) return { ok: false, error: stayError };
  const { checkIn, checkOut, checkInTime, checkOutTime } = stay as Stay;

  const name = typeof input.name === "string" ? input.name.trim().slice(0, 80) : "";
  if (!name) return { ok: false, error: "missing_name" };

  const guests = kind === "blocked" ? 0 : Number(input.guests ?? 1);
  if (kind === "stay" && (!Number.isInteger(guests) || guests < 1 || guests > 30)) {
    return { ok: false, error: "bad_guests" };
  }
  const note = typeof input.note === "string" ? input.note.trim().slice(0, 500) : "";

  const booking: Booking = {
    id: randomUUID(),
    kind,
    checkIn,
    checkInTime,
    checkOut,
    checkOutTime,
    name,
    guests,
    note,
    createdAt: new Date().toISOString(),
  };
  const cancelCode = kind === "stay" ? newCancelCode() : null;

  // BEGIN IMMEDIATE takes SQLite's write lock up front, so no other booking
  // can be written between the overlap check and the insert.
  db.exec("BEGIN IMMEDIATE");
  try {
    const clash = db
      .prepare(
        `SELECT ${COLUMNS} FROM bookings
          WHERE check_in || 'T' || check_in_time < ?
            AND ? < check_out || 'T' || check_out_time
          LIMIT 1`,
      )
      .get(`${checkOut}T${checkOutTime}`, `${checkIn}T${checkInTime}`) as Row | undefined;
    if (clash) {
      db.exec("ROLLBACK");
      return { ok: false, error: "dates_taken", clash: toBooking(clash) };
    }
    db.prepare(
      `INSERT INTO bookings (id, kind, check_in, check_in_time, check_out, check_out_time, name, guests, note, cancel_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      booking.id, kind, checkIn, checkInTime, checkOut, checkOutTime, name, guests, note,
      cancelCode ? hash(cancelCode) : null, booking.createdAt,
    );
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  return { ok: true, booking, cancelCode };
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
  if (!("admin" in auth)) {
    const given = Buffer.from(hash(auth.code.trim().toUpperCase()));
    const stored = Buffer.from(row.cancel_hash ?? "");
    if (given.length !== stored.length || !timingSafeEqual(given, stored)) {
      return "wrong_code";
    }
  }
  db.prepare("DELETE FROM bookings WHERE id = ?").run(id);
  return "cancelled";
}
