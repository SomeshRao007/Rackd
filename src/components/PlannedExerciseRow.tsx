import { useEffect, useMemo, useRef, useState } from 'react'
import { useRxData } from '../db/useRxData'
import type { Exercise, SetLog, PlannedPick, SchemeId } from '../db/schema'
import { logSet, suggestFor, deleteSet } from '../db/actions'
import { setPickMinSets, setPickExercise, saveAddedPickToPlan, removePickFromDay, removeSlotFromPlan } from '../db/plans'
import { suggestAlternatives } from '../lib/substitute'
import { addExclusion } from '../db/exclusions'
import { warmupSets, platesFor, workSets, WARMUP_NOTE } from '../lib/lifting'
import { usePrefs, setBarKg, setExerciseStep, stepFor, isBodyweightEquipment } from '../lib/prefs'
import { type Unit, useUnit, unitToKg, kgToUnit, formatWeight, formatLoad } from '../lib/units'
import { SetRow } from './SetRow'
import { RirChips } from './RirChips'
import { ExerciseInfoLink } from './ExerciseInfoLink'

// Only plate-loaded bars get the plate calculator; cable/machine/dumbbell/bodyweight don't stack plates.
const PLATE_LOADED = new Set(['barbell', 'e-z curl bar'])

/** One planned exercise on Today: a collapsed counter expanding into an inline mini-logger; turns green once min sets are logged.
 *  `sessionId` is null until today's day is committed — the row renders and reads fine without one
 *  (no session ⇒ no sets), and every write goes through `ensureSession` to materialize it first. */
