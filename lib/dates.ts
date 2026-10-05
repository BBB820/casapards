// Pure date logic shared by the server, the calendar UI and the tests.
//
// A stay runs from a check-in date and time to a check-out date and time
// (dates "YYYY-MM-DD", times "HH:MM", house local time). The check-out day
// is reserved until the check-out time, so the next family can arrive that
// same day, but only at or after that time. Two stays conflict when their
// time spans overlap.

export const MAX_DAYS = 21;
export const MAX_DAYS_AHEAD = 365;
export const DEFAULT_CHECK_IN = "15:00";
export const DEFAULT_CHECK_OUT = "11:00";

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isISODate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_RE.test(value)) return false;
  const d = new Date(value + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export const isTime = (value: unknown): value is string =>
  typeof value === "string" && TIME_RE.test(value);

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

export type Stay = {
  checkIn: string;
  checkInTime: string;
  checkOut: string;
  checkOutTime: string;
};

const startOf = (s: Stay) => `${s.checkIn}T${s.checkInTime}`;
const endOf = (s: Stay) => `${s.checkOut}T${s.checkOutTime}`;

/** True when two stays share any moment. Back-to-back (11:00 out, 11:00 in) is fine. */
export function staysOverlap(a: Stay, b: Stay): boolean {
  return startOf(a) < endOf(b) && startOf(b) < endOf(a);
}

/** Calendar days a stay touches, check-in and check-out days included. */
export function daysTouched(s: Pick<Stay, "checkIn" | "checkOut">): string[] {
  const days: string[] = [];
  for (let d = s.checkIn; d <= s.checkOut; d = addDays(d, 1)) days.push(d);
  return days;
}

export type StayError =
  | "invalid_date"
  | "invalid_time"
  | "checkout_before_checkin"
  | "in_the_past"
  | "too_far_ahead"
  | "too_long";

export function validateStay(s: Partial<Record<keyof Stay, unknown>>, today: string): StayError | null {
  const { checkIn, checkOut, checkInTime, checkOutTime } = s;
  if (!isISODate(checkIn) || !isISODate(checkOut)) return "invalid_date";
  if (!isTime(checkInTime) || !isTime(checkOutTime)) return "invalid_time";
  if (`${checkOut}T${checkOutTime}` <= `${checkIn}T${checkInTime}`) return "checkout_before_checkin";
  if (checkIn < today) return "in_the_past";
  if (daysBetween(today, checkIn) > MAX_DAYS_AHEAD) return "too_far_ahead";
  if (daysBetween(checkIn, checkOut) + 1 > MAX_DAYS) return "too_long";
  return null;
}

export const STAY_ERROR_TEXT: Record<StayError, string> = {
  invalid_date: "Pick a check-in and a check-out day.",
  invalid_time: "Pick a check-in and a check-out time.",
  checkout_before_checkin: "Check-out has to be after check-in.",
  in_the_past: "That check-in day has already passed.",
  too_far_ahead: `Bookings open ${MAX_DAYS_AHEAD} days ahead.`,
  too_long: `Stays can be up to ${MAX_DAYS} days.`,
};

/**
 * What a calendar day looks like given the existing stays:
 * - `full`: someone is there the whole day.
 * - `outBy`: someone checks out that day; the house is free from that time.
 * - `inFrom`: someone checks in that day; the house is free until that time.
 * The free window on that day is [freeFrom, freeUntil).
 */
export type DayInfo<T extends Stay> = {
  full: T | null;
  outBy: T | null;
  inFrom: T | null;
  freeFrom: string;
  freeUntil: string;
};

export function dayInfo<T extends Stay>(day: string, stays: T[]): DayInfo<T> {
  let full: T | null = null;
  let outBy: T | null = null;
  let inFrom: T | null = null;
  for (const s of stays) {
    if (s.checkIn < day && s.checkOut > day) full = s;
    else if (s.checkIn === day && s.checkOut === day) {
      // A same-day visit: treat whichever end leaves the larger free window.
      if (!outBy || s.checkOutTime > outBy.checkOutTime) outBy = s;
      if (!inFrom || s.checkInTime < inFrom.checkInTime) inFrom = s;
    } else if (s.checkOut === day) {
      if (!outBy || s.checkOutTime > outBy.checkOutTime) outBy = s;
    } else if (s.checkIn === day) {
      if (!inFrom || s.checkInTime < inFrom.checkInTime) inFrom = s;
    }
  }
  const freeFrom = outBy ? outBy.checkOutTime : "00:00";
  const freeUntil = inFrom ? inFrom.checkInTime : "24:00";
  return { full, outBy, inFrom, freeFrom, freeUntil };
}

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
