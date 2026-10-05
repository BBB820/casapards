import { NextResponse } from "next/server";
import { currentRole } from "@/lib/auth.ts";
import { cancelBooking, updateBooking } from "@/lib/bookings.ts";
import { STAY_ERROR_TEXT } from "@/lib/dates.ts";
import { houseToday } from "@/lib/house.ts";
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

const EDIT_ERROR_TEXT: Record<string, string> = {
  ...STAY_ERROR_TEXT,
  missing_name: "Add the name the stay is under.",
  bad_guests: "Guests should be a number from 1 to 30.",
  not_found: "That booking no longer exists.",
  wrong_code: "That cancel code doesn't match this stay.",
};

/** Edit a booking. Same permission as cancelling: admin, or the stay's cancel code. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const role = await currentRole();
  if (!role) {
    return NextResponse.json({ error: "Enter the family passcode first." }, { status: 401 });
  }
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Send the changes as JSON." }, { status: 400 });
  }
  const code = typeof body.code === "string" ? body.code : "";
  if (role !== "admin" && !code) {
    return NextResponse.json({ error: "Enter the cancel code from your booking." }, { status: 400 });
  }
  const { checkIn, checkInTime, checkOut, checkOutTime, name, guests, note } = body;
  const result = updateBooking(
    getDb(), id, { checkIn, checkInTime, checkOut, checkOutTime, name, guests, note },
    role === "admin" ? { admin: true } : { code }, houseToday(),
  );
  if (!result.ok) {
    const clash = result.clash;
    const error = clash
      ? `That overlaps ${clash.name} (${clash.checkIn} ${clash.checkInTime} to ${clash.checkOut} ${clash.checkOutTime}). Pick other dates or times.`
      : (EDIT_ERROR_TEXT[result.error] ?? "That change didn't work.");
    const status = { dates_taken: 409, not_found: 404, wrong_code: 403 }[result.error as string] ?? 400;
    return NextResponse.json({ error, code: result.error, clash }, { status });
  }
  return NextResponse.json({ booking: result.booking });
}
