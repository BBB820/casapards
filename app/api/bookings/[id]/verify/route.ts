import { NextResponse } from "next/server";
import { clearFailures, isLocked, recordFailure } from "@/lib/attempts.ts";
import { currentRole } from "@/lib/auth.ts";
import { verifyPin } from "@/lib/bookings.ts";
import { getDb } from "@/lib/db.ts";

/** Check a stay's PIN before showing Edit / Delete. Counts toward the wrong-PIN lockout. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await currentRole())) {
    return NextResponse.json({ error: "Enter the family passcode first." }, { status: 401 });
  }
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const code = typeof body?.code === "string" ? body.code : "";
  if (!code) return NextResponse.json({ error: "Enter the PIN you chose when booking." }, { status: 400 });
  if (isLocked(id)) {
    return NextResponse.json(
      { error: "Too many wrong PINs for this stay. Try again in 15 minutes, or ask the admin." },
      { status: 429 },
    );
  }
  const result = verifyPin(getDb(), id, code);
  if (result === "not_found") return NextResponse.json({ error: "That booking no longer exists." }, { status: 404 });
  if (result === "wrong_code") {
    recordFailure(id);
    return NextResponse.json({ error: "That PIN doesn't match this stay." }, { status: 403 });
  }
  clearFailures(id);
  return NextResponse.json({ ok: true });
}
