// Backups of the bookings database.
//
// - A daily copy is written to a "backups" folder next to the database (on
//   the Railway volume) and the last KEEP_DAYS are kept. That undoes
//   mistakes, but lives on the same disk, so it doesn't survive losing the
//   volume itself.
// - The admin can download a full copy (.db) or a spreadsheet (.csv) to keep
//   somewhere else.
//
// Copies are made with SQLite's VACUUM INTO, which writes a consistent
// snapshot even while the app is running.

import type { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { Booking } from "./bookings.ts";

export const KEEP_DAYS = 14;
// Daily copies are casapards-YYYY-MM-DD.db; the copy saved just before a
// restore is casapards-YYYY-MM-DD-before-restore-HHMMSS.db.
const NAME_RE = /^casapards-(\d{4}-\d{2}-\d{2})(-before-restore-\d{6})?\.db$/;
const DAILY_RE = /^casapards-\d{4}-\d{2}-\d{2}\.db$/;

export const backupDir = (dbPath: string) => join(dirname(resolve(dbPath)), "backups");
export const isBackupName = (name: string) => NAME_RE.test(name);

/** Write a consistent copy of the database to `file`. */
export function snapshotTo(db: DatabaseSync, file: string): void {
  mkdirSync(dirname(file), { recursive: true });
  if (existsSync(file)) rmSync(file);
  db.exec(`VACUUM INTO '${file.replaceAll("'", "''")}'`);
}

export type BackupInfo = { name: string; date: string; bytes: number; beforeRestore: boolean };

/** Daily copies, newest first. */
export function listBackups(dir: string): BackupInfo[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(isBackupName)
    .map((name) => ({
      name, date: name.match(NAME_RE)![1], bytes: statSync(join(dir, name)).size, beforeRestore: !DAILY_RE.test(name),
    }))
    .sort((a, b) => (a.name < b.name ? 1 : -1));
}

/** Make today's copy if it doesn't exist yet, then keep only the newest KEEP_DAYS. Returns true if a copy was made. */
export function ensureDailyBackup(db: DatabaseSync, dir: string, today: string, keep = KEEP_DAYS): boolean {
  const file = join(dir, `casapards-${today}.db`);
  let made = false;
  if (!existsSync(file)) {
    snapshotTo(db, file);
    made = true;
  }
  const daily = listBackups(dir).filter((b) => !b.beforeRestore);
  const saved = listBackups(dir).filter((b) => b.beforeRestore);
  for (const old of [...daily.slice(keep), ...saved.slice(keep)]) rmSync(join(dir, old.name));
  return made;
}

/**
 * Replace every booking with the ones in a backup file. The current bookings
 * are saved first (as a "before-restore" copy), so a restore can be undone.
 * Returns the name of that safety copy and how many bookings were restored.
 */
export function restoreFromBackup(db: DatabaseSync, dir: string, name: string, now = new Date()): { savedAs: string; restored: number } {
  if (!isBackupName(name)) throw new Error("Not a backup file.");
  const file = join(dir, name);
  if (!existsSync(file)) throw new Error("That backup doesn't exist.");
  const stamp = now.toISOString();
  const savedAs = `casapards-${stamp.slice(0, 10)}-before-restore-${stamp.slice(11, 19).replaceAll(":", "")}.db`;
  snapshotTo(db, join(dir, savedAs));
  db.exec(`ATTACH DATABASE '${file.replaceAll("'", "''")}' AS bk`);
  try {
    const { user_version: version } = db.prepare("PRAGMA bk.user_version").get() as { user_version: number };
    const { user_version: ours } = db.prepare("PRAGMA main.user_version").get() as { user_version: number };
    if (version !== ours) throw new Error("That backup is from a different version of the app.");
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec("DELETE FROM main.bookings; INSERT INTO main.bookings SELECT * FROM bk.bookings;");
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
    const { n } = db.prepare("SELECT COUNT(*) AS n FROM main.bookings").get() as { n: number };
    return { savedAs, restored: n };
  } finally {
    db.exec("DETACH DATABASE bk");
  }
}

const csvCell = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

/** All bookings as a spreadsheet (opens in Excel, Numbers, Google Sheets). */
export function bookingsCsv(bookings: Booking[]): string {
  const header = ["Name", "Type", "Check-in date", "Check-in time", "Check-out date", "Check-out time", "People", "Note", "Booked at"];
  const rows = bookings.map((b) => [
    b.name, b.kind === "blocked" ? "Blocked" : "Stay", b.checkIn, b.checkInTime, b.checkOut, b.checkOutTime,
    b.kind === "blocked" ? "" : b.guests, b.note, b.createdAt,
  ]);
  // Byte-order mark so Excel reads accents and ñ correctly.
  return "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
