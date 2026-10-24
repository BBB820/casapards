import { backupDir, ensureDailyBackup } from "./backups.ts";
import { databasePath, getDb } from "./db.ts";
import { houseToday } from "./house.ts";

const HOUR = 60 * 60 * 1000;
const globalForSchedule = globalThis as unknown as { casapardsBackupTimer?: NodeJS.Timeout };

/** Make today's backup if it's missing. Safe to call any time. */
export function runDailyBackup(): void {
  try {
    if (ensureDailyBackup(getDb(), backupDir(databasePath()), houseToday())) {
      console.log(`Daily backup written to ${backupDir(databasePath())}`);
    }
  } catch (err) {
    console.error("Daily backup failed:", err);
  }
}

/** Check shortly after start-up and then every hour; a new copy is made once per day. */
export function startBackupSchedule(): void {
  if (globalForSchedule.casapardsBackupTimer) return;
  setTimeout(runDailyBackup, 30_000).unref();
  globalForSchedule.casapardsBackupTimer = setInterval(runDailyBackup, HOUR);
  globalForSchedule.casapardsBackupTimer.unref();
}
