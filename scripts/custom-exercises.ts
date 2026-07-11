// Hand-authored catalog additions (M8.3): standard conditioning/mobility moves the two upstream
// sources don't carry, but the goal-based starter plans reference. Kept as pure data (no side
// effects) so both seed-catalog.ts (full remote regen) and merge-custom-exercises.ts (offline
// append) share ONE source of truth. Muscle tags use our taxonomy (src/lib/muscles.ts); equipment
// uses our 12 values (src/lib/prefs.ts). ids are stable — plans/logs reference them.

export type CustomExerciseRecord = {
  id: string
  name: string
  primaryMuscles: string[]
  secondaryMuscles: string[]
  equipment: string
  mechanic: string
  level: string
  category: string
  force: string
  instructions: string[]
  images: string[]
  gifId: string | null
  source: string
  license: string
}

const base = {
  equipment: 'body only',
  mechanic: 'compound',
  level: 'beginner',
  force: '',
  images: [] as string[],
  gifId: null,
  source: 'custom-seed',
  license: 'CC0',
}

export const CUSTOM_EXERCISES: CustomExerciseRecord[] = [
  {
    ...base,
    id: 'Burpee',
    name: 'Burpee',
    primaryMuscles: ['quadriceps'],
    secondaryMuscles: ['chest', 'shoulders', 'abdominals'],
    category: 'plyometrics',
    instructions: [
      'From standing, drop into a squat and plant both hands on the floor.',
      'Kick your feet back into a plank and lower your chest to the floor.',
      'Drive your feet back to your hands and explode straight up into a jump.',
      'Land softly and immediately begin the next rep.',
    ],
  },
  {
    ...base,
    id: 'Bear_Crawl',
    name: 'Bear Crawl',
    primaryMuscles: ['abdominals'],
    secondaryMuscles: ['shoulders', 'quadriceps'],
    category: 'plyometrics',
    instructions: [
      'Start on hands and knees with knees hovering just off the floor, back flat.',
      'Crawl forward moving the opposite hand and foot together, keeping hips low and core braced.',
      'Keep the movement controlled and continuous for the work interval.',
    ],
  },
  {
    ...base,
    id: 'High_Knees',
    name: 'High Knees',
    primaryMuscles: ['quadriceps'],
    secondaryMuscles: ['calves', 'abdominals'],
    category: 'cardio',
    instructions: [
      'Run in place, driving each knee up toward hip height.',
      'Stay on the balls of your feet and pump your arms.',
      'Keep a fast, light cadence for the full work interval.',
    ],
  },
  {
    ...base,
    id: 'Sprint',
    name: 'Sprint',
    primaryMuscles: ['quadriceps'],
    secondaryMuscles: ['hamstrings', 'glutes', 'calves'],
    category: 'cardio',
    instructions: [
      'Accelerate to near-maximal effort over a short distance (or hill), driving the knees and arms.',
      'Hold top speed for the work interval, then walk back to recover.',
      'Keep form tall and powerful; ease off before form breaks down.',
    ],
  },
  {
    ...base,
    id: 'Scapular_Wall_Slide',
    name: 'Scapular Wall Slide',
    primaryMuscles: ['shoulders'],
    secondaryMuscles: ['traps', 'middle back'],
    equipment: 'body only',
    mechanic: 'isolation',
    category: 'stretching',
    instructions: [
      'Stand with your back, head, and arms against a wall, elbows bent in a goalpost position.',
      'Keeping wrists and elbows on the wall, slide your arms overhead as far as they stay in contact.',
      'Slide back down, squeezing the shoulder blades together. Move slowly and stay tall.',
    ],
  },
]
