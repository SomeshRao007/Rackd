import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useRxData } from '../db/useRxData'
import type { Exercise, SetLog, Plan, PlanDay, PlannedDay, Session, CustomExercise } from '../db/schema'
import { addPickToDay, startAdHocSession, unenrollPlan } from '../db/plans'
import { finishSession } from '../db/actions'
import { parseSchedule, nextUpIndex, forecast, addDays } from '../lib/schedule'
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

  // Add-exercise works from any state, incl. a cold start with no plan/session (replaces the Log tab):
  // ensure today's session + a "Freestyle" day exist, then append the pick so it gets an inline logger.
  const handleAdd = async (e: Exercise) => {
    const sid = await startAdHocSession(userId)
    await addPickToDay(sid, e)
    setAdding(false)
  }

  // Catalog + custom maps for swap names, the micro-lesson, and the "rest this muscle" shortcut (M4).
  // Custom exercises are merged so a logged custom lift resolves its name/muscle/equipment too (R1).
  const exercises = useRxData<Exercise>((db) => db.exercises.find(), [])
  const custom = useRxData<CustomExercise>((db) => db.customexercises.find({ selector: { userId, deletedAt: null } }), [userId])
  const allEx = useMemo(() => [...exercises, ...custom.map(customToExercise)], [exercises, custom])
  const nameOf = useMemo(() => new Map(allEx.map((e) => [e.id, e.name])), [allEx])
  const muscleOf = useMemo(() => new Map(allEx.map((e) => [e.id, e.primaryMuscles[0] ?? ''])), [allEx])
  // equipment gates the plate calculator — only plate-loaded bars have a "per side" stack.
  const equipmentOf = useMemo(() => new Map(allEx.map((e) => [e.id, e.equipment ?? ''])), [allEx])

  const planned = useMemo<PlannedDay | null>(() => {
    if (!session?.plannedDay) return null
    try {
      return JSON.parse(session.plannedDay) as PlannedDay
    } catch {
      return null
    }
  }, [session])

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
    const todayLockedDayId = planned && planned.planId === enrolled.id ? planned.dayId : null
    let lastFinished: { date: string; dayId: string } | null = null
    for (const s of sessions) {
      if (!s.finishedAt || !s.plannedDay) continue
      try {
        const pd = JSON.parse(s.plannedDay) as PlannedDay
        if (pd.planId === enrolled.id && (!lastFinished || s.date > lastFinished.date))
          lastFinished = { date: s.date, dayId: pd.dayId }
      } catch {
        // corrupt synced plannedDay — skip the row
      }
    }
    const start = nextUpIndex(days.map((d) => d.id), todayLockedDayId ?? lastFinished?.dayId ?? null)
    // 42 training days ≈ 2–3 months of amber dots for the calendar's month navigation.
    const upcoming = forecast(days.length, schedule, start, todayLockedDayId ? addDays(date, 1) : date, 42)
    return { days, upcoming, todayEntry: upcoming.find((u) => u.date === date) ?? null }
  }, [enrolled, sessions, planned, date])

  const doneDates = useMemo(
    () => new Set(sessions.filter((s) => s.finishedAt).map((s) => s.date)),
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
  const volumeKg = useMemo(() => totalVolumeKg(sets), [sets])
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
  const restDay = Boolean(enrolled && agenda && !agenda.todayEntry) && !planned && sets.length === 0

  return (
    <section>
      <h1 className="font-display text-3xl font-black tracking-tight">Today</h1>
      {firstName && <p className="mt-1 text-sm text-fog">Hey, <span className="font-bold text-chalk">{firstName}</span> 👋</p>}
      {planned && <p className="mt-1 text-sm font-bold text-amber">{planned.label}</p>}

      <CalendarStrip today={date} doneDates={doneDates} scheduledDates={scheduledDates} scheduledLabels={scheduledLabels} />

      <MotivationStrip userId={userId} date={date} unit={unit} lessonMuscles={lessonMuscles} sessions={sessions} />

      {restDay && <RestDayHero />}

      {enrolled && agenda && !(planned && planned.planId === enrolled.id) && (
        <EnrolledCard plan={enrolled} agenda={agenda} date={date} />
      )}

      {planned && sessionId ? (
        <>
          {sets.length > 0 && <Stats sets={sets.length} lifts={groups.length} volume={formatWeight(volumeKg, unit)} />}
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
              {planned.warmup && <MobilityBlock title="Warm-up" steps={planned.warmup} nameOf={nameOf} />}
              <ul className="mt-5 space-y-2">
                {planned.picks.map((pick) => (
                  <PlannedExerciseRow
                    key={pick.slotId}
                    pick={pick}
                    sessionId={sessionId}
                    userId={userId}
                    scheme={planned.scheme ?? 'double'}
                    deload={planned.deload ?? false}
                    nameOf={nameOf}
                    muscleOf={muscleOf}
                    equipmentOf={equipmentOf}
                  />
                ))}
              </ul>
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="mt-3 w-full rounded-xl border border-dashed border-steel-700 px-4 py-3 text-sm font-semibold text-fog transition-colors hover:border-amber hover:text-amber"
              >
                + Add exercise
              </button>
              {planned.cooldown && <MobilityBlock title="Cooldown" steps={planned.cooldown} nameOf={nameOf} />}
            </>
          )}
          {extraGroups.length > 0 && (
            <div className="mt-7">
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-fog">Also logged</h2>
              <LoggedGroups groups={extraGroups} unit={unit} />
            </div>
          )}
          {session && <FinishControl session={session} />}
        </>
      ) : sets.length === 0 ? (
        restDay ? (
          <RestDayLog onStart={() => setAdding(true)} />
        ) : (
          <EmptyToday onStart={() => setAdding(true)} />
        )
      ) : (
        <>
          <Stats sets={sets.length} lifts={groups.length} volume={formatWeight(volumeKg, unit)} />
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
          {session && <FinishControl session={session} />}
        </>
      )}

      {adding && (
        <ExercisePicker
          title="Add an exercise"
          exclude={planned?.picks.map((p) => p.exerciseId) ?? []}
          onPick={handleAdd}
          onClose={() => setAdding(false)}
        />
      )}
    </section>
  )
}

