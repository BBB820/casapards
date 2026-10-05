import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const SCHEMA = `
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 5000;

  CREATE TABLE IF NOT EXISTS bookings (
    id           TEXT PRIMARY KEY,
    kind         TEXT NOT NULL CHECK (kind IN ('stay', 'blocked')),
    check_in     TEXT NOT NULL,
    check_out    TEXT NOT NULL,
    name         TEXT NOT NULL,
    guests       INTEGER NOT NULL DEFAULT 0,
    note         TEXT NOT NULL DEFAULT '',
    cancel_hash  TEXT,
    created_at   TEXT NOT NULL,
    CHECK (check_out > check_in)
  );

  -- One row per occupied night. The primary key is what makes a double
  -- booking impossible, even when two people press Reserve at once.
  CREATE TABLE IF NOT EXISTS booking_nights (
    night       TEXT PRIMARY KEY,
    booking_id  TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS bookings_check_out ON bookings (check_out);
`;

export function openDatabase(path: string): DatabaseSync {
  if (path !== ":memory:") mkdirSync(dirname(resolve(path)), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);
  return db;
}

const globalForDb = globalThis as unknown as { casapardsDb?: DatabaseSync };

export function getDb(): DatabaseSync {
  globalForDb.casapardsDb ??= openDatabase(
    process.env.DATABASE_PATH ?? "data/casapards.db",
  );
  return globalForDb.casapardsDb;
}
