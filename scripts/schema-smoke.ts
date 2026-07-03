/**
 * Smoke test for the shared DB contract (src/db/schema.ts).
 * Validates that collections build and the auto-fill query (composite index +
 * sort) returns the most recent set. Run: `npx tsx scripts/schema-smoke.ts`
 */
import assert from 'node:assert'
import { createRxDatabase, addRxPlugin } from 'rxdb'
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory'
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode'
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema'
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv'
import {
  exerciseSchema,
  sessionSchema,
  setLogSchema,
  planSchema,
  exclusionSchema,
  type WorkoutDatabase,
} from '../src/db/schema'

addRxPlugin(RxDBDevModePlugin)
addRxPlugin(RxDBMigrationSchemaPlugin)

const db = await createRxDatabase<WorkoutDatabase>({
  name: 'smoke',
  storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }),
})
await db.addCollections({
  exercises: { schema: exerciseSchema },
  sessions: {
    schema: sessionSchema,
    migrationStrategies: { 1: (doc) => ({ ...doc, plannedDay: null }) },
  },
  setlogs: {
    schema: setLogSchema,
    migrationStrategies: { 1: (doc) => ({ ...doc, rir: null, note: null }) },
  },
  plans: {
    schema: planSchema,
    migrationStrategies: { 1: (doc) => ({ ...doc, scheme: null }) },
  },
  exclusions: { schema: exclusionSchema },
})

const base = {
  userId: 'u1',
  sessionId: 's1',
  exerciseId: 'bench',
  exerciseName: 'Bench Press',
  reps: 5,
  deletedAt: null,
}
await db.setlogs.insert({ ...base, id: '1', order: 0, weightKg: 60, createdAt: '2026-06-20T10:00:00.000Z', updatedAt: '2026-06-20T10:00:00.000Z' })
await db.setlogs.insert({ ...base, id: '2', order: 1, weightKg: 65, createdAt: '2026-06-21T10:00:00.000Z', updatedAt: '2026-06-21T10:00:00.000Z' })

// lastSetFor logic: latest by createdAt for userId+exerciseId
const latest = await db.setlogs
  .findOne({ selector: { userId: 'u1', exerciseId: 'bench', deletedAt: null }, sort: [{ createdAt: 'desc' }] })
  .exec()

assert(latest, 'expected a latest set')
assert.equal(latest.weightKg, 65, 'auto-fill should return the most recent weight')
assert.equal(await db.setlogs.count().exec(), 2, 'both sets inserted')

// logSet computes `order` via a count by sessionId — must hit the index, not
// trigger RxDB's slow-count error QU14 (regression guard).
const orderCount = await db.setlogs.count({ selector: { sessionId: 's1' } }).exec()
assert.equal(orderCount, 2, 'count-by-sessionId (order calc) works without QU14')

// getOrCreateTodaySession idempotency: same deterministic id upserted twice
// (the StrictMode double-invoke case) must yield exactly ONE session row.
const sid = 'u1_2026-06-21'
const sess = { id: sid, userId: 'u1', date: '2026-06-21', title: '', createdAt: '2026-06-21T00:00:00.000Z', updatedAt: '2026-06-21T00:00:00.000Z', deletedAt: null }
await Promise.all([db.sessions.upsert(sess), db.sessions.upsert(sess)])
assert.equal(await db.sessions.count().exec(), 1, 'duplicate today-session collapses to one')

// M3: plans collection builds + stores nested `days` as a JSON string; session
// carries the v1 plannedDay field (default null after migration strategy).
await db.plans.insert({
  id: 'p1', userId: 'u1', name: 'PPL',
  days: JSON.stringify([{ id: 'd1', label: 'Push', slots: [{ id: 's1', label: 'Chest', exercisePool: ['bench'] }] }]),
  sourceShareCode: null, createdAt: '2026-06-21T00:00:00.000Z', updatedAt: '2026-06-21T00:00:00.000Z', deletedAt: null,
})
const plan = await db.plans.findOne('p1').exec()
assert(plan, 'plan inserted')
assert.equal(JSON.parse(plan.days)[0].slots[0].exercisePool[0], 'bench', 'plan days JSON round-trips')
const sessDoc = await db.sessions.findOne(sid).exec()
assert.equal(sessDoc?.plannedDay ?? null, null, 'session carries plannedDay (default null)')

// M5: setlog v1 carries nullable rir/note; plan v1 carries the nullable scheme (patchable).
await db.setlogs.insert({ ...base, id: '3', order: 2, weightKg: 70, rir: 2, note: 'felt heavy', createdAt: '2026-06-22T10:00:00.000Z', updatedAt: '2026-06-22T10:00:00.000Z' })
const withRir = await db.setlogs.findOne('3').exec()
assert.equal(withRir?.rir, 2, 'rir round-trips')
assert.equal(withRir?.note, 'felt heavy', 'note round-trips')

await db.plans.insert({
  id: 'p2', userId: 'u1', name: 'Linear', days: '[]', sourceShareCode: null, scheme: null,
  createdAt: '2026-06-22T00:00:00.000Z', updatedAt: '2026-06-22T00:00:00.000Z', deletedAt: null,
})
const p2 = await db.plans.findOne('p2').exec()
assert.equal(p2?.scheme ?? null, null, 'plan scheme null round-trips')
await p2!.patch({ scheme: 'linear', updatedAt: '2026-06-22T00:00:01.000Z' })
assert.equal((await db.plans.findOne('p2').exec())?.scheme, 'linear', 'plan scheme patch round-trips')

console.log('✓ schema smoke passed (index sort, order-count, idempotent session, plans + session v1, setlog rir/note + plan scheme v1)')
await db.close()
