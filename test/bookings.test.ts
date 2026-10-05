import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { databasePath, openDatabase } from "../lib/db.ts";
import { cancelBooking, createBooking, listBookings, updateBooking, verifyPin } from "../lib/bookings.ts";

const today = "2026-10-05";
const stay = (checkIn: string, checkOut: string, name = "Lopez family", times: { checkInTime?: string; checkOutTime?: string } = {}) => ({
  checkIn, checkOut, name, guests: 4, pin: "1234", ...times,
});

test("books free dates with default times and returns the chosen PIN", () => {
  const db = openDatabase(":memory:");
  const r = createBooking(db, stay("2026-10-08", "2026-10-10"), today);
  assert.ok(r.ok);
  assert.equal(r.booking.checkInTime, "15:00");
  assert.equal(r.booking.checkOutTime, "11:00");
  assert.equal(r.pin, "1234");
  assert.equal(listBookings(db, today).length, 1);
});

test("booking the 8th to the 10th: the 10th is taken until check-out time", () => {
  const db = openDatabase(":memory:");
  assert.ok(createBooking(db, stay("2026-10-08", "2026-10-10", "Lopez family", { checkOutTime: "11:00" }), today).ok);
  const early = createBooking(db, stay("2026-10-10", "2026-10-12", "Pardo family", { checkInTime: "09:00" }), today);
  assert.equal(early.ok, false);
  assert.equal(!early.ok && early.error, "dates_taken");
  assert.equal(!early.ok && early.clash?.name, "Lopez family");
  assert.ok(createBooking(db, stay("2026-10-10", "2026-10-12", "Pardo family", { checkInTime: "11:00" }), today).ok);
});

test("refuses stays that start inside or wrap around another", () => {
  const db = openDatabase(":memory:");
  assert.ok(createBooking(db, stay("2026-10-10", "2026-10-14"), today).ok);
  assert.equal(createBooking(db, stay("2026-10-12", "2026-10-16", "B"), today).ok, false);
  assert.equal(createBooking(db, stay("2026-10-08", "2026-10-20", "B"), today).ok, false);
  assert.equal(createBooking(db, stay("2026-10-11", "2026-10-11", "B", { checkInTime: "10:00", checkOutTime: "12:00" }), today).ok, false);
});

test("blocked dates cover whole days", () => {
  const db = openDatabase(":memory:");
  assert.ok(createBooking(db, { kind: "blocked", checkIn: "2026-11-01", checkOut: "2026-11-03", name: "Roof repair" }, today).ok);
  assert.equal(createBooking(db, stay("2026-10-30", "2026-11-01", "B", { checkOutTime: "09:00" }), today).ok, false);
  assert.equal(createBooking(db, stay("2026-11-03", "2026-11-05", "B", { checkInTime: "15:00" }), today).ok, false);
  assert.ok(createBooking(db, stay("2026-11-04", "2026-11-05", "B"), today).ok);
});

test("validates names, guest counts and times", () => {
  const db = openDatabase(":memory:");
  assert.deepEqual(createBooking(db, { ...stay("2026-10-10", "2026-10-11"), name: "  " }, today), { ok: false, error: "missing_name" });
  assert.deepEqual(createBooking(db, { ...stay("2026-10-10", "2026-10-11"), guests: 0 }, today), { ok: false, error: "bad_guests" });
  assert.deepEqual(createBooking(db, stay("2026-10-10", "2026-10-11", "A", { checkInTime: "3pm" }), today), { ok: false, error: "invalid_time" });
});

test("cancelling needs the right PIN unless you are the admin", () => {
  const db = openDatabase(":memory:");
  const r = createBooking(db, stay("2026-10-10", "2026-10-12"), today);
  assert.ok(r.ok);
  assert.equal(cancelBooking(db, r.booking.id, { code: "WRONG1" }), "wrong_code");
  assert.equal(cancelBooking(db, r.booking.id, { code: r.pin! }), "cancelled");
  const again = createBooking(db, stay("2026-10-10", "2026-10-12"), today);
  assert.ok(again.ok, "dates are free again after cancelling");
  assert.equal(cancelBooking(db, again.booking.id, { admin: true }), "cancelled");
  assert.equal(cancelBooking(db, "missing", { admin: true }), "not_found");
});

test("migrates a v1 database and keeps its bookings with default times", () => {
  const path = join(mkdtempSync(join(tmpdir(), "casapards-")), "v1.db");
  const v1 = new DatabaseSync(path);
  v1.exec(`
    CREATE TABLE bookings (id TEXT PRIMARY KEY, kind TEXT NOT NULL, check_in TEXT NOT NULL, check_out TEXT NOT NULL,
      name TEXT NOT NULL, guests INTEGER NOT NULL DEFAULT 0, note TEXT NOT NULL DEFAULT '', cancel_hash TEXT,
      created_at TEXT NOT NULL, CHECK (check_out > check_in));
    CREATE TABLE booking_nights (night TEXT PRIMARY KEY, booking_id TEXT NOT NULL);
    INSERT INTO bookings VALUES ('b1', 'stay', '2026-10-08', '2026-10-10', 'Lopez family', 4, '', 'h', '2026-10-01T00:00:00Z');
    INSERT INTO booking_nights VALUES ('2026-10-08', 'b1'), ('2026-10-09', 'b1');
  `);
  v1.close();
  const db = openDatabase(path);
  const [b] = listBookings(db, today);
  assert.deepEqual(
    [b.id, b.checkIn, b.checkInTime, b.checkOut, b.checkOutTime],
    ["b1", "2026-10-08", "15:00", "2026-10-10", "11:00"],
  );
  assert.equal(cancelBooking(db, "b1", { code: "x" }), "wrong_code", "cancel hash carried over");
  assert.equal(createBooking(db, stay("2026-10-10", "2026-10-12", "B", { checkInTime: "10:00" }), today).ok, false);
  assert.ok(createBooking(db, stay("2026-10-10", "2026-10-12", "B", { checkInTime: "12:00" }), today).ok);
  db.close();
  assert.equal(listBookings(openDatabase(path), today).length, 2, "reopening doesn't migrate twice");
});

