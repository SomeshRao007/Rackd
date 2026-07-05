import { useEffect, useRef, useState } from 'react'
import { useRxData } from '../db/useRxData'
import type { SetLog, PlannedPick, SchemeId } from '../db/schema'
import { logSet, suggestFor, deleteSet } from '../db/actions'
import { setPickMinSets, setPickExercise, saveAddedPickToPlan } from '../db/plans'
import { addExclusion } from '../db/exclusions'
import { warmupSets, platesFor } from '../lib/lifting'
import { usePrefs, setBarKg } from '../lib/prefs'
import { type Unit, useUnit, unitToKg, kgToUnit, formatWeight } from '../lib/units'
import { SetRow } from './SetRow'
import { RirChips } from './RirChips'
import { ExerciseInfoLink } from './ExerciseInfoLink'

// Only plate-loaded bars get the plate calculator; cable/machine/dumbbell/bodyweight don't stack plates.
const PLATE_LOADED = new Set(['barbell', 'e-z curl bar'])

/** One planned exercise on Today: a collapsed counter expanding into an inline mini-logger; turns green once min sets are logged. */
export function PlannedExerciseRow({
  pick,
  sessionId,
  userId,
  scheme,
  deload,
  nameOf,
  muscleOf,
  equipmentOf,
}: {
  pick: PlannedPick
  sessionId: string
  userId: string
  scheme: SchemeId
  deload?: boolean
  nameOf: Map<string, string>
  muscleOf: Map<string, string>
  equipmentOf: Map<string, string>
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
      <div className="flex items-center">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex flex-1 items-center gap-3 py-3 pl-4 pr-2 text-left"
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
              {pick.targetReps ? ` · ${pick.targetReps} reps` : ''}
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
        <div className="pr-2">
          <ExerciseInfoLink exerciseId={pick.exerciseId} label={pick.exerciseName} />
        </div>
      </div>

      {open && (
        <InlineLogger
          pick={pick}
          sessionId={sessionId}
          userId={userId}
          scheme={scheme}
          deload={deload}
          unit={unit}
          sets={sets}
          initialMin={min}
          nameOf={nameOf}
          muscleOf={muscleOf}
          equipmentOf={equipmentOf}
        />
      )}
    </li>
  )
}

type Panel = 'none' | 'swap' | 'plates' | 'rest'

