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
- **M5: Progression & intensity** — Per-plan progression schemes (double progression: fixed weight,
  reps 8→12, then +2.5 kg; linear progression: % of estimated 1RM, 70→85% ramp, 5 reps). The app
  suggests next-session weight + reps based on your history and RIR (reps in reserve, logged per set).
  Automatic 1RM estimation via Epley formula, break re-entry (2+ idle weeks → regressed load),
  and deload suggestions (−15% load, half the sets) when fatigue accumulates. RIR is optional and can be
  manually logged (0–5 scale chips per set). Per-set notes also tracked.
- **M6: Goals & adaptive tracking** — New Progress tab (bottom nav) with three sections. *Muscles*: volume-by-muscle-group
  dashboard showing sets and tonnage over 7/14/30/365-day rolling windows; each group is expandable to see the 17 individual
  muscles, and a stylized body-map heatmap overlays trained areas. *Goals*: create weight-loss, strength, or hypertrophy goals;
  track progress with a bar; get adaptive suggestions ("add" with a concrete least-recently-trained pick, "keep" or "reduce");
  memory prompt reuses the last goal's result when creating a new one (R7). *Body*: log current weight and optional measurements
  (waist, chest, arms, thighs, hips); hand-rolled SVG weight-trend sparkline shows progress over time. All synced via new RxDB
  collections (goals, bodymetrics) and D1.
- **M7: Recovery, consistency & motivation** — Daily 3-tap recovery-readiness check-in (sleep / soreness / energy) on Start Day,
  stored in synced `readiness` collection; a derived 0–100 score eases suggested load on run-down days (a readinessFactor in the
  progression engine). Training-streak tracking (measured in distinct training days; stays alive with up to 2 rest days between sessions)
  with detraining nudge when falling off pace. Today screen shows a streak chip, daily motivational quote, and per-session muscle micro-lesson.
  Personal record detection and celebration: top weight and estimated 1RM PRs from the progression engine. New Recovery tab under Progress
  showing readiness trend sparkline, streak tiles, detraining warning, and gamification badges (streak/PR/goal state derived from synced data,
  no new stored state). Native Web Push scaffold: client subscribe helper, service-worker push handlers, server-side `/push/subscribe`
  function storing to D1, and a streak-nudge sender (deploy-gated). See `.dev.vars.example` for VAPID key documentation.
- **M8: Exercise intelligence & anatomical body-map** — Replaced primitive-shape body outline with a real male/female + front/back
  anatomical muscle map (SVG paths vendored from MuscleMap). Sex toggle in Settings (localStorage `wa_sex`). New `customexercises`
  RxDB collection with smart auto-classification: create custom exercises by name, and the app auto-tags worked muscles via keyword
  matching. All exercises (catalog + custom) now appear in a searchable library under the Plans tab (new Plans | Exercises toggle).
  Each exercise has a detail card (`/app/exercises/:id`) with instructions/records toggle, worked-muscle body-map, focus area,
  equipment, how-to steps, YouTube search link, and cross-session records (heaviest, best e1RM, history). Body-map appears in two modes:
  heatmap (Progress tab, volume by muscle group) and highlight (exercise cards, primary/secondary muscles worked). Ad-hoc logging now
  works from Today via "Freestyle" session creation (empty-state prompt, "+ Add exercise" button) — no need for a separate Log tab.
  Navigation is now 4 tabs: Today / Plans / Progress / History.

