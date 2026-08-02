import type { Exercise } from '../db/schema'

// Warm-up vs cooldown (M8.4). A warm-up should be a DYNAMIC mover (raise tissue temperature,
// rehearse the pattern); a cooldown should be a STATIC hold. Neither catalog source records that
// distinction — free-exercise-db lumps foam rolling, static holds and joint circles all under
// `category: 'stretching'` — so we keep one explicit id set instead of inventing a metadata field.
// The hand-authored ids (scripts/custom-exercises.ts) are stable by design; the rest are the
// free-exercise-db entries that genuinely move a joint through range.
// ponytail: a 20-id list beats a new column until someone needs this per-user.
export const WARMUP_IDS = new Set([
  // free-exercise-db entries that move a joint through range rather than hold it
  'Ankle_Circles',
  'Arm_Circles',
  'Cat_Stretch',
  'Dynamic_Back_Stretch',
  'Dynamic_Chest_Stretch',
  'Elbow_Circles',
  'Groiners',
  'Hip_Circles_prone',
  'Inchworm',
  'Iron_Crosses_stretch',
  'Knee_Circles',
  'Rear_Leg_Raises',
  'Round_The_World_Shoulder_Stretch',
  'Scapular_Wall_Slide',
  'Shoulder_Circles',
  'Standing_Hip_Circles',
  'Torso_Rotation',
  'Worlds_Greatest_Stretch',
  'Wrist_Circles',
  // hand-authored (scripts/custom-exercises.ts)
  'Leg_Swings',
  'Walking_Knee_Hug',
  'Walking_Quad_Pull',
  'Ankle_Rocks',
  'Bodyweight_Good_Morning',
  'Hip_Airplane',
])

/** Is this a mobility move at all (catalog stretch or a user-authored one)? */
export const isMobility = (e: Exercise): boolean => e.category === 'stretching'

/** Dynamic mover → warm-up material. Everything else mobility is a cooldown hold. */
export const isWarmupMove = (e: Exercise): boolean => WARMUP_IDS.has(e.id)

/** Stable per-day offset so Push A and Push B don't open with the same three moves. Deterministic
 *  on purpose — Math.random would re-derive differently on every render and break the tests. */
export const rotateBy = <T,>(list: T[], key: string): T[] => {
  if (list.length === 0) return list
  let h = 0
  for (const c of key) h = (h + c.charCodeAt(0)) % list.length
  return [...list.slice(h), ...list.slice(0, h)]
}
