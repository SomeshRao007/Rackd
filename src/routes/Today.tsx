import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useRxData } from '../db/useRxData'
import type { Exercise, SetLog, PlannedDay } from '../db/schema'
import { addPickToDay } from '../db/plans'
import { type Unit, useUnit, formatWeight } from '../lib/units'
import { groupByExercise, totalVolumeKg, type ExerciseGroup } from '../components/groupSets'
import { SetRow } from '../components/SetRow'
import { PlannedExerciseRow } from '../components/PlannedExerciseRow'
import { MobilityBlock } from '../components/MobilityBlock'
import { ExercisePicker } from '../components/ExercisePicker'

const today = () => new Date().toISOString().slice(0, 10)

export function Today() {
  const { user } = useAuth()
  const userId = user?.id ?? ''
  const unit = useUnit()
  const date = today()
  const [adding, setAdding] = useState(false)

  const todaySessions = useRxData(
    (db) => db.sessions.find({ selector: { userId, date, deletedAt: null } }),
    [userId, date],
  )
  const session = todaySessions[0] ?? null
  const sessionId = session?.id ?? null

  // Catalog maps for swap names + the "rest this muscle" shortcut (M4).
  const exercises = useRxData<Exercise>((db) => db.exercises.find(), [])
  const nameOf = useMemo(() => new Map(exercises.map((e) => [e.id, e.name])), [exercises])
  const muscleOf = useMemo(
    () => new Map(exercises.map((e) => [e.id, e.primaryMuscles[0] ?? ''])),
    [exercises],
  )

  const planned = useMemo<PlannedDay | null>(() => {
    if (!session?.plannedDay) return null
    try {
      return JSON.parse(session.plannedDay) as PlannedDay
    } catch {
      return null
    }
  }, [session])

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

  return (
    <section>
      <h1 className="font-display text-3xl font-black tracking-tight">Today</h1>
      <p className="mt-1 text-sm text-fog">
        {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
        {planned && <span className="ml-2 font-bold text-amber">· {planned.label}</span>}
      </p>

      {planned && sessionId ? (
        <>
          {sets.length > 0 && <Stats sets={sets.length} lifts={groups.length} volume={formatWeight(volumeKg, unit)} />}
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
          {extraGroups.length > 0 && (
            <div className="mt-7">
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-fog">Also logged</h2>
              <LoggedGroups groups={extraGroups} unit={unit} />
            </div>
          )}
        </>
      ) : sets.length === 0 ? (
        <EmptyToday />
      ) : (
        <>
          <Stats sets={sets.length} lifts={groups.length} volume={formatWeight(volumeKg, unit)} />
          <div className="mt-6">
            <LoggedGroups groups={groups} unit={unit} />
          </div>
        </>
      )}

      {adding && sessionId && (
        <ExercisePicker
          title="Add an exercise"
          exclude={planned?.picks.map((p) => p.exerciseId) ?? []}
          onPick={(e) => {
            void addPickToDay(sessionId, e)
            setAdding(false)
          }}
          onClose={() => setAdding(false)}
        />
      )}
    </section>
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
          <h2 className="mb-2 font-display text-lg font-bold">{g.exerciseName}</h2>
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

function EmptyToday() {
  return (
    <div className="mt-10 rounded-2xl border border-dashed border-steel-700 px-6 py-12 text-center">
      <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-steel-800 text-3xl">🏋️</div>
      <h2 className="font-display text-xl font-bold">No sets logged yet</h2>
      <p className="mx-auto mt-1 max-w-xs text-sm text-fog">
        Start from a plan, or head to the Log tab and put the first set on the board.
      </p>
      <div className="mt-5 flex justify-center gap-3">
        <Link to="/app/plans" className="rounded-xl border border-steel-700 px-5 py-3 font-display font-black uppercase tracking-wide text-chalk transition-colors hover:bg-steel-800">
          Plans
        </Link>
        <Link to="/app/log" className="rounded-xl bg-amber px-6 py-3 font-display font-black uppercase tracking-wide text-ink transition-colors hover:bg-amber-bright">
          Start logging
        </Link>
      </div>
    </div>
  )
}
