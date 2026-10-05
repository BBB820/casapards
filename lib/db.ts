import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const PRAGMAS = `
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 5000;
`;

const BOOKINGS_TABLE = (name: string) => `
  CREATE TABLE IF NOT EXISTS ${name} (
    id              TEXT PRIMARY KEY,
    kind            TEXT NOT NULL CHECK (kind IN ('stay', 'blocked')),
    check_in        TEXT NOT NULL,
    check_in_time   TEXT NOT NULL DEFAULT '15:00',
    check_out       TEXT NOT NULL,
    check_out_time  TEXT NOT NULL DEFAULT '11:00',
    name            TEXT NOT NULL,
    guests          INTEGER NOT NULL DEFAULT 0,
    note            TEXT NOT NULL DEFAULT '',
    cancel_hash     TEXT,
    created_at      TEXT NOT NULL,
    CHECK (check_out || 'T' || check_out_time > check_in || 'T' || check_in_time)
  );
`;

const SCHEMA_VERSION = 2;

/**
 * v1 stored date-only stays plus one booking_nights row per night.
 * v2 adds check-in/check-out times (overlaps are checked inside a write
 * transaction instead). v1 check-out dates were already the departure day,
 * so they carry over unchanged with the default times.
 */
function migrate(db: DatabaseSync) {
  const { user_version: version } = db.prepare("PRAGMA user_version").get() as { user_version: number };
  if (version >= SCHEMA_VERSION) return;
  db.exec("BEGIN IMMEDIATE");
  try {
    const hasV1 = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'bookings'").get();
    if (hasV1) {
      db.exec(BOOKINGS_TABLE("bookings_v2"));
      db.exec(`
        INSERT INTO bookings_v2 (id, kind, check_in, check_out, name, guests, note, cancel_hash, created_at)
          SELECT id, kind, check_in, check_out, name, guests, note, cancel_hash, created_at FROM bookings;
        DROP TABLE IF EXISTS booking_nights;
        DROP TABLE bookings;
        ALTER TABLE bookings_v2 RENAME TO bookings;
      `);
    } else {
      db.exec(BOOKINGS_TABLE("bookings"));
    }
    db.exec("CREATE INDEX IF NOT EXISTS bookings_check_out ON bookings (check_out)");
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function openDatabase(path: string): DatabaseSync {
  if (path !== ":memory:") mkdirSync(dirname(resolve(path)), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(PRAGMAS);
  migrate(db);
  return db;
}

const globalForDb = globalThis as unknown as { casapardsDb?: DatabaseSync };

/**
 * DATABASE_PATH wins. Otherwise use the Railway volume when one is attached
 * (Railway sets RAILWAY_VOLUME_MOUNT_PATH), so bookings survive redeploys
 * even if DATABASE_PATH was never set.
 */
export function databasePath(env: Record<string, string | undefined> = process.env): string {
  if (env.DATABASE_PATH) return env.DATABASE_PATH;
  if (env.RAILWAY_VOLUME_MOUNT_PATH) return join(env.RAILWAY_VOLUME_MOUNT_PATH, "casapards.db");
  return "data/casapards.db";
}

export function getDb(): DatabaseSync {
  if (!globalForDb.casapardsDb) {
    const path = databasePath();
    try {
      globalForDb.casapardsDb = openDatabase(path);
    } catch (err) {
      console.error(`Couldn't open the database at ${path}. Is the volume mounted and writable?`, err);
      throw err;
    }
  }
  return globalForDb.casapardsDb;
}
