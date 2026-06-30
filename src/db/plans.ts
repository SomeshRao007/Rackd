import { getDb } from './database'
import { getOrCreateTodaySession, lastSetFor } from './actions'
import type { Plan, PlanDay, PlannedDay, PlannedPick } from './schema'

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
  patch: Partial<Pick<Plan, 'name' | 'days'>>,
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

// Propose picks for a plan day — one exercise per slot, chosen by last-trained timestamp (no persisted rotation state).
export async function resolveDay(
  plan: Plan,
  dayId: string,
  userId: string,
): Promise<PlannedDay> {
  const db = await getDb()
  const days = JSON.parse(plan.days) as PlanDay[]
  const day = days.find((d) => d.id === dayId)
  if (!day) return { planId: plan.id, dayId, label: '', picks: [] }

  const picks: PlannedPick[] = []
  for (const slot of day.slots) {
    if (slot.exercisePool.length === 0) continue
    const lastTrainedAt: Record<string, string | null> = {}
    for (const exId of slot.exercisePool) {
      const last = await lastSetFor(userId, exId)
      lastTrainedAt[exId] = last?.createdAt ?? null
    }
    const exerciseId = pickLeastRecent(slot.exercisePool, lastTrainedAt)
    const ex = await db.exercises.findOne(exerciseId).exec()
    picks.push({ slotId: slot.id, slotLabel: slot.label, exerciseId, exerciseName: ex?.name ?? exerciseId })
  }
  return { planId: plan.id, dayId, label: day.label, picks }
}

/** Lock the previewed day onto today's session (the session it instances). */
export async function lockDay(userId: string, planned: PlannedDay): Promise<void> {
  const session = await getOrCreateTodaySession(userId)
  const db = await getDb()
  const doc = await db.sessions.findOne(session.id).exec()
  if (doc) await doc.patch({ plannedDay: JSON.stringify(planned), updatedAt: now() })
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
