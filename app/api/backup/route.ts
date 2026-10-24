import { NextResponse } from "next/server";
import { readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { currentRole } from "@/lib/auth.ts";
import { backupDir, bookingsCsv, listBackups, snapshotTo } from "@/lib/backups.ts";
import { listAllBookings } from "@/lib/bookings.ts";
import { databasePath, getDb } from "@/lib/db.ts";
import { houseToday } from "@/lib/house.ts";

export const dynamic = "force-dynamic";

/**
 * Admin only.
 *   ?type=list  -> daily copies kept on the server
 *   ?type=db    -> download a full copy of the database right now
 *   ?type=csv   -> download every booking as a spreadsheet
 */
export async function GET(request: Request) {
  if ((await currentRole()) !== "admin") {
    return NextResponse.json({ error: "Only the admin can download backups." }, { status: 403 });
  }
  const type = new URL(request.url).searchParams.get("type") ?? "list";
  const today = houseToday();

  if (type === "list") {
    return NextResponse.json({ today, backups: listBackups(backupDir(databasePath())) });
  }
  if (type === "csv") {
    return new NextResponse(bookingsCsv(listAllBookings(getDb())), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="casapards-bookings-${today}.csv"`,
        "cache-control": "no-store",
      },
    });
  }
  if (type === "db") {
    const file = join(tmpdir(), `casapards-${randomUUID()}.db`);
    try {
      snapshotTo(getDb(), file);
      return new NextResponse(readFileSync(file), {
        headers: {
          "content-type": "application/vnd.sqlite3",
          "content-disposition": `attachment; filename="casapards-backup-${today}.db"`,
          "cache-control": "no-store",
        },
      });
    } finally {
      rmSync(file, { force: true });
    }
  }
  return NextResponse.json({ error: "Unknown backup type." }, { status: 400 });
}
