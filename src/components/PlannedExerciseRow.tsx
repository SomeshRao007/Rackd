import { useEffect, useRef, useState } from 'react'
import { useRxData } from '../db/useRxData'
import type { SetLog, PlannedPick } from '../db/schema'
import { logSet, lastSetFor, deleteSet } from '../db/actions'
import { setPickMinSets } from '../db/plans'
import { type Unit, useUnit, unitToKg, kgToUnit, formatWeight } from '../lib/units'
import { SetRow } from './SetRow'

/** One planned exercise on Today: a collapsed counter that expands into an inline
 *  mini-logger (set min sets + log weight×reps). Turns green once min sets are logged. */
export function PlannedExerciseRow({
  pick,
  sessionId,
  userId,
}: {
  pick: PlannedPick
  sessionId: string
  userId: string
}) {
  const unit = useUnit()
  const [open, setOpen] = useState(false)

  const sets = useRxData<SetLog>(
    (db) =>
      db.setlogs.find({
        selector: { sessionId, exerciseId: pick.exerciseId, deletedAt: null },
        sort: [{ createdAt: 'asc' }],
      }),
    [sessionId, pick.exerciseId],
  )

  const latest = sets[sets.length - 1] ?? null
  const min = pick.minSets ?? 0
  const done = min > 0 && sets.length >= min // green: logged at least the target number of sets

  return (
    <li
      className={`overflow-hidden rounded-xl border transition-colors ${
        done ? 'border-green-500/60 bg-green-500/10' : 'border-steel-800 bg-steel-900'
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span
          className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-black ${
            done ? 'bg-green-500 text-ink' : sets.length > 0 ? 'bg-amber text-ink' : 'border border-steel-700 text-fog'
          }`}
        >
          {done ? '✓' : sets.length > 0 ? sets.length : ''}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{pick.exerciseName}</span>
          <span className="text-xs uppercase tracking-wide text-fog">
            {pick.slotLabel}
            {min > 0 && ` · ${sets.length}/${min} sets`}
          </span>
        </span>
        {latest && (
          <span className="nums shrink-0 text-sm font-bold text-chalk">
            {formatWeight(latest.weightKg, unit)} <span className="text-fog">×</span> {latest.reps}
          </span>
        )}
        <svg
          width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
          className={`shrink-0 text-steel-600 transition-transform ${open ? 'rotate-90' : ''}`}
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
      </button>

      {open && (
        <InlineLogger
          pick={pick}
          sessionId={sessionId}
          userId={userId}
          unit={unit}
          sets={sets}
          initialMin={min}
        />
      )}
    </li>
  )
}

function InlineLogger({
  pick,
  sessionId,
  userId,
  unit,
  sets,
  initialMin,
}: {
  pick: PlannedPick
  sessionId: string
  userId: string
  unit: Unit
  sets: SetLog[]
  initialMin: number
}) {
  const [minSets, setMinSets] = useState(initialMin ? String(initialMin) : '')
  const [weight, setWeight] = useState('')
  const [reps, setReps] = useState('')
  const repsRef = useRef<HTMLInputElement>(null)

  // Autofill from the last logged set (async .then → not a sync setState-in-effect).
  useEffect(() => {
    let alive = true
    lastSetFor(userId, pick.exerciseId).then((last) => {
      if (!alive || !last) return
      setWeight(String(Math.round(kgToUnit(last.weightKg, unit) * 2) / 2))
      setReps(String(last.reps))
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function onMinSets(v: string) {
    setMinSets(v)
    const n = Number(v)
    void setPickMinSets(sessionId, pick.slotId, Number.isInteger(n) && n > 0 ? n : 0)
  }

  const w = Number(weight)
  const r = Number(reps)
  const canLog = w > 0 && Number.isInteger(r) && r > 0

  async function onLog() {
    if (!canLog) return
    await logSet({
      userId,
      sessionId,
      exerciseId: pick.exerciseId,
      exerciseName: pick.exerciseName,
      weightKg: unitToKg(w, unit),
      reps: r,
    })
    repsRef.current?.focus()
  }

  return (
    <div className="border-t border-steel-800 px-4 pb-4 pt-3">
      <label className="flex items-center justify-between gap-3 rounded-lg bg-steel-800 px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-fog">Minimum sets</span>
        <input
          type="number"
          inputMode="numeric"
          min="1"
          step="1"
          value={minSets}
          onChange={(e) => onMinSets(e.target.value)}
          placeholder="—"
          aria-label="Minimum sets target"
          className="nums w-16 bg-transparent text-right text-lg font-black text-chalk outline-none placeholder:text-steel-600"
        />
      </label>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          onLog()
        }}
        className="mt-3 grid grid-cols-[1fr_1fr_auto] items-stretch gap-2"
      >
        <Field label={`Weight (${unit})`}>
          <input
            type="number" inputMode="decimal" step="0.5" min="0"
            value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="0"
            className="nums w-full bg-transparent text-center text-2xl font-black text-chalk outline-none placeholder:text-steel-700"
          />
        </Field>
        <Field label="Reps">
          <input
            ref={repsRef}
            type="number" inputMode="numeric" step="1" min="1"
            value={reps} onChange={(e) => setReps(e.target.value)} placeholder="0"
            className="nums w-full bg-transparent text-center text-2xl font-black text-chalk outline-none placeholder:text-steel-700"
          />
        </Field>
        <button
          type="submit"
          disabled={!canLog}
          className="rounded-xl bg-amber px-4 font-display font-black uppercase tracking-wide text-ink transition-colors hover:bg-amber-bright disabled:cursor-not-allowed disabled:bg-steel-700 disabled:text-fog"
        >
          Log
        </button>
      </form>

      {sets.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {sets.map((s, i) => (
            <SetRow key={s.id} set={s} index={i} unit={unit} onDelete={(id) => void deleteSet(id)} />
          ))}
        </ul>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="rounded-xl bg-steel-800 px-3 py-2">
      <span className="block text-center text-[10px] font-semibold uppercase tracking-wide text-fog">{label}</span>
      <span className="mt-0.5 block">{children}</span>
    </label>
  )
}
