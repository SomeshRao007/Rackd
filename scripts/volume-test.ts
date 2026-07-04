/**
 * Volume-aggregation proof (M6 C4). Pure functions, no DB.
 * Run: tsx scripts/volume-test.ts  (also part of `npm test`)
 */
import assert from 'node:assert/strict'
import { perMuscleVolume, perGroupVolume, sinceDays } from '../src/lib/volume.ts'
import type { SetLog } from '../src/db/schema.ts'

// exercise → its (first) primary muscle, mirroring the muscleOf precedent.
const MUSCLE: Record<string, string> = {
  bench: 'chest', row: 'lats', curl: 'biceps', squat: 'quadriceps', pushdown: 'triceps',
}
const muscleOf = (id: string): string | undefined => MUSCLE[id]

const mk = (exerciseId: string, weightKg: number, reps: number, createdAt: string): SetLog => ({
  id: `${exerciseId}-${createdAt}`, userId: 'u1', sessionId: 's1', exerciseId,
  exerciseName: exerciseId, weightKg, reps, order: 0, rir: null, note: null,
  createdAt, updatedAt: createdAt, deletedAt: null,
})

const NOW = Date.parse('2026-07-04T00:00:00.000Z')
const recent = '2026-07-02T10:00:00.000Z'
const old = '2026-05-01T10:00:00.000Z' // > 30 days before NOW

const sets: SetLog[] = [
  mk('bench', 60, 10, recent), mk('bench', 60, 10, recent), mk('bench', 60, 10, recent), // chest: 3 sets, 1800
  mk('row', 50, 10, recent), mk('row', 50, 10, recent),                                   // lats(back): 2 sets, 1000
  mk('curl', 20, 12, recent),                                                             // biceps(arms): 1 set, 240
  mk('bench', 40, 10, old),                                                                // old — excluded by window
]

// 1. per-muscle: sets + volume, primary-only (no double counting)
const pm = perMuscleVolume(sets, muscleOf)
assert.equal(pm.chest.sets, 4, 'chest sees all 4 bench sets without a window')
assert.equal(pm.lats.volumeKg, 1000, 'lats volume = 2×500')
assert.equal(pm.biceps.sets, 1, 'biceps one set')

// 2. rolling window (7d) excludes the old set
const since = sinceDays(7, NOW)
const pmw = perMuscleVolume(sets, muscleOf, since)
assert.equal(pmw.chest.sets, 3, 'window drops the old bench set')
assert.equal(pmw.chest.volumeKg, 1800, 'windowed chest volume = 3×600')

// 3. per-group: folds muscles → groups, always all 6 groups, neglected read 0
const pg = perGroupVolume(sets, muscleOf, since)
assert.equal(pg.length, 6, 'always six groups')
const byId = Object.fromEntries(pg.map((g) => [g.group, g]))
assert.equal(byId.chest.sets, 3, 'chest group = 3 sets')
assert.equal(byId.back.sets, 2, 'back group folds lats')
assert.equal(byId.back.volumeKg, 1000, 'back group volume')
assert.equal(byId.arms.sets, 1, 'arms group folds biceps')
assert.equal(byId.legs.sets, 0, 'legs neglected → 0')
assert.equal(byId.core.sets, 0, 'core neglected → 0')

// 4. group carries its muscle breakdown incl. untouched supporting muscles (the C4 insight)
const backMuscles = Object.fromEntries(byId.back.muscles.map((m) => [m.muscle, m.sets]))
assert.equal(backMuscles.lats, 2, 'back breakdown shows lats worked')
assert.equal(backMuscles.traps, 0, 'back breakdown surfaces untrained traps')

console.log('✓ volume test passed (per-muscle, rolling window, group folding, neglected-muscle surfacing)')
