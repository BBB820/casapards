import { NextResponse } from "next/server";
import { currentRole } from "@/lib/auth.ts";
import { cancelBooking } from "@/lib/bookings.ts";
import { getDb } from "@/lib/db.ts";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const role = await currentRole();
  if (!role) {
    return NextResponse.json({ error: "Enter the family passcode first." }, { status: 401 });
  }
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const code = typeof body?.code === "string" ? body.code : "";
  if (role !== "admin" && !code) {
    return NextResponse.json({ error: "Enter the cancel code from your booking." }, { status: 400 });
  }
  const result = cancelBooking(getDb(), id, role === "admin" ? { admin: true } : { code });
  if (result === "not_found") {
    return NextResponse.json({ error: "That booking no longer exists." }, { status: 404 });
  }
  if (result === "wrong_code") {
    return NextResponse.json({ error: "That cancel code doesn't match this stay." }, { status: 403 });
  }
  return NextResponse.json({ cancelled: id });
}
