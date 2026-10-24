// Runs once when the server starts (Next.js instrumentation hook).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startBackupSchedule } = await import("./lib/backup-schedule.ts");
  startBackupSchedule();
}
