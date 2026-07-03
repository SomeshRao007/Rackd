/**
 * M2 round-trip proof: two independent RxDB stores against the LIVE wrangler backend.
 * Device A inserts a set → replication pushes to /sync → D1. Device B (separate store)
 * pulls it back. Proves the real shipping handlers (replicateCollection) + the server.
 * Run with wrangler up:  npx tsx scripts/m2-replication-test.ts
 */
import assert from 'node:assert/strict'
import { createRxDatabase, addRxPlugin } from 'rxdb'
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory'
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema'
import { replicateCollection } from '../src/db/sync.ts'
import { setLogSchema, sessionSchema } from '../src/db/schema.ts'

addRxPlugin(RxDBMigrationSchemaPlugin)

const BASE = process.env.SYNC_BASE ?? 'http://localhost:8788'
// Shipping sync.ts uses relative URLs (correct in a browser). Node's fetch rejects them,
// so resolve relative paths against BASE here — mirrors how the browser resolves them.
const realFetch = globalThis.fetch
let offline = false // simulate a dropped network for /sync calls (D3 outbox test)
globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
  const url = typeof input === 'string' && input.startsWith('/') ? BASE + input : input
  if (offline && String(url).includes('/sync/push')) return Promise.reject(new Error('offline'))
  return realFetch(url, init)
}) as typeof fetch

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const withTimeout = <T>(p: Promise<T>, ms: number, label: string) =>
  Promise.race([p, new Promise<never>((_, r) => setTimeout(() => r(new Error(`timeout: ${label}`)), ms))])

// Poll the backend directly to confirm A's RxDB push actually landed server-side.
async function pollServerHas(id: string, token: string): Promise<void> {
  for (let i = 0; i < 30; i++) {
    const res = await fetch(`${BASE}/sync/pull/setlogs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ checkpoint: null, limit: 500 }),
    })
    const { documents } = (await res.json()) as { documents: { id: string }[] }
    if (documents.some((d) => d.id === id)) return
    await sleep(500)
  }
  throw new Error('A push never reached the server')
}

async function devToken(): Promise<string> {
  const res = await fetch(`${BASE}/auth/dev-login`, { redirect: 'manual' })
  const token = new URL(res.headers.get('location')!).searchParams.get('token')
  assert.ok(token, 'dev-login returned a token')
  return token!
}

async function makeDb(name: string) {
  const db = await createRxDatabase({ name, storage: getRxStorageMemory() })
  await db.addCollections({
    sessions: {
      schema: sessionSchema,
      migrationStrategies: { 1: (doc) => ({ ...doc, plannedDay: null }) },
    },
    setlogs: {
      schema: setLogSchema,
      migrationStrategies: { 1: (doc) => ({ ...doc, rir: null, note: null }) },
    },
  })
  return db
}

async function main() {
  const token = await devToken()
  const id = `test-${crypto.randomUUID()}`
  const ts = new Date().toISOString()

  // Device A: insert → reSync pumps the push cycle → confirm it reached the server.
  const a = await makeDb('m2test_a')
  const repA = replicateCollection(a.setlogs, 'setlogs', token)
  repA.error$.subscribe((e) => console.error('repA error:', e?.message ?? e))
  await a.setlogs.insert({
    id, userId: 'will-be-overwritten', sessionId: 'sess-test', exerciseId: 'ex-test',
    exerciseName: 'Test Lift', weightKg: 42.5, reps: 8, order: 0,
    createdAt: ts, updatedAt: ts, deletedAt: null,
  })
  repA.reSync()
  await withTimeout(pollServerHas(id, token), 16000, 'A push')

  // Device B: fresh store → reSync pulls → poll the local collection for the doc.
  const b = await makeDb('m2test_b')
  const repB = replicateCollection(b.setlogs, 'setlogs', token)
  repB.error$.subscribe((e) => console.error('repB error:', e?.message ?? e))
  let pulled = null
  for (let i = 0; i < 30 && !pulled; i++) {
    repB.reSync()
    await sleep(500)
    pulled = await b.setlogs.findOne(id).exec()
  }
  assert.ok(pulled, 'device B pulled the set device A logged (multi-device round-trip)')
  assert.equal(pulled!.weightKg, 42.5, 'weight survived the round-trip')
  assert.equal(pulled!.userId, 'stub-user', 'server stamped userId from the JWT, not the client')

  // D3: offline write must not be lost — it flushes when the network returns.
  const id2 = `test-${crypto.randomUUID()}`
  const ts2 = new Date().toISOString()
  offline = true
  await a.setlogs.insert({
    id: id2, userId: 'stub-user', sessionId: 'sess-test', exerciseId: 'ex-test',
    exerciseName: 'Offline Lift', weightKg: 99, reps: 3, order: 1,
    createdAt: ts2, updatedAt: ts2, deletedAt: null,
  })
  repA.reSync()
  await sleep(2500)
  const onServerWhileOffline = await fetch(`${BASE}/sync/pull/setlogs`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ checkpoint: null, limit: 500 }),
  }).then((r) => r.json()).then((j: { documents: { id: string }[] }) => j.documents.some((d) => d.id === id2))
  assert.equal(onServerWhileOffline, false, 'offline write is held locally, not on the server yet')

  offline = false // network returns → outbox flushes
  repA.reSync()
  await withTimeout(pollServerHas(id2, token), 16000, 'reconnect flush')

  await Promise.all([repA.cancel(), repB.cancel()])
  await Promise.all([a.close(), b.close()])
  console.log('m2-replication-test: round-trip OK — A→D1→B, userId from JWT, offline write flushed on reconnect')
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
