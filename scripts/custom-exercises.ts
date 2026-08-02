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

  // ── M8.4 mobility: pre/post-workout moves the upstream sources don't carry. Dynamic movers are
  // listed in src/lib/mobility.ts WARMUP_IDS (warm-up material); the static holds below are not,
  // so they fall through to the cooldown. All `category: 'stretching'` → mobility everywhere.
  {
    ...base,
    id: 'Leg_Swings',
    name: 'Leg Swings',
    primaryMuscles: ['hamstrings'],
    secondaryMuscles: ['glutes', 'quadriceps', 'adductors'],
    mechanic: 'isolation',
    category: 'stretching',
    instructions: [
      'Hold a wall or rack for balance and stand tall on one leg.',
      'Swing the free leg forward and back through a comfortable range, letting it climb as the hip loosens.',
      'Switch to side-to-side swings across the body, then repeat on the other leg.',
    ],
  },
  {
    ...base,
    id: 'Walking_Knee_Hug',
    name: 'Walking Knee Hug',
    primaryMuscles: ['glutes'],
    secondaryMuscles: ['hamstrings', 'lower back'],
    mechanic: 'isolation',
    category: 'stretching',
    instructions: [
      'Step forward and pull one knee up to your chest with both hands.',
      'Rise onto the toes of the standing leg and hold for a beat, staying tall.',
      'Release, step through, and repeat on the other side as you walk.',
    ],
  },
  {
    ...base,
    id: 'Walking_Quad_Pull',
    name: 'Walking Quad Pull',
    primaryMuscles: ['quadriceps'],
    secondaryMuscles: ['glutes'],
    mechanic: 'isolation',
    category: 'stretching',
    instructions: [
      'Step forward, then pull the trailing heel toward your glute with the same-side hand.',
      'Keep the knees together and squeeze the glute of the stretching leg so the hip stays open.',
      'Hold for a beat, release, and alternate sides as you walk.',
    ],
  },
  {
    ...base,
    id: 'Ankle_Rocks',
    name: 'Ankle Rocks',
    primaryMuscles: ['calves'],
    secondaryMuscles: [],
    mechanic: 'isolation',
    category: 'stretching',
    instructions: [
      'Take a half-kneeling position with the front foot flat and a hand on the wall for balance.',
      'Drive the front knee forward over the toes without letting the heel lift.',
      'Rock back and repeat for reps, then switch sides. Great before squatting.',
    ],
  },
  {
    ...base,
    id: 'Bodyweight_Good_Morning',
    name: 'Bodyweight Good Morning',
    primaryMuscles: ['hamstrings'],
    secondaryMuscles: ['glutes', 'lower back'],
    category: 'stretching',
    instructions: [
      'Stand with feet hip-width and hands behind your head, elbows wide.',
      'Push the hips back and hinge forward with a flat back until you feel the hamstrings load.',
      'Drive the hips forward to stand tall. Keep it slow — this rehearses the hinge, it is not a lift.',
    ],
  },
  {
    ...base,
    id: 'Hip_Airplane',
    name: 'Hip Airplane',
    primaryMuscles: ['glutes'],
    secondaryMuscles: ['hamstrings', 'abdominals', 'abductors'],
    category: 'stretching',
    instructions: [
      'Balance on one leg and hinge forward until your torso and free leg form a straight line.',
      'Holding that line, rotate the hip open toward the ceiling, then back down and under.',
      'Move slowly and control the wobble. Switch legs.',
    ],
  },
  {
    ...base,
    id: 'Couch_Stretch',
    name: 'Couch Stretch',
    primaryMuscles: ['quadriceps'],
    secondaryMuscles: ['glutes'],
    mechanic: 'isolation',
    category: 'stretching',
    instructions: [
      'Half-kneel with the rear shin up a wall or couch, rear knee close to the base.',
      'Square the hips and squeeze the rear glute to take the arch out of your lower back.',
      'Hold and breathe. Bring the torso upright for more stretch. Switch sides.',
    ],
  },
  {
    ...base,
    id: 'Pigeon_Pose',
    name: 'Pigeon Pose',
    primaryMuscles: ['glutes'],
    secondaryMuscles: ['abductors', 'lower back'],
    mechanic: 'isolation',
    category: 'stretching',
    instructions: [
      'From all fours, bring one shin forward across your body and extend the other leg back.',
      'Keep the hips square and lower your chest toward the floor over the front shin.',
      'Breathe into the outer hip and hold. Switch sides.',
    ],
  },
  {
    ...base,
    id: 'Doorway_Pec_Stretch',
    name: 'Doorway Pec Stretch',
    primaryMuscles: ['chest'],
    secondaryMuscles: ['shoulders', 'biceps'],
    mechanic: 'isolation',
    category: 'stretching',
    instructions: [
      'Place a forearm on a doorframe with the elbow at shoulder height.',
      'Step through with the same-side foot and rotate the chest away until you feel the pec open.',
      'Hold and breathe, then repeat at a higher and lower elbow angle. Switch sides.',
    ],
  },
  {
    ...base,
    id: 'Lying_Spinal_Twist',
    name: 'Lying Spinal Twist',
    primaryMuscles: ['lower back'],
    secondaryMuscles: ['glutes', 'abdominals'],
    mechanic: 'isolation',
    category: 'stretching',
    instructions: [
      'Lie on your back and draw one knee up to 90 degrees.',
      'Let that knee fall across your body while keeping both shoulders on the floor.',
      'Turn your head the other way, breathe, and hold. Switch sides.',
    ],
  },
]
