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

// ── M8 body-map contract ────────────────────────────────────────────────────
// Our 17 catalog muscles → the MuscleMap SVG slugs the BodyMap renders (public/bodymap).
// A few are approximations (MuscleMap has no lats/abductors slug): lats/middle back share the
// upper-back mass; abductors ride the gluteal region; abdominals light abs + obliques.
export const MUSCLE_TO_BODYMAP: Record<string, string[]> = {
  chest: ['chest'],
  lats: ['upperBack'],
  'middle back': ['upperBack'],
  'lower back': ['lowerBack'],
  traps: ['trapezius'],
  shoulders: ['deltoids'],
  neck: ['neck'],
  biceps: ['biceps'],
  triceps: ['triceps'],
  forearms: ['forearm'],
  quadriceps: ['quadriceps'],
  hamstrings: ['hamstring'],
  glutes: ['gluteal'],
  calves: ['calves'],
  adductors: ['adductors'],
  abductors: ['gluteal'],
  abdominals: ['abs', 'obliques'],
}

// Inverse: a rendered bodymap slug → its coarse group (drives heatmap fill + click-to-group).
// Structural silhouette slugs (head/hands/feet/knees/ankles/tibialis/serratus) are absent →
// they render as quiet base and aren't clickable to a group.
export const SLUG_TO_GROUP: Record<string, MuscleGroupId> = Object.fromEntries(
  GROUP_IDS.flatMap((g) =>
    MUSCLE_GROUPS[g].flatMap((m) => (MUSCLE_TO_BODYMAP[m] ?? []).map((slug) => [slug, g])),
  ),
) as Record<string, MuscleGroupId>

/** Every bodymap slug a group occupies (union of its muscles' slugs). */
export const slugsForGroup = (g: MuscleGroupId): string[] =>
  MUSCLE_GROUPS[g].flatMap((m) => MUSCLE_TO_BODYMAP[m] ?? [])

/** Every bodymap slug a set of catalog muscles occupies. */
export const slugsForMuscles = (muscles: string[]): string[] =>
  muscles.flatMap((m) => MUSCLE_TO_BODYMAP[m] ?? [])
