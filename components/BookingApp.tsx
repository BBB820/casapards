"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addDays, dayInfo, daysBetween, DEFAULT_CHECK_IN, DEFAULT_CHECK_OUT, MAX_DAYS, MAX_DAYS_AHEAD, monthGrid,
  todayISO, type DayInfo,
} from "@/lib/dates.ts";
import type { Booking } from "@/lib/bookings.ts";
import HeroArt from "./HeroArt.tsx";
import { holidaysFor, type ExtraHoliday } from "@/lib/holidays.ts";

type Props = { houseName: string; tagline: string; isAdmin: boolean; canSignOut: boolean; extraHolidays: ExtraHoliday[]; storageWarning: string | null };
type Info = DayInfo<Booking> & {
  status: "free" | "booked" | "blocked" | "out" | "in" | "turnover";
  /** Whether any time that day is still free. */
  open: boolean;
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Older versions remembered codes on the phone; PINs are now asked for every time. */
function forgetStoredCodes() {
  try {
    localStorage.removeItem("casapards.cancelCodes");
  } catch {
    /* private window */
  }
}

const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(iso + "T12:00:00Z").toLocaleDateString(undefined, { timeZone: "UTC", ...opts });
const longDate = (iso: string) => fmt(iso, { weekday: "short", day: "numeric", month: "short" });
/** "15:00" -> "3:00 PM" in the viewer's locale. */
const timeText = (t: string) =>
  new Date(`2000-01-01T${t}:00Z`).toLocaleTimeString(undefined, { timeZone: "UTC", hour: "numeric", minute: "2-digit" });
/** "15:00" -> "3pm", "11:30" -> "11:30am", "02:00" -> "2am": fits inside a calendar cell. */
const shortTime = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
};
/** "Oct 24–25", or "Oct 30 – Nov 1" across months. */
const shortRange = (a: string, b: string) =>
  a.slice(0, 7) === b.slice(0, 7)
    ? `${fmt(a, { month: "short", day: "numeric" })}–${Number(b.slice(8))}`
    : `${fmt(a, { month: "short", day: "numeric" })} – ${fmt(b, { month: "short", day: "numeric" })}`;
const daysLabel = (n: number) => `${n} day${n === 1 ? "" : "s"}`;
const stayText = (b: Booking) =>
  b.kind === "blocked"
    ? `${longDate(b.checkIn)}${b.checkOut !== b.checkIn ? ` – ${longDate(b.checkOut)}` : ""}`
    : `${longDate(b.checkIn)}, ${timeText(b.checkInTime)} → ${longDate(b.checkOut)}, ${timeText(b.checkOutTime)}`;
const clashText = (c: Booking) => `That overlaps ${c.name} (${stayText(c)}). Pick other dates or times.`;
/** "Lopez family" -> "L", "Reyes cousins" -> "RC", "Martin" -> "M". */
const initials = (name: string) => {
  const words = name.split(/\s+/).filter((w) => w && !/^(family|the|and|&)$/i.test(w));
  return (words.length ? words : [name]).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
};
/** "Here now", "Today", "Tomorrow", "in 5 days". */
const countdown = (b: Booking, today: string) => {
  if (b.checkIn < today) return "Here now";
  const n = daysBetween(today, b.checkIn);
  return n === 0 ? "Today" : n === 1 ? "Tomorrow" : `in ${n} days`;
};
/** Left-hand panel: the illustration with the house name in big letters, plus the at-a-glance cards. */
function Hero({ houseName, tagline, children }: { houseName: string; tagline: string; children?: React.ReactNode }) {
  return (
    <aside className="hero">
      <HeroArt variant="tall" />
      <HeroArt variant="wide" />
      <div className="hero-content">
        <p className="eyebrow">Family house · reservations</p>
        <h1 className="hero-title">{houseName}</h1>
        {tagline && <p className="tagline">{tagline}</p>}
        {children}
      </div>
    </aside>
  );
}

const maxTime = (a: string, b: string) => (a > b ? a : b);
const minTime = (a: string, b: string) => (a < b ? a : b);