test("database path prefers DATABASE_PATH, then the Railway volume", () => {
  assert.equal(databasePath({ DATABASE_PATH: "/x/a.db", RAILWAY_VOLUME_MOUNT_PATH: "/data" }), "/x/a.db");
  assert.equal(databasePath({ RAILWAY_VOLUME_MOUNT_PATH: "/data" }), "/data/casapards.db");
  assert.equal(databasePath({}), "data/casapards.db");
});

test("editing a stay: owner with code can move it, even over its own old dates", () => {
  const db = openDatabase(":memory:");
  const r = createBooking(db, stay("2026-10-08", "2026-10-10"), today);
  assert.ok(r.ok);
  const moved = updateBooking(db, r.booking.id, { checkIn: "2026-10-09", checkOut: "2026-10-12", checkOutTime: "13:00", name: "Lopez family" , guests: 5 }, { code: r.pin! }, today);
  assert.ok(moved.ok);
  assert.deepEqual(
    [moved.booking.checkIn, moved.booking.checkOut, moved.booking.checkOutTime, moved.booking.guests],
    ["2026-10-09", "2026-10-12", "13:00", 5],
  );
  assert.equal(listBookings(db, today)[0].checkOut, "2026-10-12", "saved");
});

test("editing can't overlap someone else, needs the right code, and keeps fields not sent", () => {
  const db = openDatabase(":memory:");
  const a = createBooking(db, stay("2026-10-08", "2026-10-10"), today);
  const b = createBooking(db, stay("2026-10-12", "2026-10-14", "Pardo family", {}), today);
  assert.ok(a.ok && b.ok);
  const clash = updateBooking(db, a.booking.id, { checkOut: "2026-10-13" }, { code: a.pin! }, today);
  assert.equal(!clash.ok && clash.error, "dates_taken");
  assert.equal(!clash.ok && clash.clash?.name, "Pardo family");
  assert.equal(updateBooking(db, a.booking.id, { note: "x" }, { code: "WRONG1" }, today).ok, false);
  const noted = updateBooking(db, a.booking.id, { note: "Bringing the dog" }, { admin: true }, today);
  assert.ok(noted.ok);
  assert.equal(noted.booking.checkIn, "2026-10-08");
  assert.equal(noted.booking.note, "Bringing the dog");
  assert.equal(updateBooking(db, "missing", {}, { admin: true }, today).ok, false);
});

test("a stay that already started can still change its check-out", () => {
  const db = openDatabase(":memory:");
  const r = createBooking(db, stay("2026-10-04", "2026-10-07"), "2026-10-03");
  assert.ok(r.ok);
  const later = updateBooking(db, r.booking.id, { checkOut: "2026-10-08" }, { code: r.pin! }, today);
  assert.ok(later.ok);
  const moveStart = updateBooking(db, r.booking.id, { checkIn: "2026-10-03" }, { code: r.pin! }, today);
  assert.equal(!moveStart.ok && moveStart.error, "in_the_past");
});

test("a stay needs a 4-digit PIN; blocked dates don't", () => {
  const db = openDatabase(":memory:");
  for (const pin of [undefined, "", "123", "12345", "12a4"]) {
    assert.deepEqual(createBooking(db, { ...stay("2026-10-10", "2026-10-11"), pin }, today), { ok: false, error: "bad_pin" }, String(pin));
  }
  const blocked = createBooking(db, { kind: "blocked", checkIn: "2026-11-01", checkOut: "2026-11-02", name: "Repairs" }, today);
  assert.ok(blocked.ok);
  assert.equal(blocked.pin, null);
});

test("the same PIN on two stays only unlocks each one with its own PIN", () => {
  const db = openDatabase(":memory:");
  const a = createBooking(db, { ...stay("2026-10-10", "2026-10-11"), pin: "4321" }, today);
  const b = createBooking(db, { ...stay("2026-10-12", "2026-10-13", "B"), pin: "4321" }, today);
  assert.ok(a.ok && b.ok);
  assert.ok(updateBooking(db, b.booking.id, { note: "hi" }, { code: "4321" }, today).ok);
  assert.equal(updateBooking(db, a.booking.id, { note: "hi" }, { code: "1234" }, today).ok, false);
});

test("bookings made with the old 6-character codes still work", () => {
  const db = openDatabase(":memory:");
  const r = createBooking(db, stay("2026-10-10", "2026-10-11"), today);
  assert.ok(r.ok);
  const legacy = createHash("sha256").update("K7Q2MX").digest("hex");
  db.prepare("UPDATE bookings SET cancel_hash = ? WHERE id = ?").run(legacy, r.booking.id);
  assert.equal(cancelBooking(db, r.booking.id, { code: "1234" }), "wrong_code");
  assert.equal(cancelBooking(db, r.booking.id, { code: " k7q2mx " }), "cancelled");
});

test("verifyPin checks a PIN without changing the booking", () => {
  const db = openDatabase(":memory:");
  const r = createBooking(db, stay("2026-10-10", "2026-10-11"), today);
  assert.ok(r.ok);
  assert.equal(verifyPin(db, r.booking.id, "1234"), "ok");
  assert.equal(verifyPin(db, r.booking.id, "9999"), "wrong_code");
  assert.equal(verifyPin(db, "missing", "1234"), "not_found");
  assert.equal(listBookings(db, today).length, 1);
});