function InlineLogger({
  pick,
  sessionId,
  userId,
  scheme,
  deload,
  unit,
  sets,
  initialMin,
  nameOf,
  muscleOf,
  equipmentOf,
}: {
  pick: PlannedPick
  sessionId: string
  userId: string
  scheme: SchemeId
  deload?: boolean
  unit: Unit
  sets: SetLog[]
  initialMin: number
  nameOf: Map<string, string>
  muscleOf: Map<string, string>
  equipmentOf: Map<string, string>
}) {
  const [minSets, setMinSets] = useState(initialMin ? String(initialMin) : '')
  const [weight, setWeight] = useState('')
  const [reps, setReps] = useState(pick.targetReps ? String(pick.targetReps) : '')
  const [reason, setReason] = useState('')
  const [calibrate, setCalibrate] = useState(false)
  const [rir, setRir] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [panel, setPanel] = useState<Panel>('none')
  const [restedMsg, setRestedMsg] = useState('')
  const { barKg } = usePrefs()
  const repsRef = useRef<HTMLInputElement>(null)

  // Seed once from the progression engine (M5); async .then → not a sync setState-in-effect.
  useEffect(() => {
    let alive = true
    suggestFor(userId, pick.exerciseId, scheme, deload).then((s) => {
      if (!alive) return
      if (!s) {
        setCalibrate(true)
        return
      }
      setWeight(String(Math.round(kgToUnit(s.weightKg, unit) * 2) / 2))
      setReps(String(s.targetReps))
      setReason(s.reason)
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
  const wKg = w > 0 ? unitToKg(w, unit) : 0
  const warmups = warmupSets(wKg)
  const plateLoaded = PLATE_LOADED.has(equipmentOf.get(pick.exerciseId) ?? '')
  const plates = platesFor(wKg, barKg)
  const muscle = muscleOf.get(pick.exerciseId)

  async function onLog() {
    if (!canLog) return
    await logSet({
      userId,
      sessionId,
      exerciseId: pick.exerciseId,
      exerciseName: pick.exerciseName,
      weightKg: wKg,
      reps: r,
      rir,
      note: note || null,
    })
    setNote('') // RIR intentionally kept — stable set to set
    repsRef.current?.focus()
  }

  const toggle = (p: Panel) => setPanel((cur) => (cur === p ? 'none' : p))

  return (
    <div className="border-t border-steel-800 px-4 pb-4 pt-3">
      {/* Toolbar: swap exercise / plate math / rest this / save-to-plan (M4) */}
      <div className="mb-3 flex gap-2 text-xs font-bold uppercase tracking-wide">
        {pick.pool && pick.pool.length > 1 && <Tool active={panel === 'swap'} onClick={() => toggle('swap')}>Swap</Tool>}
        {plateLoaded && <Tool active={panel === 'plates'} onClick={() => toggle('plates')}>Plates</Tool>}
        <Tool active={panel === 'rest'} onClick={() => toggle('rest')}>Rest</Tool>
        {pick.added && (
          pick.savedToPlan ? (
            <span className="rounded-lg px-3 py-1.5 text-green-400">✓ In plan</span>
          ) : (
            <button
              type="button"
              onClick={() => void saveAddedPickToPlan(sessionId, pick.slotId)}
              className="rounded-lg bg-steel-800 px-3 py-1.5 text-fog transition-colors hover:bg-amber hover:text-ink"
            >
              Save to plan
            </button>
          )
        )}
      </div>

      {panel === 'swap' && pick.pool && (
        <div className="mb-3 flex flex-wrap gap-2">
          {pick.pool.map((exId) => {
            const active = exId === pick.exerciseId
            return (
              <button
                key={exId}
                type="button"
                onClick={() => void setPickExercise(sessionId, pick.slotId, exId)}
                aria-pressed={active}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${active ? 'bg-amber text-ink' : 'bg-steel-800 text-fog hover:text-chalk'}`}
              >
                {nameOf.get(exId) ?? exId}
              </button>
            )
          })}
        </div>
      )}

      {panel === 'rest' && (
        <div className="mb-3">
          {restedMsg ? (
            <p className="rounded-lg border border-green-500/40 bg-green-500/10 px-3 py-2 text-sm text-green-300">
              ✓ {restedMsg}. This won’t change today’s session — it’s left out of your next generated day. End it anytime in Settings.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              <RestButton onClick={() => { void addExclusion(userId, 'exercise', pick.exerciseId, pick.exerciseName, 7); setRestedMsg(`Resting ${pick.exerciseName} for 1 week`) }}>
                Rest this lift · 1 week
              </RestButton>
              {muscle && (
                <RestButton onClick={() => { void addExclusion(userId, 'muscle', muscle, muscle, 7); setRestedMsg(`Resting ${muscle} for 1 week`) }}>
                  Rest {muscle} · 1 week
                </RestButton>
              )}
            </div>
          )}
        </div>
      )}

      {panel === 'plates' && plateLoaded && (
        <div className="mb-3 rounded-lg bg-steel-800 px-3 py-2 text-sm">
          <label className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-fog">Bar weight</span>
            <span className="flex items-baseline gap-1">
              <input
                type="number"
                inputMode="decimal"
                step="2.5"
                min="0"
                value={barKg}
                onChange={(e) => setBarKg(Number(e.target.value) || 0)}
                aria-label="Bar weight in kg"
                className="nums w-14 bg-transparent text-right text-base font-black text-chalk outline-none"
              />
              <span className="text-fog">kg</span>
            </span>
          </label>
          <p className="mt-1.5">
            {plates.length > 0 ? (
              <>
                <span className="font-semibold text-fog">Per side: </span>
                <span className="nums font-bold text-chalk">{plates.join(' + ')} kg</span>
              </>
            ) : (
              <span className="text-fog">Enter a weight above the {barKg}kg bar to see the plate stack.</span>
            )}
          </p>
        </div>
      )}

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

      {warmups.length > 0 && (
        <div className="mt-2 flex items-center gap-2 text-xs">
          <span className="font-semibold uppercase tracking-wide text-fog">Warm-up</span>
          {warmups.map((wu) => (
            <span key={wu.kg} className="nums rounded bg-steel-800 px-2 py-1 font-bold text-chalk">
              {formatWeight(wu.kg, unit)}
            </span>
          ))}
        </div>
      )}

      {reason && <p className="mt-3 text-xs font-semibold text-amber">↗ {reason}</p>}
      {calibrate && (
        <p className="mt-3 text-xs text-fog">
          First time? Enter a weight you could lift about 8 times — your first set seeds the progression.
        </p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          onLog()
        }}
        className="mt-3 space-y-2"
      >
        <div className="grid grid-cols-[1fr_1fr_auto] items-stretch gap-2">
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
        </div>
        <RirChips value={rir} onChange={setRir} />
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional)"
          aria-label="Set note"
          className="w-full rounded-xl bg-steel-800 px-3 py-2 text-sm text-chalk outline-none placeholder:text-steel-600"
        />
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

function Tool({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-lg px-3 py-1.5 transition-colors ${active ? 'bg-amber text-ink' : 'bg-steel-800 text-fog hover:text-chalk'}`}
    >
      {children}
    </button>
  )
}

function RestButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg bg-steel-800 px-3 py-2 text-sm font-semibold text-fog hover:bg-amber hover:text-ink"
    >
      {children}
    </button>
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
