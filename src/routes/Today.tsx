import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useRxData } from '../db/useRxData'
import type { Exercise, SetLog, MobilityStep, Plan, PlanDay, PlannedDay, Session, CustomExercise } from '../db/schema'
import { addPickToDay, startAdHocSession, unenrollPlan, setMobility, deriveMobility, materializeDay, lockDay, skipDay, unskipDay } from '../db/plans'
import { useDayProposal } from '../db/useDayProposal'
import { groupPicksBySection, sectionProgress, sectionLabelFor } from '../lib/daySections'
import { finishSession } from '../db/actions'
import { parseSchedule, nextUpIndex, forecast, addDays } from '../lib/schedule'
import { parsePlannedDay, trainedSessions, lastCompletedDay, isSkipped } from '../lib/plannedDay'
import { workSets } from '../lib/lifting'
import { customToExercise } from '../db/customExercises'
import { type Unit, useUnit, formatWeight } from '../lib/units'
import { trainingStreak } from '../lib/consistency'
import { prsOn, type PR, type PRSet } from '../lib/pr'
import { quoteOfDay } from '../lib/quotes'
import { lessonForMuscles } from '../lib/lessons'
import { groupByExercise, totalVolumeKg, type ExerciseGroup } from '../components/groupSets'
import { SetRow } from '../components/SetRow'
import { PlannedExerciseRow } from '../components/PlannedExerciseRow'
import { MobilityBlock } from '../components/MobilityBlock'
import { SectionHeader } from '../components/SectionHeader'
import { CircuitTimer } from '../components/CircuitTimer'
import { ExercisePicker } from '../components/ExercisePicker'
import { ExerciseInfoLink } from '../components/ExerciseInfoLink'
import { CalendarStrip } from '../components/CalendarStrip'

const today = () => new Date().toISOString().slice(0, 10)
const fmtDay = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { ...opts, timeZone: 'UTC' })
const parsePlanDays = (raw: string): PlanDay[] => {
  try {
    return JSON.parse(raw) as PlanDay[]
  } catch {
    return []
  }
}

type Agenda = {
  days: PlanDay[]
  upcoming: { date: string; dayIndex: number }[]
  todayEntry: { date: string; dayIndex: number } | null
}

