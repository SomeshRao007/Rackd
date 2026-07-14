/**
 * Unit test for the equipment substituter (src/lib/substitute.ts): the barbell→dumbbell
 * equivalent finder, plan-pool rewrite, and swap-panel suggestions — all against the REAL
 * catalog so a reseed that breaks matching fails loudly. Run: npx tsx scripts/substitute-test.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { findEquivalent, substituteInDays, countByEquipment, suggestAlternatives } from '../src/lib/substitute'
import type { Exercise, PlanDay } from '../src/db/schema'

const catalog = JSON.parse(readFileSync('public/catalog/exercises.v1.json', 'utf8')) as Exercise[]
const exMap = new Map(catalog.map((e) => [e.id, e]))
const dumbbells = catalog.filter((e) => e.equipment === 'dumbbell')
const barbells = catalog.filter((e) => e.equipment === 'barbell')

// Known pairs (pinned — a catalog reseed that shifts these deserves a look).
const pairs: Record<string, string> = {
  'Barbell_Bench_Press_-_Medium_Grip': 'Dumbbell_Bench_Press',
  Barbell_Curl: 'Dumbbell_Bicep_Curl',
  Barbell_Deadlift: 'Dumbbell_Deadlift', // name-override path: sources tag lower back vs glutes
  Barbell_Shrug: 'Dumbbell_Shrug',
  Barbell_Squat: 'Dumbbell_Squat',
}
for (const [from, to] of Object.entries(pairs))
  assert.equal(findEquivalent(exMap.get(from)!, dumbbells)?.match.id, to, `${from} → ${to}`)

// Genuine catalog gaps stay unmatched — no forced bad substitutions.
for (const id of ['Barbell_Hip_Thrust', 'Barbell_Ab_Rollout'])
  assert.equal(findEquivalent(exMap.get(id)!, dumbbells), null, `${id} has no dumbbell equivalent`)

// Coverage floor + sanity: every match is a dumbbell lift and never the source itself.
let hits = 0
for (const b of barbells) {
  const r = findEquivalent(b, dumbbells)
  if (!r) continue
  hits++
  assert.equal(r.match.equipment, 'dumbbell', `${b.id} matched non-dumbbell ${r.match.id}`)
  assert.notEqual(r.match.id, b.id)
}
assert.ok(hits >= 200, `coverage floor: ${hits}/${barbells.length} < 200`)

// substituteInDays: rewrite + dedupe + custom-id passthrough + kept + cross-day consistency.
const days: PlanDay[] = [
  {
    id: 'd1',
    label: 'Push',
    slots: [
      // barbell bench collapses into the dumbbell bench already in the pool (dedupe)
      { id: 's1', label: 'Chest', exercisePool: ['Barbell_Bench_Press_-_Medium_Grip', 'Dumbbell_Bench_Press'] },
      // no equivalent → kept; custom id unknown to the catalog → untouched
      { id: 's2', label: 'Glutes', exercisePool: ['Barbell_Hip_Thrust', 'custom-abc'] },
    ],
  },
  // same lift again on another day → must map to the same dumbbell id
  { id: 'd2', label: 'Full', slots: [{ id: 's3', label: 'Chest', exercisePool: ['Barbell_Bench_Press_-_Medium_Grip'] }] },
]
const { days: out, summary } = substituteInDays(days, exMap, catalog, 'barbell', 'dumbbell')
assert.deepEqual(out[0].slots[0].exercisePool, ['Dumbbell_Bench_Press'], 'replaced + deduped')
assert.deepEqual(out[0].slots[1].exercisePool, ['Barbell_Hip_Thrust', 'custom-abc'], 'no-equivalent + custom kept')
assert.deepEqual(out[1].slots[0].exercisePool, ['Dumbbell_Bench_Press'], 'same lift maps identically across days')
assert.deepEqual(summary, { replaced: 1, kept: 1 }, 'summary counts distinct ids')
assert.deepEqual(days[0].slots[0].exercisePool.length, 2, 'input days not mutated')

// Idempotent: re-running leaves only the genuine no-equivalent barbell lift.
const again = substituteInDays(out, exMap, catalog, 'barbell', 'dumbbell')
assert.deepEqual(again.summary, { replaced: 0, kept: 1 }, 're-run is a no-op apart from kept')

// countByEquipment drives the UI visibility.
assert.equal(countByEquipment(days, exMap, 'barbell'), 2)
assert.equal(countByEquipment(out, exMap, 'barbell'), 1)

// suggestAlternatives: same muscle group, available equipment only, exclusions respected.
const bench = exMap.get('Dumbbell_Bench_Press')!
const alts = suggestAlternatives([bench], catalog, ['dumbbell'], new Set([bench.id]))
assert.ok(alts.length > 0 && alts.length <= 5, 'bounded suggestions')
for (const a of alts) {
  assert.notEqual(a.id, bench.id, 'excluded id filtered')
  assert.ok(a.equipment === 'dumbbell' || a.equipment === 'body only' || !a.equipment, `${a.id} needs unavailable kit`)
  assert.notEqual(a.category, 'stretching')
}
assert.deepEqual(
  alts.map((a) => a.id),
  suggestAlternatives([bench], catalog, ['dumbbell'], new Set([bench.id])).map((a) => a.id),
  'deterministic ordering',
)

console.log('✓ substitute test passed (pairs, no-match gaps, coverage ' + hits + '/307, rewrite, suggestions)')
