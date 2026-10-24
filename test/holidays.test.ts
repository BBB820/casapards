import { test } from "node:test";
import assert from "node:assert/strict";
import { easterSunday, holidaysFor, parseExtraHolidays } from "../lib/holidays.ts";

test("Easter Sunday matches known dates", () => {
  assert.equal(easterSunday(2024), "2024-03-31");
  assert.equal(easterSunday(2025), "2025-04-20");
  assert.equal(easterSunday(2026), "2026-04-05");
  assert.equal(easterSunday(2027), "2027-03-28");
});

test("built-in holidays include Holy Week and Christmas", () => {
  const h = holidaysFor(2026);
  assert.equal(h.get("2026-04-02"), "Holy Thursday");
  assert.equal(h.get("2026-04-03"), "Good Friday");
  assert.equal(h.get("2026-12-25"), "Christmas");
  assert.equal(h.get("2026-01-01"), "New Year");
});

test("family holidays: yearly and one-off, malformed entries skipped", () => {
  const extra = parseExtraHolidays("11-01:All Saints; 2026-12-08:Lola's 80th; nonsense; 13:bad; 12-25:Noche Buena feast");
  assert.deepEqual(extra.map((e) => e.date), ["11-01", "2026-12-08", "12-25"]);
  const y26 = holidaysFor(2026, extra);
  assert.equal(y26.get("2026-11-01"), "All Saints");
  assert.equal(y26.get("2026-12-08"), "Lola's 80th");
  assert.equal(y26.get("2026-12-25"), "Noche Buena feast", "family name wins");
  const y27 = holidaysFor(2027, extra);
  assert.equal(y27.get("2027-11-01"), "All Saints");
  assert.equal(y27.has("2027-12-08"), false, "one-off doesn't repeat");
});
