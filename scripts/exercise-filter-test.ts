/**
 * Unit test for the shared exercise filter + movement-pattern classifier
 * (src/lib/exerciseFilter.ts). Locks push/pull/upper/lower + power/pump/metabolic inference,
 * including the ExerciseDB fallback (blank force/mechanic). Run: npx tsx scripts/exercise-filter-test.ts
 */
import assert from 'node:assert/strict'
import { matchesPattern, filterExercises, EMPTY_FILTER, type PatternId } from '../src/lib/exerciseFilter'
import type { Exercise } from '../src/db/schema'

const ex = (p: Partial<Exercise> & { id: string; name: string; primaryMuscles: string[] }): Exercise => ({
  secondaryMuscles: [], equipment: '', mechanic: '', level: '', category: '', force: '',
  instructions: [], images: [], gifId: null, source: '', license: '', ...p,
})

const pats = (e: Exercise): PatternId[] =>
  (['push', 'pull', 'upper', 'lower', 'power', 'pump', 'metabolic'] as PatternId[]).filter((p) => matchesPattern(e, p))

// free-exercise-db bench: force push, compound → Upper/Push/Power.
const bench = ex({ id: 'b', name: 'Bench', primaryMuscles: ['chest'], force: 'push', mechanic: 'compound', category: 'strength' })
assert.deepEqual(pats(bench).sort(), ['power', 'push', 'upper'], 'bench = upper/push/power')

// Curl: isolation, biceps → Upper/Pull/Pump.
const curl = ex({ id: 'c', name: 'Curl', primaryMuscles: ['biceps'], force: 'pull', mechanic: 'isolation', category: 'strength' })
assert.deepEqual(pats(curl).sort(), ['pull', 'pump', 'upper'], 'curl = upper/pull/pump')

// Squat: quads → Lower + push (knee-dominant) + power (compound).
const squat = ex({ id: 's', name: 'Squat', primaryMuscles: ['quadriceps'], force: 'push', mechanic: 'compound', category: 'strength' })
assert.ok(matchesPattern(squat, 'lower') && matchesPattern(squat, 'push') && matchesPattern(squat, 'power'), 'squat = lower/push/power')

// Plyometric → Metabolic (and NOT power/pump).
const burpee = ex({ id: 'bp', name: 'Burpee', primaryMuscles: ['quadriceps'], category: 'plyometrics' })
assert.ok(matchesPattern(burpee, 'metabolic'), 'burpee = metabolic')
assert.ok(!matchesPattern(burpee, 'power') && !matchesPattern(burpee, 'pump'), 'metabolic excludes power/pump')

// Stretch → no training style at all.
const stretch = ex({ id: 'st', name: 'Childs Pose', primaryMuscles: ['lower back'], category: 'stretching' })
assert.ok(!['power', 'pump', 'metabolic'].some((p) => matchesPattern(stretch, p as PatternId)), 'stretch has no style')

// ExerciseDB fallback: blank force/mechanic, 2+ secondaries → push via muscle, power via secondary count.
const edb = ex({ id: 'e', name: 'edb press', primaryMuscles: ['chest'], secondaryMuscles: ['shoulders', 'triceps'], category: 'chest' })
assert.ok(matchesPattern(edb, 'push'), 'blank force → push from primary muscle')
assert.ok(matchesPattern(edb, 'power'), 'blank mechanic + 2 secondaries → power')

// filterExercises composes pattern with the rest.
const all = [bench, curl, squat, burpee, stretch, edb]
// push movements: bench (force), squat (quads), edb (chest), burpee (quads) — not curl/stretch.
const pushOnly = filterExercises(all, { ...EMPTY_FILTER, pattern: 'push' }, new Set())
assert.deepEqual(pushOnly.map((e) => e.id).sort(), ['b', 'bp', 'e', 's'], 'pattern filter narrows to push movements')
const pumpUpper = filterExercises(all, { ...EMPTY_FILTER, pattern: 'pump' }, new Set())
assert.deepEqual(pumpUpper.map((e) => e.id), ['c'], 'pump filter finds the isolation lift')

console.log('✓ exercise-filter test passed (push/pull/upper/lower, power/pump/metabolic, ExerciseDB fallback, compose)')
