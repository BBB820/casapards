import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addDays, isISODate, monthGrid, nightsOf, rangesOverlap, validateRange,
} from "../lib/dates.ts";

test("addDays crosses months, years and leap days", () => {
  assert.equal(addDays("2026-10-31", 1), "2026-11-01");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2028-02-28", 1), "2028-02-29");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
});

test("isISODate rejects impossible dates", () => {
  assert.equal(isISODate("2026-02-29"), false);
  assert.equal(isISODate("2026-13-01"), false);
  assert.equal(isISODate("10/05/2026"), false);
  assert.equal(isISODate("2026-10-05"), true);
});

test("a stay occupies check-in up to but not including check-out", () => {
  assert.deepEqual(nightsOf("2026-10-10", "2026-10-12"), ["2026-10-10", "2026-10-11"]);
});

test("back-to-back stays do not overlap; nested ones do", () => {
  assert.equal(rangesOverlap("2026-10-10", "2026-10-12", "2026-10-12", "2026-10-14"), false);
  assert.equal(rangesOverlap("2026-10-10", "2026-10-15", "2026-10-11", "2026-10-12"), true);
  assert.equal(rangesOverlap("2026-10-11", "2026-10-13", "2026-10-10", "2026-10-12"), true);
});

test("validateRange", () => {
  const today = "2026-10-05";
  assert.equal(validateRange("2026-10-10", "2026-10-12", today), null);
  assert.equal(validateRange("2026-10-05", "2026-10-06", today), null);
  assert.equal(validateRange("2026-10-12", "2026-10-12", today), "checkout_before_checkin");
  assert.equal(validateRange("2026-10-04", "2026-10-06", today), "in_the_past");
  assert.equal(validateRange("2027-12-01", "2027-12-02", today), "too_far_ahead");
  assert.equal(validateRange("2026-10-10", "2026-11-10", today), "too_long");
  assert.equal(validateRange("nope", "2026-10-12", today), "invalid_date");
});

test("monthGrid starts on Monday and pads full weeks", () => {
  const weeks = monthGrid(2026, 9); // October 2026 starts on a Thursday
  assert.deepEqual(weeks[0], [null, null, null, "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
  assert.ok(weeks.every((w) => w.length === 7));
  assert.equal(weeks.flat().filter(Boolean).length, 31);
});
