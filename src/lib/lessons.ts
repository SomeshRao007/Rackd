// Per-session muscle micro-lessons (M7 C7). Static, fun "learn while you rest" snippets keyed to
// the 6-group taxonomy (muscles.ts). The session picks the lesson for its primary group. No AI —
// the optional BYO-AI enrichment is an M9 concern; these hand-written blurbs always work offline.

import { groupOf, type MuscleGroupId } from './muscles'

export type Lesson = { title: string; body: string }

const MUSCLE_LESSONS: Record<MuscleGroupId, Lesson> = {
  chest: {
    title: 'Your chest is a fan, not a slab',
    body: 'The pec major pulls from two angles — a slight incline biases the clavicular (upper) fibres, flat and decline bias the sternal. Rotating the angle across sessions is why your split works.',
  },
  back: {
    title: 'Pull wide, pull low',
    body: 'Vertical pulls (pull-ups) hit the lats; horizontal rows load the mid-back and traps. Hitting both is what builds the 3-D back a single movement can’t.',
  },
  shoulders: {
    title: 'Three heads, three jobs',
    body: 'The delt has front, side and rear heads. Presses hammer the front; most people never train the rear — a few sets of reverse flyes balances the shoulder and protects it.',
  },
  arms: {
    title: 'The triceps are the bigger half',
    body: 'Two-thirds of your upper-arm mass is triceps, not biceps. Want bigger arms? Press and extend as much as you curl.',
  },
  legs: {
    title: 'Hinge vs. squat',
    body: 'Squats bias the quads; hip hinges (deadlifts, RDLs) bias the hamstrings and glutes. Alternating the pattern is how you avoid the all-quads look.',
  },
  core: {
    title: 'The core resists more than it flexes',
    body: 'Beyond crunches, the abs’ real job is anti-rotation and anti-extension — bracing under a heavy squat or carry trains them harder than most ab circuits.',
  },
}

/** Lesson for a set of primary muscles — folds the first known muscle to its group. null if none map. */
export function lessonForMuscles(primaryMuscles: string[]): Lesson | null {
  for (const m of primaryMuscles) {
    const g = groupOf(m)
    if (g) return MUSCLE_LESSONS[g]
  }
  return null
}
