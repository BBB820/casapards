import { test } from "node:test";
import assert from "node:assert/strict";
import { clearFailures, isLocked, MAX_FAILURES, recordFailure, WINDOW_MS } from "../lib/attempts.ts";

test("a booking locks after too many wrong PINs and unlocks after the window", () => {
  const t0 = 1_000_000;
  for (let i = 0; i < MAX_FAILURES - 1; i++) recordFailure("b1", t0 + i);
  assert.equal(isLocked("b1", t0 + 10), false);
  recordFailure("b1", t0 + 10);
  assert.equal(isLocked("b1", t0 + 11), true);
  assert.equal(isLocked("b2", t0 + 11), false, "other bookings unaffected");
  assert.equal(isLocked("b1", t0 + 10 + WINDOW_MS), false, "unlocks after 15 minutes");
});

test("a correct PIN clears the count", () => {
  for (let i = 0; i < MAX_FAILURES - 1; i++) recordFailure("b3");
  clearFailures("b3");
  recordFailure("b3");
  assert.equal(isLocked("b3"), false);
});
