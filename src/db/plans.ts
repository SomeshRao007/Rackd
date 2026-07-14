import { getDb } from './database'
import { getOrCreateTodaySession, lastSetFor } from './actions'
import { getPrefs, equipmentAvailable } from '../lib/prefs'
import { activeExclusions } from './exclusions'
import type { Plan, PlanDay, PlannedDay, PlannedPick, Exercise, SchemeId } from './schema'
import type { PlanSchedule } from '../lib/schedule'
import { groupOf, GROUP_LABELS, type MuscleGroupId } from '../lib/muscles'
import { findEquivalent, substituteInDays, type SubstitutionSummary } from '../lib/substitute'

const now = () => new Date().toISOString()

// Rotation core (pure; unit-tested in scripts/rotation-test.ts): pick the least-recently-trained exercise — never-trained ('') sorts first, else oldest createdAt wins, ties keep pool order (replace only on strictly smaller).
export function pickLeastRecent(
  pool: string[],
  lastTrainedAt: Record<string, string | null>,
): string {
  let best = pool[0]
  let bestTs = lastTrainedAt[best] ?? ''
  for (let i = 1; i < pool.length; i++) {
    const ts = lastTrainedAt[pool[i]] ?? ''
    if (ts < bestTs) {
      best = pool[i]
      bestTs = ts
    }
  }
  return best
}

// Auto-match a plan day for a goal-suggested exercise (M6 R6 "ADD"): the day whose slots already
// train `group` the most, so a hypertrophy volume add lands where that muscle already lives. Circuit
// days (M8.3 timed stations) are excluded so a strength add doesn't silently become a timed station;
// ties / no-match resolve to the first candidate (strict `>`, like pickLeastRecent). Pure — no DB.
export function pickPlanDayForGroup(
  days: PlanDay[],
  groupById: Map<string, MuscleGroupId | undefined>,
  group: MuscleGroupId,
): PlanDay | null {
  if (days.length === 0) return null
  const candidates = days.filter((d) => d.mode !== 'circuit')
  const pool = candidates.length ? candidates : days
  const scoreOf = (d: PlanDay): number =>
    d.slots.reduce((n, s) => n + s.exercisePool.filter((id) => groupById.get(id) === group).length, 0)
  return pool.reduce((best, d) => (scoreOf(d) > scoreOf(best) ? d : best), pool[0])
}

// ── CRUD (plans are the first freely-editable LWW record; patch bumps updatedAt) ─
export async function createPlan(userId: string, name: string): Promise<Plan> {
  const db = await getDb()
  const ts = now()
  const plan: Plan = {
    id: crypto.randomUUID(),
    userId,
    name,
    days: '[]',
    sourceShareCode: null,
    enrolledAt: null,
    schedule: null,
    createdAt: ts,
    updatedAt: ts,
    deletedAt: null,
  }
  await db.plans.insert(plan)
  return plan
}

export async function updatePlan(
  id: string,
  patch: Partial<Pick<Plan, 'name' | 'days' | 'scheme'>>,
): Promise<void> {
  const db = await getDb()
  const doc = await db.plans.findOne(id).exec()
  if (doc) await doc.patch({ ...patch, updatedAt: now() })
}

// Enroll (M8.2): one active plan at a time — clearing the others' enrolledAt keeps "the enrolled
// plan" a simple findOne everywhere; each patch bumps updatedAt so the change syncs via LWW.
// Note: `enrolledAt: { $ne: null }` selectors don't match under the Dexie storage (they silently
// return nothing, so the clear-loop no-oped and left two plans enrolled). Query plainly and filter
// enrolledAt in JS — the pattern Plans.tsx already uses reliably on the same data.
export async function enrollPlan(
  userId: string,
  planId: string,
  schedule: PlanSchedule,
): Promise<void> {
  const db = await getDb()
  const userPlans = await db.plans.find({ selector: { userId, deletedAt: null } }).exec()
  for (const doc of userPlans) {
    if (doc.id !== planId && doc.enrolledAt != null)
      await doc.patch({ enrolledAt: null, schedule: null, updatedAt: now() })
  }
  const doc = await db.plans.findOne(planId).exec()
  if (doc) await doc.patch({ enrolledAt: now(), schedule: JSON.stringify(schedule), updatedAt: now() })
}

