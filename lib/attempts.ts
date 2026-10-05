// Slows down PIN guessing: a 4-digit PIN has only 10,000 possibilities, so
// after MAX_FAILURES wrong tries on one booking within WINDOW_MS, that
// booking refuses PINs until the window passes. Kept in memory, which is
// fine for a single small server; a restart simply clears it.

export const MAX_FAILURES = 5;
export const WINDOW_MS = 15 * 60 * 1000;

const failures = new Map<string, number[]>();

function recent(id: string, now: number): number[] {
  const list = (failures.get(id) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length) failures.set(id, list);
  else failures.delete(id);
  return list;
}

export const isLocked = (id: string, now = Date.now()) => recent(id, now).length >= MAX_FAILURES;

export function recordFailure(id: string, now = Date.now()) {
  failures.set(id, [...recent(id, now), now]);
}

export const clearFailures = (id: string) => failures.delete(id);
