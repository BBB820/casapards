// Holidays shown on the calendar. Built in: Philippine national holidays
// (regular and special non-working days with fixed or computable dates;
// Holy Week is worked out from Easter each year, National Heroes Day is the
// last Monday of August). Eid holidays are proclaimed each year, so families
// add those, and anything else, with HOUSE_HOLIDAYS.
// Families add their own with HOUSE_HOLIDAYS, e.g.
//   HOUSE_HOLIDAYS="11-01:All Saints; 2026-12-08:Lola's 80th"
// "MM-DD" repeats every year; "YYYY-MM-DD" is a one-off.

import { addDays } from "./dates.ts";

/** Easter Sunday (Gregorian), via the anonymous / Meeus algorithm. */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export type ExtraHoliday = { date: string; name: string };

/** Parse HOUSE_HOLIDAYS; anything malformed is skipped. */
export function parseExtraHolidays(raw: string | undefined): ExtraHoliday[] {
  if (!raw) return [];
  return raw
    .split(/[;\n]/)
    .map((part) => {
      const idx = part.indexOf(":");
      if (idx < 0) return null;
      const date = part.slice(0, idx).trim();
      const name = part.slice(idx + 1).trim().slice(0, 40);
      return /^(\d{4}-)?\d{2}-\d{2}$/.test(date) && name ? { date, name } : null;
    })
    .filter((h): h is ExtraHoliday => h !== null);
}

/** Chinese New Year, which moves with the lunar calendar (known years only). */
const CHINESE_NEW_YEAR: Record<number, string> = {
  2025: "2025-01-29", 2026: "2026-02-17", 2027: "2027-02-06", 2028: "2028-01-26",
  2029: "2029-02-13", 2030: "2030-02-03",
};

/** Last Monday of August (National Heroes Day). */
function lastMondayOfAugust(year: number): string {
  const aug31 = new Date(Date.UTC(year, 7, 31));
  const back = (aug31.getUTCDay() + 6) % 7; // days since Monday
  return `${year}-08-${String(31 - back).padStart(2, "0")}`;
}

/** Holidays in a given year: ISO date -> name. Family-added names win. */
export function holidaysFor(year: number, extra: ExtraHoliday[] = []): Map<string, string> {
  const map = new Map<string, string>();
  const easter = easterSunday(year);
  const add = (date: string, name: string) => map.set(date, name);
  add(`${year}-01-01`, "New Year");
  if (CHINESE_NEW_YEAR[year]) add(CHINESE_NEW_YEAR[year], "Chinese New Year");
  add(`${year}-02-25`, "EDSA Day");
  add(`${year}-04-09`, "Araw ng Kagitingan");
  add(`${year}-05-01`, "Labor Day");
  add(`${year}-06-12`, "Independence Day");
  add(`${year}-08-21`, "Ninoy Aquino Day");
  add(lastMondayOfAugust(year), "National Heroes Day");
  add(`${year}-11-01`, "All Saints' Day");
  add(`${year}-11-02`, "All Souls' Day");
  add(`${year}-11-30`, "Bonifacio Day");
  add(`${year}-12-08`, "Immaculate Conception");
  add(`${year}-12-24`, "Christmas Eve");
  add(`${year}-12-25`, "Christmas");
  add(`${year}-12-30`, "Rizal Day");
  add(`${year}-12-31`, "New Year's Eve");
  // Holy Week last, so it wins if it ever lands on Araw ng Kagitingan.
  add(addDays(easter, -3), "Holy Thursday");
  add(addDays(easter, -2), "Good Friday");
  add(addDays(easter, -1), "Black Saturday");
  add(easter, "Easter");
  for (const h of extra) {
    if (h.date.length === 5) add(`${year}-${h.date}`, h.name);
    else if (h.date.startsWith(`${year}-`)) add(h.date, h.name);
  }
  return map;
}
