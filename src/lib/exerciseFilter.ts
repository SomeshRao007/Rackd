import type { Exercise } from '../db/schema'
import { groupOf, type MuscleGroupId } from './muscles'

// Shared exercise-library filter (M8.3) — the one stack used by both the Exercises library
// (Plans → Exercises) and the ExercisePicker (add to a plan slot's pool / Today add). Kept here so
// the two surfaces filter identically instead of drifting.

// ── Movement-pattern / training-style tags (M8.3) ────────────────────────────
// A cross-cut of the muscle groups: push/pull/upper/lower movement patterns + power/pump/metabolic
// training styles, INFERRED per exercise so every lift is tagged even though the ExerciseDB rows
// carry no `force`/`mechanic`. A discovery aid (an exercise can match several), not a strict schema.
export type PatternId = 'push' | 'pull' | 'upper' | 'lower' | 'power' | 'pump' | 'metabolic'
export const PATTERN_IDS: PatternId[] = ['push', 'pull', 'upper', 'lower', 'power', 'pump', 'metabolic']
export const PATTERN_LABELS: Record<PatternId, string> = {
  push: 'Push', pull: 'Pull', upper: 'Upper', lower: 'Lower', power: 'Power', pump: 'Pump', metabolic: 'Metabolic',
}

const PUSH_MUSCLES = new Set(['chest', 'shoulders', 'triceps', 'quadriceps', 'calves'])
const PULL_MUSCLES = new Set(['lats', 'middle back', 'lower back', 'traps', 'biceps', 'forearms', 'hamstrings', 'glutes'])
const POWER_CATEGORIES = new Set(['powerlifting', 'olympic weightlifting', 'strongman'])
const METABOLIC_CATEGORIES = new Set(['plyometrics', 'cardio'])

// Training style — every non-mobility exercise gets one, even ExerciseDB rows whose `mechanic` is
// blank (fall back to the secondary-muscle count: multi-joint → power, single-joint → pump).
// Stretches stay untagged (they're mobility, not a training style).
function styleOf(e: Exercise): 'power' | 'pump' | 'metabolic' | null {
  if (METABOLIC_CATEGORIES.has(e.category ?? '')) return 'metabolic'
  if (e.category === 'stretching') return null
  const compound =
    e.mechanic === 'compound' ||
    POWER_CATEGORIES.has(e.category ?? '') ||
    (e.mechanic !== 'isolation' && (e.secondaryMuscles?.length ?? 0) >= 2)
  return compound ? 'power' : 'pump'
}

/** Does an exercise match a movement pattern / training style? push/pull use the catalog `force`
 *  when present (free-exercise-db) and fall back to the primary muscle otherwise (ExerciseDB). */
export function matchesPattern(e: Exercise, pattern: PatternId): boolean {
  const primary = e.primaryMuscles[0]
  const group = groupOf(primary)
  switch (pattern) {
    case 'upper':
      return group === 'chest' || group === 'back' || group === 'shoulders' || group === 'arms'
    case 'lower':
      return group === 'legs'
    case 'push':
      return e.force === 'push' || (!e.force && PUSH_MUSCLES.has(primary))
    case 'pull':
      return e.force === 'pull' || (!e.force && PULL_MUSCLES.has(primary))
    default:
      return styleOf(e) === pattern // power | pump | metabolic
  }
}

export type ExerciseFilter = {
  query: string
  group: MuscleGroupId | null
  equip: string | null
  pattern: PatternId | null
  onlyCustom: boolean
}

export const EMPTY_FILTER: ExerciseFilter = { query: '', group: null, equip: null, pattern: null, onlyCustom: false }

/** Search (name) + muscle group + movement pattern + equipment + custom-only, sorted by name. */
export function filterExercises(all: Exercise[], f: ExerciseFilter, customIds: Set<string>): Exercise[] {
  const q = f.query.trim().toLowerCase()
  return all
    .filter(
      (e) =>
        (!q || e.name.toLowerCase().includes(q)) &&
        (!f.group || e.primaryMuscles.some((m) => groupOf(m) === f.group)) &&
        (!f.pattern || matchesPattern(e, f.pattern)) &&
        (!f.equip || e.equipment === f.equip) &&
        (!f.onlyCustom || customIds.has(e.id)),
    )
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Equipment values actually present in the library, plus the user's custom types (Settings). */
export function equipmentOptionsOf(all: Exercise[], customEquipment: string[]): string[] {
  const set = new Set<string>()
  for (const e of all) if (e.equipment) set.add(e.equipment)
  for (const c of customEquipment) set.add(c)
  return [...set].sort()
}