export async function unenrollPlan(planId: string): Promise<void> {
  const db = await getDb()
  const doc = await db.plans.findOne(planId).exec()
  if (doc) await doc.patch({ enrolledAt: null, schedule: null, updatedAt: now() })
}

// Rewrite a plan's pools, swapping every `from`-equipment lift for its best `to` equivalent
// ("use dumbbells instead"). Explicit user action — independent of the Settings equipment filter.
// Locked sessions keep their snapshotted picks; only future resolveDay runs see the change.
export async function substituteEquipment(
  planId: string,
  from: string,
  to: string,
): Promise<SubstitutionSummary> {
  const db = await getDb()
  const doc = await db.plans.findOne(planId).exec()
  if (!doc) return { replaced: 0, kept: 0 }
  const catalog = (await db.exercises.find().exec()).map((e) => e.toJSON() as Exercise)
  const exMap = new Map(catalog.map((e) => [e.id, e]))
  const { days, summary } = substituteInDays(JSON.parse(doc.days) as PlanDay[], exMap, catalog, from, to)
  if (summary.replaced > 0) await doc.patch({ days: JSON.stringify(days), updatedAt: now() })
  return summary
}

export type AddToPlanResult =
  | { ok: true; dayLabel: string }
  | { ok: false; reason: 'no-plan' | 'no-days' | 'duplicate' }

// Append a goal-suggested exercise to the enrolled plan as a new single-exercise slot (M6 R6 "ADD"),
// on the auto-matched day (pickPlanDayForGroup) — a fresh slot (not a rotation-pool append) so the
// exercise shows up every time that day runs, mirroring saveAddedPickToPlan. One enrolled plan at a
// time, queried plainly then filtered in JS (Dexie `$ne: null` gotcha). Idempotent: an exercise
// already anywhere in the plan returns 'duplicate' rather than a second copy.
export async function addExerciseToEnrolledPlan(
  userId: string,
  exerciseId: string,
  group: MuscleGroupId,
): Promise<AddToPlanResult> {
  const db = await getDb()
  const userPlans = await db.plans.find({ selector: { userId, deletedAt: null } }).exec()
  const enrolled = userPlans.find((p) => p.enrolledAt != null)
  if (!enrolled) return { ok: false, reason: 'no-plan' }

  const days = JSON.parse(enrolled.days) as PlanDay[]
  if (days.length === 0) return { ok: false, reason: 'no-days' }
  if (days.some((d) => d.slots.some((s) => s.exercisePool.includes(exerciseId))))
    return { ok: false, reason: 'duplicate' }

  const exs = (await db.exercises.find().exec()).map((e) => e.toJSON() as Exercise)
  const groupById = new Map(exs.map((e) => [e.id, groupOf(e.primaryMuscles[0])]))
  const target = pickPlanDayForGroup(days, groupById, group)
  if (!target) return { ok: false, reason: 'no-days' }

  const name = exs.find((e) => e.id === exerciseId)?.name
  target.slots.push({ id: crypto.randomUUID(), label: name ?? GROUP_LABELS[group], exercisePool: [exerciseId] })
  await updatePlan(enrolled.id, { days: JSON.stringify(days) })
  return { ok: true, dayLabel: target.label }
}

/** Soft-delete (tombstone, so the delete syncs). */
export async function deletePlan(id: string): Promise<void> {
  const db = await getDb()
  const doc = await db.plans.findOne(id).exec()
  if (doc) await doc.patch({ deletedAt: now(), updatedAt: now() })
}

