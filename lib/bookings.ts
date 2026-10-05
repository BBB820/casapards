import type { DatabaseSync } from "node:sqlite";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { nightsOf, validateRange, type RangeError } from "./dates.ts";

export type Kind = "stay" | "blocked";

export type Booking = {
  id: string;
  kind: Kind;
  checkIn: string;
  checkOut: string;
  name: string;
  guests: number;
  note: string;
  createdAt: string;
};

export type NewBooking = {
  kind?: Kind;
  checkIn: unknown;
  checkOut: unknown;
  name: unknown;
  guests?: unknown;
  note?: unknown;
};

export type CreateResult =
  | { ok: true; booking: Booking; cancelCode: string | null }
  | { ok: false; error: RangeError | "missing_name" | "bad_guests" | "dates_taken" };

type Row = {
  id: string;
  kind: Kind;
  check_in: string;
  check_out: string;
  name: string;
  guests: number;
  note: string;
  created_at: string;
};

const toBooking = (r: Row): Booking => ({
  id: r.id,
  kind: r.kind,
  checkIn: r.check_in,
  checkOut: r.check_out,
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

/** Bookings that end on or after `from`, earliest first. */
export function listBookings(db: DatabaseSync, from: string): Booking[] {
  const rows = db
    .prepare(
      `SELECT id, kind, check_in, check_out, name, guests, note, created_at
         FROM bookings WHERE check_out > ? ORDER BY check_in`,
    )
    .all(from) as unknown as Row[];
  return rows.map(toBooking);
}

export function createBooking(
  db: DatabaseSync,
  input: NewBooking,
  today: string,
): CreateResult {
  const kind: Kind = input.kind === "blocked" ? "blocked" : "stay";
  const rangeError = validateRange(input.checkIn, input.checkOut, today);
  if (rangeError) return { ok: false, error: rangeError };
  const checkIn = input.checkIn as string;
  const checkOut = input.checkOut as string;

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
    checkOut,
    name,
    guests,
    note,
    createdAt: new Date().toISOString(),
  };
  const cancelCode = kind === "stay" ? newCancelCode() : null;

  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(
      `INSERT INTO bookings (id, kind, check_in, check_out, name, guests, note, cancel_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      booking.id, kind, checkIn, checkOut, name, guests, note,
      cancelCode ? hash(cancelCode) : null, booking.createdAt,
    );
    const claim = db.prepare("INSERT INTO booking_nights (night, booking_id) VALUES (?, ?)");
    for (const night of nightsOf(checkIn, checkOut)) claim.run(night, booking.id);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    if (err instanceof Error && /UNIQUE constraint failed: booking_nights/.test(err.message)) {
      return { ok: false, error: "dates_taken" };
    }
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