// Current-plan card (M8.2): the next few scheduled days ("Thu 10 · Upper") and — when today is a
// training day — the one-tap entry into the existing StartDay flow. Hidden once today's session
// is locked from this plan (the session UI takes over).
function EnrolledCard({ plan, agenda, date }: { plan: Plan; agenda: Agenda; date: string }) {
  const navigate = useNavigate()
  const { days, upcoming, todayEntry } = agenda
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
      {todayEntry ? (
        <button
          type="button"
          onClick={() => navigate(`/app/plans/${plan.id}/start/${days[todayEntry.dayIndex].id}`)}
          className="mt-4 w-full rounded-xl bg-amber py-3 font-display font-black uppercase tracking-wide text-ink transition-colors hover:bg-amber-bright"
        >
          Start {days[todayEntry.dayIndex]?.label} workout
        </button>
      ) : (
        next && (
          <p className="mt-3 text-sm text-fog">
            Next up: <span className="font-bold text-chalk">{days[next.dayIndex]?.label}</span> on{' '}
            {fmtDay(next.date, { weekday: 'long' })}
          </p>
        )
      )}
    </div>
  )
}

// Finish stamps finishedAt but leaves the session open (M8.2) — green calendar day + rotation
// advance count finished workouts only.
function FinishControl({ session }: { session: Session }) {
  if (session.finishedAt) {
    return (
      <div className="mt-6 rounded-xl border border-green-500/40 bg-green-500/10 px-4 py-3 text-center text-sm font-bold text-green-300">
        ✓ Workout complete — extra sets still count.
      </div>
    )
  }
  return (
    <button
      type="button"
      onClick={() => void finishSession(session.id)}
      className="mt-6 w-full rounded-xl border-2 border-green-500 py-3 font-display font-black uppercase tracking-wide text-green-400 transition-colors hover:bg-green-500 hover:text-ink"
    >
      Finish workout
    </button>
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