// Copy a plan snapshot into the user's own editable plan; normalize `days` to a string (starter = nested object, shared-code = already a string).
export async function adoptPlan(
  userId: string,
  snapshot: { name: string; days: string | PlanDay[]; shareCode?: string },
): Promise<Plan> {
  const db = await getDb()
  const ts = now()
  const plan: Plan = {
    id: crypto.randomUUID(),
    userId,
    name: snapshot.name,
    days: typeof snapshot.days === 'string' ? snapshot.days : JSON.stringify(snapshot.days),
    sourceShareCode: snapshot.shareCode ?? null,
    enrolledAt: null,
    schedule: null,
    createdAt: ts,
    updatedAt: ts,
    deletedAt: null,
  }
  await db.plans.insert(plan)
  return plan
}

// Propose picks for a plan day — one exercise per slot, chosen by last-trained timestamp (no
// persisted rotation state), after filtering each pool by available equipment (M4 F2) and active
// injury exclusions (M4 F3). A slot whose pool collapses to empty falls back unfiltered + flagged.
export async function resolveDay(
  plan: Plan,
  dayId: string,
  userId: string,
): Promise<PlannedDay> {
  const db = await getDb()
  const days = JSON.parse(plan.days) as PlanDay[]
  const day = days.find((d) => d.id === dayId)
  if (!day) return { planId: plan.id, dayId, label: '', picks: [] }

  // Load the catalog once → filter pools without an N+1 of findOne.
  const allEx = await db.exercises.find().exec()
  const exMap = new Map(allEx.map((e) => [e.id, e.toJSON() as Exercise]))
  const { equipment } = getPrefs()
  const exclusions = await activeExclusions(userId)
  const blockedMuscles = new Set(exclusions.filter((e) => e.kind === 'muscle').map((e) => e.value))
  const blockedExercises = new Set(exclusions.filter((e) => e.kind === 'exercise').map((e) => e.value))

  const passes = (exId: string): boolean => {
    const ex = exMap.get(exId)
    if (!ex) return true // unknown id → don't filter it out (data-quality safety)
    if (blockedExercises.has(exId)) return false
    if (ex.primaryMuscles.some((m) => blockedMuscles.has(m))) return false
    return equipmentAvailable(ex.equipment ?? '', equipment)
  }

  const picks: PlannedPick[] = []
  let subCandidates: Exercise[] | null = null // lazy — only built when a slot collapses
  for (const slot of day.slots) {
    if (slot.exercisePool.length === 0) continue // genuinely empty slot
    // filter BEFORE the lastSetFor loop (correctness + fewer awaits)
    const usable = slot.exercisePool.filter(passes)

    if (usable.length === 0) {
      // Pool collapsed under the equipment/exclusion filter → substitute a catalog equivalent
      // for the user's kit before resorting to the old unfiltered fallback.
      subCandidates ??= [...exMap.values()].filter((e) => e.category !== 'stretching' && passes(e.id))
      let sub: Exercise | null = null
      for (const exId of slot.exercisePool) {
        const src = exMap.get(exId)
        const found = src ? findEquivalent(src, subCandidates) : null
        if (found) {
          sub = found.match
          break
        }
      }
      if (sub) {
        picks.push({
          slotId: slot.id,
          slotLabel: slot.label,
          exerciseId: sub.id,
          exerciseName: sub.name,
          pool: [...slot.exercisePool, sub.id], // substitute rides the pool → swap-back possible
          substituted: true,
        })
        continue
      }
    }

    const unavailable = usable.length === 0
    const pool = unavailable ? slot.exercisePool : usable // never silently drop the slot

    const lastTrainedAt: Record<string, string | null> = {}
    for (const exId of pool) {
      const last = await lastSetFor(userId, exId)
      lastTrainedAt[exId] = last?.createdAt ?? null
    }
    const exerciseId = pickLeastRecent(pool, lastTrainedAt)
    const ex = exMap.get(exerciseId)
    picks.push({
      slotId: slot.id,
      slotLabel: slot.label,
      exerciseId,
      exerciseName: ex?.name ?? exerciseId,
      pool: slot.exercisePool, // full pool snapshot → mid-session swap can override (M4 F6)
      ...(unavailable ? { unavailable: true } : {}),
    })
  }
  // Circuit days (M8.3) carry their timing so Today renders the timer instead of set loggers.
  const circuit =
    day.mode === 'circuit'
      ? { mode: 'circuit' as const, workSec: day.workSec, restSec: day.restSec, rounds: day.rounds }
      : {}
  return {
    planId: plan.id,
    dayId,
    label: day.label,
    scheme: (plan.scheme as SchemeId) ?? 'double',
    picks,
    ...circuit,
    ...deriveMobility(day, picks, exMap),
  }
}