export function Today() {
  const { user } = useAuth()
  const userId = user?.id ?? ''
  const unit = useUnit()
  const date = today()
  const [adding, setAdding] = useState(false)
  // First name for the greeting; skip it when the stored name is still an email (pre-profile accounts).
  const firstName = user?.name && !user.name.includes('@') ? user.name.split(' ')[0] : null

  // One reactive query feeds today's session, the calendar marks, the streak, and the agenda.
  const sessions = useRxData<Session>(
    (db) => db.sessions.find({ selector: { userId, deletedAt: null } }),
    [userId],
  )
  const session = useMemo(() => sessions.find((s) => s.date === date) ?? null, [sessions, date])
  const sessionId = session?.id ?? null

  // Catalog + custom maps for swap names, the micro-lesson, and the "rest this muscle" shortcut (M4).
  // Custom exercises are merged so a logged custom lift resolves its name/muscle/equipment too (R1).
  const exercises = useRxData<Exercise>((db) => db.exercises.find(), [])
  const custom = useRxData<CustomExercise>((db) => db.customexercises.find({ selector: { userId, deletedAt: null } }), [userId])
  const allEx = useMemo(() => [...exercises, ...custom.map(customToExercise)], [exercises, custom])
  const exMap = useMemo(() => new Map(allEx.map((e) => [e.id, e])), [allEx])
  const nameOf = useMemo(() => new Map(allEx.map((e) => [e.id, e.name])), [allEx])
  const muscleOf = useMemo(() => new Map(allEx.map((e) => [e.id, e.primaryMuscles[0] ?? ''])), [allEx])
  // equipment gates the plate calculator — only plate-loaded bars have a "per side" stack.
  const equipmentOf = useMemo(() => new Map(allEx.map((e) => [e.id, e.equipment ?? ''])), [allEx])

  // The day COMMITTED to today's session. Distinct from `planned` below on purpose: anything that
  // decides whether today counts as trained — the rotation, the rest-day layout — must read this
  // one, never the uncommitted proposal.
  const persisted = useMemo<PlannedDay | null>(() => parsePlannedDay(session?.plannedDay), [session])

  // Freestyle sessions are created with no mobility (there are no picks yet to derive from). Once
  // something is logged, propose one from what's actually being trained — the same derivation the
  // plan days use — and persist it so it survives a reload and stays editable like any other.
  useEffect(() => {
    if (!sessionId || !persisted || persisted.dayId !== 'adhoc') return
    if (persisted.warmup || persisted.cooldown || persisted.picks.length === 0 || allEx.length === 0) return
    const derived = deriveMobility('adhoc', persisted.picks, exMap)
    // Write both unconditionally — an empty list still trips the guard above, so a session whose
    // muscles match no stretch derives once instead of on every render. Sequential: each call is a
    // read-modify-write of the same plannedDay blob, so firing them together loses one.
    void (async () => {
      await setMobility(sessionId, 'warmup', derived.warmup ?? [])
      await setMobility(sessionId, 'cooldown', derived.cooldown ?? [])
    })()
  }, [sessionId, persisted, allEx, exMap])

  // Enrollment (M8.2): the single active plan and which of its days lands on which date. Rotation
  // continues from the last FINISHED workout; today's locked day (even unfinished) counts so
  // "next up" moves past it.
  // `enrolledAt: { $ne: null }` selectors don't match under the Dexie storage, so query plainly and
  // filter in JS (like Plans.tsx). Pick the most-recently-enrolled so a stale prior enrollment that
  // a broken clear-loop left behind can't win — and self-heal that stale row below.
  const userPlans = useRxData<Plan>(
    (db) => db.plans.find({ selector: { userId, deletedAt: null } }),
    [userId],
  )
  const activePlans = useMemo(
    () =>
      userPlans
        .filter((p) => p.enrolledAt != null)
        .sort((a, b) => (b.enrolledAt ?? '').localeCompare(a.enrolledAt ?? '')),
    [userPlans],
  )
  const enrolled = activePlans[0] ?? null

  // Self-heal: enforce the "one active plan" invariant if an earlier clear-loop bug left extras
  // enrolled. Unenroll all but the most recent so Plans stops showing two "Enrolled" badges.
  useEffect(() => {
    if (activePlans.length > 1)
      for (const p of activePlans.slice(1)) void unenrollPlan(p.id)
  }, [activePlans])

  const agenda = useMemo<Agenda | null>(() => {
    if (!enrolled) return null
    const schedule = parseSchedule(enrolled.schedule)
    const days = parsePlanDays(enrolled.days)
    if (!schedule || days.length === 0) return null
    const todayLockedDayId = persisted && persisted.planId === enrolled.id ? persisted.dayId : null
    // Rotation advances past a day that was FINISHED or deliberately SKIPPED (M8.6). Without
    // counting skips here, `todayLockedDayId` would move today's forecast along but tomorrow's
    // recompute would snap straight back to the skipped day.
    const lastDone = lastCompletedDay(sessions, enrolled.id)
    const start = nextUpIndex(days.map((d) => d.id), todayLockedDayId ?? lastDone?.dayId ?? null)
    // 42 training days ≈ 2–3 months of amber dots for the calendar's month navigation.
    const upcoming = forecast(days.length, schedule, start, todayLockedDayId ? addDays(date, 1) : date, 42)
    return { days, upcoming, todayEntry: upcoming.find((u) => u.date === date) ?? null }
  }, [enrolled, sessions, persisted, date])

  // ── Today's day, with no lock step ────────────────────────────────────────
  // A scheduled training day resolves into a live, uncommitted proposal that renders and behaves
  // exactly like a locked one. Note `todayEntry` goes null the moment the day IS committed (the
  // forecast then starts tomorrow) — that's what switches the proposal off, so don't "fix" it.
  const todayDayId = agenda?.todayEntry ? agenda.days[agenda.todayEntry.dayIndex]?.id ?? null : null
  const proposal = useDayProposal(
    enrolled,
    todayDayId && persisted?.dayId !== todayDayId ? todayDayId : null,
    userId,
    exMap,
  )
  const planned = persisted ?? proposal

  // Commit-on-first-action. Both guards matter: the early return skips the write once we know a day
  // is committed, and the ref single-flights concurrent callers — `persisted` only refreshes on the
  // next RxDB emission, so two quick taps can both still believe nothing exists. `materializeDay`
  // is write-if-absent, so a late duplicate is a no-op rather than a lost update.
  const inflight = useRef<Promise<string> | null>(null)
  const ensureSession = useCallback(() => {
    if (sessionId && persisted) return Promise.resolve(sessionId)
    inflight.current ??= (proposal ? materializeDay(userId, proposal) : startAdHocSession(userId))
      .finally(() => {
        inflight.current = null
      })
    return inflight.current
  }, [sessionId, persisted, proposal, userId])

  // Add-exercise works from any state, incl. a cold start with no plan/session (replaces the Log
  // tab). Routed through ensureSession so adding a lift to a scheduled day commits THAT day —
  // startAdHocSession alone would write a Freestyle day over it.
  const handleAdd = async (es: Exercise[]) => {
    const sid = await ensureSession()
    // Labels resolve against the PRE-batch picks, so two chest adds agree on one section (both
    // find the existing one, or both mint the identical fallback). addPickToDay re-reads the blob
    // for the insert position, so they still land beside each other.
    const base = planned?.picks ?? []
    for (const e of es)
      await addPickToDay(sid, e, sectionLabelFor(base, e.primaryMuscles?.[0] ?? '', muscleOf))
    setAdding(false)
  }

  const saveMobility = async (which: 'warmup' | 'cooldown', steps: MobilityStep[]) =>
    setMobility(await ensureSession(), which, steps)

  const doneDates = useMemo(
    () => new Set(sessions.filter((s) => s.finishedAt).map((s) => s.date)),
    [sessions],
  )
  // Sessions that COUNT as training — skip rows removed, so passing on a day can never inflate a
  // streak. Shared with MotivationStrip below (RecoveryView derives its own the same way).
  const trained = useMemo(() => trainedSessions(sessions), [sessions])
  const skippedDates = useMemo(
    () => new Set(sessions.filter(isSkipped).map((s) => s.date)),
    [sessions],
  )
  const scheduledDates = useMemo(() => new Set(agenda?.upcoming.map((u) => u.date) ?? []), [agenda])
  // Date → plan-day label ("Upper", "Metabolic Burst") for the full-month calendar (M8.3).
  const scheduledLabels = useMemo(
    () => new Map(agenda?.upcoming.map((u) => [u.date, agenda.days[u.dayIndex]?.label ?? '']) ?? []),
    [agenda],
  )

  const sets = useRxData<SetLog>(
    (db) =>
      sessionId
        ? db.setlogs.find({
            selector: { sessionId, deletedAt: null },
            sort: [{ createdAt: 'asc' }],
          })
        : null,
    [sessionId],
  )

  const groups = useMemo(() => groupByExercise(sets), [sets])
  // Warm-up ramps are real sets but not training (M8.6) — the day's headline numbers and the
  // section progress read work sets only. `groups` stays on the full list so "Also logged" and
  // the per-lift breakdown still show everything that was logged.
  const workAll = useMemo(() => workSets(sets), [sets])
  const volumeKg = useMemo(() => totalVolumeKg(workAll), [workAll])
  // Sections + their live set counts — "CHEST · 2/3 sets" on the rail.
  const sections = useMemo(() => groupPicksBySection(planned?.picks ?? []), [planned])
  const setCountOf = useMemo(
    () => new Map(groupByExercise(workAll).map((g) => [g.exerciseId, g.sets.length])),
    [workAll],
  )
  // lifts logged outside the plan still surface, under "Also logged".
  const extraGroups = useMemo(() => {
    if (!planned) return groups
    const inPlan = new Set(planned.picks.map((p) => p.exerciseId))
    return groups.filter((g) => !inPlan.has(g.exerciseId))
  }, [groups, planned])

  // Day's primary muscles → micro-lesson (M7): the plan's picks when locked, else what's logged.
  const lessonMuscles = useMemo(() => {
    const ids = planned ? planned.picks.map((p) => p.exerciseId) : groups.map((g) => g.exerciseId)
    return ids.map((id) => muscleOf.get(id) ?? '')
  }, [planned, groups, muscleOf])

  // Rest day: enrolled, but today isn't a scheduled training day and nothing's started/logged.
  // Drives the calmer layout — big "Rest day", the plan card as the hero, logging demoted to a link.
  const restDay = Boolean(enrolled && agenda && !agenda.todayEntry) && !persisted && sets.length === 0
  // Today's plan day is on screen (committed or proposed) → the "current plan" card would just
  // repeat it. Read `planned`, not agenda.todayEntry, which nulls out once the day is committed.
  // Today was deliberately passed on (M8.6). The rail is replaced by a hero + Undo; the plan card
  // is deliberately allowed back so "next up" is visible right where the day used to be.
  const skipped = planned?.skipped === true
  const planDayShown = Boolean(enrolled && planned && planned.planId === enrolled.id) && !skipped
  // Today IS a training day, but resolveDay hasn't answered yet. Without this the empty-state and
  // the plan card flash for a beat on every cold open — the exact friction this screen removed.
  const proposalPending = todayDayId != null && !persisted && !proposal
  const customizeTo =
    planned && planned.planId && planned.dayId !== 'adhoc'
      ? `/app/plans/${planned.planId}/start/${planned.dayId}`
      : null

  return (
    <section>
      <h1 className="font-display text-3xl font-black tracking-tight">Today</h1>
      {firstName && <p className="mt-1 text-sm text-fog">Hey, <span className="font-bold text-chalk">{firstName}</span> 👋</p>}
      {/* Hidden once the day is skipped — the hero below already names it, and offering
          "Customize" on a day you just passed on invites editing something that isn't happening. */}
      {planned && !skipped && (
        <div className="mt-1 flex items-baseline justify-between gap-3">
          <p className="truncate text-sm font-bold text-amber">{planned.label}</p>
          {customizeTo && (
            <Link
              to={customizeTo}
              className="shrink-0 rounded-lg bg-amber px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-ink transition-colors hover:bg-amber-bright focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"
            >
              Customize
            </Link>
          )}
        </div>
      )}

      <CalendarStrip
        today={date}
        doneDates={doneDates}
        skippedDates={skippedDates}
        scheduledDates={scheduledDates}
        scheduledLabels={scheduledLabels}
      />

      <MotivationStrip userId={userId} date={date} unit={unit} lessonMuscles={lessonMuscles} sessions={trained} />

      {restDay && <RestDayHero />}

      {enrolled && agenda && !planDayShown && !proposal && !proposalPending && (
        <EnrolledCard plan={enrolled} agenda={agenda} date={date} />
      )}

      {/* Freestyle already claimed today, but today is also a training day — offer the plan day
          back. Explicit, so it overwrites; logged sets survive under "Also logged". */}
      {persisted && proposal && (
        <button
          type="button"
          onClick={() => void lockDay(userId, proposal)}
          className="mt-4 w-full rounded-xl border border-amber/40 bg-amber/10 px-4 py-3 text-sm font-bold text-amber transition-colors hover:bg-amber/20"
        >
          Load today's plan day — {proposal.label}
        </button>
      )}

      {skipped && planned ? (
        <SkippedHero label={planned.label} onUndo={() => sessionId && void unskipDay(sessionId)} />
      ) : planned ? (
        <>
          {sets.length > 0 && <Stats sets={workAll.length} lifts={groups.length} volume={formatWeight(volumeKg, unit)} />}
          {/* Mobility sits OUTSIDE the circuit branch — a timed circuit deserves a warm-up too. */}
          <MobilityBlock
            title="Warm-up"
            steps={planned.warmup ?? []}
            nameOf={nameOf}
            onChange={(s) => void saveMobility('warmup', s)}
            pattern="warmup"
          />
          {planned.mode === 'circuit' ? (
            <CircuitTimer
              key={planned.dayId}
              picks={planned.picks}
              workSec={planned.workSec}
              restSec={planned.restSec}
              rounds={planned.rounds}
            />
          ) : (
            <>
              {/* The rail: one block per section of the day, in the order you train them. */}
              {sections.map((section) => {
                const progress = sectionProgress(section, setCountOf)
                return (
                  <div key={section.label} className="mt-7">
                    <SectionHeader
                      label={section.label}
                      // Only worth a header count when it aggregates something — with one lift in
                      // the section the row underneath already says "0/2 sets".
                      meta={
                        section.picks.length > 1 && progress.target > 0
                          ? `${progress.logged}/${progress.target} sets`
                          : undefined
                      }
                      done={progress.done}
                    />
                    <ul className="space-y-2">
                      {section.picks.map((pick) => (
                        <PlannedExerciseRow
                          key={pick.slotId}
                          pick={pick}
                          sessionId={sessionId}
                          ensureSession={ensureSession}
                          userId={userId}
                          scheme={planned.scheme ?? 'double'}
                          deload={planned.deload ?? false}
                          nameOf={nameOf}
                          muscleOf={muscleOf}
                          equipmentOf={equipmentOf}
                          catalog={allEx}
                        />
                      ))}
                    </ul>
                  </div>
                )
              })}
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="mt-3 w-full rounded-xl border border-dashed border-steel-700 px-4 py-3 text-sm font-semibold text-fog transition-colors hover:border-amber hover:text-amber"
              >
                + Add exercise
              </button>
            </>
          )}
          <MobilityBlock
            title="Cooldown"
            steps={planned.cooldown ?? []}
            nameOf={nameOf}
            onChange={(s) => void saveMobility('cooldown', s)}
            pattern="cooldown"
          />
          {extraGroups.length > 0 && (
            <div className="mt-7">
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-fog">Also logged</h2>
              <LoggedGroups groups={extraGroups} unit={unit} />
            </div>
          )}
          <FinishControl session={session} ensureSession={ensureSession} />
          {planned.planId && planned.dayId !== 'adhoc' && !session?.finishedAt && (
            <SkipControl
              label={planned.label}
              hasSets={sets.length > 0}
              onSkip={() => void skipDay(userId, planned)}
            />
          )}
        </>
      ) : proposalPending ? (
        <DaySkeleton />
      ) : sets.length === 0 ? (
        restDay ? (
          <RestDayLog onStart={() => setAdding(true)} />
        ) : (
          <EmptyToday onStart={() => setAdding(true)} />
        )
      ) : (
        <>
          <Stats sets={workAll.length} lifts={groups.length} volume={formatWeight(volumeKg, unit)} />
          <div className="mt-6">
            <LoggedGroups groups={groups} unit={unit} />
          </div>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="mt-3 w-full rounded-xl border border-dashed border-steel-700 px-4 py-3 text-sm font-semibold text-fog transition-colors hover:border-amber hover:text-amber"
          >
            + Add exercise
          </button>
          <FinishControl session={session} ensureSession={ensureSession} />
        </>
      )}

      {adding && (
        <ExercisePicker
          title="Add an exercise"
          exclude={planned?.picks.map((p) => p.exerciseId) ?? []}
          onPickMany={handleAdd}
          onClose={() => setAdding(false)}
        />
      )}
    </section>
  )
}

