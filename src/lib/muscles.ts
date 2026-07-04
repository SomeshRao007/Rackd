// Shared muscle taxonomy (M6). The catalog tags exercises with 17 lowercase `primaryMuscles`
// (source: scripts/seed-catalog.ts). We fold them into 6 coarse groups for the volume dashboard,
// goal emphasis, and (later, M8) the body-map regions. Group→muscle is the source of truth;
// muscle→group is derived. Lifted out of Settings.tsx so every feature shares one vocabulary.

export type MuscleGroupId = 'chest' | 'back' | 'shoulders' | 'arms' | 'legs' | 'core'

/** The 17 catalog primaryMuscles, grouped. Order here drives display order. */
export const MUSCLE_GROUPS: Record<MuscleGroupId, string[]> = {
  chest: ['chest'],
  back: ['lats', 'middle back', 'lower back', 'traps'],
  shoulders: ['shoulders', 'neck'],
  arms: ['biceps', 'triceps', 'forearms'],
  legs: ['quadriceps', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors'],
  core: ['abdominals'],
}

export const GROUP_IDS = Object.keys(MUSCLE_GROUPS) as MuscleGroupId[]

export const GROUP_LABELS: Record<MuscleGroupId, string> = {
  chest: 'Chest', back: 'Back', shoulders: 'Shoulders', arms: 'Arms', legs: 'Legs', core: 'Core',
}

/** All 17 catalog muscles, flattened (replaces the inline list in Settings). */
export const MUSCLES: string[] = GROUP_IDS.flatMap((g) => MUSCLE_GROUPS[g])

// muscle name → its group (derived once at module load).
const MUSCLE_TO_GROUP = Object.fromEntries(
  GROUP_IDS.flatMap((g) => MUSCLE_GROUPS[g].map((m) => [m, g])),
) as Record<string, MuscleGroupId>

/** The coarse group a catalog muscle belongs to; undefined for an unknown muscle. */
export const groupOf = (muscle: string): MuscleGroupId | undefined => MUSCLE_TO_GROUP[muscle]
