// Holidays shown on the calendar. Built in: dates most families share
// (New Year, Christmas, and Holy Week worked out from Easter each year).
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

/** Holidays in a given year: ISO date -> name. Family-added names win. */
export function holidaysFor(year: number, extra: ExtraHoliday[] = []): Map<string, string> {
  const map = new Map<string, string>();
  const easter = easterSunday(year);
  const add = (date: string, name: string) => map.set(date, name);
  add(`${year}-01-01`, "New Year");
  add(addDays(easter, -3), "Holy Thursday");
  add(addDays(easter, -2), "Good Friday");
  add(easter, "Easter");
  add(`${year}-12-24`, "Christmas Eve");
  add(`${year}-12-25`, "Christmas");
  add(`${year}-12-31`, "New Year's Eve");
  for (const h of extra) {
    if (h.date.length === 5) add(`${year}-${h.date}`, h.name);
    else if (h.date.startsWith(`${year}-`)) add(h.date, h.name);
  }
  return map;
}
