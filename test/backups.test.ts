import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "../lib/db.ts";
import { cancelBooking, createBooking, listAllBookings } from "../lib/bookings.ts";
import { bookingsCsv, ensureDailyBackup, listBackups, restoreFromBackup, snapshotTo } from "../lib/backups.ts";

const today = "2026-10-24";
const fresh = () => {
  const dir = mkdtempSync(join(tmpdir(), "casapards-bk-"));
  const db = openDatabase(join(dir, "casapards.db"));
  createBooking(db, { checkIn: "2026-11-28", checkOut: "2026-11-30", name: "Martin", guests: 12, pin: "1111" }, today);
  return { dir, db, backups: join(dir, "backups") };
};

test("a snapshot is a complete, readable copy", () => {
  const { dir, db } = fresh();
  const file = join(dir, "copy.db");
  snapshotTo(db, file);
  const copy = new DatabaseSync(file);
  const row = copy.prepare("SELECT name, guests FROM bookings").get() as { name: string; guests: number };
  assert.deepEqual({ ...row }, { name: "Martin", guests: 12 });
});

test("one daily copy per day, oldest pruned beyond the limit", () => {
  const { db, backups } = fresh();
  assert.equal(ensureDailyBackup(db, backups, today), true);
  assert.equal(ensureDailyBackup(db, backups, today), false, "second run the same day does nothing");
  for (let d = 1; d <= 5; d++) ensureDailyBackup(db, backups, `2026-10-${String(24 + d).padStart(2, "0")}`, 3);
  const kept = listBackups(backups).map((b) => b.date);
  assert.deepEqual(kept, ["2026-10-29", "2026-10-28", "2026-10-27"]);
});

test("unrelated files in the backups folder are left alone", () => {
  const { db, backups } = fresh();
  ensureDailyBackup(db, backups, today, 1);
  writeFileSync(join(backups, "notes.txt"), "keep me");
  ensureDailyBackup(db, backups, "2026-10-25", 1);
  assert.deepEqual(listBackups(backups).map((b) => b.name), ["casapards-2026-10-25.db"]);
});

test("spreadsheet export lists every booking and escapes commas and quotes", () => {
  const { db } = fresh();
  createBooking(db, { checkIn: "2026-12-01", checkOut: "2026-12-02", name: "Reyes, cousins", guests: 3, note: 'Bring "lechon"', pin: "2222" }, today);
  const csv = bookingsCsv(listAllBookings(db));
  const lines = csv.replace(/^﻿/, "").trim().split("\r\n");
  assert.equal(lines.length, 3);
  assert.match(lines[0], /^Name,Type,Check-in date/);
  assert.match(lines[2], /^"Reyes, cousins",Stay,2026-12-01,15:00,2026-12-02,11:00,3,"Bring ""lechon""",/);
});

test("restore brings back deleted bookings, and saves the current ones first", () => {
  const { db, backups } = fresh();
  ensureDailyBackup(db, backups, today);
  const martin = listAllBookings(db)[0];
  cancelBooking(db, martin.id, { admin: true });
  createBooking(db, { checkIn: "2026-12-05", checkOut: "2026-12-06", name: "Pardo family", guests: 2, pin: "3333" }, today);
  const r = restoreFromBackup(db, backups, `casapards-${today}.db`, new Date("2026-10-24T09:15:30Z"));
  assert.equal(r.restored, 1);
  assert.deepEqual(listAllBookings(db).map((b) => b.name), ["Martin"]);
  assert.equal(r.savedAs, "casapards-2026-10-24-before-restore-091530.db");
  // Undo the restore with the safety copy.
  restoreFromBackup(db, backups, r.savedAs, new Date("2026-10-24T09:20:00Z"));
  assert.deepEqual(listAllBookings(db).map((b) => b.name), ["Pardo family"]);
  assert.ok(listBackups(backups).some((b) => b.beforeRestore));
  assert.throws(() => restoreFromBackup(db, backups, "../casapards.db"), /Not a backup/);
});
