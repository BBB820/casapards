import { test } from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../lib/db.ts";
import { cancelBooking, createBooking, listBookings } from "../lib/bookings.ts";

const today = "2026-10-05";
const stay = (checkIn: string, checkOut: string, name = "Lopez family") => ({
  checkIn, checkOut, name, guests: 4,
});

test("books free dates and returns a cancel code", () => {
  const db = openDatabase(":memory:");
  const r = createBooking(db, stay("2026-10-10", "2026-10-12"), today);
  assert.ok(r.ok);
  assert.match(r.cancelCode!, /^[A-Z2-9]{6}$/);
  assert.equal(listBookings(db, today).length, 1);
});

test("refuses any overlap, allows back-to-back", () => {
  const db = openDatabase(":memory:");
  assert.ok(createBooking(db, stay("2026-10-10", "2026-10-14"), today).ok);
  const clash = createBooking(db, stay("2026-10-13", "2026-10-16", "Pardo family"), today);
  assert.deepEqual(clash, { ok: false, error: "dates_taken" });
  assert.ok(createBooking(db, stay("2026-10-14", "2026-10-16", "Pardo family"), today).ok);
  assert.ok(createBooking(db, stay("2026-10-08", "2026-10-10", "Pardo family"), today).ok);
  assert.equal(listBookings(db, today).length, 3);
});

test("a failed booking leaves nothing behind", () => {
  const db = openDatabase(":memory:");
  createBooking(db, stay("2026-10-12", "2026-10-13"), today);
  createBooking(db, stay("2026-10-10", "2026-10-14"), today); // clashes on the 12th
  assert.ok(createBooking(db, stay("2026-10-10", "2026-10-12"), today).ok);
});

test("blocked dates stop bookings too", () => {
  const db = openDatabase(":memory:");
  assert.ok(createBooking(db, { kind: "blocked", checkIn: "2026-11-01", checkOut: "2026-11-03", name: "Roof repair" }, today).ok);
  assert.equal(createBooking(db, stay("2026-11-02", "2026-11-04"), today).ok, false);
});

test("validates names and guest counts", () => {
  const db = openDatabase(":memory:");
  assert.deepEqual(createBooking(db, { ...stay("2026-10-10", "2026-10-11"), name: "  " }, today), { ok: false, error: "missing_name" });
  assert.deepEqual(createBooking(db, { ...stay("2026-10-10", "2026-10-11"), guests: 0 }, today), { ok: false, error: "bad_guests" });
});

test("cancelling needs the right code unless you are the admin", () => {
  const db = openDatabase(":memory:");
  const r = createBooking(db, stay("2026-10-10", "2026-10-12"), today);
  assert.ok(r.ok);
  assert.equal(cancelBooking(db, r.booking.id, { code: "WRONG1" }), "wrong_code");
  assert.equal(cancelBooking(db, r.booking.id, { code: r.cancelCode!.toLowerCase() }), "cancelled");
  assert.equal(listBookings(db, today).length, 0);
  // Nights are released, so the dates can be booked again.
  const again = createBooking(db, stay("2026-10-10", "2026-10-12"), today);
  assert.ok(again.ok);
  assert.equal(cancelBooking(db, again.booking.id, { admin: true }), "cancelled");
  assert.equal(cancelBooking(db, "missing", { admin: true }), "not_found");
});
