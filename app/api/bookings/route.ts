import { NextResponse } from "next/server";
import { currentRole } from "@/lib/auth.ts";
import { createBooking, listBookings } from "@/lib/bookings.ts";
import { RANGE_ERROR_TEXT, type RangeError } from "@/lib/dates.ts";
import { getDb } from "@/lib/db.ts";
import { houseToday } from "@/lib/house.ts";

const ERROR_TEXT: Record<string, string> = {
  ...RANGE_ERROR_TEXT,
  missing_name: "Add the name the stay is under.",
  bad_guests: "Guests should be a number from 1 to 30.",
  dates_taken: "Someone just booked some of those nights. Pick other dates.",
};

const unauthorized = () =>
  NextResponse.json({ error: "Enter the family passcode first." }, { status: 401 });

export async function GET() {
  if (!(await currentRole())) return unauthorized();
  const today = houseToday();
  return NextResponse.json({ today, bookings: listBookings(getDb(), today) });
}

export async function POST(request: Request) {
  const role = await currentRole();
  if (!role) return unauthorized();
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Send the booking as JSON." }, { status: 400 });
  }
  if (body.kind === "blocked" && role !== "admin") {
    return NextResponse.json({ error: "Only the admin can block dates." }, { status: 403 });
  }
  const result = createBooking(getDb(), body, houseToday());
  if (!result.ok) {
    const status = result.error === "dates_taken" ? 409 : 400;
    return NextResponse.json(
      { error: ERROR_TEXT[result.error as RangeError] ?? "That booking didn't work.", code: result.error },
      { status },
    );
  }
  return NextResponse.json(
    { booking: result.booking, cancelCode: result.cancelCode },
    { status: 201 },
  );
}
