import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useRxData } from '../db/useRxData'
import type { SetLog, PlannedDay } from '../db/schema'
import { useUnit, formatWeight } from '../lib/units'
import { groupByExercise, totalVolumeKg } from '../components/groupSets'
import { SetRow } from '../components/SetRow'

const today = () => new Date().toISOString().slice(0, 10)

export function Today() {
  const { user } = useAuth()
  const userId = user?.id ?? ''
  const unit = useUnit()
  const date = today()

  const todaySessions = useRxData(
    (db) => db.sessions.find({ selector: { userId, date, deletedAt: null } }),
    [userId, date],
  )
  const session = todaySessions[0] ?? null
  const sessionId = session?.id ?? null

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
  const setCount = useMemo(() => {
    const m = new Map<string, number>()
    for (const g of groups) m.set(g.exerciseId, g.sets.length)
    return m
  }, [groups])

  return (
    <section>
      <h1 className="font-display text-3xl font-black tracking-tight">Today</h1>
      <p className="mt-1 text-sm text-fog">
        {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
        {planned && <span className="ml-2 font-bold text-amber">· {planned.label}</span>}
      </p>

      {planned && (
        <ul className="mt-5 space-y-1.5">
          {planned.picks.map((pick) => {
            const n = setCount.get(pick.exerciseId) ?? 0
            return (
              <li key={pick.slotId}>
                <Link
                  to={`/app/log?ex=${encodeURIComponent(pick.exerciseId)}`}
                  className="flex items-center gap-3 rounded-xl bg-steel-900 px-4 py-3 transition-colors hover:bg-steel-800"
                >
                  <span
                    className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-black ${
                      n > 0 ? 'bg-amber text-ink' : 'border border-steel-700 text-fog'
                    }`}
                  >
                    {n > 0 ? n : ''}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{pick.exerciseName}</span>
                    <span className="text-xs uppercase tracking-wide text-fog">{pick.slotLabel}</span>
                  </span>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-steel-600">
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </Link>
              </li>
            )
          })}
        </ul>
      )}

      {sets.length === 0 ? (
        planned ? null : <EmptyToday />
      ) : (
        <>
          <div className="mt-5 grid grid-cols-3 gap-3">
            <Stat value={sets.length} label="sets" />
            <Stat value={groups.length} label="lifts" />
            <Stat value={formatWeight(volumeKg, unit)} label="volume" wide />
          </div>

          <div className="mt-6 space-y-5">
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
        </>
      )}
    </section>
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
