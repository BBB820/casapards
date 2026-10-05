"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addDays, dayInfo, daysBetween, DEFAULT_CHECK_IN, DEFAULT_CHECK_OUT, MAX_DAYS, MAX_DAYS_AHEAD, monthGrid,
  todayISO, type DayInfo,
} from "@/lib/dates.ts";
import type { Booking } from "@/lib/bookings.ts";

type Props = { houseName: string; isAdmin: boolean; canSignOut: boolean };
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
const daysLabel = (n: number) => `${n} day${n === 1 ? "" : "s"}`;
const stayText = (b: Booking) =>
  b.kind === "blocked"
    ? `${longDate(b.checkIn)}${b.checkOut !== b.checkIn ? ` – ${longDate(b.checkOut)}` : ""}`
    : `${longDate(b.checkIn)}, ${timeText(b.checkInTime)} → ${longDate(b.checkOut)}, ${timeText(b.checkOutTime)}`;
const clashText = (c: Booking) => `That overlaps ${c.name} (${stayText(c)}). Pick other dates or times.`;
const maxTime = (a: string, b: string) => (a > b ? a : b);
const minTime = (a: string, b: string) => (a < b ? a : b);

export default function BookingApp({ houseName, isAdmin, canSignOut }: Props) {
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
  const maxOffset = 12;
  const upcoming = bookings.filter((b) => b.checkOut >= today);
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
    />
  );

  const instruction = !loaded
    ? "Checking which days are free…"
    : !first
      ? "Tap your check-in day."
      : !last
        ? "Now tap your check-out day. Tap the same day again for a day visit."
        : `${longDate(first)}${last !== first ? ` – ${longDate(last)}` : ""} picked.`;

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

          <ul className="legend small">
            <li><span className="swatch free" /> Free</li>
            <li><span className="swatch bar" /> Booked</li>
            <li><span className="swatch half" /> Check-out / check-in day (free part shown)</li>
            <li><span className="swatch blocked" /> Unavailable</li>
            <li><span className="swatch picked" /> Your dates</li>
          </ul>
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
            <div className="card stack">
              <h2>Reserve a stay</h2>
              <p className="muted">
                {first
                  ? `Check-in: ${longDate(first)}. Now tap your check-out day.`
                  : `Tap your check-in day, then your check-out day. Check-in is from ${timeText(DEFAULT_CHECK_IN)} and check-out by ${timeText(DEFAULT_CHECK_OUT)} unless you choose other times. Half bars show the day someone leaves or arrives, with the time. Tap a coloured bar to see that stay.`}
              </p>
              {first && (
                <div className="row">
                  <button className="primary" onClick={() => pick(first)}>Day visit on {longDate(first)}</button>
                  <button className="link" onClick={clearSelection}>Start over</button>
                </div>
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
        </aside>
      </section>
    </main>
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
function segmentsFor(day: string, bookings: Booking[], weekday: number, monthStart: string, monthEnd: string): Segment[] {
  const segs: Segment[] = [];
  for (const b of bookings) {
    if (day < b.checkIn || day > b.checkOut) continue;
    const part = b.checkIn === b.checkOut ? "visit" : day === b.checkIn ? "in" : day === b.checkOut ? "out" : "full";
    const startsHere = part === "in" || part === "visit" || ((weekday === 0 || day === monthStart) && (part === "full" || part === "out"));
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
  const { year, month, today, lastBookable, bookings, colors, editingId, info, first, last, preview, onPick, onOpenStay, selecting, onHover } = props;
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
        const segs = segmentsFor(day, bookings, weekday, monthStart, monthEnd);
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
            aria-label={`${fmt(day, { dateStyle: "full" })}, ${describe}`}
            aria-pressed={inRange}
            title={out ? undefined : describe}
          >
            <span className="num">{Number(day.slice(8))}</span>
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

function StayRow({ booking: b, color, unlocked, isAdmin, editing, onEdit, onDelete, onUnlock, onLock }: {
  booking: Booking;
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
        <span className={`dot ${color}`} aria-hidden="true" />
        <strong>{b.name}</strong>
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
