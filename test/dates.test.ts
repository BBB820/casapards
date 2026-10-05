import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addDays, dayInfo, daysTouched, isISODate, isTime, monthGrid, staysOverlap, validateStay,
} from "../lib/dates.ts";

const stay = (checkIn: string, checkInTime: string, checkOut: string, checkOutTime: string) => ({
  checkIn, checkInTime, checkOut, checkOutTime,
});

test("addDays crosses months, years and leap days", () => {
  assert.equal(addDays("2026-10-31", 1), "2026-11-01");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2028-02-28", 1), "2028-02-29");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
});

test("isISODate and isTime reject impossible values", () => {
  assert.equal(isISODate("2026-02-29"), false);
  assert.equal(isISODate("2026-10-05"), true);
  assert.equal(isTime("24:00"), false);
  assert.equal(isTime("9:00"), false);
  assert.equal(isTime("09:30"), true);
});

test("a stay touches its check-in day, every day between, and its check-out day", () => {
  assert.deepEqual(daysTouched({ checkIn: "2026-10-08", checkOut: "2026-10-10" }), ["2026-10-08", "2026-10-09", "2026-10-10"]);
});

test("the next family can arrive on the check-out day, but only after check-out time", () => {
  const lopez = stay("2026-10-08", "15:00", "2026-10-10", "11:00");
  assert.equal(staysOverlap(lopez, stay("2026-10-10", "11:00", "2026-10-12", "11:00")), false);
  assert.equal(staysOverlap(lopez, stay("2026-10-10", "15:00", "2026-10-12", "11:00")), false);
  assert.equal(staysOverlap(lopez, stay("2026-10-10", "10:00", "2026-10-12", "11:00")), true);
  assert.equal(staysOverlap(lopez, stay("2026-10-09", "15:00", "2026-10-09", "18:00")), true);
});

test("dayInfo describes full, check-out and check-in days", () => {
  const lopez = stay("2026-10-08", "15:00", "2026-10-10", "11:00");
  const pardo = stay("2026-10-10", "16:00", "2026-10-12", "10:00");
  const both = [lopez, pardo];
  assert.equal(dayInfo("2026-10-09", both).full, lopez);
  const tenth = dayInfo("2026-10-10", both);
  assert.equal(tenth.full, null);
  assert.equal(tenth.outBy, lopez);
  assert.equal(tenth.inFrom, pardo);
  assert.deepEqual([tenth.freeFrom, tenth.freeUntil], ["11:00", "16:00"]);
  const free = dayInfo("2026-10-20", both);
  assert.deepEqual([free.full, free.outBy, free.inFrom, free.freeFrom, free.freeUntil], [null, null, null, "00:00", "24:00"]);
});

test("validateStay", () => {
  const today = "2026-10-05";
  assert.equal(validateStay(stay("2026-10-10", "15:00", "2026-10-12", "11:00"), today), null);
  assert.equal(validateStay(stay("2026-10-10", "10:00", "2026-10-10", "18:00"), today), null, "same-day visit");
  assert.equal(validateStay(stay("2026-10-10", "15:00", "2026-10-10", "11:00"), today), "checkout_before_checkin");
  assert.equal(validateStay(stay("2026-10-04", "15:00", "2026-10-06", "11:00"), today), "in_the_past");
  assert.equal(validateStay(stay("2027-12-01", "15:00", "2027-12-02", "11:00"), today), "too_far_ahead");
  assert.equal(validateStay(stay("2026-10-10", "15:00", "2026-11-10", "11:00"), today), "too_long");
  assert.equal(validateStay(stay("2026-10-10", "3pm", "2026-10-12", "11:00"), today), "invalid_time");
  assert.equal(validateStay({ checkIn: "nope", checkOut: "2026-10-12" }, today), "invalid_date");
});

test("monthGrid starts on Monday and pads full weeks", () => {
  const weeks = monthGrid(2026, 9); // October 2026 starts on a Thursday
  assert.deepEqual(weeks[0], [null, null, null, "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
  assert.ok(weeks.every((w) => w.length === 7));
  assert.equal(weeks.flat().filter(Boolean).length, 31);
});

test("resolveTimeZone forgives typos and rejects nonsense", async () => {
  const { resolveTimeZone } = await import("../lib/house.ts");
  assert.deepEqual(resolveTimeZone(" America/Los Angeles "), { zone: "America/Los_Angeles", valid: true });
  assert.deepEqual(resolveTimeZone("Europe/Madrid"), { zone: "Europe/Madrid", valid: true });
  assert.deepEqual(resolveTimeZone("Pacific"), { zone: undefined, valid: false });
  assert.deepEqual(resolveTimeZone(undefined), { zone: undefined, valid: true });
});
