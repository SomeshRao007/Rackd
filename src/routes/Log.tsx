import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useRxData } from '../db/useRxData'
import {
  getOrCreateTodaySession,
  lastSetFor,
  logSet,
  deleteSet,
} from '../db/actions'
import type { Exercise, SetLog } from '../db/schema'
import { useUnit, unitToKg, kgToUnit } from '../lib/units'
import { SetRow } from '../components/SetRow'

const MAX_RESULTS = 50

export function Log() {
  const { user } = useAuth()
  const userId = user?.id ?? ''
  const unit = useUnit()

  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<Exercise | null>(null)

  // Whole catalog, queried live (empty for a beat while seedCatalog resolves).
  const exercises = useRxData<Exercise>(
    (db) => db.exercises.find(),
    [],
  )

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    const pool = q
      ? exercises.filter((e) => e.name.toLowerCase().includes(q))
      : exercises
    return [...pool]
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, MAX_RESULTS)
  }, [exercises, query])

  if (picked) {
    return (
      <Logger
        key={picked.id}
        exercise={picked}
        userId={userId}
        unit={unit}
        onBack={() => setPicked(null)}
      />
    )
  }

  return (
    <section>
      <h1 className="font-display text-3xl font-black tracking-tight">
        Pick a lift
      </h1>
      <p className="mt-1 text-sm text-fog">
        Search the catalog, then log your sets.
      </p>

      <div className="relative mt-5">
        <svg
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-fog"
          width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          type="search"
          inputMode="search"
          autoComplete="off"
          aria-label="Search exercises"
          placeholder="Bench, squat, curl…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-xl border border-steel-700 bg-steel-900 py-3.5 pl-11 pr-4 text-base text-chalk placeholder:text-steel-600 focus-visible:border-amber focus-visible:outline-none"
        />
      </div>

      {exercises.length === 0 ? (
        <p className="mt-8 text-center text-fog">Loading catalog…</p>
      ) : matches.length === 0 ? (
        <p className="mt-8 text-center text-fog">
          No lifts match “{query.trim()}”.
        </p>
      ) : (
        <ul className="mt-4 space-y-1.5">
          {matches.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => setPicked(e)}
                className="flex w-full items-center gap-3 rounded-xl bg-steel-900 px-4 py-3.5 text-left transition-colors hover:bg-steel-800 focus-visible:outline-2 focus-visible:outline-amber"
              >
                <span className="flex-1 font-semibold">{e.name}</span>
                <span className="text-xs uppercase tracking-wide text-fog">
                  {e.primaryMuscles[0] ?? e.equipment}
                </span>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-steel-600">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** The logging surface for a single selected exercise. */
function Logger({
  exercise,
  userId,
  unit,
  onBack,
}: {
  exercise: Exercise
  userId: string
  unit: import('../lib/units').Unit
  onBack: () => void
}) {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [weight, setWeight] = useState('')
  const [reps, setReps] = useState('')
  const repsRef = useRef<HTMLInputElement>(null)

  // Auto-fill: fires once per exercise selection (component is keyed by id).
  // Seeds inputs from the last logged set; never re-runs after a log so
  // repeated sets keep what the user typed.
  useEffect(() => {
    let alive = true
    Promise.all([
      getOrCreateTodaySession(userId),
      lastSetFor(userId, exercise.id),
    ]).then(([session, last]) => {
      if (!alive) return
      setSessionId(session.id)
      if (last) {
        setWeight(String(Math.round(kgToUnit(last.weightKg, unit) * 2) / 2))
        setReps(String(last.reps))
      }
    })
    return () => {
      alive = false
    }
    // unit intentionally excluded: seed reflects the unit at selection time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, exercise.id])

  // If the unit is toggled mid-entry, convert the typed weight in place so the
  // number always matches the label (else "80" under a LB label logs as 80 lb).
  const prevUnit = useRef(unit)
  useEffect(() => {
    if (prevUnit.current === unit) return
    setWeight((w) => {
      const n = Number(w)
      if (!(n > 0)) return w
      return String(Math.round(kgToUnit(unitToKg(n, prevUnit.current), unit) * 2) / 2)
    })
    prevUnit.current = unit
  }, [unit])

  const sets = useRxData<SetLog>(
    (db) =>
      sessionId
        ? db.setlogs.find({
            selector: {
              sessionId,
              exerciseId: exercise.id,
              deletedAt: null,
            },
            sort: [{ createdAt: 'asc' }],
          })
        : null,
    [sessionId, exercise.id],
  )

  const w = Number(weight)
  const r = Number(reps)
  const canLog = sessionId !== null && w > 0 && Number.isInteger(r) && r > 0

  async function onLog() {
    if (!canLog || !sessionId) return
    await logSet({
      userId,
      sessionId,
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      weightKg: unitToKg(w, unit),
      reps: r,
    })
    // Keep inputs populated for the next set; nudge focus back to reps.
    repsRef.current?.focus()
  }

  return (
    <section>
      <button
        type="button"
        onClick={onBack}
        className="-ml-1 mb-3 flex items-center gap-1 text-sm font-semibold text-fog transition-colors hover:text-chalk"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="m15 18-6-6 6-6" />
        </svg>
        All lifts
      </button>

      <h1 className="font-display text-3xl font-black leading-tight tracking-tight">
        {exercise.name}
      </h1>
      <p className="mt-1 text-xs uppercase tracking-widest text-amber">
        {exercise.primaryMuscles.join(' · ') || exercise.category}
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          onLog()
        }}
        className="mt-6 rounded-2xl border border-steel-800 bg-steel-900 p-4"
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Weight (${unit})`}>
            <input
              type="number"
              inputMode="decimal"
              step="0.5"
              min="0"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder="0"
              className="nums w-full bg-transparent text-center text-4xl font-black text-chalk outline-none placeholder:text-steel-700"
            />
          </Field>
          <Field label="Reps">
            <input
              ref={repsRef}
              type="number"
              inputMode="numeric"
              step="1"
              min="1"
              value={reps}
              onChange={(e) => setReps(e.target.value)}
              placeholder="0"
              className="nums w-full bg-transparent text-center text-4xl font-black text-chalk outline-none placeholder:text-steel-700"
            />
          </Field>
        </div>

        <button
          type="submit"
          disabled={!canLog}
          className="mt-4 w-full rounded-xl bg-amber py-4 font-display text-lg font-black uppercase tracking-wide text-ink transition-colors hover:bg-amber-bright focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber disabled:cursor-not-allowed disabled:bg-steel-700 disabled:text-fog"
        >
          Log set
        </button>
      </form>

      <div className="mt-6">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-fog">
            This session
          </h2>
          {sets.length > 0 && (
            <span className="nums text-sm text-fog">
              {sets.length} {sets.length === 1 ? 'set' : 'sets'}
            </span>
          )}
        </div>
        {sets.length === 0 ? (
          <p className="rounded-xl border border-dashed border-steel-700 px-4 py-6 text-center text-sm text-fog">
            No sets yet. Log your first above.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {sets.map((s, i) => (
              <SetRow
                key={s.id}
                set={s}
                index={i}
                unit={unit}
                onDelete={(id) => void deleteSet(id)}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="rounded-xl bg-steel-800 px-3 py-3">
      <span className="block text-center text-xs font-semibold uppercase tracking-wide text-fog">
        {label}
      </span>
      <span className="mt-1 block">{children}</span>
    </label>
  )
}