export function PlannedExerciseRow({
  pick,
  sessionId,
  ensureSession,
  userId,
  scheme,
  deload,
  nameOf,
  muscleOf,
  equipmentOf,
  catalog,
  planId,
  dayId,
}: {
  pick: PlannedPick
  sessionId: string | null
  ensureSession: () => Promise<string>
  userId: string
  scheme: SchemeId
  deload?: boolean
  nameOf: Map<string, string>
  muscleOf: Map<string, string>
  equipmentOf: Map<string, string>
  catalog: Exercise[]
  planId?: string
  dayId?: string
}) {
  const unit = useUnit()
  const [open, setOpen] = useState(false)

  const sets = useRxData<SetLog>(
    (db) =>
      sessionId
        ? db.setlogs.find({
            selector: { sessionId, exerciseId: pick.exerciseId, deletedAt: null },
            sort: [{ createdAt: 'asc' }],
          })
        : null,
    [sessionId, pick.exerciseId],
  )

  // Warm-up ramp sets are real SetLogs (M8.6) but must never advance the target — two ramp taps
  // shouldn't paint a 2-set goal green. Every count on this row reads work sets only; the logger
  // below still lists all of them so ramps stay visible and deletable.
  const work = useMemo(() => workSets(sets), [sets])
  const latest = work[work.length - 1] ?? null
  const min = pick.minSets ?? 0
  const done = min > 0 && work.length >= min // green: logged at least the target number of sets

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
          className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-4 pr-2 text-left"
        >
          <span
            className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-black ${
              done ? 'bg-green-500 text-ink' : work.length > 0 ? 'bg-amber text-ink' : 'border border-steel-700 text-fog'
            }`}
          >
            {done ? '✓' : work.length > 0 ? work.length : ''}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{pick.exerciseName}</span>
            {/* No slot label here — the section header above the row already says "Side delts". */}
            <span className="text-xs uppercase tracking-wide text-fog">
              {min > 0 ? `${work.length}/${min} sets` : 'log a set'}
              {pick.targetReps ? ` · ${pick.targetReps} reps` : ''}
              {pick.substituted && <span className="text-amber"> · subbed for your kit</span>}
            </span>
          </span>
          {latest && (
            <span className="nums shrink-0 text-sm font-bold text-chalk">
              {formatLoad(latest.weightKg, unit)} <span className="text-fog">×</span> {latest.reps}
            </span>
          )}
          <svg
            width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
            className={`shrink-0 text-steel-600 transition-transform ${open ? 'rotate-90' : ''}`}
          >
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
        <div className="shrink-0 pr-2">
          <ExerciseInfoLink exerciseId={pick.exerciseId} label={pick.exerciseName} showText />
        </div>
      </div>

      {open && (
        <InlineLogger
          pick={pick}
          ensureSession={ensureSession}
          userId={userId}
          scheme={scheme}
          deload={deload}
          unit={unit}
          sets={sets}
          initialMin={min}
          nameOf={nameOf}
          muscleOf={muscleOf}
          equipmentOf={equipmentOf}
          catalog={catalog}
          planId={planId}
          dayId={dayId}
        />
      )}
    </li>
  )
}

type Panel = 'none' | 'swap' | 'load' | 'rest' | 'remove'

function InlineLogger({
  pick,
  ensureSession,
  userId,
  scheme,
  deload,
  unit,
  sets,
  initialMin,
  nameOf,
  muscleOf,
  equipmentOf,
  catalog,
  planId,
  dayId,
}: {
  pick: PlannedPick
  ensureSession: () => Promise<string>
  userId: string
  scheme: SchemeId
  deload?: boolean
  unit: Unit
  sets: SetLog[]
  initialMin: number
  nameOf: Map<string, string>
  muscleOf: Map<string, string>
  equipmentOf: Map<string, string>
  catalog: Exercise[]
  planId?: string
  dayId?: string
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
  const prefs = usePrefs()
  const { barKg, equipment } = prefs
  const repsRef = useRef<HTMLInputElement>(null)

  // Smallest jump this lift can actually make (M8.7): its own override, else what its kit allows.
  // Everything that moves a load reads it — the next-weight suggestion, the warm-up rungs, and the
  // weight field's arrows — so a 4.5 kg leg press stops being prescribed 2.5 kg it can't load.
  const equip = equipmentOf.get(pick.exerciseId) ?? ''
  const stepKg = stepFor(prefs, equip, pick.exerciseId)

  // Bodyweight mode (M8.6): push-ups shouldn't demand a load, and until now a 0 kg set couldn't be
  // logged at all (`canLog` required w > 0), so they were unloggable from a planned row.
  // The kit tells us the DEFAULT; the seeded suggestion below refines it, so a lift you've loaded
  // before (weighted dips) reopens in weight mode — history is the memory, no extra persistence.
  const kitFree = isBodyweightEquipment(equip)
  const [body, setBody] = useState(kitFree)
  const modeTouched = useRef(false) // an explicit +Add weight / Bodyweight tap outranks a re-seed
  // User has edited weight/reps since the last seed → don't overwrite their entry mid-set.
  const dirty = useRef(false)

  // Same-muscle catalog alternatives doable with the user's kit. Ranked against the POOL (not the
  // current pick) so the list stays stable when you swap onto one of its entries.
  const alts = useMemo(() => {
    if (!pick.pool) return []
    const byId = new Map(catalog.map((e) => [e.id, e]))
    const poolExs = pick.pool.map((id) => byId.get(id)).filter((e) => e !== undefined)
    return suggestAlternatives(poolExs, catalog, equipment, new Set(pick.pool))
  }, [pick.pool, catalog, equipment])

  // Work sets logged for this exercise — the re-seed trigger below.
  // Deliberately NOT `sets` (a fresh array identity on every RxDB emission) and NOT `sets.length`
  // (which a warm-up ramp tap would move, re-seeding the work prescription off the ramp weight).
  const workCount = useMemo(() => workSets(sets).length, [sets])

  // Re-seed from the progression engine (M5) whenever the work-set count changes (M8.6).
  // `suggestFor` already reads freshly-logged sets — the old `[]` deps are the whole reason
  // closing and reopening the card was the only way to refresh the recommendation.
  // Guarded by `dirty`, NOT by input focus: onLog ends with repsRef.focus(), so a focus guard
  // would suppress the re-seed in the exact flow that reported the bug.
  useEffect(() => {
    if (dirty.current) return
    let alive = true
    suggestFor(userId, pick.exerciseId, scheme, deload, stepKg).then((s) => {
      if (!alive) return
      if (!s) {
        // No history left (the last work set was deleted) → back to the calibration prompt.
        setCalibrate(true)
        setReason('')
        return
      }
      setCalibrate(false)
      if (!modeTouched.current) setBody(s.weightKg <= 0)
      setWeight(s.weightKg > 0 ? String(Math.round(kgToUnit(s.weightKg, unit) * 2) / 2) : '')
      setReps(String(s.targetReps))
      setReason(s.reason)
    })
    return () => {
      alive = false
    }
    // `unit` is intentionally out: re-seeding on a unit switch would clobber an in-progress entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workCount, userId, pick.exerciseId, scheme, deload, stepKg])

  // Every write below materializes today's day first — before that point the session doesn't exist
  // yet, by design: opening Today must not create anything. ensureSession is idempotent.
  async function onMinSets(v: string) {
    setMinSets(v)
    const n = Number(v)
    await setPickMinSets(await ensureSession(), pick.slotId, Number.isInteger(n) && n > 0 ? n : 0)
  }
  const swapTo = async (exId: string) => setPickExercise(await ensureSession(), pick.slotId, exId)
  const saveToPlan = async () => saveAddedPickToPlan(await ensureSession(), pick.slotId)
  const dropToday = async () => removePickFromDay(await ensureSession(), pick.slotId)
  const dropEverywhere = async () => {
    if (planId && dayId) await removeSlotFromPlan(planId, dayId, pick.slotId)
    await dropToday()
  }
  // A `~n` slotId is one movement of a SHARED slot — deleting that slot would take its siblings
  // with it, so those only get the session-scoped remove.
  const inPlan =
    Boolean(planId) && Boolean(dayId) && dayId !== 'adhoc' && !pick.slotId.includes('~') &&
    (!pick.added || pick.savedToPlan === true)
  // Resting commits the day too, so today stays exactly what's on screen — which is what the
  // confirmation promises ("won't change today's session"); the exclusion only shapes future days.
  const rest = async (kind: 'exercise' | 'muscle', value: string, label: string) => {
    await ensureSession()
    await addExclusion(userId, kind, value, label, 7)
    setRestedMsg(`Resting ${label} for 1 week`)
  }

  const w = Number(weight)
  const r = Number(reps)
  // Bodyweight sets log at 0 kg, so reps alone are enough to enable Log.
  const canLog = Number.isInteger(r) && r > 0 && (body || w > 0)
  const wKg = body ? 0 : w > 0 ? unitToKg(w, unit) : 0
  const warmups = warmupSets(wKg, stepKg) // 0 kg → [] , so Body mode hides the ramp badges for free
  const plateLoaded = PLATE_LOADED.has(equip)
  const plates = platesFor(wKg, barKg, prefs.plateKg)
  // What the plates you own actually make. The greedy stack silently under-shoots an unreachable
  // target, which is worse than saying so.
  const loadable = barKg + plates.reduce((a, b) => a + b, 0) * 2
  const muscle = muscleOf.get(pick.exerciseId)

  async function onLog() {
    if (!canLog) return
    await logSet({
      userId,
      sessionId: await ensureSession(),
      exerciseId: pick.exerciseId,
      exerciseName: pick.exerciseName,
      weightKg: wKg,
      reps: r,
      rir,
      note: note || null,
    })
    setNote('') // RIR intentionally kept — stable set to set
    // Cleared BEFORE the resulting workCount change lands, so the next emission re-seeds instead
    // of being treated as an in-progress edit. A ref, not state: as state it would either sit in
    // the effect's deps (re-firing on every keystroke) or go stale inside the closure.
    dirty.current = false
    repsRef.current?.focus()
  }

  // A warm-up ramp badge logs a REAL set at its own weight/reps (M8.6), marked via `note` so
  // progression, PRs, volume and the set target all skip it. Deliberately not a prefill: writing
  // into the shared inputs would destroy the work prescription the user needs 90 seconds later.
  // Undo is the trash icon already on every row of the set list below.
  async function onLogWarmup(wu: { kg: number; reps: number }) {
    await logSet({
      userId,
      sessionId: await ensureSession(),
      exerciseId: pick.exerciseId,
      exerciseName: pick.exerciseName,
      weightKg: wu.kg,
      reps: wu.reps,
      rir: null,
      note: WARMUP_NOTE,
    })
  }

  const toggle = (p: Panel) => setPanel((cur) => (cur === p ? 'none' : p))

  return (
    <div className="border-t border-steel-800 px-4 pb-4 pt-3">
      {/* Toolbar: swap exercise / load setup / rest this / remove / save-to-plan (M4, M8.7) */}
      <div className="mb-3 flex flex-wrap gap-2 text-xs font-bold uppercase tracking-wide">
        {pick.pool && (pick.pool.length > 1 || alts.length > 0) && (
          <Tool active={panel === 'swap'} onClick={() => toggle('swap')}>Swap</Tool>
        )}
        <Tool active={panel === 'load'} onClick={() => toggle('load')}>Load</Tool>
        <Tool active={panel === 'rest'} onClick={() => toggle('rest')}>Rest</Tool>
        <Tool active={panel === 'remove'} onClick={() => toggle('remove')}>Remove</Tool>
        {pick.added && (
          pick.savedToPlan ? (
            <span className="rounded-lg px-3 py-1.5 text-green-400">✓ In plan</span>
          ) : (
            <button
              type="button"
              onClick={() => void saveToPlan()}
              className="rounded-lg bg-steel-800 px-3 py-1.5 text-fog transition-colors hover:bg-amber hover:text-ink"
            >
              Save to plan
            </button>
          )
        )}
      </div>

      {panel === 'swap' && pick.pool && (
        <div className="mb-3">
          <div className="flex flex-wrap gap-2">
            {pick.pool.map((exId) => (
              <SwapChip
                key={exId}
                active={exId === pick.exerciseId}
                label={nameOf.get(exId) ?? exId}
                onClick={() => void swapTo(exId)}
              />
            ))}
          </div>
          {alts.length > 0 && (
            <>
              <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-fog">More with your kit</p>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {alts.map((e) => (
                  <SwapChip
                    key={e.id}
                    active={e.id === pick.exerciseId}
                    label={e.name}
                    onClick={() => void swapTo(e.id)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {panel === 'remove' && (
        <div className="mb-3 rounded-lg bg-steel-800 px-3 py-2.5">
          <p className="text-sm text-chalk">Remove <span className="font-bold">{pick.exerciseName}</span>?</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <RestButton onClick={() => void dropToday()}>Just today</RestButton>
            {inPlan && <RestButton onClick={() => void dropEverywhere()}>Remove from plan too</RestButton>}
          </div>
          {inPlan && (
            <p className="mt-2 text-xs text-fog">“Just today” leaves it in the plan — it’s back next time this day runs.</p>
          )}
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
              <RestButton onClick={() => void rest('exercise', pick.exerciseId, pick.exerciseName)}>
                Rest this lift · 1 week
              </RestButton>
              {muscle && (
                <RestButton onClick={() => void rest('muscle', muscle, muscle)}>
                  Rest {muscle} · 1 week
                </RestButton>
              )}
            </div>
          )}
        </div>
      )}

      {panel === 'load' && (
        <div className="mb-3 space-y-1.5 rounded-lg bg-steel-800 px-3 py-2 text-sm">
          <label className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-fog">Weight step</span>
            <span className="flex items-baseline gap-1">
              <input
                type="number"
                inputMode="decimal"
                step="0.5"
                min="0"
                value={prefs.exerciseSteps[pick.exerciseId] ?? ''}
                onChange={(e) => setExerciseStep(pick.exerciseId, Number(e.target.value) || 0)}
                placeholder={String(stepKg)}
                aria-label="Weight increment for this exercise in kg"
                className="nums w-14 bg-transparent text-right text-base font-black text-chalk outline-none placeholder:text-steel-600"
              />
              <span className="text-fog">kg</span>
            </span>
          </label>
          <p className="text-xs text-fog">
            {prefs.exerciseSteps[pick.exerciseId]
              ? 'This machine only. Clear the box to go back to the default.'
              : `Inherited from ${equip || 'bodyweight'} — override it if this one jumps differently.`}
          </p>

          {plateLoaded && (
            <>
              <label className="flex items-center justify-between gap-3 border-t border-steel-700 pt-1.5">
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
              <p>
                {plates.length > 0 ? (
                  <>
                    <span className="font-semibold text-fog">Per side: </span>
                    <span className="nums font-bold text-chalk">{plates.join(' + ')} kg</span>
                    {Math.abs(loadable - wKg) > 0.01 && (
                      <span className="text-amber"> · closest you can load is {loadable} kg</span>
                    )}
                  </>
                ) : (
                  <span className="text-fog">Enter a weight above the {barKg}kg bar to see the plate stack.</span>
                )}
              </p>
            </>
          )}
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
          onChange={(e) => void onMinSets(e.target.value)}
          placeholder="—"
          aria-label="Minimum sets target"
          className="nums w-16 bg-transparent text-right text-lg font-black text-chalk outline-none placeholder:text-steel-600"
        />
      </label>

      {warmups.length > 0 && (
        <div className="mt-2 flex items-center gap-2 text-xs">
          <span className="font-semibold uppercase tracking-wide text-fog">Warm-up</span>
          {/* Tap to log the ramp set — it joins the list below marked "Warm-up" but counts toward
              nothing: not the set target, not volume, not PRs, not the next prescription. */}
          {warmups.map((wu) => (
            <button
              key={wu.kg}
              type="button"
              onClick={() => void onLogWarmup(wu)}
              aria-label={`Log warm-up set: ${formatWeight(wu.kg, unit)} for ${wu.reps} reps`}
              className="nums rounded bg-steel-800 px-2 py-1 font-bold text-chalk transition-colors hover:bg-amber hover:text-ink"
            >
              {formatWeight(wu.kg, unit)} <span className="opacity-60">× {wu.reps}</span>
            </button>
          ))}
        </div>
      )}

      {reason && <p className="mt-3 text-xs font-semibold text-amber">↗ {reason}</p>}
      {calibrate && (
        <p className="mt-3 text-xs text-fog">
          {body
            ? 'First time? Log a set of about 8 reps — your first set seeds the progression.'
            : 'First time? Enter a weight you could lift about 8 times — your first set seeds the progression.'}
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
          {body ? (
            <Field label="Load">
              <span className="nums block text-center text-2xl font-black text-chalk">BW</span>
            </Field>
          ) : (
            <Field label={`Weight (${unit})`}>
              {/* step stays 0.5, NOT the equipment increment: `step` is a VALIDATION rule, and a
                  4.5 kg increment would make "40" a stepMismatch and silently block the submit —
                  you must always be able to log what you actually lifted. The increment does its
                  job in the suggestion and the warm-up rungs. */}
              <input
                type="number" inputMode="decimal" step="0.5" min="0"
                value={weight}
                onChange={(e) => {
                  dirty.current = true
                  setWeight(e.target.value)
                }}
                placeholder="0"
                className="nums w-full bg-transparent text-center text-2xl font-black text-chalk outline-none placeholder:text-steel-700"
              />
            </Field>
          )}
          <Field label="Reps">
            <input
              ref={repsRef}
              type="number" inputMode="numeric" step="1" min="1"
              value={reps}
              onChange={(e) => {
                dirty.current = true
                setReps(e.target.value)
              }}
              placeholder="0"
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
        {/* Escape hatch both ways. Gated on `kitFree || body` rather than `kitFree` alone so a
            non-bodyweight lift the engine put in Body mode (all its logged sets were 0 kg) can
            always get its weight field back. */}
        {(kitFree || body) && (
          <button
            type="button"
            onClick={() => {
              modeTouched.current = true
              if (body) setWeight('')
              setBody((b) => !b)
            }}
            className="text-xs font-semibold text-fog underline-offset-4 transition-colors hover:text-amber hover:underline"
          >
            {body ? '+ Add weight' : 'Just bodyweight'}
          </button>
        )}
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

function SwapChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${active ? 'bg-amber text-ink' : 'bg-steel-800 text-fog hover:text-chalk'}`}
    >
      {label}
    </button>
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