export default function BookingApp({ houseName, tagline, isAdmin, canSignOut, extraHolidays, storageWarning }: Props) {
  const [today, setToday] = useState(() => todayISO());
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [monthOffset, setMonthOffset] = useState(0);
  const [first, setFirst] = useState<string | null>(null);
  const [last, setLast] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [hint, setHint] = useState("");
  // PINs typed in this visit, per booking id. Kept in memory only.
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState<{ booking: Booking; code: string | null; edited?: boolean } | null>(null);
  const [editing, setEditing] = useState<Booking | null>(null);
  // Stay opened by tapping its bar on the calendar.
  const [viewingId, setViewingId] = useState<string | null>(null);
  // Phone-only tabs; on wider screens both sides show at once.
  const [tab, setTab] = useState<"calendar" | "stays">("calendar");
  const panelRef = useRef<HTMLDivElement>(null);
  // On phones the panel sits below the calendar: bring it into view when a
  // stay is opened or an edit starts.
  useEffect(() => {
    if ((viewingId || editing) && window.matchMedia("(max-width: 960px)").matches) {
      panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [viewingId, editing]);
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
    forgetStoredCodes();
    load();
    const refresh = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", refresh);
    const timer = setInterval(refresh, 60_000);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      clearInterval(timer);
    };
  }, [load]);

  const colors = useMemo(() => colorMap(bookings), [bookings]);
  const infoCache = useMemo(() => new Map<string, Info>(), [bookings]);
  const info = useCallback((day: string): Info => {
    let hit = infoCache.get(day);
    if (!hit) {
      const d = dayInfo(day, bookings);
      const blocked = [d.full, d.outBy, d.inFrom].some((b) => b?.kind === "blocked");
      const status: Info["status"] = blocked ? "blocked"
        : d.full ? "booked"
        : d.outBy && d.inFrom ? "turnover"
        : d.outBy ? "out"
        : d.inFrom ? "in"
        : "free";
      hit = { ...d, status, open: status !== "blocked" && status !== "booked" && d.freeFrom < d.freeUntil };
      infoCache.set(day, hit);
    }
    return hit;
  }, [bookings, infoCache]);

  if (!mounted) {
    return (
      <div className="page">
        <Hero houseName={houseName} tagline={tagline} />
        <main className="content">
          <p className="muted">Loading the calendar…</p>
        </main>
      </div>
    );
  }

  const lastBookable = addDays(today, MAX_DAYS_AHEAD);
  const inWindow = (d: string) => d >= today && d <= lastBookable;
  const canStart = (d: string) => inWindow(d) && info(d).open;
  /** Can a stay run from `a` to `b` (b > a)? Days between must be untouched. */
  const canSpan = (a: string, b: string) => {
    if (info(a).inFrom || info(b).outBy) return false;
    for (let d = addDays(a, 1); d < b; d = addDays(d, 1)) if (info(d).status !== "free") return false;
    return inWindow(b) && info(b).open;
  };

  const previewEnd =
    first && !last && hover && hover > first && daysBetween(first, hover) < MAX_DAYS && canSpan(first, hover) ? hover : null;

  function pick(day: string) {
    setEditing(null);
    setViewingId(null);
    setConfirmed(null);
    setHint("");
    const startNew = () => {
      if (!canStart(day)) {
        setHint(inWindow(day) ? "That day is fully booked. Pick another day." : "Pick a day from today onward.");
        return;
      }
      setFirst(day);
      setLast(null);
    };
    if (!first || last || day < first) return startNew();
    if (day === first) return setLast(day); // a one-day visit
    if (daysBetween(first, day) + 1 > MAX_DAYS) return setHint(`Stays can be up to ${MAX_DAYS} days.`);
    if (!canSpan(first, day)) {
      return setHint(
        info(first).inFrom
          ? `${info(first).inFrom!.name} checks in on ${longDate(first)}, so that day only works for a short visit before ${timeText(info(first).freeUntil)}.`
          : "Another stay falls between those days. Pick a shorter stay or other dates.",
      );
    }
    setLast(day);
  }

  const clearSelection = () => {
    setFirst(null);
    setLast(null);
    setHint("");
  };

  function onBooked(booking: Booking, pin: string | null) {
    if (pin) setCodes((prev) => ({ ...prev, [booking.id]: pin }));
    setConfirmed({ booking, code: pin });
    clearSelection();
    load();
  }

  function lock(id: string) {
    setCodes((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (editing?.id === id) setEditing(null);
  }

  /** Check a PIN with the server; on success Edit / Delete appear for that stay. */
  async function unlock(id: string, pin: string): Promise<string | null> {
    const res = await fetch(`/api/bookings/${id}/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: pin }),
    });
    if (!res.ok) return (await res.json()).error ?? "Couldn't check that PIN.";
    setCodes((prev) => ({ ...prev, [id]: pin }));
    return null;
  }

  async function remove(b: Booking): Promise<string | null> {
    const res = await fetch(`/api/bookings/${b.id}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: codes[b.id] ?? "" }),
    });
    if (res.status === 403) lock(b.id);
    if (!res.ok && res.status !== 404) return (await res.json()).error ?? "Couldn't delete that stay.";
    lock(b.id);
    load();
    return null;
  }

  function startEdit(b: Booking) {
    setViewingId(null);
    clearSelection();
    setConfirmed(null);
    setEditing(b);
  }

  function onEdited(b: Booking) {
    setEditing(null);
    setConfirmed({ booking: b, code: null, edited: true });
    load();
  }

  /** Show the month containing `iso`. */
  function goToMonth(iso: string) {
    const [y, m] = iso.split("-").map(Number);
    const [ty0, tm0] = today.split("-").map(Number);
    setMonthOffset(Math.max(0, Math.min(12, (y - ty0) * 12 + (m - tm0))));
  }

  function showStay(b: Booking) {
    goToMonth(b.checkIn < today ? today : b.checkIn);
    openStay(b.id);
  }

  function bookWeekend() {
    setEditing(null);
    setViewingId(null);
    setConfirmed(null);
    setHint("");
    goToMonth(weekendStart);
    setFirst(weekendStart);
    setLast(sunday);
  }

  function goPickDates() {
    setTab("calendar");
    requestAnimationFrame(() => {
      const grid = document.querySelector<HTMLElement>(".month-grid");
      grid?.scrollIntoView({ behavior: "smooth", block: "center" });
      document.querySelector<HTMLButtonElement>(".month-grid .cell.open")?.focus({ preventScroll: true });
    });
  }

  function openStay(id: string) {
    setEditing(null);
    setConfirmed(null);
    clearSelection();
    setViewingId(id);
  }

  async function signOut() {
    await fetch("/api/session", { method: "DELETE" });
    window.location.href = "/login";
  }

  const [ty, tm] = today.split("-").map(Number);
  const shown = new Date(Date.UTC(ty, tm - 1 + monthOffset, 1));
  const monthTitle = shown.toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
  const monthName = shown.toLocaleDateString(undefined, { month: "long", timeZone: "UTC" });
  const holidays = holidaysFor(shown.getUTCFullYear(), extraHolidays);
  const monthStartIso = shown.toISOString().slice(0, 10);
  const monthEndIso = new Date(Date.UTC(shown.getUTCFullYear(), shown.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  const monthIsEmpty = loaded && !bookings.some((b) => b.checkIn <= monthEndIso && b.checkOut >= monthStartIso);
  const maxOffset = 12;
  const upcoming = bookings.filter((b) => b.checkOut >= today);
  const stays = upcoming.filter((b) => b.kind === "stay");
  const hereNow = stays.find((b) => b.checkIn <= today);
  const nextUp = stays.find((b) => b.checkIn > today);
  // "This weekend": the coming Fri–Sun (or the current one, if today is Fri–Sun).
  const dow = (new Date(today + "T12:00:00Z").getUTCDay() + 6) % 7; // Mon = 0
  const friday = addDays(today, 4 - dow);
  const sunday = addDays(friday, 2);
  const weekendStart = friday < today ? today : friday;
  const weekendStay = bookings.find((b) => b.checkIn <= sunday && b.checkOut >= weekendStart && b.kind === "stay");
  const weekendBlocked = bookings.find((b) => b.checkIn <= sunday && b.checkOut >= weekendStart && b.kind === "blocked");
  const weekendBookable = loaded && !weekendStay && !weekendBlocked && weekendStart < sunday && canStart(weekendStart) && canSpan(weekendStart, sunday);
  const viewing = viewingId ? bookings.find((b) => b.id === viewingId) ?? null : null;
  const focusId = editing?.id ?? viewing?.id ?? null;
  const panelActive = Boolean(editing || viewing || confirmed);
  const stayRow = (b: Booking) => (
    <StayRow
      key={b.id}
      booking={b}
      color={colors.get(b.id) ?? "c1"}
      unlocked={Boolean(codes[b.id])}
      isAdmin={isAdmin}
      editing={editing?.id === b.id}
      onEdit={startEdit}
      onDelete={remove}
      onUnlock={unlock}
      onLock={lock}
      today={today}
    />
  );

  const instruction = !loaded
    ? "Checking which days are free…"
    : !first
      ? (monthIsEmpty && monthEndIso >= today ? `${monthName} is wide open. Tap a day to claim it.` : "Tap your check-in day.")
      : !last
        ? "Now tap your check-out day. Tap the same day again for a day visit."
        : `${longDate(first)}${last !== first ? ` – ${longDate(last)}` : ""} picked.`;

  return (
    <div className="page">
      <Hero houseName={houseName} tagline={tagline}>
      {loaded && (
        <section className="glance" aria-label="At a glance">
          {hereNow ? (
            <button className="glance-item now" onClick={() => showStay(hereNow)}>
              <span className="glance-label">Here now</span>
              <span className="glance-main">{hereNow.name}</span>
              <span className="glance-sub">until {longDate(hereNow.checkOut)}, {timeText(hereNow.checkOutTime)}</span>
            </button>
          ) : nextUp ? (
            <button className="glance-item" onClick={() => showStay(nextUp)}>
              <span className="glance-label">Next up</span>
              <span className="glance-main">{nextUp.name}</span>
              <span className="glance-sub">
                {longDate(nextUp.checkIn)}{nextUp.checkOut !== nextUp.checkIn ? ` – ${longDate(nextUp.checkOut)}` : ""} · {countdown(nextUp, today)}
              </span>
            </button>
          ) : (
            <div className="glance-item">
              <span className="glance-label">Next up</span>
              <span className="glance-main">No stays booked yet</span>
              <span className="glance-sub">The house is all yours. Pick any dates.</span>
            </div>
          )}
          {weekendStay && weekendStay !== hereNow ? (
            <button className="glance-item" onClick={() => showStay(weekendStay)}>
              <span className="glance-label">This weekend</span>
              <span className="glance-main">{weekendStay.name}</span>
              <span className="glance-sub">{shortRange(friday, sunday)}</span>
            </button>
          ) : weekendBookable ? (
            <button className="glance-item free" onClick={bookWeekend}>
              <span className="glance-label">This weekend is free</span>
              <span className="glance-main">{shortRange(weekendStart, sunday)}</span>
              <span className="glance-sub glance-cta">Book it →</span>
            </button>
          ) : hereNow && nextUp ? (
            <button className="glance-item" onClick={() => showStay(nextUp)}>
              <span className="glance-label">Next up</span>
              <span className="glance-main">{nextUp.name}</span>
              <span className="glance-sub">{shortRange(nextUp.checkIn, nextUp.checkOut)} · {countdown(nextUp, today)}</span>
            </button>
          ) : weekendBlocked ? (
            <div className="glance-item">
              <span className="glance-label">This weekend</span>
              <span className="glance-main">Unavailable</span>
              <span className="glance-sub">{weekendBlocked.name}</span>
            </div>
          ) : null}
        </section>
      )}
      </Hero>

      <main className="content">
      {(isAdmin || canSignOut) && (
        <nav className="topnav">
          {isAdmin && <span className="pill admin">Admin</span>}
          {canSignOut && <button className="link" onClick={signOut}>Sign out</button>}
        </nav>
      )}

      {storageWarning && (
        <p className="storage-warning" role="alert">
          <strong>Bookings are paused.</strong>{" "}
          {isAdmin
            ? "This site isn't saving to permanent storage, so every update would wipe the calendar. In Railway, open the casapards service and add a Volume mounted at /data; bookings reopen after it redeploys."
            : "The calendar is being set up and can't take bookings right now. Please check back soon."}
        </p>
      )}

      <div className="tabs" role="tablist" aria-label="View">
        <button role="tab" aria-selected={tab === "calendar"} onClick={() => setTab("calendar")}>Calendar</button>
        <button role="tab" aria-selected={tab === "stays"} onClick={() => setTab("stays")}>
          Stays{loaded && upcoming.length > 0 ? ` (${upcoming.length})` : ""}
        </button>
      </div>

      <section className="layout" data-tab={tab}>
        <div className="calendar card">
          <div className="cal-head">
            <h2 className="month-title">{monthTitle}</h2>
            <div className="cal-nav">
              <button
                className="icon"
                aria-label="Previous month"
                onClick={() => setMonthOffset((m) => Math.max(0, m - 1))}
                disabled={monthOffset === 0}
              >‹</button>
              <button className="chip" onClick={() => setMonthOffset(0)} disabled={monthOffset === 0}>Today</button>
              <button
                className="icon"
                aria-label="Next month"
                onClick={() => setMonthOffset((m) => Math.min(maxOffset, m + 1))}
                disabled={monthOffset >= maxOffset}
              >›</button>
            </div>
          </div>
          <div className="instruction-row">
            <p className="instruction" aria-live="polite">{instruction}</p>
            {first && <button className="link small" onClick={clearSelection}>Clear</button>}
          </div>

          <div className={loaded ? "" : "loading"} onMouseLeave={() => setHover(null)}>
            <Month
              year={shown.getUTCFullYear()}
              month={shown.getUTCMonth()}
              today={today}
              lastBookable={lastBookable}
              bookings={bookings}
              colors={colors}
              holidays={holidays}
              editingId={focusId}
              info={info}
              first={first}
              last={last ?? previewEnd}
              preview={!last && Boolean(previewEnd)}
              onPick={pick}
              onOpenStay={openStay}
              selecting={Boolean(first && !last)}
              onHover={setHover}
            />
          </div>

          <details className="legend-details small">
            <summary>How to read the calendar</summary>
            <ul className="legend">
              <li><span className="swatch bar" /> A coloured bar is a stay. Tap it for details.</li>
              <li><span className="swatch half" /> A half bar is a check-in or check-out day; the rest of the day is free.</li>
              <li><span className="swatch blocked" /> Striped means unavailable.</li>
              <li><span className="swatch weekend" /> Fri–Sun are shaded; holidays have a label.</li>
            </ul>
          </details>
          {hint && <p className="error small" role="status">{hint}</p>}
          {loadError && <p className="error small" role="alert">{loadError}</p>}
        </div>

        <aside className="side">
          <div ref={panelRef} className={`panel${panelActive ? " active" : ""}`}>
          {editing ? (
            <EditForm
              key={editing.id}
              booking={editing}
              code={codes[editing.id] ?? ""}
              today={today}
              onWrongPin={() => lock(editing.id)}
              onSaved={onEdited}
              onClose={() => setEditing(null)}
            />
          ) : viewing ? (
            <div className="card stack stay-card">
              <div className="row spread">
                <h2>{viewing.kind === "blocked" ? "Unavailable" : "Stay details"}</h2>
                <button className="link small" onClick={() => setViewingId(null)}>Close</button>
              </div>
              <ul className="stays">{stayRow(viewing)}</ul>
            </div>
          ) : confirmed ? (
            <Confirmation {...confirmed} onDone={() => setConfirmed(null)} />
          ) : first && last ? (
            <ReserveForm
              key={`${first}-${last}`}
              first={first}
              last={last}
              firstInfo={info(first)}
              lastInfo={info(last)}
              isAdmin={isAdmin}
              onBooked={onBooked}
              onClear={clearSelection}
              onConflict={load}
            />
          ) : (
            <div className="card stack reserve-card">
              <h2>Reserve a stay</h2>
              <ol className="steps">
                <li className={!first ? "active" : "done"}>
                  <span className="step-num">1</span>
                  <span><strong>Tap your check-in day</strong>{first ? ` · ${longDate(first)}` : ""}</span>
                </li>
                <li className={first ? "active" : ""}>
                  <span className="step-num">2</span>
                  <span><strong>Tap your check-out day</strong> (same day again for a day visit)</span>
                </li>
                <li>
                  <span className="step-num">3</span>
                  <span><strong>Add your name and a PIN</strong>, then reserve</span>
                </li>
              </ol>
              <p className="muted small">
                Check-in from {timeText(DEFAULT_CHECK_IN)}, check-out by {timeText(DEFAULT_CHECK_OUT)}. You can pick other times.
              </p>
              {first ? (
                <div className="row">
                  <button className="primary" onClick={() => pick(first)}>Day visit on {longDate(first)}</button>
                  <button className="link" onClick={clearSelection}>Start over</button>
                </div>
              ) : (
                <button className="primary big" onClick={goPickDates}>Pick your dates</button>
              )}
            </div>
          )}
          </div>

          <div className="card stack stays-card">
            <h2>Upcoming stays</h2>
            {!loaded ? (
              <p className="muted">Loading the calendar…</p>
            ) : upcoming.length === 0 ? (
              <p className="muted">Nobody has booked yet. The house is all yours.</p>
            ) : (
              <ul className="stays">
                {upcoming.map(stayRow)}
              </ul>
            )}
          </div>
          {isAdmin && <BackupsCard onRestored={load} />}
        </aside>
      </section>
      </main>
    </div>
  );
}

/**
 * Colour per booking (c1–c5), handed out in date order so stays next to
 * each other always differ. Blocked dates are always striped grey.
 */
function colorMap(bookings: Booking[]): Map<string, string> {
  const map = new Map<string, string>();
  let i = 0;
  for (const b of [...bookings].sort((x, y) => (x.checkIn + x.checkInTime < y.checkIn + y.checkInTime ? -1 : 1))) {
    map.set(b.id, b.kind === "blocked" ? "blocked" : `c${(i++ % 5) + 1}`);
  }
  return map;
}

type Segment = { booking: Booking; part: "full" | "out" | "in" | "visit"; halves: number };

/**
 * The bar pieces drawn in one day cell. `halves` is how far the name may run,
 * in half-cells (0 = no name here): names go on a stay's first day, and again
 * at the start of each week row or month it continues into. Check-in bars
 * start mid-cell and check-out bars end mid-cell, hence half-cells.
 */
function segmentsFor(day: string, bookings: Booking[], weekday: number, monthStart: string, monthEnd: string, today = ""): Segment[] {
  const segs: Segment[] = [];
  for (const b of bookings) {
    if (day < b.checkIn || day > b.checkOut) continue;
    const part = b.checkIn === b.checkOut ? "visit" : day === b.checkIn ? "in" : day === b.checkOut ? "out" : "full";
    // Names go on a stay's first day, on the first day of each week row or
    // month it runs into, and on today for a stay already under way (its
    // earlier days are faded).
    const startsHere = part === "in" || part === "visit"
      || ((weekday === 0 || day === monthStart || (day === today && b.checkIn < today)) && (part === "full" || part === "out"));
    let halves = 0;
    if (part === "visit") halves = 2;
    else if (startsHere) {
      const lastCell = [b.checkOut, addDays(day, 6 - weekday), monthEnd].sort()[0];
      halves = (daysBetween(day, lastCell) + 1) * 2 - (part === "in" ? 1 : 0) - (lastCell === b.checkOut ? 1 : 0);
    }
    segs.push({ booking: b, part, halves });
  }
  // Outgoing stay first (left half), then incoming (right half).
  return segs.sort((a, b) => (a.part === "out" ? -1 : b.part === "out" ? 1 : 0));
}

function Month(props: {
  year: number;
  month: number;
  today: string;
  lastBookable: string;
  bookings: Booking[];
  colors: Map<string, string>;
  holidays: Map<string, string>;
  editingId: string | null;
  info: (day: string) => Info;
  first: string | null;
  last: string | null;
  preview: boolean;
  onPick: (day: string) => void;
  onOpenStay: (id: string) => void;
  selecting: boolean;
  onHover: (day: string | null) => void;
}) {
  const { year, month, today, lastBookable, bookings, colors, holidays, editingId, info, first, last, preview, onPick, onOpenStay, selecting, onHover } = props;
  const weeks = monthGrid(year, month);
  const days = weeks.flat().filter(Boolean) as string[];
  const monthStart = days[0];
  const monthEnd = days[days.length - 1];
  const end = last ?? first;
  return (
    <div className={`month-grid${editingId ? " editing-mode" : ""}`} role="grid" aria-label={fmt(monthStart, { month: "long", year: "numeric" })}>
      {WEEKDAYS.map((w) => <div key={w} className="dow" role="columnheader">{w}</div>)}
      {weeks.flat().map((day, i) => {
        if (!day) return <div key={`pad-${i}`} className="cell pad" />;
        const weekday = i % 7;
        const d = info(day);
        const out = day < today || day > lastBookable;
        const inRange = Boolean(first && end && day >= first && day <= end);
        const segs = segmentsFor(day, bookings, weekday, monthStart, monthEnd, today);
        const who = d.full ?? d.outBy ?? d.inFrom;
        const describe =
          out ? "not bookable"
          : d.status === "blocked" ? `unavailable${who ? `: ${who.name}` : ""}`
          : d.status === "booked" ? `booked by ${who?.name ?? "someone"}`
          : d.status === "turnover"
            ? `${d.outBy!.name} checks out at ${timeText(d.freeFrom)}, ${d.inFrom!.name} checks in at ${timeText(d.freeUntil)}${d.open ? "" : "; no free time"}`
          : d.status === "out" ? `${d.outBy!.name} checks out at ${timeText(d.freeFrom)}; free after`
          : d.status === "in" ? `${d.inFrom!.name} checks in at ${timeText(d.freeUntil)}; free before`
          : "free";
        const cls = [
          "cell",
          out ? "past" : d.open ? "open" : "closed",
          weekday >= 4 ? "weekend" : "",
          holidays.has(day) ? "holiday" : "",
          inRange ? (preview ? "preview" : "picked") : "",
          inRange && day === first ? "sel-start" : "",
          inRange && day === end ? "sel-end" : "",
          day === today ? "today" : "",
        ].join(" ");
        return (
          <button
            key={day}
            className={cls}
            onClick={(e) => {
              // Tapping a stay's bar (or a fully booked day) opens that stay,
              // unless you're in the middle of choosing a check-out day.
              const seg = (e.target as HTMLElement).closest<HTMLElement>("[data-booking]");
              const id = seg?.dataset.booking ?? (!d.open ? who?.id : undefined);
              if (id && !selecting) onOpenStay(id);
              else onPick(day);
            }}
            onMouseEnter={() => onHover(day)}
            onFocus={() => onHover(day)}
            disabled={out}
            aria-label={`${fmt(day, { dateStyle: "full" })}${holidays.has(day) ? ` (${holidays.get(day)})` : ""}, ${describe}`}
            aria-pressed={inRange}
            title={out ? undefined : describe}
          >
            <span className="cell-top">
              <span className="num">{Number(day.slice(8))}</span>
              {holidays.has(day) && <span className="holiday-tag" title={holidays.get(day)}>{holidays.get(day)}</span>}
            </span>
            <span className="lane">
              {segs.map((sg) => (
                <span
                  key={sg.booking.id}
                  data-booking={sg.booking.id}
                  className={`seg ${sg.part} ${colors.get(sg.booking.id)}${sg.booking.id === editingId ? " editing" : ""}`}
                />
              ))}
              {segs.filter((sg) => sg.halves > 0).map((sg) => (
                <span
                  key={`label-${sg.booking.id}`}
                  className={`seg-label ${sg.part} ${colors.get(sg.booking.id)}${sg.booking.id === editingId ? " editing" : ""}`}
                  style={{ "--halves": sg.halves } as React.CSSProperties}
                >
                  {sg.booking.name}
                </span>
              ))}
            </span>
            <span className="times-row">
              {!out && d.status !== "blocked" && (
                d.outBy && d.outBy === d.inFrom ? (
                  <span className="visit-time">{shortTime(d.outBy.checkInTime)}–<wbr />{shortTime(d.outBy.checkOutTime)}</span>
                ) : (
                  <>
                    {d.outBy && <span><span className="word">out </span>{shortTime(d.freeFrom)}</span>}
                    {d.inFrom && <span className="in-time"><span className="word">in </span>{shortTime(d.freeUntil)}</span>}
                  </>
                )
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ReserveForm(props: {
  first: string;
  last: string;
  firstInfo: Info;
  lastInfo: Info;
  isAdmin: boolean;
  onBooked: (b: Booking, code: string | null) => void;
  onClear: () => void;
  onConflict: () => void;
}) {
  const { first, last, firstInfo, lastInfo, isAdmin, onBooked, onClear, onConflict } = props;
  const sameDay = first === last;
  // Earliest check-in and latest check-out the neighbouring stays allow.
  const earliestIn = firstInfo.freeFrom;
  const latestOut = lastInfo.freeUntil === "24:00" ? "23:59" : lastInfo.freeUntil;
  const defaultIn = sameDay ? maxTime("10:00", earliestIn) : maxTime(DEFAULT_CHECK_IN, earliestIn);
  const defaultOut = sameDay ? minTime("18:00", latestOut) : minTime(DEFAULT_CHECK_OUT, latestOut);

  const [mode, setMode] = useState<"stay" | "blocked">("stay");
  const [name, setName] = useState("");
  const [guests, setGuests] = useState("4");
  const [note, setNote] = useState("");
  const [pin, setPin] = useState("");
  const [inTime, setInTime] = useState(defaultIn);
  const [outTime, setOutTime] = useState(defaultOut);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      setName(localStorage.getItem("casapards.lastName") ?? "");
    } catch { /* ignore */ }
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (mode === "stay") {
      if (inTime < earliestIn) {
        return setError(`${firstInfo.outBy?.name ?? "The previous stay"} checks out at ${timeText(earliestIn)}. Check in at that time or later.`);
      }
      if (outTime > latestOut) {
        return setError(`${lastInfo.inFrom?.name ?? "The next stay"} checks in at ${timeText(lastInfo.freeUntil)}. Check out by then.`);
      }
      if (sameDay && outTime <= inTime) return setError("Check-out has to be after check-in.");
      if (!/^\d{4}$/.test(pin)) return setError("Choose a 4-digit PIN (numbers only).");
    }
    setBusy(true);
    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: mode, checkIn: first, checkOut: last, checkInTime: inTime, checkOutTime: outTime,
        name, guests: Number(guests), note, ...(mode === "stay" ? { pin } : {}),
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.clash ? clashText(data.clash) : (data.error ?? "That booking didn't work."));
      if (res.status === 409) onConflict();
      return;
    }
    if (mode === "stay") {
      try { localStorage.setItem("casapards.lastName", name.trim()); } catch { /* ignore */ }
    }
    onBooked(data.booking, data.pin);
  }

  const days = daysBetween(first, last) + 1;
  return (
    <form className="card stack" onSubmit={submit}>
      <h2>{mode === "stay" ? (sameDay ? "Reserve a day visit" : "Reserve these dates") : "Block these dates"}</h2>
      <div className="summary">
        <div><span className="label">Check-in</span><strong>{longDate(first)}</strong></div>
        <div><span className="label">Check-out</span><strong>{longDate(last)}</strong></div>
        <div><span className="label">Length</span><strong>{daysLabel(days)}</strong></div>
      </div>

      {isAdmin && (
        <div className="segmented" role="radiogroup" aria-label="Booking type">
          <button type="button" role="radio" aria-checked={mode === "stay"} onClick={() => setMode("stay")}>Family stay</button>
          <button type="button" role="radio" aria-checked={mode === "blocked"} onClick={() => setMode("blocked")}>Block dates</button>
        </div>
      )}

      {mode === "stay" && (
        <>
          {firstInfo.outBy && (
            <p className="notice small">
              <strong>{firstInfo.outBy.name}</strong> checks out at {timeText(earliestIn)} on {longDate(first)}.
            </p>
          )}
          {lastInfo.inFrom && (
            <p className="notice small">
              <strong>{lastInfo.inFrom.name}</strong> checks in at {timeText(lastInfo.freeUntil)} on {longDate(last)}.
            </p>
          )}
          <div className="times">
            <div className="stack-tight">
              <label htmlFor="in-time">Check-in time</label>
              <input id="in-time" type="time" value={inTime} min={earliestIn} onChange={(e) => setInTime(e.target.value)} required />
            </div>
            <div className="stack-tight">
              <label htmlFor="out-time">Check-out time</label>
              <input id="out-time" type="time" value={outTime} max={latestOut} onChange={(e) => setOutTime(e.target.value)} required />
            </div>
          </div>
        </>
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
          <label htmlFor="pin">Choose a 4-digit PIN</label>
          <input
            id="pin"
            className="pin-input"
            inputMode="numeric"
            autoComplete="off"
            pattern="[0-9]{4}"
            maxLength={4}
            placeholder="••••"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            required
          />
          <p className="muted small">You'll need this PIN to edit or delete your stay later, from any phone. Pick one you'll remember.</p>
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

function Confirmation({ booking, code, edited, onDone }: { booking: Booking; code: string | null; edited?: boolean; onDone: () => void }) {
  return (
    <div className="card stack confirm" role="status">
      <h2>{edited ? "Changes saved" : booking.kind === "blocked" ? "Dates blocked" : "You're booked"}</h2>
      <p>
        <strong>{booking.name}</strong>: {stayText(booking)}.
      </p>
      {code && (
        <>
          <p className="muted">Your PIN. Remember it: to edit or delete this stay later, tap "Edit or delete" on it and enter this PIN.</p>
          <p className="code">{code}</p>
        </>
      )}
      <button className="link" onClick={onDone}>Done</button>
    </div>
  );
}

function StayRow({ booking: b, color, unlocked, isAdmin, editing, onEdit, onDelete, onUnlock, onLock, today }: {
  booking: Booking;
  today: string;
  color: string;
  unlocked: boolean;
  isAdmin: boolean;
  editing: boolean;
  onEdit: (b: Booking) => void;
  onDelete: (b: Booking) => Promise<string | null>;
  onUnlock: (id: string, pin: string) => Promise<string | null>;
  onLock: (id: string) => void;
}) {
  const [step, setStep] = useState<"idle" | "pin" | "confirm">("idle");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const canManage = isAdmin || unlocked;

  async function submitPin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const err = await onUnlock(b.id, pin.trim());
    setBusy(false);
    if (err) return setError(err);
    setPin("");
    setStep("idle");
  }

  async function deleteIt() {
    setError("");
    const err = await onDelete(b);
    if (err) setError(err);
    else setStep("idle");
  }

  return (
    <li className={`stay${editing ? " editing" : ""}`}>
      <div className="stay-main">
        <span className={`avatar ${color}`} aria-hidden="true">{b.kind === "blocked" ? "–" : initials(b.name)}</span>
        <strong>{b.name}</strong>
        <span className={`when${b.checkIn <= today ? " now" : ""}`}>{countdown(b, today)}</span>
        {unlocked && !isAdmin && <span className="pill">Unlocked</span>}
        <span className="muted small">
          {stayText(b)}
          {b.kind === "stay" && ` · ${b.guests} ${b.guests === 1 ? "person" : "people"}`}
        </span>
        {b.note && <span className="small">{b.note}</span>}
      </div>
      <div className="stay-actions small">
        {step === "idle" && canManage && (
          <span className="row">
            <button className="pill-btn" onClick={() => onEdit(b)} disabled={editing}>{editing ? "Editing…" : "Edit"}</button>
            <button className="pill-btn danger-btn" onClick={() => setStep("confirm")}>Delete</button>
            {unlocked && !isAdmin && <button className="link" onClick={() => onLock(b.id)}>Lock</button>}
          </span>
        )}
        {step === "idle" && !canManage && b.kind === "stay" && (
          <button className="pill-btn" onClick={() => setStep("pin")}>Edit or delete</button>
        )}
        {step === "pin" && (
          <form className="pin-step" onSubmit={submitPin}>
            <label htmlFor={`pin-${b.id}`}>Enter the PIN for this stay</label>
            <div className="row">
              <input
                id={`pin-${b.id}`}
                className="pin-input"
                inputMode="numeric"
                autoComplete="off"
                maxLength={6}
                placeholder="••••"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                autoFocus
                required
              />
              <button className="primary" disabled={busy}>{busy ? "Checking…" : "Continue"}</button>
              <button type="button" className="link" onClick={() => { setStep("idle"); setError(""); setPin(""); }}>Back</button>
            </div>
            <p className="muted small">Forgot it? Ask the admin to change or delete this stay.</p>
          </form>
        )}
        {step === "confirm" && (
          <span className="row">
            <button className="danger" onClick={deleteIt}>{b.kind === "blocked" ? "Unblock these dates" : "Delete this stay"}</button>
            <button className="link" onClick={() => setStep("idle")}>Keep it</button>
          </span>
        )}
        {error && <p className="error" role="alert">{error}</p>}
      </div>
    </li>
  );
}

function EditForm({ booking: b, code, today, onWrongPin, onSaved, onClose }: {
  booking: Booking;
  code: string;
  today: string;
  onWrongPin: () => void;
  onSaved: (b: Booking) => void;
  onClose: () => void;
}) {
  const blocked = b.kind === "blocked";
  const started = b.checkIn < today;
  const [checkIn, setCheckIn] = useState(b.checkIn);
  const [checkInTime, setCheckInTime] = useState(b.checkInTime);
  const [checkOut, setCheckOut] = useState(b.checkOut);
  const [checkOutTime, setCheckOutTime] = useState(b.checkOutTime);
  const [name, setName] = useState(b.name);
  const [guests, setGuests] = useState(String(b.guests || 1));
  const [note, setNote] = useState(b.note);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (`${checkOut}T${checkOutTime}` <= `${checkIn}T${checkInTime}`) return setError("Check-out has to be after check-in.");
    setBusy(true);
    const res = await fetch(`/api/bookings/${b.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code, checkIn, checkOut, name, note,
        ...(blocked ? {} : { checkInTime, checkOutTime, guests: Number(guests) }),
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (res.status === 403) onWrongPin();
    if (!res.ok) return setError(data.clash ? clashText(data.clash) : (data.error ?? "That change didn't work."));
    onSaved(data.booking);
  }

  return (
    <form className="card stack edit-card" onSubmit={save}>
      <div className="row spread">
        <h2>{blocked ? "Edit blocked dates" : "Edit reservation"}</h2>
        <button type="button" className="link small" onClick={onClose}>Close</button>
      </div>
      <p className="muted small">{blocked ? "Change the dates or reason." : "Change the dates, times or details. Everyone sees the update right away."}</p>
      <div className="times">
        <div className="stack-tight">
          <label htmlFor="edit-in">Check-in day</label>
          <input id="edit-in" type="date" value={checkIn} min={started ? undefined : today} disabled={started}
            onChange={(e) => setCheckIn(e.target.value)} required />
        </div>
        {!blocked && (
          <div className="stack-tight">
            <label htmlFor="edit-in-time">Check-in time</label>
            <input id="edit-in-time" type="time" value={checkInTime} disabled={started} onChange={(e) => setCheckInTime(e.target.value)} required />
          </div>
        )}
        <div className="stack-tight">
          <label htmlFor="edit-out">Check-out day</label>
          <input id="edit-out" type="date" value={checkOut} min={checkIn} onChange={(e) => setCheckOut(e.target.value)} required />
        </div>
        {!blocked && (
          <div className="stack-tight">
            <label htmlFor="edit-out-time">Check-out time</label>
            <input id="edit-out-time" type="time" value={checkOutTime} onChange={(e) => setCheckOutTime(e.target.value)} required />
          </div>
        )}
      </div>
      {started && <p className="muted small">This stay has already started, so only the check-out can change.</p>}
      <label htmlFor="edit-name">{blocked ? "Reason (shown to family)" : "Name the stay is under"}</label>
      <input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
      {!blocked && (
        <>
          <label htmlFor="edit-guests">How many people</label>
          <input id="edit-guests" type="number" min={1} max={30} value={guests} onChange={(e) => setGuests(e.target.value)} required />
          <label htmlFor="edit-note">Note for the family <span className="muted">(optional)</span></label>
          <textarea id="edit-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        </>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="row">
        <button className="primary" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
        <button type="button" className="link" onClick={onClose}>Discard</button>
      </div>
    </form>
  );
}

type BackupInfo = { name: string; date: string; bytes: number; beforeRestore: boolean };

/** Admin only: daily copies kept on the server, plus downloads to keep elsewhere. */
function BackupsCard({ onRestored }: { onRestored: () => void }) {
  const [backups, setBackups] = useState<BackupInfo[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const refresh = useCallback(() => {
    fetch("/api/backup?type=list", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setBackups(d.backups))
      .catch(() => setFailed(true));
  }, []);
  useEffect(refresh, [refresh]);

  async function restore(b: BackupInfo) {
    setMessage("");
    const res = await fetch(`/api/backup/${b.name}`, { method: "POST" });
    const data = await res.json();
    setConfirming(null);
    if (!res.ok) return setMessage(data.error ?? "Restore failed.");
    setMessage(`Restored ${data.restored} booking${data.restored === 1 ? "" : "s"} from ${longDate(b.date)}. The bookings from before are saved as "Before restore" in the list, in case you need them back.`);
    refresh();
    onRestored();
  }

  const latest = backups?.find((b) => !b.beforeRestore);
  const size = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

  return (
    <div className="card stack backups-card">
      <div className="row spread">
        <h2>Backups</h2>
        <span className="pill admin">Admin</span>
      </div>
      <p className="muted small">
        {failed
          ? "Couldn't check the backups. Refresh to try again."
          : backups === null
            ? "Checking backups…"
            : latest
              ? `A copy of every booking is saved automatically each day; the last 14 days are kept. Latest: ${longDate(latest.date)}.`
              : "A copy of every booking is saved automatically each day. The first one is made a minute after the site starts."}
      </p>
      <p className="muted small">Those copies live on the same Railway disk. Download one now and then to keep a copy somewhere else.</p>
      <div className="row">
        <a className="primary" href="/api/backup?type=db" download>Download backup</a>
        <a className="pill-btn" href="/api/backup?type=csv" download>Download as spreadsheet</a>
      </div>
      {backups && backups.length > 0 && (
        <details className="small" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
          <summary>Copies on the server ({backups.length})</summary>
          <ul className="backup-list">
            {backups.map((b) => (
              <li key={b.name}>
                {confirming === b.name ? (
                  <span className="restore-confirm">
                    <span>Replace all bookings with the copy from {longDate(b.date)}? Today's bookings are saved first.</span>
                    <span className="row">
                      <button className="danger" onClick={() => restore(b)}>Restore</button>
                      <button className="link" onClick={() => setConfirming(null)}>Keep current</button>
                    </span>
                  </span>
                ) : (
                  <>
                    <span>{longDate(b.date)}{b.beforeRestore && <span className="muted"> · before restore</span>}</span>
                    <span className="muted">{size(b.bytes)}</span>
                    <a href={`/api/backup/${b.name}`} download>Download</a>
                    <button className="link" onClick={() => setConfirming(b.name)}>Restore</button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
      {message && <p className="small" role="status">{message}</p>}
    </div>
  );
}
