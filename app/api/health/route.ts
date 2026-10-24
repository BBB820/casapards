import { NextResponse } from "next/server";
import { databasePath, getDb, storageProblem } from "@/lib/db.ts";
import { houseTimeZone } from "@/lib/house.ts";

export const dynamic = "force-dynamic";

/**
 * Health check for the host (Railway's healthcheckPath) and for people
 * debugging a deploy. Reports only yes/no facts, never passcodes.
 */
export async function GET() {
  const problems: string[] = [];
  let database = "ok";
  try {
    const db = getDb();
    db.exec("CREATE TABLE IF NOT EXISTS _health (t TEXT); DELETE FROM _health; INSERT INTO _health VALUES (datetime('now'))");
  } catch (err) {
    database = "error";
    problems.push(
      `Can't write the database at ${databasePath()}: ${err instanceof Error ? err.message : String(err)}. ` +
        "On Railway, attach a volume to this service.",
    );
  }
  const storage = storageProblem();
  if (storage) problems.push(storage);
  if (!houseTimeZone.valid) {
    problems.push("HOUSE_TIMEZONE isn't a valid time zone (use e.g. America/Los_Angeles); using the server's zone.");
  }
  if (!process.env.ADMIN_PASSCODE?.trim()) {
    problems.push("ADMIN_PASSCODE isn't set, so nobody can cancel other people's stays or block dates.");
  }
  return NextResponse.json(
    {
      ok: database === "ok",
      database,
      familyPasscode: Boolean(process.env.FAMILY_PASSCODE?.trim()),
      adminPasscode: Boolean(process.env.ADMIN_PASSCODE?.trim()),
      timeZone: houseTimeZone.zone ?? "server default",
      problems,
    },
    { status: database === "ok" ? 200 : 503 },
  );
}
