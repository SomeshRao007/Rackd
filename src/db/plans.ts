import { getDb } from './database'
import { getOrCreateTodaySession, lastSetFor } from './actions'
import { getPrefs, equipmentAvailable } from '../lib/prefs'
import { activeExclusions } from './exclusions'
import type { Plan, PlanDay, PlannedDay, PlannedPick, Exercise, SchemeId } from './schema'

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
  for (const slot of day.slots) {
    if (slot.exercisePool.length === 0) continue // genuinely empty slot
    // filter BEFORE the lastSetFor loop (correctness + fewer awaits)
    const usable = slot.exercisePool.filter(passes)
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
  return {
    planId: plan.id,
    dayId,
    label: day.label,
    scheme: (plan.scheme as SchemeId) ?? 'double',
    picks,
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
  const planned = JSON.parse(doc.plannedDay) as PlannedDay
  planned.picks = planned.picks.map((p) =>
    p.slotId === slotId
      ? { ...p, exerciseId, exerciseName: ex?.name ?? exerciseId }
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
