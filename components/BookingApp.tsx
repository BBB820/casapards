"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addDays, daysBetween, MAX_DAYS_AHEAD, MAX_NIGHTS, monthGrid, nightsOf, todayISO,
} from "@/lib/dates.ts";
import type { Booking } from "@/lib/bookings.ts";

type Props = { houseName: string; isAdmin: boolean; canSignOut: boolean };

const CODES_KEY = "casapards.cancelCodes";
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function readCodes(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(CODES_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function saveCodes(codes: Record<string, string>) {
  try {
    localStorage.setItem(CODES_KEY, JSON.stringify(codes));
  } catch {
    /* private window: codes are still shown on screen */
  }
}

const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(iso + "T12:00:00Z").toLocaleDateString(undefined, { timeZone: "UTC", ...opts });
const longDate = (iso: string) => fmt(iso, { weekday: "short", day: "numeric", month: "short" });
const nightsLabel = (n: number) => `${n} night${n === 1 ? "" : "s"}`;

export default function BookingApp({ houseName, isAdmin, canSignOut }: Props) {
  const [today, setToday] = useState(() => todayISO());
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [monthOffset, setMonthOffset] = useState(0);
  const [checkIn, setCheckIn] = useState<string | null>(null);
  const [checkOut, setCheckOut] = useState<string | null>(null);
  const [hint, setHint] = useState("");
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState<{ booking: Booking; code: string | null } | null>(null);
  // Dates and month names depend on the browser's locale and time zone, so
  // render the calendar only in the browser to avoid hydration mismatches.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/bookings", { cache: "no-store" });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      const data = await res.json();
      setToday(data.today);
      setBookings(data.bookings);
      setLoadError("");
    } catch {
      setLoadError("Couldn't reach the calendar. Check your connection and refresh.");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    setCodes(readCodes());
    load();
    const refresh = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", refresh);
    const timer = setInterval(refresh, 60_000);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      clearInterval(timer);
    };
  }, [load]);

  // night -> booking occupying it
  const byNight = useMemo(() => {
    const map = new Map<string, Booking>();
    for (const b of bookings) for (const n of nightsOf(b.checkIn, b.checkOut)) map.set(n, b);
    return map;
  }, [bookings]);

  if (!mounted) {
    return (
      <main className="shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">Family house · reservations</p>
            <h1>{houseName}</h1>
          </div>
        </header>
        <p className="muted">Loading the calendar…</p>
      </main>
    );
  }

  const lastBookable = addDays(today, MAX_DAYS_AHEAD);
  const isFreeNight = (d: string) => d >= today && d <= lastBookable && !byNight.has(d);

  function pick(day: string) {
    setConfirmed(null);
    setHint("");
    const startNew = () => {
      if (!isFreeNight(day)) {
        setHint(byNight.has(day) ? "That night is taken. Pick a free day to arrive." : "Pick a day from today onward.");
        return;
      }
      setCheckIn(day);
      setCheckOut(null);
    };
    if (!checkIn || checkOut || day <= checkIn) return startNew();
    const nights = nightsOf(checkIn, day);
    if (nights.length > MAX_NIGHTS) {
      setHint(`Stays can be up to ${MAX_NIGHTS} nights.`);
      return;
    }
    if (nights.some((n) => !isFreeNight(n))) return startNew();
    setCheckOut(day);
  }

  const clearSelection = () => {
    setCheckIn(null);
    setCheckOut(null);
    setHint("");
  };

  function onBooked(booking: Booking, code: string | null) {
    if (code) {
      const next = { ...codes, [booking.id]: code };
      setCodes(next);
      saveCodes(next);
    }
    setConfirmed({ booking, code });
    clearSelection();
    load();
  }

  async function cancel(b: Booking, code?: string): Promise<string | null> {
    const res = await fetch(`/api/bookings/${b.id}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: code ?? codes[b.id] ?? "" }),
    });
    if (!res.ok && res.status !== 404) return (await res.json()).error ?? "Couldn't cancel that stay.";
    const next = { ...codes };
    delete next[b.id];
    setCodes(next);
    saveCodes(next);
    load();
    return null;
  }

  async function signOut() {
    await fetch("/api/session", { method: "DELETE" });
    window.location.href = "/login";
  }

  const [ty, tm] = today.split("-").map(Number);
  const months = [0, 1].map((i) => {
    const d = new Date(Date.UTC(ty, tm - 1 + monthOffset + i, 1));
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
  });
  const maxOffset = 12;
  const upcoming = bookings.filter((b) => b.checkOut > today);

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Family house · reservations</p>
          <h1>{houseName}</h1>
        </div>
        <nav className="topnav">
          {isAdmin && <span className="pill admin">Admin</span>}
          {!isAdmin && <a href="/login">Admin sign in</a>}
          {canSignOut && <button className="link" onClick={signOut}>Sign out</button>}
        </nav>
      </header>

      <section className="layout">
        <div className="calendar card">
          <div className="cal-head">
            <button
              className="icon"
              aria-label="Previous month"
              onClick={() => setMonthOffset((m) => Math.max(0, m - 1))}
              disabled={monthOffset === 0}
            >‹</button>
            <p className="muted small">
              {!checkIn ? "Tap the day you arrive." : !checkOut ? "Now tap the day you leave." : "Dates picked. Fill in the form to reserve."}
            </p>
            <button
              className="icon"
              aria-label="Next month"
              onClick={() => setMonthOffset((m) => Math.min(maxOffset, m + 1))}
              disabled={monthOffset >= maxOffset}
            >›</button>
          </div>

          <div className="months">
            {months.map(({ year, month }) => (
              <Month
                key={`${year}-${month}`}
                year={year}
                month={month}
                today={today}
                lastBookable={lastBookable}
                byNight={byNight}
                checkIn={checkIn}
                checkOut={checkOut}
                onPick={pick}
              />
            ))}
          </div>

          <ul className="legend small">
            <li><span className="swatch free" /> Free</li>
            <li><span className="swatch booked" /> Booked</li>
            <li><span className="swatch blocked" /> Unavailable</li>
            <li><span className="swatch picked" /> Your dates</li>
          </ul>
          {hint && <p className="error small" role="status">{hint}</p>}
          {loadError && <p className="error small" role="alert">{loadError}</p>}
        </div>

        <aside className="side">
          {confirmed ? (
            <Confirmation {...confirmed} onDone={() => setConfirmed(null)} />
          ) : checkIn && checkOut ? (
            <ReserveForm
              checkIn={checkIn}
              checkOut={checkOut}
              isAdmin={isAdmin}
              onBooked={onBooked}
              onClear={clearSelection}
              onConflict={load}
            />
          ) : (
            <div className="card stack">
              <h2>Reserve a stay</h2>
              <p className="muted">
                {checkIn
                  ? `Arriving ${longDate(checkIn)}. Tap the day you leave.`
                  : "Pick your arrival day on the calendar, then the day you leave. Stays run from check-in to check-out, so you can arrive the day someone else leaves."}
              </p>
              {checkIn && <button className="link" onClick={clearSelection}>Start over</button>}
            </div>
          )}

          <div className="card stack">
            <h2>Upcoming stays</h2>
            {!loaded ? (
              <p className="muted">Loading the calendar…</p>
            ) : upcoming.length === 0 ? (
              <p className="muted">Nobody has booked yet. The house is all yours.</p>
            ) : (
              <ul className="stays">
                {upcoming.map((b) => (
                  <StayRow key={b.id} booking={b} mine={Boolean(codes[b.id])} isAdmin={isAdmin} onCancel={cancel} />
                ))}
              </ul>
            )}
          </div>
        </aside>
      </section>
    </main>
  );
}

function Month(props: {
  year: number;
  month: number;
  today: string;
  lastBookable: string;
  byNight: Map<string, Booking>;
  checkIn: string | null;
  checkOut: string | null;
  onPick: (day: string) => void;
}) {
  const { year, month, today, lastBookable, byNight, checkIn, checkOut, onPick } = props;
  const title = new Date(Date.UTC(year, month, 1)).toLocaleDateString(undefined, {
    month: "long", year: "numeric", timeZone: "UTC",
  });
  return (
    <div className="month">
      <h3>{title}</h3>
      <div className="grid" role="grid" aria-label={title}>
        {WEEKDAYS.map((w) => <div key={w} className="dow" role="columnheader">{w}</div>)}
        {monthGrid(year, month).flat().map((day, i) => {
          if (!day) return <div key={`pad-${i}`} className="day pad" />;
          const booking = byNight.get(day);
          const past = day < today || day > lastBookable;
          const inRange = checkIn && (checkOut ? day >= checkIn && day <= checkOut : day === checkIn);
          const cls = [
            "day",
            past ? "past" : booking ? (booking.kind === "blocked" ? "blocked" : "booked") : "free",
            inRange ? "picked" : "",
            day === checkIn ? "start" : "",
            day === checkOut ? "end" : "",
            day === today ? "today" : "",
          ].join(" ");
          const label = `${new Date(day + "T12:00:00Z").toLocaleDateString(undefined, { timeZone: "UTC", dateStyle: "full" })}${
            booking ? `, ${booking.kind === "blocked" ? "unavailable" : `booked by ${booking.name}`}` : past ? "" : ", free"
          }`;
          return (
            <button
              key={day}
              className={cls}
              onClick={() => onPick(day)}
              disabled={day < today || day > addDays(lastBookable, 1)}
              aria-label={label}
              aria-pressed={Boolean(inRange)}
              title={booking ? (booking.kind === "blocked" ? booking.name : `${booking.name} · ${booking.guests} guests`) : undefined}
            >
              <span>{Number(day.slice(8))}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ReserveForm(props: {
  checkIn: string;
  checkOut: string;
  isAdmin: boolean;
  onBooked: (b: Booking, code: string | null) => void;
  onClear: () => void;
  onConflict: () => void;
}) {
  const { checkIn, checkOut, isAdmin, onBooked, onClear, onConflict } = props;
  const [mode, setMode] = useState<"stay" | "blocked">("stay");
  const [name, setName] = useState("");
  const [guests, setGuests] = useState("4");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      setName(localStorage.getItem("casapards.lastName") ?? "");
    } catch { /* ignore */ }
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: mode, checkIn, checkOut, name, guests: Number(guests), note }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "That booking didn't work.");
      if (res.status === 409) onConflict();
      return;
    }
    if (mode === "stay") {
      try { localStorage.setItem("casapards.lastName", name.trim()); } catch { /* ignore */ }
    }
    onBooked(data.booking, data.cancelCode);
  }

  const nights = daysBetween(checkIn, checkOut);
  return (
    <form className="card stack" onSubmit={submit}>
      <h2>{mode === "stay" ? "Reserve these dates" : "Block these dates"}</h2>
      <div className="summary">
        <div><span className="label">Check-in</span><strong>{longDate(checkIn)}</strong></div>
        <div><span className="label">Check-out</span><strong>{longDate(checkOut)}</strong></div>
        <div><span className="label">Length</span><strong>{nightsLabel(nights)}</strong></div>
      </div>

      {isAdmin && (
        <div className="segmented" role="radiogroup" aria-label="Booking type">
          <button type="button" role="radio" aria-checked={mode === "stay"} onClick={() => setMode("stay")}>Family stay</button>
          <button type="button" role="radio" aria-checked={mode === "blocked"} onClick={() => setMode("blocked")}>Block dates</button>
        </div>
      )}

      <label htmlFor="name">{mode === "stay" ? "Name the stay is under" : "Reason (shown to family)"}</label>
      <input
        id="name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={mode === "stay" ? "e.g. Lopez family" : "e.g. Roof repair"}
        maxLength={80}
        required
      />

      {mode === "stay" && (
        <>
          <label htmlFor="guests">How many people</label>
          <input id="guests" type="number" min={1} max={30} value={guests} onChange={(e) => setGuests(e.target.value)} required />
          <label htmlFor="note">Note for the family <span className="muted">(optional)</span></label>
          <textarea id="note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Bringing the dog, arriving late…" />
        </>
      )}

      {error && <p className="error" role="alert">{error}</p>}
      <div className="row">
        <button className="primary" disabled={busy}>{busy ? "Saving…" : mode === "stay" ? "Reserve" : "Block dates"}</button>
        <button type="button" className="link" onClick={onClear}>Change dates</button>
      </div>
    </form>
  );
}

function Confirmation({ booking, code, onDone }: { booking: Booking; code: string | null; onDone: () => void }) {
  const nights = daysBetween(booking.checkIn, booking.checkOut);
  return (
    <div className="card stack confirm" role="status">
      <h2>{booking.kind === "blocked" ? "Dates blocked" : "You're booked"}</h2>
      <p>
        <strong>{booking.name}</strong>, {longDate(booking.checkIn)} to {longDate(booking.checkOut)} ({nightsLabel(nights)}).
      </p>
      {code && (
        <>
          <p className="muted">Your cancel code. This device remembers it, but write it down in case you need to cancel from another phone.</p>
          <p className="code">{code}</p>
        </>
      )}
      <button className="link" onClick={onDone}>Done</button>
    </div>
  );
}

function StayRow({ booking: b, mine, isAdmin, onCancel }: {
  booking: Booking;
  mine: boolean;
  isAdmin: boolean;
  onCancel: (b: Booking, code?: string) => Promise<string | null>;
}) {
  const [step, setStep] = useState<"idle" | "confirm" | "code">("idle");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  async function go(withCode?: string) {
    setError("");
    const err = await onCancel(b, withCode);
    if (err) setError(err);
    else setStep("idle");
  }

  return (
    <li className={`stay ${b.kind}`}>
      <div className="stay-main">
        <strong>{b.name}</strong>
        {mine && <span className="pill">Yours</span>}
        <span className="muted small">
          {longDate(b.checkIn)} → {longDate(b.checkOut)} · {nightsLabel(daysBetween(b.checkIn, b.checkOut))}
          {b.kind === "stay" && ` · ${b.guests} ${b.guests === 1 ? "person" : "people"}`}
        </span>
        {b.note && <span className="small">{b.note}</span>}
      </div>
      <div className="stay-actions small">
        {step === "idle" && (mine || isAdmin) && <button className="link" onClick={() => setStep("confirm")}>Cancel</button>}
        {step === "idle" && !mine && !isAdmin && b.kind === "stay" && (
          <button className="link" onClick={() => setStep("code")}>Cancel with code</button>
        )}
        {step === "confirm" && (
          <span className="row">
            <button className="danger" onClick={() => go()}>Cancel this stay</button>
            <button className="link" onClick={() => setStep("idle")}>Keep it</button>
          </span>
        )}
        {step === "code" && (
          <form className="row" onSubmit={(e) => { e.preventDefault(); go(code); }}>
            <input
              id={`code-${b.id}`}
              aria-label="Cancel code"
              className="code-input"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Code"
              required
            />
            <button className="danger">Cancel stay</button>
            <button type="button" className="link" onClick={() => setStep("idle")}>Back</button>
          </form>
        )}
        {error && <p className="error">{error}</p>}
      </div>
    </li>
  );
}