**Not built yet:** recommendations, progress photos (deferred). See [Roadmap](#roadmap).

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
  │   ├─ sessions + setlogs    — append-only log of lifts (M5: +rir, +note)
  │   ├─ plans                 — user's own workout plans (M3, M5: +scheme)
  │   ├─ exclusions            — temporary/permanent movement exclusions (M4)
  │   ├─ goals                 — weight-loss/strength/hypertrophy goals (M6)
  │   ├─ bodymetrics           — weight + measurements log (M6)
  │   ├─ readiness             — daily recovery check-in, one row/day (M7)
  │   └─ customexercises       — user-created exercises with tagged muscles (M8)
  ├─ localStorage              — device-local environment + equipment prefs (M4); sex (M8)
  ├─ static exercise catalog   — seeded once, versioned JSON
  ├─ starter plans             — seeded at build time, versioned JSON (M3)
  ├─ body-map SVG paths        — anatomical male/female muscle map, vendored from MuscleMap (M8)
  └─ JWT held client-side
        │  (online only)
        ▼
Cloudflare Pages Functions
  ├─ /auth/*          — Google OAuth + email/password → mint JWT
  ├─ /sync            — push/pull RxDB collections, upsert + tombstone into D1, last-write-wins
  ├─ /share/publish   — publish a plan snapshot (owner-keyed upsert, stable shareCode) (M3)
  ├─ /share/[code]    — fetch a shared plan snapshot (M3)
  └─ /push/subscribe  — store a Web Push subscription (M7; delivery deploy-gated)
        ▼
D1 (SQLite) — per-user rows: sessions (with nullable plannedDay), setlogs (M5: +rir, +note),
              plans (M3, M5: +scheme), exclusions (M4), goals (M6), bodymetrics (M6), readiness (M7),
              customexercises (M8)
            — cross-user immutable rows: shared_plans (M3)
            — server-only rows: push_subscriptions (M7)
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
npm run seed:bodymap   # pulls anatomical body-map SVG paths (M8)
npm run dev            # → http://localhost:5173
```

**Full stack (auth + sync + plans against local D1):**

```bash
cp .dev.vars.example .dev.vars        # set JWT_SECRET; Google keys optional, see below
npx wrangler d1 migrations apply workout-db --local   # creates local D1 tables (M1-M8 migrations)
npm run seed:plans                     # generates starter plans into public/catalog/
npm run seed:bodymap                   # pulls anatomical body-map SVG paths (M8)
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
npm run smoke   # RxDB schema sanity check (9 collections including M8 customexercises)
npm run test    # 11 suites: sync replication, rotation, generation, progression (M5), volume + goals (M6), readiness + consistency + PR + gamification (M7), custom-exercise classification (M8), lifting math
```

## Using the app

1. Sign in (email/password or Google).
2. **Settings** (M4) — Configure your device: environment (home/gym), available equipment, and workout timing.
   Environment and equipment filters which exercises appear when plans are resolved. Workout timing
   (rest interval between sets, rough working-set duration, and a maximum sets-per-exercise ceiling) calibrates how many
   sets fit the Start-day time budget. The max-sets input (default 6) is adjustable to limit how many sets the budget
   algorithm assigns to any single exercise. Also manage temporary or permanent exclusions (rest a muscle group or specific exercise
   for a preset duration or forever) — useful for injury recovery or focusing on other body parts.
3. **Plans** (M3, M5, M8) — Build your own workout plan or adopt a starter plan. A plan defines "days"
   (e.g., Push, Pull, Legs), each with "slots" (e.g., Horizontal Push). Each slot holds an exercise pool.
   When you start a day, the app picks the least-recently-trained exercise from each pool,
   filtering out excluded exercises and unavailable equipment. You can preview and swap picks
   before locking the day. Share your plans with other users via a stable share code; they can
   adopt a copy into their own plans. Each plan has a progression scheme (double progression or linear progression);
   the app uses it to suggest next-session weight + reps based on your history and logged intensity.
   The Plans tab also has an **Exercises** view (Plans | Exercises toggle): a searchable library of all exercises
   (catalog + custom). Each exercise opens a detail card with worked-muscle body-map (front/back), focus area,
   equipment, instructions, and cross-session records (heaviest, best estimated 1RM, history).
4. **Start Day** (M4, M5) — Enter a time budget (minutes). The app auto-assigns sets and target reps
   per exercise to fit the budget: reps are set by exercise role (heavy compounds = 8 reps, isolations = 12 reps,
   unknown = 10), and sets grow one at a time, prioritizing compounds first. Per-set time comes from your
   calibration in Settings (rest interval + working-set duration). If no budget, everything defaults to 2 sets
   at role-based reps. The active progression scheme is shown; if a deload is suggested (based on accumulated
   fatigue), a banner offers to apply it (−15% load, half the sets). Mobility blocks appear for warm-up
   (stretches targeting the day's trained muscles) and cool-down, each with a seconds countdown.
   A quick **recovery check-in** (M7) — three taps for sleep, soreness, and energy — gives a 0–100
   readiness score; on a run-down day the loggers ease that session's suggested weights automatically.
5. **Progress** (M6, M7, M8) — Bottom-nav tab with four sections. *Muscles*: see training volume (sets + tonnage) per muscle group
   over rolling 7/14/30/365-day windows; expand each group to drill into the 17 individual muscles; an anatomical body-map
   heatmap (male/female, front/back) overlays trained areas. *Goals*: create a goal (lose fat, gain strength on a specific lift, or build muscle),
   watch your progress with a bar, and get adaptive suggestions (add a least-recently-trained exercise, keep the current plan,
   or reduce volume). When you finish a goal and start a new one, the app asks if you want to reuse the last cycle's result.
   *Body*: log your current weight and any measurements (waist, chest, arms, thighs, hips); a hand-rolled weight-trend sparkline
   visualizes your progress over time. *Recovery* (M7): your readiness trend, current training day streak (and best, forgiving up to 2 rest days
   between sessions), a nudge if you've been away long enough to lose progress, and goal-tied badges you've earned.
6. **Today** (M8) — When a plan day is locked, each planned exercise appears as an inline mini-logger.
   For each exercise: see suggested weight + reps (from the plan's progression scheme), warm-up sets
   (steps down from the last working weight), and a plate calculator (barbell plate stack per side;
   edit the bar weight in the calculator if your bar is not 20 kg). A labeled "Info" button on each exercise opens its detail page
   with instructions, worked muscles, and cross-session records. Tap a row to expand it, log weight × reps per set.
   Optionally log RIR (reps in reserve, 0–5 scale) and a per-set note for each set; these feed the progression
   engine and are shown in history. Mid-workout actions: swap to a different exercise (drawing from your plan's pool),
   add a new exercise from the catalog (an "+ Add exercise" button at the bottom), or temporarily exclude an exercise
   or muscle group to rest. When you exclude an exercise ("Rest this lift" or "Rest {muscle}"), an inline confirmation appears
   explaining the exclusion takes effect on the next generated day (not the current session) and can be ended anytime in Settings.
   Ad-hoc exercises added mid-session can be saved to the plan so they recur next time.
   Rows turn green once you've logged the target number of sets. Any lifts logged outside the plan appear under "Also logged",
   each also with an "Info" button to view details. Stats show today's total set count, lift count, and volume. A motivation strip (M7) sits
   at the top: your current day streak, a daily quote, a celebration when you set a personal record, and a short muscle micro-lesson for the day.
   To log lifting without a plan, use the empty-state "Start logging" button or the "+ Add exercise" action to create a "Freestyle"
   session and log on-the-fly. Last session's numbers for each exercise are pre-filled.
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
| ✓ Progression & intensity (M5) | Per-plan progression schemes (double & linear), automatic weight + reps suggestion, RIR logging, 1RM estimation, break re-entry, deload detection. |
| ✓ Goals & body tracking (M6) | Weight-loss, strength, and hypertrophy goals with progress bars and adaptive suggestions. Body weight + measurements tracking with trend sparkline. Volume-by-muscle-group dashboard over 7/14/30/365-day windows with drill-down and body-map overlay. |
| ✓ Recovery, consistency & motivation (M7) | Daily recovery-readiness check-in that eases suggested load on run-down days; weekly training streaks + "cost of falling off" nudges; personal-record detection & celebration; goal-tied badges + per-session muscle micro-lessons; native Web Push reminder scaffold (delivery deploy-gated). |
| ✓ Exercise intelligence & body-map (M8) | Anatomical male/female muscle map (front/back, from MuscleMap) appearing on exercise cards and the Progress heatmap. Custom exercises with smart auto-classification: name → muscle tagging via keyword matching. Searchable exercise library with detail cards showing worked muscles, instructions, records, and YouTube links. |
| Optional AI layer | Bring your own AI key to improve plans/recommendations. Never required — the app works fully without it. |

Nutrition tracking, wearable integrations, and AI form-checking are under consideration but
not scheduled.
