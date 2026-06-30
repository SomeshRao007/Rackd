import { getDb } from './database'
import type { Session, SetLog } from './schema'

const now = () => new Date().toISOString()
const today = () => new Date().toISOString().slice(0, 10) // YYYY-MM-DD

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
