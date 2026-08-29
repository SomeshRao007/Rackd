import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useDb, useRxData } from '../db/useRxData'
import type { Exercise, CustomExercise, MobilityStep, Plan, PlanDay, PlannedDay, PlannedPick, SchemeId, Readiness } from '../db/schema'
import { customToExercise } from '../db/customExercises'
import { resolveDay, lockDay, saveAddedPickToPlan, addToSlotPool } from '../db/plans'
import { deloadStatus, todaySession } from '../db/actions'
import { fitToBudget, mobilityMinutes } from '../db/generate'
import { carryablePicks } from '../lib/plannedDay'
import { SCHEMES, DELOAD_SET_FACTOR } from '../lib/suggest'
import { usePrefs, setBudgetMin } from '../lib/prefs'
import { todayReadiness, logReadiness } from '../db/readiness'
import { readinessScore, readinessLabel } from '../lib/readiness'
import { MobilityBlock } from '../components/MobilityBlock'
import { ExercisePicker } from '../components/ExercisePicker'

const today = () => new Date().toISOString().slice(0, 10)

/** slotId → chosen exerciseIds, seeded from the committed day when there is one. Committed picks
 *  carry the `~n` suffix a multi-movement slot mints at apply time, so strip it to get back to the
 *  slot. Plan slots the committed day doesn't mention fall back to the freshly resolved anchor. */
function seedSelection(basePicks: PlannedPick[], committed: PlannedDay | null): Record<string, string[]> {
  const sel: Record<string, string[]> = {}
  for (const p of committed?.picks ?? []) {
    if (p.added) continue // ad-hoc lift, not a plan slot — carried through onApply instead
    const base = p.slotId.split('~')[0]
    ;(sel[base] ??= []).push(p.exerciseId)
  }
  for (const p of basePicks) sel[p.slotId] ??= [p.exerciseId]
  return sel
}

