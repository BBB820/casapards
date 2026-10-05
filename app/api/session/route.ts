import { NextResponse } from "next/server";
import { endSession, roleForPasscode, startSession } from "@/lib/auth.ts";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const role = roleForPasscode(typeof body?.passcode === "string" ? body.passcode.trim() : "");
  if (!role) {
    return NextResponse.json({ error: "That passcode isn't right." }, { status: 401 });
  }
  await startSession(role);
  return NextResponse.json({ role });
}

export async function DELETE() {
  await endSession();
  return NextResponse.json({ ok: true });
}
