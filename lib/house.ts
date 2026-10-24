import { todayISO } from "./dates.ts";

export const HOUSE_NAME = process.env.HOUSE_NAME?.trim() || "Casa Pards";
/** Optional one-line tagline under the name, e.g. "Our family's place by the sea". */
export const HOUSE_TAGLINE = process.env.HOUSE_TAGLINE?.trim().slice(0, 80) || "";

/**
 * Turn HOUSE_TIMEZONE into a valid IANA zone. Forgives common typos
 * ("America/Los Angeles", stray spaces); anything still invalid falls back
 * to the server's zone with a warning instead of breaking every request.
 */
export function resolveTimeZone(raw: string | undefined): { zone: string | undefined; valid: boolean } {
  const value = raw?.trim().replace(/\s+/g, "_");
  if (!value) return { zone: undefined, valid: true };
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: value });
    return { zone: value, valid: true };
  } catch {
    return { zone: undefined, valid: false };
  }
}

const tz = resolveTimeZone(process.env.HOUSE_TIMEZONE);
if (!tz.valid) {
  console.warn(
    `HOUSE_TIMEZONE="${process.env.HOUSE_TIMEZONE}" isn't a valid time zone; using the server's. ` +
      `Use a name like America/Los_Angeles or Europe/Madrid.`,
  );
}

export const houseTimeZone = tz;
export const houseToday = () => todayISO(tz.zone);
