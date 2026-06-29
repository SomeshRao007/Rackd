/**
 * M3 share proof: publish → fetch round-trip through the REAL shipping handlers
 * (functions/share/*) + the client helpers (src/db/plans.ts). Proves the immutable
 * snapshot survives, the shareCode is stable on re-publish, and auth is enforced.
 * Run with wrangler up:  npx tsx scripts/share-test.ts
 */
import assert from 'node:assert/strict'
import { publishPlan, fetchSharedPlan } from '../src/db/plans.ts'
import type { Plan } from '../src/db/schema.ts'

const BASE = process.env.SHARE_BASE ?? 'http://localhost:8788'
// Shipping plans.ts uses relative URLs (correct in a browser); resolve against BASE here.
const realFetch = globalThis.fetch
globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
  const url = typeof input === 'string' && input.startsWith('/') ? BASE + input : input
  return realFetch(url as string | URL | Request, init)
}) as typeof fetch

async function devToken(): Promise<string> {
  const res = await fetch(`${BASE}/auth/dev-login`, { redirect: 'manual' })
  const token = new URL(res.headers.get('location')!).searchParams.get('token')
  assert.ok(token, 'dev-login returned a token')
  return token!
}

async function main() {
  const token = await devToken()
  const days = JSON.stringify([
    { id: 'd1', label: 'Push', slots: [{ id: 's1', label: 'Chest', exercisePool: ['ex-a', 'ex-b'] }] },
  ])
  const plan = { id: `plan-${crypto.randomUUID()}`, name: 'Shared PPL', days } as Plan

  // publish → fetch round-trip
  const code = await publishPlan(plan, token)
  assert.ok(code, 'publish returned a shareCode')
  const snap = await fetchSharedPlan(code, token)
  assert.equal(snap.name, 'Shared PPL', 'name survived the round-trip')
  assert.equal(snap.days, days, 'days JSON survived the round-trip')

  // re-publishing the same plan keeps the SAME shareCode (stable link) but updates content
  const code2 = await publishPlan({ ...plan, name: 'Shared PPL v2' }, token)
  assert.equal(code2, code, 're-publish keeps the stable shareCode')
  assert.equal((await fetchSharedPlan(code, token)).name, 'Shared PPL v2', 're-publish updated the snapshot')

  // auth required: no token → 401
  const noAuth = await realFetch(`${BASE}/share/${code}`)
  assert.equal(noAuth.status, 401, 'GET /share/:code requires auth')

  // the fetched snapshot is directly adoptable (days is a string adoptPlan stores as-is)
  assert.equal(typeof snap.days, 'string', 'snapshot.days is adoptPlan-ready')

  console.log('share-test: OK — publish→fetch round-trip, stable shareCode on re-publish, 401 without token')
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
