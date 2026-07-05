import { getDb } from './database'
import { suggestNext, deloadDue, type Suggestion } from '../lib/suggest'
import { todayISO, weekIndex } from '../lib/dates'
import { readinessScore, readinessFactor } from '../lib/readiness'
import { todayReadiness } from './readiness'
import type { PlannedDay, SchemeId, Session, SetLog } from './schema'

const now = () => new Date().toISOString()
const today = () => new Date().toISOString().slice(0, 10) // YYYY-MM-DD
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)

// Get-or-create today's session. Id is a deterministic `userId_date` key, so concurrent callers (e.g. StrictMode's double-invoked effect) collapse to one row instead of duplicating.
export async function getOrCreateTodaySession(userId: string): Promise<Session> {
  const db = await getDb()
  const id = `${userId}_${today()}`
  const existing = await db.sessions.findOne(id).exec()
  if (existing) return existing.toJSON() as Session
  const ts = now()
  // upsert keyed on the deterministic id — a concurrent create collapses to one row.
  const doc = await db.sessions.upsert({
    id,
    userId,
    date: today(),
    title: '',
    createdAt: ts,
    updatedAt: ts,
    deletedAt: null,
  })
  return doc.toJSON() as Session
}

// Append a logged set (append-only); `order` is its position within the session.
export async function logSet(input: {
  userId: string
  sessionId: string
  exerciseId: string
  exerciseName: string
  weightKg: number
  reps: number
  rir?: number | null
  note?: string | null
}): Promise<SetLog> {
  const db = await getDb()
  // count by sessionId only so it hits the index (RxDB count needs a full index match, else QU14); soft-deleted gaps in `order` are harmless.
  const count = await db.setlogs
    .count({ selector: { sessionId: input.sessionId } })
    .exec()
  const ts = now()
  const set: SetLog = {
    id: crypto.randomUUID(),
    ...input,
    // explicit after the spread — an undefined-valued key fails the dev-mode ajv validator
    rir: input.rir ?? null,
    note: input.note ?? null,
    order: count,
    createdAt: ts,
    updatedAt: ts,
    deletedAt: null,
  }
  await db.setlogs.insert(set)
  return set
}

/** Most recent logged set for an exercise — powers auto-fill (C6). */
export async function lastSetFor(
  userId: string,
  exerciseId: string,
): Promise<SetLog | null> {
  const db = await getDb()
  const doc = await db.setlogs
    .findOne({
      selector: { userId, exerciseId, deletedAt: null },
      sort: [{ createdAt: 'desc' }],
    })
    .exec()
  return doc ? (doc.toJSON() as SetLog) : null
}

/** Recent sets for an exercise, newest first — feeds suggestNext (M5). Rides the composite index. */
export async function historyFor(
  userId: string,
  exerciseId: string,
  limit = 60,
): Promise<SetLog[]> {
  const db = await getDb()
  const docs = await db.setlogs
    .find({
      selector: { userId, exerciseId, deletedAt: null },
      sort: [{ createdAt: 'desc' }],
      limit,
    })
    .exec()
  return docs.map((d) => d.toJSON() as SetLog)
}

/** Next-load suggestion for an exercise under the plan's progression scheme (M5), eased by today's
 * readiness check-in if one exists (M7 C5 — opt-in: no check-in ⇒ factor 1 ⇒ unchanged). */
export async function suggestFor(
  userId: string,
  exerciseId: string,
  scheme: SchemeId,
  deload = false,
): Promise<Suggestion | null> {
  const history = await historyFor(userId, exerciseId)
  const rd = await todayReadiness(userId, todayISO())
  const factor = rd ? readinessFactor(readinessScore(rd)) : 1
  return suggestNext({ history, scheme, today: todayISO(), deload, readinessFactor: factor })
}

// JSON.parse is the one boundary here that can throw (corrupt synced string) — contain it.
function parsePlannedDay(json: string | null | undefined): PlannedDay | null {
  if (!json) return null
  try {
    return JSON.parse(json) as PlannedDay
  } catch {
    return null
  }
}

/** Deload-banner input (M5): weeks trained since the last accepted deload + recent RIR trend. */
export async function deloadStatus(userId: string): Promise<string | null> {
  const db = await getDb()
  // ponytail: unindexed createdAt scan — bounded to 56 days of one user's sets, once per StartDay visit.
  const logs = await db.setlogs
    .find({ selector: { userId, deletedAt: null, createdAt: { $gte: daysAgo(56) } } })
    .exec()

  // Newest session whose locked day was accepted as a deload — the stateless deload history.
  const sessions = await db.sessions
    .find({ selector: { userId, deletedAt: null }, sort: [{ date: 'desc' }], limit: 60 })
    .exec()
  let lastDeloadWeek = -Infinity
  for (const s of sessions) {
    if (parsePlannedDay(s.plannedDay)?.deload === true) {
      lastDeloadWeek = weekIndex(s.date)
      break
    }
  }

  const weeks = new Set(logs.map((l) => weekIndex(l.createdAt.slice(0, 10))))
  const trainedWeeks = [...weeks].filter((w) => w > lastDeloadWeek).sort((a, b) => b - a)

  const cutoff14 = daysAgo(14)
  const recentRirs = logs
    .filter((l) => l.createdAt >= cutoff14 && l.rir != null)
    .map((l) => l.rir as number)

  return deloadDue({ trainedWeeks, currentWeek: weekIndex(todayISO()), recentRirs })
}

/** Soft-delete a set (tombstone, so the delete syncs in M2). */
export async function deleteSet(id: string): Promise<void> {
  const db = await getDb()
  const doc = await db.setlogs.findOne(id).exec()
  if (doc) await doc.patch({ deletedAt: now(), updatedAt: now() })
}

/** Download this user's data as JSON (Part G backup; complements server sync). */
export async function exportData(): Promise<void> {
  const db = await getDb()
  const [sessions, setlogs] = await Promise.all([
    db.sessions.find().exec(),
    db.setlogs.find().exec(),
  ])
  const payload = {
    exportedAt: now(),
    sessions: sessions.map((d) => d.toJSON()),
    setlogs: setlogs.map((d) => d.toJSON()),
  }
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
  )
  const a = document.createElement('a')
  a.href = url
  a.download = `rackd-export-${today()}.json`
  a.click()
  URL.revokeObjectURL(url)
}
