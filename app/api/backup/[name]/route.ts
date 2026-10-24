import { NextResponse } from "next/server";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { currentRole } from "@/lib/auth.ts";
import { backupDir, isBackupName, restoreFromBackup } from "@/lib/backups.ts";
import { databasePath, getDb } from "@/lib/db.ts";

/** Admin only: download one of the daily copies kept on the server. */
export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  if ((await currentRole()) !== "admin") {
    return NextResponse.json({ error: "Only the admin can download backups." }, { status: 403 });
  }
  const { name } = await params;
  const file = join(backupDir(databasePath()), name);
  if (!isBackupName(name) || !existsSync(file)) {
    return NextResponse.json({ error: "That backup doesn't exist." }, { status: 404 });
  }
  return new NextResponse(readFileSync(file), {
    headers: {
      "content-type": "application/vnd.sqlite3",
      "content-disposition": `attachment; filename="${name}"`,
      "cache-control": "no-store",
    },
  });
}

/** Admin only: replace all bookings with this copy (current bookings are saved first). */
export async function POST(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  if ((await currentRole()) !== "admin") {
    return NextResponse.json({ error: "Only the admin can restore backups." }, { status: 403 });
  }
  const { name } = await params;
  try {
    const result = restoreFromBackup(getDb(), backupDir(databasePath()), name);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Restore failed." }, { status: 400 });
  }
}