// Derive warm-up/cooldown stretches from the catalog (category 'stretching') matching the day's
// trained muscles. ponytail: derived, not authored — see m4-deferred #5.
function deriveMobility(
  _day: PlanDay,
  picks: PlannedPick[],
  exMap: Map<string, Exercise>,
): Pick<PlannedDay, 'warmup' | 'cooldown'> {
  const muscles = new Set(picks.flatMap((p) => exMap.get(p.exerciseId)?.primaryMuscles ?? []))
  if (muscles.size === 0) return {}
  const stretches = [...exMap.values()].filter(
    (e) => e.category === 'stretching' && e.primaryMuscles.some((m) => muscles.has(m)),
  )
  const pickN = (n: number) => stretches.slice(0, n).map((e) => ({ exerciseId: e.id, sec: 30 }))
  const warmup = pickN(3)
  if (warmup.length === 0) return {}
  return { warmup, cooldown: pickN(4) }
}

// Start (or reuse) today's session for ad-hoc logging with no plan: ensures an empty "Freestyle"
// planned day exists so exercises can be added + logged from a cold start (rest day, no plan) —
// this is the logging entry the removed Log tab used to provide. Idempotent: never overwrites a
// real locked plan day.
export async function startAdHocSession(userId: string): Promise<string> {
  const session = await getOrCreateTodaySession(userId)
  const db = await getDb()
  const doc = await db.sessions.findOne(session.id).exec()
  if (doc && !doc.plannedDay) {
    const planned: PlannedDay = { planId: '', dayId: 'adhoc', label: 'Freestyle', scheme: 'double', picks: [] }
    await doc.patch({ plannedDay: JSON.stringify(planned), updatedAt: now() })
  }
  return session.id
}

/** Lock the previewed day onto today's session (the session it instances). */
export async function lockDay(userId: string, planned: PlannedDay): Promise<void> {
  const session = await getOrCreateTodaySession(userId)
  const db = await getDb()
  const doc = await db.sessions.findOne(session.id).exec()
  if (doc) await doc.patch({ plannedDay: JSON.stringify(planned), updatedAt: now() })
}

// Add an ad-hoc exercise to today's locked day mid-session (defaults to 2×10 so it joins the
// green-indicator system). Flagged `added` so it can later be saved into the plan.
export async function addPickToDay(
  sessionId: string,
  ex: { id: string; name: string; primaryMuscles?: string[] },
): Promise<void> {
  const db = await getDb()
  const doc = await db.sessions.findOne(sessionId).exec()
  if (!doc?.plannedDay) return
  const planned = JSON.parse(doc.plannedDay) as PlannedDay
  planned.picks.push({
    slotId: crypto.randomUUID(),
    slotLabel: ex.primaryMuscles?.[0] ?? 'Added',
    exerciseId: ex.id,
    exerciseName: ex.name,
    pool: [ex.id],
    minSets: 2,
    targetReps: 10,
    added: true,
  })
  await doc.patch({ plannedDay: JSON.stringify(planned), updatedAt: now() })
}

