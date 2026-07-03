# Rackd

A workout tracker that's fast enough to use mid-set, offline-first, and shared with family.
Pick a lift, log weight + reps, the app auto-fills your last numbers so logging takes one tap.
No signal in the gym is fine — it syncs when you're back online.

The bigger goal: most trackers stop at logging. Rackd is being built to also tell you
**what to train next**, based on your recovery and what you've eaten — not just your last
session. That part isn't built yet (see [Roadmap](#roadmap)).

## Status

**Working today:**
- Email/password and Google sign-in
- Offline-first logging (RxDB + IndexedDB) — works with no connection
- Sync across devices via Cloudflare D1 (last-write-wins)
- Today / Log / History views, kg↔lb toggle, JSON data export
- Installable PWA
- **M3: Workout plans** — build a plan, exercises rotate automatically within each slot's pool,
  share plans with other users (immutable snapshots), adopt starter plans or shared plans by code.
- **M4: Rules-based session generation** — time-budget auto-assignment: reps by exercise role
  (compound/isolation/unknown), sets grown greedily with compound priority; per-set time from user
  calibration (rest + work durations in Settings). Environment/equipment awareness filters exercise
  pools by available gear. Temporary injury and movement exclusions (synced per device/user, auto-expire
  or permanent), mobility blocks (warm-up/cooldown stretches from catalog), warm-up set calculation,
  plate stacking math, mid-workout exercise swaps, and add-to-session / save-to-plan (pick an exercise
  mid-workout to add it to today's session; optionally persist it into the plan so it recurs next time).

**Not built yet:** load auto-progression, RPE, goals, recovery tracking, recommendations.
See [Roadmap](#roadmap).

Not deployed anywhere yet — runs locally for now.

## Tech stack

| | |
|---|---|
| Frontend | React 19 + TypeScript, Vite, Tailwind CSS, React Router |
| Drag-and-drop | @dnd-kit (core, sortable, utilities) |
| Local data | RxDB on Dexie (IndexedDB) — local-first, offline by default |
| Backend | Cloudflare Pages Functions (Workers) |
| Database | Cloudflare D1 (SQLite) |
| Auth | Google OAuth + email/password, stateless JWT |
| PWA | vite-plugin-pwa |
| Exercise catalog | seeded from [free-exercise-db](https://github.com/yuhonas/free-exercise-db), versioned static JSON |
| Starter plans | seeded from scripts/seed-starter-plans.ts, static JSON |

## Architecture

```
Browser (PWA, React + Vite)
  ├─ RxDB + Dexie (IndexedDB)   — local-first store, works offline
  │   ├─ sessions + setlogs    — append-only log of lifts
  │   ├─ plans                 — user's own workout plans (M3)
  │   └─ exclusions            — temporary/permanent movement exclusions (M4)
  ├─ localStorage              — device-local environment + equipment prefs (M4)
  ├─ static exercise catalog   — seeded once, versioned JSON
  ├─ starter plans             — seeded at build time, versioned JSON (M3)
  └─ JWT held client-side
        │  (online only)
        ▼
Cloudflare Pages Functions
  ├─ /auth/*          — Google OAuth + email/password → mint JWT
  ├─ /sync            — push/pull RxDB collections, upsert + tombstone into D1, last-write-wins
  ├─ /share/publish   — publish a plan snapshot (owner-keyed upsert, stable shareCode) (M3)
  └─ /share/[code]    — fetch a shared plan snapshot (M3)
        ▼
D1 (SQLite) — per-user rows: sessions (with nullable plannedDay), setlogs, plans (M3),
              exclusions (M4)
            — cross-user immutable rows: shared_plans (M3)
            ↕ pull restores the same data on a new device
```

Sync model: client-generated UUID `id`, `createdAt`/`updatedAt`, `deletedAt` tombstone,
last-write-wins by `updatedAt`. No CRDTs.

## Run it locally

**Logging only, no sync, no auth:**

```bash
npm install
npm run seed           # pulls the exercise catalog into public/catalog/
npm run seed:plans     # generates starter plans into public/catalog/ (M3)
npm run dev            # → http://localhost:5173
```

**Full stack (auth + sync + plans against local D1):**

```bash
cp .dev.vars.example .dev.vars        # set JWT_SECRET; Google keys optional, see below
npx wrangler d1 migrations apply workout-db --local   # creates local D1 tables (sessions, setlogs, plans, shared_plans via M3)
npm run seed:plans                     # generates starter plans into public/catalog/
npm run dev:api   # terminal 1 — Pages Functions + local D1 on http://localhost:8788
npm run dev       # terminal 2 — app on http://localhost:5173 (proxies /auth + /sync + /share to :8788)
```

Open the app at **http://localhost:5173** (not :8788). Both processes must be running for
email/password + Google sign-in, sync, and plan sharing to work.

Set `AUTH_STUB=1` in `.dev.vars` to sign in without a real Google OAuth client — it adds
`/auth/dev-login`, which mints a real JWT for a fake identity. Email/password sign-in always
works against local D1 and doesn't need this flag; it only matters for the Google button.
Never set it in production.

**Tests:**
```bash
npm run smoke   # RxDB schema sanity check
npm run test    # sync replication, rotation, session generation, lifting math
```

## Using the app

1. Sign in (email/password or Google).
2. **Settings** (M4) — Configure your device: environment (home/gym), available equipment, and workout timing.
   Environment and equipment filters which exercises appear when plans are resolved. Workout timing
   (rest interval between sets, rough working-set duration, and a maximum sets-per-exercise ceiling) calibrates how many
   sets fit the Start-day time budget. The max-sets input (default 6) is adjustable to limit how many sets the budget
   algorithm assigns to any single exercise. Also manage temporary or permanent exclusions (rest a muscle group or specific exercise
   for a preset duration or forever) — useful for injury recovery or focusing on other body parts.
3. **Plans** (M3) — Build your own workout plan or adopt a starter plan. A plan defines "days"
   (e.g., Push, Pull, Legs), each with "slots" (e.g., Horizontal Push). Each slot holds an exercise pool.
   When you start a day, the app picks the least-recently-trained exercise from each pool,
   filtering out excluded exercises and unavailable equipment. You can preview and swap picks
   before locking the day. Share your plans with other users via a stable share code; they can
   adopt a copy into their own plans.
4. **Start Day** (M4) — Enter a time budget (minutes). The app auto-assigns sets and target reps
   per exercise to fit the budget: reps are set by exercise role (heavy compounds = 8 reps, isolations = 12 reps,
   unknown = 10), and sets grow one at a time, prioritizing compounds first. Per-set time comes from your
   calibration in Settings (rest interval + working-set duration). If no budget, everything defaults to 2 sets
   at role-based reps. Mobility blocks appear for warm-up (stretches targeting the day's trained muscles)
   and cool-down, each with a seconds countdown.
5. **Today** — When a plan day is locked, each planned exercise appears as an inline mini-logger.
   For each exercise: see warm-up sets (steps down from the last working weight) and a plate calculator
   (barbell plate stack per side; edit the bar weight in the calculator if your bar is not 20 kg). Tap a row to expand it, log weight × reps per set.
   Mid-workout actions: swap to a different exercise (drawing from your plan's pool),
   add a new exercise from the catalog (an "+ Add exercise" button at the bottom), or temporarily exclude an exercise
   or muscle group to rest. When you exclude an exercise ("Rest this lift" or "Rest {muscle}"), an inline confirmation appears
   explaining the exclusion takes effect on the next generated day (not the current session) and can be ended anytime in Settings.
   Ad-hoc exercises added mid-session can be saved to the plan so they recur next time.
   Rows turn green once you've logged the target number of sets. Any lifts logged outside the plan appear under "Also logged".
   Stats show today's total set count, lift count, and volume.
6. **Log** — Search the exercise catalog and log weight + reps per set (logging is now inline on Today
   when following a plan). Last session's numbers for that exercise are pre-filled.
7. **History** — Past sessions.
8. Toggle kg/lb anytime from the header. Export all your data as JSON from the same header.

Data lives on your device first. If you're signed in and online, it syncs to your other
devices automatically.

## Roadmap

In rough order, each one shippable on its own:

| | |
|---|---|
| ✓ Plans & templates (M3) | Build a workout plan once, reuse it. Exercises rotate automatically within each slot's pool. Share plans with other users (immutable snapshots). |
| ✓ Rules-based generation (M4) | Time-budget auto-assignment, equipment/environment awareness, injury exclusions, mobility blocks, warm-up sets, plate math, mid-workout swaps. |
| Load progression (M5) | Weights increase week over week automatically, with manual override and RPE logging. |
| Goals & body tracking | Track weight, measurements, progress photos. See training volume per muscle group over time. |
| Recovery & consistency | Recovery-readiness score, streaks, nudges when you're falling off pace. |
| Exercise intelligence | Visual muscle map per exercise; smart classification for custom exercises you add. |
| Optional AI layer | Bring your own AI key to improve plans/recommendations. Never required — the app works fully without it. |

Nutrition tracking, wearable integrations, and AI form-checking are under consideration but
not scheduled.
