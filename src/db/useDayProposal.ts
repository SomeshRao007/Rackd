import { useEffect, useMemo, useState } from 'react'
import type { Exercise, Plan, PlannedDay } from './schema'
import { resolveDay } from './plans'
import { fitToBudget, mobilityMinutes } from './generate'
import { usePrefs } from '../lib/prefs'

/**
 * Today's scheduled day, resolved but NOT committed — the thing that replaced "Lock day & start".
 *
 * Returns exactly what `lockDay` used to write, so Today can render a fully working session off it
 * and only persist once the user actually does something (Today's `ensureSession`). Pass a null
 * `dayId` to switch it off (rest day, no plan, or a day that's already committed).
 *
 * The `fitToBudget` pass is not optional: `resolveDay` leaves `minSets`/`targetReps` unset, and
 * without them every row loses its target and its green-done state. Mirrors StartDay's memo minus
 * the multi-select expansion (one movement per slot is the default) and minus deload — that stays
 * an opt-in on Customize.
 */
export function useDayProposal(
  plan: Plan | null,
  dayId: string | null,
  userId: string,
  exMap: Map<string, Exercise>,
): PlannedDay | null {
  const prefs = usePrefs()
  const [resolved, setResolved] = useState<PlannedDay | null>(null)
  const equipment = prefs.equipment.join(',')

  useEffect(() => {
    if (!plan || !dayId || !userId) return // never clear synchronously — the memo below gates instead
    let alive = true
    // Re-resolves when the plan is edited or the kit changes — equipment/exclusion filtering
    // happens inside resolveDay, so a stale proposal would offer gear the user just unchecked.
    void resolveDay(plan, dayId, userId).then((day) => {
      if (alive) setResolved(day)
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan?.id, plan?.updatedAt, dayId, userId, equipment])

  return useMemo(() => {
    // Gate here rather than clearing state in the effect: switched off, or still holding the
    // previous day's answer while the new one resolves, both read as "no proposal yet".
    if (!plan || !dayId || !resolved) return null
    if (resolved.planId !== plan.id || resolved.dayId !== dayId) return null
    if (resolved.mode === 'circuit') return resolved // fixed stations — no set budget to fit
    const mobMin = mobilityMinutes([...(resolved.warmup ?? []), ...(resolved.cooldown ?? [])])
    return {
      ...resolved,
      picks: fitToBudget(resolved.picks, exMap, prefs.budgetMin, mobMin, {
        restSec: prefs.restSec,
        workSec: prefs.workSec,
        maxSets: prefs.maxSets,
      }),
    }
  }, [plan, dayId, resolved, exMap, prefs.budgetMin, prefs.restSec, prefs.workSec, prefs.maxSets])
}
