# Rackd

A workout tracker that's fast enough to use mid-set, offline-first, and shared with family.
Pick a lift, log weight + reps, and the app auto-fills your last numbers so logging takes one tap.
No signal in the gym is fine — it syncs when you're back online.

**Live:** [rackd.someshrao.fyi](https://rackd.someshrao.fyi/)

Most trackers stop at logging. Rackd also decides **what you train next** — plan days rotate on
a schedule you choose, weights and reps come from your own history and logged intensity, and the
session eases itself on days you report as run-down.

## Features

- **Offline-first logging** — RxDB on IndexedDB. The app is fully usable with no connection;
  writes replicate to Cloudflare D1 when you're back online (last-write-wins, no CRDTs). Log
  against a plan, or start a plan-free "Freestyle" session and log on the fly.
- **Plans & scheduling** — Build a plan of days (Push/Pull/Legs) and slots, or adopt one of 10
  curated goal-tagged starter plans. Each slot has an anchor lift plus 4–5 alternatives so you can
  rotate equipment without losing progressive overload on the main movement. Enroll a plan with a
  start date and training weekdays; days rotate across them and self-heal over missed sessions.
  A calendar strip on Today shows finished workouts and what's coming up, and an explicit "Finish
  workout" action advances the rotation. Share plans by code as immutable snapshots. Adopted starter
  plans can refresh their exercise pools to access the latest alternatives.
- **Session generation** — Give it a time budget and it assigns sets and target reps per exercise,
  reps by movement role and sets grown greedily with compounds first, using your own rest and
  working-set timings. Filters by your environment and available equipment. Each slot's anchor lift
  is always proposed when it survives filtering, so main lifts progress uninterrupted. You can add
  multiple alternatives to a single slot before locking, and each gets its own independent logger
  and budget allocation.
- **Progression & intensity** — Double progression (reps 8→12, then +2.5 kg) or linear (% of
  estimated 1RM). Suggests next-session weight and reps from your history and RIR, estimates 1RM
  via Epley, regresses load after a break, and offers a deload when fatigue accumulates.
- **Equipment-aware substitution** — No barbell? "Use dumbbells instead" rewrites a plan's barbell
  lifts to dumbbell equivalents. Slots that match nothing in your kit auto-swap to a catalog
  equivalent, labelled so you can see it happened.
- **Exercise library** — 2,032 exercises, searchable and filterable by muscle group, movement
  pattern, and equipment. 1,287 carry animated demonstration GIFs. Detail cards show worked muscles
  on an anatomical body map, instructions, and your cross-session records. When building a plan or
  adding exercises mid-session, you can multi-select exercises at once and view inline details without
  losing your selection. Add your own custom exercises — the app auto-tags the muscles they work from
  the name.
- **Progress tracking** — Volume by muscle group over 7/14/30/365-day windows with drill-down to 17
  individual muscles and a body-map heatmap. Weight-loss, strength, and hypertrophy goals with
  adaptive suggestions. Body weight and measurements with a trend sparkline.
- **Recovery & consistency** — A three-tap daily readiness check-in (sleep / soreness / energy)
  produces a 0–100 score that feeds the progression engine. Training streaks forgive up to two rest
  days, with a nudge when you fall off pace. Personal records are detected and celebrated.
- **Timed circuits** — Plan days can define work/rest intervals and rounds, driven by an on-screen
  countdown with a progress ring and audio cues.
- **In-session tools** — Warm-up sets stepped down from your last working weight, per-side barbell
  plate math (with an editable bar weight), mobility warm-up and cooldown blocks on a countdown,
  mid-workout swaps, and add-an-exercise that can be saved back into the plan so it recurs. Tweaked
  something? Rest a single lift or a whole muscle group, temporarily or permanently.
- **Accounts & sync** — Email/password or Google sign-in, with name and date of birth captured at
  signup and editable later in Settings. Sign in on another device and everything is restored.
- **Installable PWA** — Add to home screen, kg↔lb toggle, and full JSON data export.

Not built yet: the optional bring-your-own-key AI layer and progress photos. See [Roadmap](#roadmap).

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

## Architecture

```
Browser (PWA, React + Vite)
  ├─ RxDB + Dexie (IndexedDB)   — local-first store, works offline
  │   ├─ exercises              — seeded catalog, local only (not synced)
  │   ├─ sessions + setlogs     — append-only log of lifts
  │   ├─ plans                  — workout plans, schedule, progression scheme
  │   ├─ exclusions             — temporary/permanent movement exclusions
  │   ├─ goals                  — weight-loss / strength / hypertrophy goals
  │   ├─ bodymetrics            — weight + measurements log
  │   ├─ readiness              — daily recovery check-in, one row per day
  │   └─ customexercises        — user-created exercises with tagged muscles
  ├─ localStorage               — device-local environment, equipment, and sex prefs
  ├─ static exercise catalog    — seeded once, versioned JSON
  ├─ body-map SVG paths         — anatomical male/female muscle map
  └─ JWT held client-side
        │  (online only)
        ▼
Cloudflare Pages Functions
  ├─ /auth/*          — Google OAuth + email/password → mint JWT; /auth/account edits profile
  ├─ /sync/{pull,push}/{collection}
  │                   — replicate the 8 synced collections; upsert + tombstone into D1
  ├─ /share/publish   — publish a plan snapshot (owner-keyed upsert, stable share code)
  ├─ /share/[code]    — fetch a shared plan snapshot
  └─ /push/subscribe  — store a Web Push subscription (sending is deploy-gated)
        ▼
D1 (SQLite) — per-user rows: users, sessions, setlogs, plans, exclusions,
                             goals, bodymetrics, readiness, customexercises
            — cross-user immutable rows: shared_plans
            — server-only rows: push_subscriptions
            ↕ pull restores the same data on a new device
```

Sync model: client-generated UUID `id`, `createdAt`/`updatedAt`, `deletedAt` tombstone, last-write-wins
by `updatedAt`. `userId` is always taken from the verified JWT and never from the request body — that's
the per-user isolation boundary.

## Run it locally

**Logging only, no sync, no auth:**

```bash
npm install
npm run seed           # build the exercise catalog into public/catalog/
npm run seed:plans     # generate starter plans
npm run seed:bodymap   # pull anatomical body-map SVG paths
npm run dev            # → http://localhost:5173
```

**Full stack (auth + sync + sharing against local D1):**

```bash
cp .dev.vars.example .dev.vars                        # set JWT_SECRET; Google keys optional
npx wrangler d1 migrations apply workout-db --local   # create local D1 tables
npm run seed && npm run seed:plans && npm run seed:bodymap

npm run dev:api   # terminal 1 — Pages Functions + local D1 on http://localhost:8788
npm run dev       # terminal 2 — app on http://localhost:5173 (proxies /auth + /sync)
```

Open the app at **http://localhost:5173** (not :8788). Both processes must be running for sign-in,
sync, and plan sharing to work.

Set `AUTH_STUB=1` in `.dev.vars` to sign in without a real Google OAuth client — it adds
`/auth/dev-login`, which mints a real JWT for a fake identity. Email/password sign-in always works
against local D1 and doesn't need this flag. **Never set it in production.**

**Tests:**

```bash
npm run smoke   # RxDB schema sanity check (9 collections)
npm run test    # sync replication, rotation, generation, lifting math, progression, volume,
                # goals, readiness, consistency, PRs, gamification, scheduling, circuits,
                # exercise filtering, plan editing, equipment substitution
```

## Deploy

Deployed as a Cloudflare Pages project (`rackd`, build output `dist`).

```bash
npm run build
npx wrangler pages deploy                             # project: rackd
npx wrangler d1 migrations apply workout-db --remote  # apply migrations to production D1
```

Set production secrets once — never commit them:

```bash
npx wrangler pages secret put GOOGLE_CLIENT_ID
npx wrangler pages secret put GOOGLE_CLIENT_SECRET
npx wrangler pages secret put JWT_SECRET
```

In the Google Cloud console, add the deployed callback as an authorized redirect URI
(`https://<your-domain>/auth/google/callback`). Web Push additionally needs a VAPID key pair —
see `.dev.vars.example`. Make sure `AUTH_STUB` is **not** set in the production environment.

## Roadmap

| | |
|---|---|
| Optional AI layer | Bring your own AI key to improve plans and recommendations. Never required — the app works fully without it. |
| Progress photos | Deferred. |

Nutrition tracking, wearable integrations, and AI form-checking are under consideration but not scheduled.

## Credits

- Exercise catalog merged from [free-exercise-db](https://github.com/yuhonas/free-exercise-db) and the
  [ExerciseDB v1 dataset](https://github.com/hasaneyldrm/exercises-dataset), deduplicated by normalized
  name. Demonstration GIFs are hotlinked from `exercisedb.dev` and require a connection.
- Anatomical muscle-map SVG paths vendored from [MuscleMap](https://github.com/melihcolpan/MuscleMap)
  — MIT, © Melih Colpan.
