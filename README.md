# Casa Pards reservations

A small booking calendar for the family vacation house. Family members open the
calendar, see which nights are free, tap the day they arrive and the day they
leave, and reserve. Two stays can never overlap.

## How it works

- **Any days, any length.** A stay runs from check-in to check-out (up to 21
  nights, up to a year ahead). The check-out day is free for the next family to
  arrive.
- **No double bookings.** Every occupied night is a row with a unique key in
  SQLite, so if two people reserve the same weekend at the same moment, one
  succeeds and the other is told to pick different dates.
- **Family passcode.** Everyone shares one passcode to see the calendar and book.
- **Cancel codes.** After booking you get a 6-character code. The phone you
  booked on remembers it; from any other device you can cancel with the code.
- **Admin.** Sign in with the admin passcode to cancel any stay and to block
  dates (repairs, owners' use). Blocked dates show as striped.

## Run it locally

Needs Node.js 22.13 or newer (it uses Node's built-in SQLite, no database server).

```bash
npm install
cp .env.example .env.local   # then edit the passcodes
npm run dev                  # http://localhost:3000
```

```bash
npm test          # date logic + booking rules, including overlap checks
npm run typecheck
```

## Settings

| Variable          | What it does                                                         |
|-------------------|----------------------------------------------------------------------|
| `FAMILY_PASSCODE` | Passcode to see and book. Empty means anyone with the link can book.  |
| `ADMIN_PASSCODE`  | Passcode for admin powers. Required.                                 |
| `SESSION_SECRET`  | Random string that signs login cookies. Falls back to the passcodes. |
| `DATABASE_PATH`   | SQLite file. Default: the Railway volume, else `data/casapards.db`.  |
| `HOUSE_TIMEZONE`  | IANA time zone of the house, used for "today", e.g. `Europe/Madrid`. |
| `HOUSE_NAME`      | Name in the header. Default `Casa Pards`.                            |

## Deploying

The app keeps its data in one SQLite file, so it needs a host with a
**persistent disk**. Serverless hosts like Vercel or Netlify wipe the disk
between requests and will lose bookings.

Good fits:

- **Railway** (config in `railway.json`):
  1. New Project → Deploy from GitHub repo → `casapards`.
  2. On the service, add a **Volume** mounted at `/data`. The deploy waits
     for it, so bookings survive redeploys.
  3. Under Variables set `FAMILY_PASSCODE`, `ADMIN_PASSCODE` and
     `HOUSE_TIMEZONE`. The database goes on the volume automatically.
     `SESSION_SECRET` (`openssl rand -hex 32`) is recommended; without it
     the login cookies are signed with a key derived from the passcodes.
  4. Settings → Networking → Generate Domain. Keep it at one replica
     (SQLite is a single file).
- **Render**: create a web service from this repo with a persistent disk
  mounted at `/data`, the same variables, build command `npm run build` and
  start command `npm start`.
- **Fly.io**: `fly launch`, then `fly volumes create data --size 1` and mount it
  at `/data` in `fly.toml`.
- **Any small VPS or home server**: `npm ci && npm run build && npm start`
  behind a reverse proxy with HTTPS.

Back up by copying the `.db` file while the app is stopped, or with
`sqlite3 casapards.db ".backup backup.db"` while it runs.

## Project layout

```
app/                 pages and API routes (Next.js App Router)
  api/bookings       list and create bookings
  api/bookings/[id]  cancel a booking
  api/session        passcode sign-in and sign-out
components/          calendar, reserve form, stays list, login form
lib/dates.ts         pure date rules shared by server, UI and tests
lib/bookings.ts      create, list and cancel bookings in SQLite
lib/db.ts            schema and connection
lib/auth.ts          passcode sessions (signed cookies)
test/                node:test unit tests
```
