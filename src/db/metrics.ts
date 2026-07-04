// Body-metric CRUD (M6 Part G) — weight + measurements, one row per date. Mirrors the
// exclusions/actions write idioms.
// ponytail: progress photos deferred — need an R2 bucket + upload/serve Function + a gated deploy (m6-deferred.md #1).
import { getDb } from './database'
import type { BodyMetric } from './schema'

const now = () => new Date().toISOString()

export type MetricInput = {
  userId: string
  date: string // YYYY-MM-DD
  weightKg?: number | null
  measurements?: Record<string, number> | null
  note?: string | null
}

/** Upsert the day's metric by deterministic id (userId_date); preserves createdAt on edit. */
export async function logBodyMetric(input: MetricInput): Promise<BodyMetric> {
  const db = await getDb()
  const id = `${input.userId}_${input.date}`
  const measurements =
    input.measurements && Object.keys(input.measurements).length ? JSON.stringify(input.measurements) : null
  const existing = await db.bodymetrics.findOne(id).exec()
  if (existing) {
    await existing.patch({
      weightKg: input.weightKg ?? null,
      measurements,
      note: input.note ?? null,
      updatedAt: now(),
    })
    return existing.toJSON() as BodyMetric
  }
  const ts = now()
  const doc = await db.bodymetrics.insert({
    id,
    userId: input.userId,
    date: input.date,
    weightKg: input.weightKg ?? null,
    measurements,
    note: input.note ?? null,
    createdAt: ts,
    updatedAt: ts,
    deletedAt: null,
  })
  return doc.toJSON() as BodyMetric
}

/** Latest weigh-in (by date) — fat-loss baseline + goal current value. */
export async function latestMetric(userId: string): Promise<BodyMetric | null> {
  const db = await getDb()
  const doc = await db.bodymetrics
    .findOne({ selector: { userId, deletedAt: null }, sort: [{ date: 'desc' }] })
    .exec()
  return doc ? (doc.toJSON() as BodyMetric) : null
}