export function StartDay() {
  const { id: planId, dayId } = useParams()
  const { user } = useAuth()
  const userId = user?.id ?? ''
  const navigate = useNavigate()
  const db = useDb()
  const prefs = usePrefs()

  const [plan, setPlan] = useState<Plan | null>(null)
  const [day, setDay] = useState<PlanDay | null>(null)
  const [basePicks, setBasePicks] = useState<PlannedPick[]>([])
  // slotId → chosen exerciseIds, [0] leading. Pools are 4–5 deep now, so a slot can run more than
  // one movement; each extra becomes its own pick (and its own logger) at lock time.
  const [sel, setSel] = useState<Record<string, string[]>>({})
  const [warmup, setWarmup] = useState<MobilityStep[]>([])
  const [cooldown, setCooldown] = useState<MobilityStep[]>([])
  const [scheme, setScheme] = useState<SchemeId>('double')
  // Circuit timing (M8.3): non-null → this is a timed circuit; lock it as one, skip the set-budget UI.
  const [circuit, setCircuit] = useState<{ workSec?: number; restSec?: number; rounds?: number } | null>(null)
  const [deloadReason, setDeloadReason] = useState<string | null>(null)
  const [deload, setDeload] = useState(false) // never auto-applied — the user opts in
  // Today's committed day, when this screen is opened mid-session as "Customize". Applying then
  // has to merge rather than replace — see onApply.
  const [committed, setCommitted] = useState<PlannedDay | null>(null)
  // Lifts added straight onto Today. They belong to the session, not the plan, so `resolveDay`
  // knows nothing about them — before M8.7 they were invisible here and only smuggled through
  // onApply, which is why an exercise you added never showed up on Customize.
  const [addedPicks, setAddedPicks] = useState<PlannedPick[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [poolSlot, setPoolSlot] = useState<string | null>(null)
  // Budget/deload changed during this visit → the user asked for a refit, so the fresh set targets
  // win over their committed ones. Untouched → they came to swap movements, keep their edits.
  const [refitSets, setRefitSets] = useState(false)
  const [loading, setLoading] = useState(true)
  const [readiness, setReadiness] = useState<Readiness | null>(null)
  const [sleep, setSleep] = useState(1)
  const [soreness, setSoreness] = useState(1)
  const [energy, setEnergy] = useState(1)
  const [redo, setRedo] = useState(false)

  // Custom lifts ride along or a user-authored exercise (or stretch) renders as its raw UUID.
  const exercises = useRxData<Exercise>((d) => d.exercises.find(), [])
  const custom = useRxData<CustomExercise>((d) => d.customexercises.find({ selector: { userId, deletedAt: null } }), [userId])
  const allEx = useMemo(() => [...exercises, ...custom.map(customToExercise)], [exercises, custom])
  const nameOf = useMemo(() => new Map(allEx.map((e) => [e.id, e.name])), [allEx])
  const exMap = useMemo(() => new Map(allEx.map((e) => [e.id, e])), [allEx])

  useEffect(() => {
    if (!db || !planId || !dayId) return
    let alive = true
    db.plans
      .findOne(planId)
      .exec()
      .then(async (doc) => {
        if (!alive || !doc) {
          if (alive) setLoading(false)
          return
        }
        const p = doc.toJSON() as Plan
        const found = (JSON.parse(p.days) as PlanDay[]).find((x) => x.id === dayId) ?? null
        const resolved = await resolveDay(p, dayId, userId) // equipment/exclusion-filtered proposal
        // Opened mid-session? Seed from what's actually committed, so Customize shows the day the
        // user is training — their swaps and mobility edits — not a fresh proposal over the top.
        const sess = await todaySession(userId)
        const prev = sess?.plannedDay ? (JSON.parse(sess.plannedDay) as PlannedDay) : null
        const seed = prev && prev.planId === p.id && prev.dayId === dayId ? prev : null
        if (!alive) return
        setPlan(p)
        setDay(found)
        setCommitted(seed)
        setSessionId(sess?.id ?? null)
        setAddedPicks(seed?.picks.filter((x) => x.added) ?? [])
        setBasePicks(resolved.picks)
        setSel(seedSelection(resolved.picks, seed))
        setWarmup(seed?.warmup ?? resolved.warmup ?? [])
        setCooldown(seed?.cooldown ?? resolved.cooldown ?? [])
        setScheme(seed?.scheme ?? resolved.scheme ?? 'double')
        setDeload(seed?.deload ?? false)
        setCircuit(
          resolved.mode === 'circuit'
            ? { workSec: resolved.workSec, restSec: resolved.restSec, rounds: resolved.rounds }
            : null,
        )
        setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [db, planId, dayId, userId])

  // Deload check (M5): surface a suggestion banner when a lighter week is due.
  useEffect(() => {
    if (!userId) return
    let alive = true
    deloadStatus(userId).then((reason) => {
      if (alive) setDeloadReason(reason)
    })
    return () => {
      alive = false
    }
  }, [userId])

  // Readiness check-in (M7): today's row seeds the taps; the loggers read it for load auto-regulation.
  useEffect(() => {
    if (!userId) return
    let alive = true
    todayReadiness(userId, today()).then((r) => {
      if (!alive) return
      setReadiness(r)
      if (r) {
        setSleep(r.sleep)
        setSoreness(r.soreness)
        setEnergy(r.energy)
      }
    })
    return () => {
      alive = false
    }
  }, [userId])

  // Sets/reps fit the budget live (no budget → 2×10); load stays user-entered. Compounds favored.
  // Deload on → half the sets here; the −15% load happens in the loggers via the flag.
  // ponytail: preview reps come from fitToBudget's mechanic defaults; the scheme's reps win when the logger opens. Bake suggestions in at lock time if the mismatch confuses.
  const mobMin = useMemo(() => mobilityMinutes([...warmup, ...cooldown]), [warmup, cooldown])

  // One pick per selected exercise. Extras take a `~n` slotId — fitToBudget and every post-lock
  // action key rows by slotId, and `~` can't occur in a generated slot id (slugs / UUIDs).
  const expanded = useMemo(
    () =>
      basePicks.flatMap((p) =>
        (sel[p.slotId] ?? [p.exerciseId]).map((exId, i) => ({
          ...p,
          slotId: i === 0 ? p.slotId : `${p.slotId}~${i}`,
          exerciseId: exId,
          exerciseName: nameOf.get(exId) ?? exId,
          // A manual choice is no longer an auto-substitution.
          ...(exId === p.exerciseId ? {} : { substituted: undefined }),
        })),
      ),
    [basePicks, sel, nameOf],
  )

  // Added lifts go through the budget with everything else — leaving them out let the time budget
  // under-count a day the user had already added two exercises to.
  const fitted = useMemo(() => {
    const all = [...expanded, ...addedPicks]
    if (circuit) return all // timed circuit: fixed stations, no set-budget fitting
    const out = fitToBudget(all, exMap, prefs.budgetMin, mobMin, { restSec: prefs.restSec, workSec: prefs.workSec, maxSets: prefs.maxSets })
    if (!deload) return out
    return out.map((p) =>
      p.minSets != null ? { ...p, minSets: Math.max(1, Math.round(p.minSets * DELOAD_SET_FACTOR)) } : p,
    )
  }, [expanded, addedPicks, exMap, prefs.budgetMin, mobMin, prefs.restSec, prefs.workSec, prefs.maxSets, deload, circuit])
  const picks = useMemo(() => fitted.filter((p) => !p.added), [fitted])
  const addedFitted = useMemo(() => fitted.filter((p) => p.added), [fitted])

  // Tap on = add the movement to this slot, tap off = drop it; the last one can't be removed.
  const toggle = (slotId: string, exId: string) =>
    setSel((cur) => {
      const list = cur[slotId] ?? []
      if (!list.includes(exId)) return { ...cur, [slotId]: [...list, exId] }
      if (list.length === 1) return cur
      return { ...cur, [slotId]: list.filter((x) => x !== exId) }
    })

  // Apply overwrites today's day, so anything the session gained that this screen can't see has to
  // be carried across: hand-edited set targets, and ad-hoc lifts added mid-session (their slotIds
  // are UUIDs, absent from day.slots, so `picks` — built from basePicks — never contains them).
  async function onApply() {
    if (!plan || !day) return
    const prevBySlot = new Map((committed?.picks ?? []).map((p) => [p.slotId, p]))
    const keepEdits = (p: PlannedPick) => {
      const prev = prevBySlot.get(p.slotId)
      return !refitSets && prev?.minSets != null ? { ...p, minSets: prev.minSets } : p
    }
    const merged = picks.map(keepEdits)
    // A lift already saved into the plan arrives from BOTH sides here — the plan's copy wins.
    // That double row is the bug this filter exists for; the rule is unit-tested.
    const carried = carryablePicks(addedFitted, merged).map(keepEdits)
    await lockDay(userId, {
      planId: plan.id,
      dayId: day.id,
      label: day.label,
      picks: [...merged, ...carried],
      warmup,
      cooldown,
      scheme,
      ...(deload ? { deload: true } : {}),
      ...(circuit ? { mode: 'circuit' as const, ...circuit } : {}),
    })
    navigate('/app/today')
  }

  /** Persist an added lift into the plan so it recurs. Its pool is just itself — "+ Add movement"
   *  on the slot card is what gives it something to rotate with. */
  async function savePick(slotId: string) {
    if (!sessionId) return
    await saveAddedPickToPlan(sessionId, slotId)
    setAddedPicks((cur) => cur.map((p) => (p.slotId === slotId ? { ...p, savedToPlan: true } : p)))
  }

  /** Add rotation alternatives to a slot. Written straight to the plan (not staged behind Apply) —
   *  it changes future days, not today's, so there's nothing for Apply to commit. Left unlit: it's
   *  an alternative for next time, not a swap for right now. */
  async function addToPool(slotId: string, exIds: string[]) {
    if (!plan || !day) return
    await addToSlotPool(plan.id, day.id, slotId, exIds)
    const fresh = (pool: string[]) => [...pool, ...exIds.filter((id) => !pool.includes(id))]
    setBasePicks((cur) => cur.map((p) => (p.slotId === slotId ? { ...p, pool: fresh(p.pool ?? []) } : p)))
    setDay((d) => d && { ...d, slots: d.slots.map((s) => (s.id === slotId ? { ...s, exercisePool: fresh(s.exercisePool) } : s)) })
    setPoolSlot(null)
  }

  async function saveCheckin() {
    const row = await logReadiness({ userId, date: today(), sleep, soreness, energy })
    setReadiness(row)
    setRedo(false)
  }

  const readinessLive = readinessScore({ sleep, soreness, energy })
  const showCheckin = !readiness || redo

  if (loading) return <p className="mt-8 text-center text-fog">Loading…</p>
  if (!plan || !day) {
    return (
      <section>
        <p className="mt-8 text-center text-fog">That plan day no longer exists.</p>
        <Link to="/app/plans" className="mt-4 block text-center font-semibold text-amber">
          Back to plans
        </Link>
      </section>
    )
  }

  return (
    <section className="pb-24">
      {/* Reachable from Today ("Customize") and from Plans ("Start {day}") — go back where you came
          from rather than always landing on Plans. Same idiom as ExerciseDetail. */}
      <button
        type="button"
        onClick={() => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/app/plans'))}
        className="-ml-1 mb-3 flex items-center gap-1 text-sm font-semibold text-fog hover:text-chalk"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="m15 18-6-6 6-6" />
        </svg>
        Back
      </button>

      <h1 className="font-display text-3xl font-black tracking-tight">{day.label}</h1>
      {circuit ? (
        <p className="mt-1 text-sm text-fog">
          A timed circuit — <span className="font-semibold text-chalk">{circuit.rounds ?? 1} rounds · {circuit.workSec ?? 0}s work / {circuit.restSec ?? 0}s rest</span>. Tap to add or drop a station, then apply the changes.
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-fog">
            Your anchor lift per section, filtered to your kit. Tap to add or drop movements, set a time budget, then apply the changes to today.
          </p>
          <p className="mt-1 text-sm text-fog">
            Progression: <span className="font-semibold text-chalk">{SCHEMES.find((s) => s.id === scheme)?.name}</span>{' '}
            <Link to={`/app/plans/${plan.id}`} className="font-semibold text-amber hover:text-amber-bright">
              Change
            </Link>
          </p>
        </>
      )}

      {/* Deload suggestion (M5) — opt-in only; sets halve in the preview below, load drops in the loggers. */}
      {!circuit && deloadReason && (
        <div className="mt-4 rounded-xl border border-amber/40 bg-amber/10 px-4 py-3">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm text-chalk">
              <span className="font-bold text-amber">Deload suggested</span> — {deloadReason}. One lighter session: −15%
              weight, half the sets.
            </p>
            <button
              type="button"
              onClick={() => {
                setDeloadReason(null)
                setDeload(false)
              }}
              aria-label="Dismiss deload suggestion"
              className="shrink-0 text-fog transition-colors hover:text-chalk"
            >
              ✕
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              setDeload((d) => !d)
              setRefitSets(true) // deload halves the sets — that has to reach the committed day
            }}
            aria-pressed={deload}
            className={`mt-2 rounded-lg px-3 py-2 text-sm font-bold transition-colors ${
              deload ? 'bg-amber text-ink' : 'bg-steel-800 text-fog hover:text-chalk'
            }`}
          >
            {deload ? '✓ Deload on — tap to undo' : 'Take a deload'}
          </button>
        </div>
      )}

      {/* Readiness check-in (M7) — three taps → a 0–100 score; low days ease suggested loads in the loggers. */}
      <section className="mt-4 rounded-2xl border border-steel-800 bg-steel-900 p-4">
        <h2 className="font-display text-lg font-black text-chalk">Readiness check-in</h2>
        {showCheckin ? (
          <>
            <div className="mt-3 space-y-3">
              <TapRow label="Sleep" options={['Poor', 'OK', 'Great']} value={sleep} onChange={setSleep} />
              <TapRow label="Soreness" options={['Sore', 'Meh', 'Fresh']} value={soreness} onChange={setSoreness} />
              <TapRow label="Energy" options={['Drained', 'OK', 'Fired up']} value={energy} onChange={setEnergy} />
            </div>
            <p className="mt-3 text-sm text-chalk">
              Readiness <span className="nums font-bold text-amber">{readinessLive}</span>/100 —{' '}
              {readinessLabel(readinessLive)}
            </p>
            <button
              type="button"
              onClick={saveCheckin}
              className="mt-3 w-full rounded-xl bg-amber py-3 font-display font-black uppercase tracking-wide text-ink transition-colors hover:bg-amber-bright"
            >
              Save check-in
            </button>
          </>
        ) : (
          <div className="mt-2 flex items-start justify-between gap-3">
            <p className="text-sm text-chalk">
              Readiness <span className="nums font-bold text-amber">{readinessLive}</span>/100 —{' '}
              {readinessLabel(readinessLive)}. Low days ease today's suggested loads automatically.
            </p>
            <button
              type="button"
              onClick={() => setRedo(true)}
              className="shrink-0 text-sm font-semibold text-fog transition-colors hover:text-chalk"
            >
              Redo
            </button>
          </div>
        )}
      </section>

      {/* Time budget — sets/reps auto-fit; blank = no limit (default 2×10). Circuits have fixed timing. */}
      {!circuit && (
        <label className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-steel-800 bg-steel-900 px-4 py-3">
          <span className="text-sm font-semibold uppercase tracking-wide text-fog">Time budget</span>
          <span className="flex items-baseline gap-1.5">
            <input
              type="number"
              inputMode="numeric"
              min="0"
              step="5"
              value={prefs.budgetMin || ''}
              onChange={(e) => {
                setBudgetMin(Number(e.target.value) || 0)
                setRefitSets(true) // an explicit budget change re-fits every set target on apply
              }}
              placeholder="—"
              aria-label="Time budget in minutes"
              className="nums w-16 bg-transparent text-right text-2xl font-black text-chalk outline-none placeholder:text-steel-600"
            />
            <span className="text-sm font-semibold text-fog">min</span>
          </span>
        </label>
      )}

      {fitted.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-steel-700 px-4 py-8 text-center text-sm text-fog">
          This day has no exercises yet.{' '}
          <Link to={`/app/plans/${plan.id}`} className="font-semibold text-amber">
            Add some
          </Link>
          .
        </p>
      ) : (
        <>
          {/* Editable: mobilityMinutes feeds fitToBudget, so re-timing a hold re-fits the sets. */}
          <MobilityBlock title="Warm-up" steps={warmup} nameOf={nameOf} onChange={setWarmup} pattern="warmup" />

          {/* One card per slot; every lit chip becomes its own exercise (and logger) on lock. */}
          <ul className="mt-5 space-y-4">
            {basePicks.map((base) => {
              const slot = day.slots.find((s) => s.id === base.slotId)
              const chosen = sel[base.slotId] ?? [base.exerciseId]
              const setsOf = new Map(
                picks
                  .filter((p) => p.slotId === base.slotId || p.slotId.startsWith(`${base.slotId}~`))
                  .map((p) => [p.exerciseId, p]),
              )
              return (
                <li key={base.slotId} className="rounded-2xl border border-steel-800 bg-steel-900 p-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-xs font-bold uppercase tracking-widest text-amber">{base.slotLabel}</p>
                    {chosen.length > 1 && <p className="nums text-xs font-bold text-fog">{chosen.length} lifts</p>}
                  </div>
                  {base.unavailable && (
                    <p className="mt-1 text-xs font-semibold text-amber-dim">⚠ No available match (kit or rest) — showing all</p>
                  )}
                  {base.substituted && chosen.includes(base.exerciseId) && (
                    <p className="mt-1 text-xs font-semibold text-amber-dim">↻ Swapped for your kit</p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(base.pool ?? slot?.exercisePool)?.map((exId) => {
                      const active = chosen.includes(exId)
                      const fitted = setsOf.get(exId)
                      return (
                        <button
                          key={exId}
                          type="button"
                          onClick={() => toggle(base.slotId, exId)}
                          aria-pressed={active}
                          className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                            active ? 'bg-amber text-ink' : 'bg-steel-800 text-fog hover:text-chalk'
                          }`}
                        >
                          {nameOf.get(exId) ?? exId}
                          {active && fitted?.minSets != null && (
                            <span className="nums text-xs font-black text-ink/60">
                              {fitted.minSets}×{fitted.targetReps}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => setPoolSlot(base.slotId)}
                    className="mt-2 text-xs font-semibold text-fog transition-colors hover:text-amber"
                  >
                    + Add movement
                  </button>
                </li>
              )
            })}
          </ul>

          {/* Lifts added on Today. Editable here now — dropping one or saving it into the plan both
              used to need a trip back to Today, and until M8.7 they didn't render here at all. */}
          {addedFitted.length > 0 && (
            <>
              <h2 className="mt-5 text-xs font-bold uppercase tracking-widest text-amber">Added today</h2>
              <ul className="mt-2 space-y-2">
                {addedFitted.map((p) => (
                  <li key={p.slotId} className="flex items-center gap-2 rounded-xl border border-steel-800 bg-steel-900 px-3 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{p.exerciseName}</span>
                      <span className="text-xs uppercase tracking-wide text-fog">
                        {p.slotLabel}
                        {p.minSets != null && <span className="nums"> · {p.minSets}×{p.targetReps}</span>}
                      </span>
                    </span>
                    {p.savedToPlan ? (
                      <span className="shrink-0 text-xs font-bold uppercase tracking-wide text-green-400">✓ In plan</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void savePick(p.slotId)}
                        className="shrink-0 rounded-lg bg-steel-800 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-fog transition-colors hover:bg-amber hover:text-ink"
                      >
                        Save to plan
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setAddedPicks((cur) => cur.filter((x) => x.slotId !== p.slotId))}
                      aria-label={`Remove ${p.exerciseName}`}
                      className="grid size-8 shrink-0 place-items-center rounded-lg text-steel-600 transition-colors hover:bg-steel-800 hover:text-red-400"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-xs text-fog">Saved lifts come back every time this day runs. Add alternatives to a section above to let one rotate.</p>
            </>
          )}

          <MobilityBlock title="Cooldown" steps={cooldown} nameOf={nameOf} onChange={setCooldown} pattern="cooldown" />
        </>
      )}

      {fitted.length > 0 && (
        <div className="fixed inset-x-0 bottom-16 z-10 mx-auto max-w-lg px-4">
          <button
            type="button"
            onClick={onApply}
            className="w-full rounded-xl bg-amber py-4 font-display text-lg font-black uppercase tracking-wide text-ink shadow-lg transition-colors hover:bg-amber-bright"
          >
            Apply changes
          </button>
        </div>
      )}

      {poolSlot && (
        <ExercisePicker
          title="Add a movement"
          exclude={day.slots.find((s) => s.id === poolSlot)?.exercisePool ?? []}
          onPickMany={(es) => void addToPool(poolSlot, es.map((e) => e.id))}
          onClose={() => setPoolSlot(null)}
        />
      )}
    </section>
  )
}

// Three-tap selector row for the readiness check-in (M7). Index 0/1/2 = worst→best; amber = selected.
function TapRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: string[]
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-fog">{label}</div>
      <div className="grid grid-cols-3 gap-2">
        {options.map((opt, i) => {
          const active = value === i
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(i)}
              aria-pressed={active}
              className={`rounded-lg px-2 py-2 text-sm font-semibold transition-colors ${
                active ? 'bg-amber text-ink' : 'bg-steel-800 text-fog hover:text-chalk'
              }`}
            >
              {opt}
            </button>
          )
        })}
      </div>
    </div>
  )
}
