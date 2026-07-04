// Readiness check-in CRUD (M7 C5) — one row per day, upsert-by-date. Mirrors metrics.ts.
// The three raw taps are the source of truth; the score/factor are derived (src/lib/readiness.ts).
import { getDb } from './database'
import type { Readiness } from './schema'

const now = () => new Date().toISOString()

export type ReadinessInput = {
  userId: string
  date: string // YYYY-MM-DD
  sleep: number // 0..2
  soreness: number // 0..2
  energy: number // 0..2
  note?: string | null
}

/** Upsert the day's check-in by deterministic id (userId_date); preserves createdAt on edit. */
export async function logReadiness(input: ReadinessInput): Promise<Readiness> {
  const db = await getDb()
  const id = `${input.userId}_${input.date}`
  const existing = await db.readiness.findOne(id).exec()
  if (existing) {
    await existing.patch({
      sleep: input.sleep,
      soreness: input.soreness,
      energy: input.energy,
      note: input.note ?? null,
      updatedAt: now(),
    })
    return existing.toJSON() as Readiness
  }
  const ts = now()
  const doc = await db.readiness.insert({
    id,
    userId: input.userId,
    date: input.date,
    sleep: input.sleep,
    soreness: input.soreness,
    energy: input.energy,
    note: input.note ?? null,
    createdAt: ts,
    updatedAt: ts,
    deletedAt: null,
  })
  return doc.toJSON() as Readiness
}

/** Today's check-in for a user, or null if they haven't logged one yet. */
export async function todayReadiness(userId: string, date: string): Promise<Readiness | null> {
  const db = await getDb()
  const doc = await db.readiness.findOne(`${userId}_${date}`).exec()
  return doc ? (doc.toJSON() as Readiness) : null
}