// Current-plan card (M8.2): what's coming up ("Thu 10 · Upper"). It used to carry the "Start
// workout" button into StartDay — that gate is gone, so on a training day the day itself renders
// instead and this card is hidden entirely. What's left is the off-day view: next up, and a way
// into the plan.
function EnrolledCard({ plan, agenda, date }: { plan: Plan; agenda: Agenda; date: string }) {
  const { days, upcoming } = agenda
  const next = upcoming[0]
  return (
    <div className="mt-5 rounded-2xl border border-amber/40 bg-steel-900 p-4">
      <p className="text-xs font-bold uppercase tracking-widest text-amber">Current plan</p>
      <Link to={`/app/plans/${plan.id}`} className="mt-0.5 block font-display text-lg font-bold hover:text-amber">
        {plan.name || 'Untitled plan'}
      </Link>
      <div className="mt-3 flex flex-wrap gap-2">
        {upcoming.slice(0, 3).map((u) => (
          <span
            key={u.date}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
              u.date === date ? 'bg-amber text-ink' : 'bg-steel-800 text-fog'
            }`}
          >
            {fmtDay(u.date, { weekday: 'short', day: 'numeric' })} · {days[u.dayIndex]?.label}
          </span>
        ))}
      </div>
      {next && (
        <p className="mt-3 text-sm text-fog">
          Next up: <span className="font-bold text-chalk">{days[next.dayIndex]?.label}</span> on{' '}
          {fmtDay(next.date, { weekday: 'long' })}
        </p>
      )}
    </div>
  )
}

// Finish stamps finishedAt but leaves the session open (M8.2) — green calendar day + rotation
// advance count finished workouts only. Renders with no session yet (nothing committed), because a
// timed circuit day never logs a set: Finish is its ONLY write, and without it the rotation would
// never advance past a circuit.
function FinishControl({
  session,
  ensureSession,
}: {
  session: Session | null
  ensureSession: () => Promise<string>
}) {
  if (session?.finishedAt) {
    return (
      <div className="mt-6 rounded-xl border border-green-500/40 bg-green-500/10 px-4 py-3 text-center text-sm font-bold text-green-300">
        ✓ Workout complete — extra sets still count.
      </div>
    )
  }
  return (
    <button
      type="button"
      onClick={() => void ensureSession().then(finishSession)}
      className="mt-6 w-full rounded-xl border-2 border-green-500 py-3 font-display font-black uppercase tracking-wide text-green-400 transition-colors hover:bg-green-500 hover:text-ink"
    >
      Finish workout
    </button>
  )
}

// Held for the beat between "today is a training day" and resolveDay answering. Shaped like the
// rail it becomes — a section eyebrow over two exercise rows — so nothing jumps when it resolves.
function DaySkeleton() {
  return (
    <div aria-hidden className="mt-7 animate-pulse space-y-2">
      <div className="mb-2 h-3 w-24 rounded bg-steel-800" />
      <div className="h-14 rounded-xl bg-steel-900" />
      <div className="h-14 rounded-xl bg-steel-900" />
    </div>
  )
}

function Stats({ sets, lifts, volume }: { sets: number; lifts: number; volume: string }) {
  return (
    <div className="mt-5 grid grid-cols-3 gap-3">
      <Stat value={sets} label="sets" />
      <Stat value={lifts} label="lifts" />
      <Stat value={volume} label="volume" wide />
    </div>
  )
}

function LoggedGroups({ groups, unit }: { groups: ExerciseGroup[]; unit: Unit }) {
  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <div key={g.exerciseId}>
          <div className="mb-2 flex items-center gap-1.5">
            <h2 className="font-display text-lg font-bold">{g.exerciseName}</h2>
            <ExerciseInfoLink exerciseId={g.exerciseId} label={g.exerciseName} showText />
          </div>
          <ul className="space-y-1.5">
            {g.sets.map((s, i) => (
              <SetRow key={s.id} set={s} index={i} unit={unit} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

function Stat({ value, label, wide }: { value: string | number; label: string; wide?: boolean }) {
  return (
    <div className="rounded-xl bg-steel-900 px-3 py-4 text-center">
      <div className={`nums font-display font-black text-amber ${wide ? 'text-xl' : 'text-3xl'}`}>{value}</div>
      <div className="mt-0.5 text-xs uppercase tracking-wide text-fog">{label}</div>
    </div>
  )
}

// Rest-day hero (M8): on a scheduled off-day the plan card is the star, so logging steps back.
// The big statement reassures that resting is on-program, not a missed day.
function RestDayHero() {
  return (
    <div className="mt-6 text-center">
      <div aria-hidden className="mx-auto grid size-16 place-items-center rounded-2xl bg-steel-800 text-4xl">
        😴
      </div>
      <h2 className="mt-3 font-display text-4xl font-black tracking-tight">Rest day</h2>
      <p className="mx-auto mt-1.5 max-w-xs text-sm text-fog">
        Nothing scheduled today. Muscle grows between sessions, not during them.
      </p>
    </div>
  )
}

// Today was passed on (M8.6). Deliberately calm, not scolding — skipping is a legitimate call, and
// the rotation has already moved on, which is the reassurance worth leading with. Undo strips the
// flag (never tombstones the session), so the day comes straight back, still writable.
function SkippedHero({ label, onUndo }: { label: string; onUndo: () => void }) {
  return (
    <div className="mt-6 text-center">
      <div aria-hidden className="mx-auto grid size-16 place-items-center rounded-2xl bg-steel-800 text-4xl">
        ⏭️
      </div>
      <h2 className="mt-3 font-display text-4xl font-black tracking-tight">Day skipped</h2>
      <p className="mx-auto mt-1.5 max-w-xs text-sm text-fog">
        <span className="font-bold text-chalk">{label}</span> is off the books — your plan has rolled
        on to the next day.
      </p>
      <button
        type="button"
        onClick={onUndo}
        className="mt-4 rounded-xl border border-steel-700 px-5 py-2.5 text-sm font-bold text-chalk transition-colors hover:border-amber hover:text-amber"
      >
        Undo skip
      </button>
    </div>
  )
}

// Skip today's day. Two-tap confirm once sets exist (they survive the skip, but the day stops
// counting as trained, so it's worth a beat). Inline rather than window.confirm — that's blocked in
// some PWA display modes, and nothing else in this app uses it.
function SkipControl({
  label,
  hasSets,
  onSkip,
}: {
  label: string
  hasSets: boolean
  onSkip: () => void
}) {
  const [confirming, setConfirming] = useState(false)

  if (confirming)
    return (
      <div className="mt-3 rounded-xl border border-steel-700 bg-steel-900 px-4 py-3">
        <p className="text-sm text-fog">
          Skip <span className="font-bold text-chalk">{label}</span>? Your logged sets stay, but the
          day won't count as trained and the plan moves on.
        </p>
        <div className="mt-2.5 flex gap-2">
          <button
            type="button"
            onClick={onSkip}
            className="rounded-lg bg-amber px-4 py-2 text-sm font-bold text-ink transition-colors hover:bg-amber-bright"
          >
            Skip it
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="rounded-lg bg-steel-800 px-4 py-2 text-sm font-semibold text-fog transition-colors hover:text-chalk"
          >
            Keep going
          </button>
        </div>
      </div>
    )

  return (
    <button
      type="button"
      onClick={() => (hasSets ? setConfirming(true) : onSkip())}
      className="mt-3 block w-full py-2 text-center text-sm font-semibold text-fog underline-offset-4 transition-colors hover:text-amber hover:underline"
    >
      Skip this day
    </button>
  )
}

// Demoted logging affordance for rest days — a quiet link, not the full empty-state block.
function RestDayLog({ onStart }: { onStart: () => void }) {
  return (
    <p className="mt-8 text-center text-sm text-fog">
      Feeling good?{' '}
      <button
        type="button"
        onClick={onStart}
        className="font-semibold text-amber underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"
      >
        Log a lift anyway
      </button>
    </p>
  )
}

function EmptyToday({ onStart }: { onStart: () => void }) {
  return (
    <div className="mt-10 rounded-2xl border border-dashed border-steel-700 px-6 py-12 text-center">
      <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-steel-800 text-3xl">🏋️</div>
      <h2 className="font-display text-xl font-bold">No sets logged yet</h2>
      <p className="mx-auto mt-1 max-w-xs text-sm text-fog">
        Start from a plan, or log a single lift to put the first set on the board.
      </p>
      <div className="mt-5 flex justify-center gap-3">
        <Link to="/app/plans" className="rounded-xl border border-steel-700 px-5 py-3 font-display font-black uppercase tracking-wide text-chalk transition-colors hover:bg-steel-800">
          Plans
        </Link>
        <button type="button" onClick={onStart} className="rounded-xl bg-amber px-6 py-3 font-display font-black uppercase tracking-wide text-ink transition-colors hover:bg-amber-bright">
          Start logging
        </button>
      </div>
    </div>
  )
}

// Motivation strip (M7): day streak + daily quote, today's PR celebration, and a muscle micro-lesson.
// Sessions arrive from the page-level query (M8.2 shares it with the calendar); sets load here.
function MotivationStrip({
  userId,
  date,
  unit,
  lessonMuscles,
  sessions,
}: {
  userId: string
  date: string
  unit: Unit
  lessonMuscles: string[]
  sessions: Session[]
}) {
  const setlogs = useRxData<SetLog>(
    (db) => db.setlogs.find({ selector: { userId, deletedAt: null } }),
    [userId],
  )

  const streak = useMemo(() => trainingStreak(sessions.map((s) => s.date), date), [sessions, date])

  // Today's PRs, deduped to one per exercise+kind (highest value wins).
  const prs = useMemo(() => {
    const mapped: PRSet[] = setlogs.map((s) => ({
      exerciseId: s.exerciseId,
      exerciseName: s.exerciseName ?? '',
      weightKg: s.weightKg,
      reps: s.reps,
      rir: s.rir,
      note: s.note, // carries the warm-up marker so ramps can't become PR baselines
      createdAt: s.createdAt,
    }))
    const best = new Map<string, PR>()
    for (const p of prsOn(mapped, date)) {
      const key = `${p.exerciseName}|${p.kind}`
      const cur = best.get(key)
      if (!cur || p.value > cur.value) best.set(key, p)
    }
    return [...best.values()]
  }, [setlogs, date])

  const lesson = useMemo(() => lessonForMuscles(lessonMuscles), [lessonMuscles])

  return (
    <div className="mt-4 space-y-3">
      <div>
        {streak.current > 0 ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-steel-800 px-3 py-1 text-sm font-bold text-amber">
            <span aria-hidden>🔥</span>
            <span className="nums">{streak.current}</span>-day streak
          </span>
        ) : (
          <span className="text-sm font-semibold text-fog">Start your streak today.</span>
        )}
        <p className="mt-1.5 text-sm italic text-fog">{quoteOfDay(date)}</p>
      </div>

      {prs.length > 0 && (
        <div className="rounded-xl border border-amber/40 bg-amber/10 px-4 py-3">
          <ul className="space-y-1">
            {prs.map((p) => (
              <li key={`${p.exerciseName}|${p.kind}`} className="text-sm font-semibold text-chalk">
                {p.kind === 'weight' ? (
                  <>🏆 New PR — {p.exerciseName}: <span className="nums text-amber">{formatWeight(p.value, unit)}</span></>
                ) : (
                  <>🏆 {p.exerciseName}: <span className="nums text-amber">{formatWeight(p.value, unit)}</span> est. 1RM</>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {lesson && (
        <div className="rounded-xl border border-steel-800 bg-steel-900 px-4 py-3">
          <p className="text-sm font-bold text-chalk">💡 {lesson.title}</p>
          <p className="mt-1 text-xs leading-relaxed text-fog">{lesson.body}</p>
        </div>
      )}
    </div>
  )
}
