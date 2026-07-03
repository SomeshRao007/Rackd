import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useDb, useRxData } from '../db/useRxData'
import type { Exercise, MobilityStep, Plan, PlanDay, PlannedPick } from '../db/schema'
import { resolveDay, lockDay } from '../db/plans'
import { fitToBudget, mobilityMinutes } from '../db/generate'
import { usePrefs, setBudgetMin } from '../lib/prefs'
import { MobilityBlock } from '../components/MobilityBlock'

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
  const [warmup, setWarmup] = useState<MobilityStep[]>([])
  const [cooldown, setCooldown] = useState<MobilityStep[]>([])
  const [loading, setLoading] = useState(true)

  const exercises = useRxData<Exercise>((d) => d.exercises.find(), [])
  const nameOf = useMemo(() => new Map(exercises.map((e) => [e.id, e.name])), [exercises])
  const exMap = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises])

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
        if (!alive) return
        setPlan(p)
        setDay(found)
        setBasePicks(resolved.picks)
        setWarmup(resolved.warmup ?? [])
        setCooldown(resolved.cooldown ?? [])
        setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [db, planId, dayId, userId])

  // Sets/reps fit the budget live (no budget → 2×10); load stays user-entered. Compounds favored.
  const mobMin = useMemo(() => mobilityMinutes([...warmup, ...cooldown]), [warmup, cooldown])
  const picks = useMemo(
    () => fitToBudget(basePicks, exMap, prefs.budgetMin, mobMin, { restSec: prefs.restSec, workSec: prefs.workSec, maxSets: prefs.maxSets }),
    [basePicks, exMap, prefs.budgetMin, mobMin, prefs.restSec, prefs.workSec, prefs.maxSets],
  )

  function swap(slotId: string, exerciseId: string) {
    setBasePicks((cur) =>
      cur.map((p) =>
        p.slotId === slotId
          ? { ...p, exerciseId, exerciseName: nameOf.get(exerciseId) ?? exerciseId }
          : p,
      ),
    )
  }

  async function onLock() {
    if (!plan || !day) return
    await lockDay(userId, { planId: plan.id, dayId: day.id, label: day.label, picks, warmup, cooldown })
    navigate('/app/today')
  }

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
      <Link to="/app/plans" className="-ml-1 mb-3 flex items-center gap-1 text-sm font-semibold text-fog hover:text-chalk">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="m15 18-6-6 6-6" />
        </svg>
        Plans
      </Link>

      <h1 className="font-display text-3xl font-black tracking-tight">{day.label}</h1>
      <p className="mt-1 text-sm text-fog">
        Proposed by least-recently-trained, filtered to your kit. Tap to swap, set a time budget, then lock it in.
      </p>

      {/* Time budget — sets/reps auto-fit; blank = no limit (default 2×10). */}
      <label className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-steel-800 bg-steel-900 px-4 py-3">
        <span className="text-sm font-semibold uppercase tracking-wide text-fog">Time budget</span>
        <span className="flex items-baseline gap-1.5">
          <input
            type="number"
            inputMode="numeric"
            min="0"
            step="5"
            value={prefs.budgetMin || ''}
            onChange={(e) => setBudgetMin(Number(e.target.value) || 0)}
            placeholder="—"
            aria-label="Time budget in minutes"
            className="nums w-16 bg-transparent text-right text-2xl font-black text-chalk outline-none placeholder:text-steel-600"
          />
          <span className="text-sm font-semibold text-fog">min</span>
        </span>
      </label>

      {picks.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-steel-700 px-4 py-8 text-center text-sm text-fog">
          This day has no exercises yet.{' '}
          <Link to={`/app/plans/${plan.id}`} className="font-semibold text-amber">
            Add some
          </Link>
          .
        </p>
      ) : (
        <>
          <MobilityBlock title="Warm-up" steps={warmup} nameOf={nameOf} />

          <ul className="mt-5 space-y-4">
            {picks.map((pick) => {
              const slot = day.slots.find((s) => s.id === pick.slotId)
              return (
                <li key={pick.slotId} className="rounded-2xl border border-steel-800 bg-steel-900 p-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-xs font-bold uppercase tracking-widest text-amber">{pick.slotLabel}</p>
                    {pick.minSets != null && (
                      <p className="nums text-xs font-bold text-fog">
                        {pick.minSets} × {pick.targetReps}
                      </p>
                    )}
                  </div>
                  {pick.unavailable && (
                    <p className="mt-1 text-xs font-semibold text-amber-dim">⚠ No available match (kit or rest) — showing all</p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {slot?.exercisePool.map((exId) => {
                      const active = exId === pick.exerciseId
                      return (
                        <button
                          key={exId}
                          type="button"
                          onClick={() => swap(pick.slotId, exId)}
                          aria-pressed={active}
                          className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                            active ? 'bg-amber text-ink' : 'bg-steel-800 text-fog hover:text-chalk'
                          }`}
                        >
                          {nameOf.get(exId) ?? exId}
                        </button>
                      )
                    })}
                  </div>
                </li>
              )
            })}
          </ul>

          <MobilityBlock title="Cooldown" steps={cooldown} nameOf={nameOf} />
        </>
      )}

      {picks.length > 0 && (
        <div className="fixed inset-x-0 bottom-16 z-10 mx-auto max-w-lg px-4">
          <button
            type="button"
            onClick={onLock}
            className="w-full rounded-xl bg-amber py-4 font-display text-lg font-black uppercase tracking-wide text-ink shadow-lg transition-colors hover:bg-amber-bright"
          >
            Lock day &amp; start
          </button>
        </div>
      )}
    </section>
  )
}
