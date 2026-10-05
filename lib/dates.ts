// Pure date logic shared by the server, the calendar UI and the tests.
// Dates are ISO strings ("YYYY-MM-DD"). A stay occupies the nights from
// check-in up to, but not including, check-out, so one family can leave
// on the same day another arrives.

export const MAX_NIGHTS = 21;
export const MAX_DAYS_AHEAD = 365;

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isISODate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_RE.test(value)) return false;
  const d = new Date(value + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  const ms = Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z");
  return Math.round(ms / 86_400_000);
}

/** Today in the given time zone (defaults to the runtime's). */
export function todayISO(timeZone?: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Every night a stay occupies: [checkIn, checkOut). */
export function nightsOf(checkIn: string, checkOut: string): string[] {
  const nights: string[] = [];
  for (let d = checkIn; d < checkOut; d = addDays(d, 1)) nights.push(d);
  return nights;
}

export function rangesOverlap(
  aIn: string,
  aOut: string,
  bIn: string,
  bOut: string,
): boolean {
  return aIn < bOut && bIn < aOut;
}

export type RangeError =
  | "invalid_date"
  | "checkout_before_checkin"
  | "in_the_past"
  | "too_far_ahead"
  | "too_long";

export function validateRange(
  checkIn: unknown,
  checkOut: unknown,
  today: string,
): RangeError | null {
  if (!isISODate(checkIn) || !isISODate(checkOut)) return "invalid_date";
  if (checkOut <= checkIn) return "checkout_before_checkin";
  if (checkIn < today) return "in_the_past";
  if (daysBetween(today, checkIn) > MAX_DAYS_AHEAD) return "too_far_ahead";
  if (daysBetween(checkIn, checkOut) > MAX_NIGHTS) return "too_long";
  return null;
}

export const RANGE_ERROR_TEXT: Record<RangeError, string> = {
  invalid_date: "Pick a check-in and a check-out date.",
  checkout_before_checkin: "Check-out has to be after check-in.",
  in_the_past: "That check-in date has already passed.",
  too_far_ahead: `Bookings open ${MAX_DAYS_AHEAD} days ahead.`,
  too_long: `Stays can be up to ${MAX_NIGHTS} nights.`,
};

/** Weeks (Monday first) covering a month; days outside it are null. */
export function monthGrid(year: number, month: number): (string | null)[][] {
  const first = new Date(Date.UTC(year, month, 1));
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7;
  const cells: (string | null)[] = Array(lead).fill(null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10));
  }
  while (cells.length % 7) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