// Persist an added pick into its plan day so it recurs next time, then mark it saved.
// ponytail: the new slot's pool is just the exercise itself — add rotation alternatives in the
// builder later (m4-deferred #10).
export async function saveAddedPickToPlan(sessionId: string, slotId: string): Promise<void> {
  const db = await getDb()
  const sdoc = await db.sessions.findOne(sessionId).exec()
  if (!sdoc?.plannedDay) return
  const planned = JSON.parse(sdoc.plannedDay) as PlannedDay
  const pick = planned.picks.find((p) => p.slotId === slotId)
  if (!pick) return

  const pdoc = await db.plans.findOne(planned.planId).exec()
  if (pdoc) {
    const days = JSON.parse(pdoc.days) as PlanDay[]
    const day = days.find((d) => d.id === planned.dayId)
    if (day && !day.slots.some((s) => s.id === slotId)) {
      day.slots.push({ id: slotId, label: pick.slotLabel, exercisePool: [pick.exerciseId] })
      await updatePlan(planned.planId, { days: JSON.stringify(days) }) // bumps updatedAt for LWW
    }
  }
  planned.picks = planned.picks.map((p) => (p.slotId === slotId ? { ...p, savedToPlan: true } : p))
  await sdoc.patch({ plannedDay: JSON.stringify(planned), updatedAt: now() })
}

/** Swap a slot's exercise on the locked day (mid-session). Looks up the name from the catalog. */
export async function setPickExercise(sessionId: string, slotId: string, exerciseId: string): Promise<void> {
  const db = await getDb()
  const doc = await db.sessions.findOne(sessionId).exec()
  if (!doc?.plannedDay) return
  const ex = await db.exercises.findOne(exerciseId).exec()
  const custom = ex ? null : await db.customexercises.findOne(exerciseId).exec()
  const planned = JSON.parse(doc.plannedDay) as PlannedDay
  // A manual choice is no longer an auto-substitution — drop the "swapped for your kit" flag.
  planned.picks = planned.picks.map((p) =>
    p.slotId === slotId
      ? { ...p, exerciseId, exerciseName: ex?.name ?? custom?.name ?? exerciseId, substituted: undefined }
      : p,
  )
  await doc.patch({ plannedDay: JSON.stringify(planned), updatedAt: now() })
}

/** Set a slot's per-session minimum-sets target on the locked day. minSets <= 0 clears it. */
export async function setPickMinSets(sessionId: string, slotId: string, minSets: number): Promise<void> {
  const db = await getDb()
  const doc = await db.sessions.findOne(sessionId).exec()
  if (!doc?.plannedDay) return
  const planned = JSON.parse(doc.plannedDay) as PlannedDay
  planned.picks = planned.picks.map((p) =>
    p.slotId === slotId ? { ...p, minSets: minSets > 0 ? minSets : undefined } : p,
  )
  await doc.patch({ plannedDay: JSON.stringify(planned), updatedAt: now() })
}

// ── Sharing (relative URLs → browser-correct; the node test shims a BASE) ───────
async function shareAuth(path: string, init: RequestInit, token: string) {
  const res = await fetch(path, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`${path} → ${res.status}`)
  return res.json()
}

/** Publish an immutable snapshot; returns the shareable code. */
export async function publishPlan(plan: Plan, token: string): Promise<string> {
  const { shareCode } = await shareAuth(
    '/share/publish',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planId: plan.id, name: plan.name, days: plan.days }),
    },
    token,
  )
  return shareCode as string
}

/** Fetch a shared snapshot by code (to feed adoptPlan). */
export async function fetchSharedPlan(
  code: string,
  token: string,
): Promise<{ name: string; days: string; shareCode: string }> {
  return shareAuth(`/share/${encodeURIComponent(code)}`, { method: 'GET' }, token)
}
