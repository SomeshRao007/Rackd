/**
 * Build the starter-plan catalog. Authored by exercise NAME, resolved to real
 * catalog ids at build time (fails loud on any miss → no silently-broken rotation).
 * Output shape extends adoptPlan's snapshot with browse-time metadata:
 *   { id, goal, name, description, days: PlanDay[] }
 * A day may be a timed circuit ({ mode:'circuit', workSec, restSec, rounds }); those drive the
 * Today CircuitTimer instead of the weight×reps loggers (M8.3).
 *   Run: npm run seed:plans   (after npm run seed, which builds exercises.v1.json)
 */
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'

const CATALOG = new URL('../public/catalog/exercises.v1.json', import.meta.url)
const OUT = new URL('../public/catalog/starter-plans.v1.json', import.meta.url)

type Cat = { id: string; name: string }
const catalog = JSON.parse(await readFile(CATALOG, 'utf8')) as Cat[]
const byName = new Map(catalog.map((e) => [e.name.toLowerCase(), e.id]))

const id = (name: string): string => {
  const found = byName.get(name.toLowerCase())
  assert(found, `starter plan references unknown exercise: "${name}"`)
  return found!
}
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

type Goal = 'muscle-growth' | 'stay-active' | 'weight-loss'
type Circuit = { workSec: number; restSec: number; rounds: number }
type Slot = { label: string; pool: string[] }
type Day = { label: string; slots: Slot[]; circuit?: Circuit }
type Authored = { id: string; goal: Goal; name: string; description: string; days: Day[] }

// Shorthand: a slot is [label, ...movement names]; a circuit day adds its timing.
const s = (label: string, ...pool: string[]): Slot => ({ label, pool })

const PLANS: Authored[] = [
  // ── MUSCLE GROWTH (4) ──────────────────────────────────────────────────────
  {
    id: 'mg-perfect-ppl',
    goal: 'muscle-growth',
    name: 'Perfect PPL Split',
    description:
      'A high-frequency 6-day Push/Pull/Legs split that trains every muscle twice a week. Heavy compound lifts are paired with targeted hypertrophy work and built-in face-pull correctives for healthy shoulders. Best for intermediates training 5–6 days a week.',
    days: [
      { label: 'Push A', slots: [
        s('Chest', 'Barbell Bench Press - Medium Grip', 'Dumbbell Bench Press'),
        s('Shoulders', 'Dumbbell Shoulder Press', 'Standing Military Press'),
        s('Side delts', 'Side Lateral Raise', 'Seated Side Lateral Raise'),
        s('Triceps', 'EZ-Bar Skullcrusher', 'Lying Triceps Press'),
        s('Correctives', 'Face Pull'),
      ] },
      { label: 'Pull A', slots: [
        s('Vertical pull', 'Pullups', 'Wide-Grip Lat Pulldown'),
        s('Horizontal pull', 'Bent Over Barbell Row', 'Seated Cable Rows'),
        s('Lats', 'Straight-Arm Dumbbell Pullover'),
        s('Biceps', 'Barbell Curl', 'Alternate Hammer Curl'),
        s('Rear delts', 'Face Pull'),
      ] },
      { label: 'Legs A', slots: [
        s('Quads', 'Barbell Squat', 'Leg Press'),
        s('Glutes', 'Barbell Hip Thrust'),
        s('Unilateral', 'Split Squat with Dumbbells', 'Split Squats'),
        s('Calves', 'Standing Calf Raises'),
        s('Correctives', 'Face Pull'),
      ] },
      { label: 'Push B', slots: [
        s('Upper chest', 'Incline Dumbbell Press', 'Barbell Incline Bench Press - Medium Grip'),
        s('Shoulders', 'Standing Military Press', 'Barbell Shoulder Press'),
        s('Chest fly', 'Cable Crossover', 'Incline Cable Flye'),
        s('Triceps', 'Close-Grip Barbell Bench Press', 'Triceps Pushdown'),
        s('Side delts', 'Cable Seated Lateral Raise', 'Side Lateral Raise'),
      ] },
      { label: 'Pull B', slots: [
        s('Hinge', 'Barbell Deadlift'),
        s('Row', 'Bent Over Two-Dumbbell Row', 'Barbell Pendlay Row'),
        s('Vertical pull', 'Chin-Up', 'Pullups'),
        s('Biceps', 'Alternate Hammer Curl', 'Cable Hammer Curls - Rope Attachment'),
        s('Rear delts', 'Face Pull'),
      ] },
      { label: 'Legs B', slots: [
        s('Hinge', 'Romanian Deadlift', 'Dumbbell Romanian Deadlift'),
        s('Lunge', 'Barbell Walking Lunge', 'Bodyweight Walking Lunge'),
        s('Quads', 'Leg Extensions'),
        s('Hamstrings', 'Lying Leg Curls', 'Seated Leg Curl'),
        s('Calves', 'Barbell Seated Calf Raise'),
      ] },
    ],
  },
  {
    id: 'mg-ppl-ul-hybrid',
    goal: 'muscle-growth',
    name: 'PPL + Upper/Lower Hybrid',
    description:
      'A 5-day hybrid: three heavy Push/Pull/Legs power days feed two higher-volume Upper/Lower hypertrophy days, so every muscle gets both a strength and a growth stimulus each week. Two full rest days keep the nervous system fresh.',
    days: [
      { label: 'Push (Power)', slots: [
        s('Chest', 'Barbell Bench Press - Medium Grip'),
        s('Shoulders', 'Dumbbell Shoulder Press'),
        s('Side delts', 'Side Lateral Raise'),
        s('Triceps', 'EZ-Bar Skullcrusher'),
        s('Correctives', 'Face Pull'),
      ] },
      { label: 'Pull (Power)', slots: [
        s('Hinge', 'Barbell Deadlift'),
        s('Row', 'Seated Cable Rows', 'Bent Over Barbell Row'),
        s('Vertical pull', 'Pullups'),
        s('Biceps', 'Barbell Curl'),
        s('Correctives', 'Face Pull'),
      ] },
      { label: 'Legs (Power)', slots: [
        s('Quads', 'Barbell Squat'),
        s('Glutes', 'Barbell Hip Thrust'),
        s('Unilateral', 'Crossover Reverse Lunge', 'Bodyweight Walking Lunge'),
        s('Calves', 'Standing Calf Raises'),
        s('Correctives', 'Face Pull'),
      ] },
      { label: 'Upper (Hypertrophy)', slots: [
        s('Incline chest', 'Barbell Incline Bench Press - Medium Grip', 'Incline Dumbbell Press'),
        s('Chest fly', 'Flat Bench Cable Flyes', 'Cable Crossover'),
        s('Back', 'Barbell Pendlay Row', 'Bent Over Two-Dumbbell Row'),
        s('Vertical pull', 'Pullups'),
        s('Side delts', 'Cable Seated Lateral Raise'),
        s('Triceps', 'Cable Rope Overhead Triceps Extension'),
        s('Biceps', 'Cable Hammer Curls - Rope Attachment'),
      ] },
      { label: 'Lower (Hypertrophy)', slots: [
        s('Hinge', 'Romanian Deadlift'),
        s('Lunge', 'Barbell Walking Lunge'),
        s('Quads', 'Leg Extensions'),
        s('Hamstrings', 'Seated Leg Curl', 'Lying Leg Curls'),
        s('Calves', 'Barbell Seated Calf Raise'),
      ] },
    ],
  },
  {
    id: 'mg-total-body',
    goal: 'muscle-growth',
    name: 'Total-Body Strength & Size',
    description:
      'Three full-body sessions a week, each with a different flavour — a heavy Power day, a hypertrophy Pump day, and a Metabolic conditioning day. It exposes you to strength, growth and work-capacity stimuli in minimal time. Ideal for busy or intermediate lifters.',
    days: [
      { label: 'Power', slots: [
        s('Squat', 'Barbell Squat'),
        s('Press', 'Barbell Bench Press - Medium Grip'),
        s('Hinge', 'Barbell Deadlift'),
        s('Pull', 'Pullups', 'Wide-Grip Lat Pulldown'),
      ] },
      { label: 'Pump', slots: [
        s('Incline press', 'Incline Dumbbell Press'),
        s('Legs', 'Split Squat with Dumbbells'),
        s('Row', 'Bent Over Two-Dumbbell Row'),
        s('Shoulders', 'Dumbbell Shoulder Press'),
        s('Biceps', 'Dumbbell Bicep Curl', 'Alternate Hammer Curl'),
      ] },
      { label: 'Metabolic', slots: [
        s('Legs', 'Freehand Jump Squat'),
        s('Push', 'Pushups'),
        s('Pull', 'Inverted Row'),
        s('Lunge', 'Bodyweight Walking Lunge', 'Crossover Reverse Lunge'),
      ] },
    ],
  },
  {
    id: 'mg-upper-lower',
    goal: 'muscle-growth',
    name: 'Upper / Lower Split',
    description:
      'The classic 4-day Upper/Lower split — two upper-body and two lower-body sessions a week. Simple, balanced and proven for building strength and muscle while leaving plenty of recovery. A great first structured plan.',
    days: [
      { label: 'Upper', slots: [
        s('Chest', 'Barbell Bench Press - Medium Grip', 'Dumbbell Bench Press'),
        s('Back', 'Bent Over Barbell Row', 'Wide-Grip Lat Pulldown', 'Seated Cable Rows'),
        s('Shoulders', 'Dumbbell Shoulder Press', 'Standing Military Press'),
        s('Biceps', 'Barbell Curl', 'Alternate Hammer Curl'),
        s('Triceps', 'Triceps Pushdown', 'EZ-Bar Skullcrusher'),
      ] },
      { label: 'Lower', slots: [
        s('Quads', 'Barbell Squat', 'Leg Press'),
        s('Hamstrings', 'Barbell Deadlift', 'Lying Leg Curls'),
        s('Accessory', 'Leg Extensions', 'Barbell Walking Lunge'),
        s('Calves', 'Standing Calf Raises', 'Rocking Standing Calf Raise'),
      ] },
    ],
  },
  // ── STAY ACTIVE (3) ────────────────────────────────────────────────────────
  {
    id: 'sa-bodyweight-basics',
    goal: 'stay-active',
    name: 'Foundational Bodyweight Circuit',
    description:
      'A no-equipment foundation built on the basics — squat, push, pull, hinge and brace — done 2–3 times a week. Focus on clean movement and a two-second squeeze at the top of every rep. Perfect for beginners, deload weeks, or training at home.',
    days: [
      { label: 'Full Body', slots: [
        s('Squat', 'Bodyweight Squat'),
        s('Push', 'Pushups', 'Incline Push-Up'),
        s('Pull', 'Inverted Row'),
        s('Glutes', 'Butt Lift (Bridge)', 'Single Leg Glute Bridge'),
        s('Core', 'Plank'),
        s('Correctives', 'Face Pull'),
      ] },
    ],
  },
  {
    id: 'sa-30-min-full-body',
    goal: 'stay-active',
    name: '30-Minute Full-Body',
    description:
      'A brisk full-body dumbbell circuit that maintains strength and bone density in about 30 minutes, twice a week. Move through goblet squat, press, row, hinge and a loaded carry with short rest — heavy enough to count, quick enough to keep up.',
    days: [
      { label: 'Full Body', slots: [
        s('Legs', 'Goblet Squat', 'Kettlebell Goblet Squat'),
        s('Push', 'Push Press'),
        s('Pull', 'Bent Over Two-Dumbbell Row'),
        s('Hinge', 'Dumbbell Romanian Deadlift'),
        s('Carry', "Farmer's Walk"),
        s('Core', 'Plank'),
      ] },
    ],
  },
  {
    id: 'sa-mobility-flow',
    goal: 'stay-active',
    name: 'Daily Mobility Flow',
    description:
      'A daily 10-minute mobility flow to undo desk posture and keep joints healthy. Move through controlled holds — wall slides, thoracic and hip openers — breathing into each position. Use it on rest days or as a warm-up; no equipment needed.',
    days: [
      { label: 'Mobility Flow', circuit: { workSec: 30, restSec: 5, rounds: 2 }, slots: [
        s('Shoulders', 'Scapular Wall Slide'),
        s('Thoracic', 'Cat Stretch'),
        s('Hip opener', "World's Greatest Stretch"),
        s('Hips', 'Standing Hip Circles'),
        s('Decompress', "Child's Pose"),
      ] },
    ],
  },
  // ── WEIGHT LOSS (3, all timed circuits) ─────────────────────────────────────
  {
    id: 'wl-metabolic-burst',
    goal: 'weight-loss',
    name: 'Metabolic Burst (HIIT)',
    description:
      'A 20-minute HIIT circuit built to spike your heart rate and keep burning calories long after you finish (the EPOC effect). Thirty seconds all-out, thirty seconds rest, four rounds. Preserves muscle while torching fat — only an optional kettlebell needed.',
    days: [
      { label: 'Burst Circuit', circuit: { workSec: 30, restSec: 30, rounds: 4 }, slots: [
        s('Full body', 'Mountain Climbers'),
        s('Legs', 'Freehand Jump Squat'),
        s('Full body', 'Burpee'),
        s('Conditioning', 'Star Jump'),
        s('Hinge', 'Kettlebell Swing'),
        s('Cardio', 'High Knees'),
      ] },
    ],
  },
  {
    id: 'wl-conditioning-shred',
    goal: 'weight-loss',
    name: 'Full-Body Conditioning Shred',
    description:
      'A brutal, time-efficient shred that pairs push, pull and lower-body power with almost no rest to flood the muscles with metabolites. Forty seconds work, twenty seconds rest, three rounds — roughly 15 sweaty minutes. Scale the pace to your fitness.',
    days: [
      { label: 'Shred Circuit', circuit: { workSec: 40, restSec: 20, rounds: 3 }, slots: [
        s('Full body', 'Burpee'),
        s('Push', 'Pushups'),
        s('Legs', 'Freehand Jump Squat'),
        s('Core', 'Mountain Climbers'),
        s('Power', 'Kettlebell Thruster', 'Barbell Thruster'),
        s('Brace', 'Plank'),
      ] },
    ],
  },
  {
    id: 'wl-sprint-conditioning',
    goal: 'weight-loss',
    name: 'Outdoor Sprint Conditioning',
    description:
      'Explosive outdoor (or treadmill) conditioning inspired by hill-sprint training — short maximal efforts with full recovery to build power and drive fat loss. Twenty seconds hard, forty seconds easy, six rounds. Find a hill or open stretch and go.',
    days: [
      { label: 'Sprint Circuit', circuit: { workSec: 20, restSec: 40, rounds: 6 }, slots: [
        s('Sprint', 'Sprint'),
        s('Crawl', 'Bear Crawl'),
        s('Lunge', 'Bodyweight Walking Lunge'),
        s('Jump', 'Freehand Jump Squat'),
        s('Plyo', 'Knee Tuck Jump'),
        s('Power', 'Front Box Jump'),
      ] },
    ],
  },
]

const resolved = PLANS.map((p) => ({
  id: p.id,
  goal: p.goal,
  name: p.name,
  description: p.description,
  days: p.days.map((d) => {
    const dayId = `${p.id}-${slug(d.label)}`
    return {
      id: dayId,
      label: d.label,
      ...(d.circuit ? { mode: 'circuit' as const, ...d.circuit } : {}),
      slots: d.slots.map((slot, i) => ({
        id: `${dayId}-${i + 1}-${slug(slot.label)}`,
        label: slot.label,
        exercisePool: slot.pool.map(id),
      })),
    }
  }),
}))

await writeFile(OUT, JSON.stringify(resolved, null, 2) + '\n')

// runnable checks: pools non-empty + resolve, slot ids unique, goal counts as intended (4/3/3).
const ids = new Set(catalog.map((e) => e.id))
const slotIds = new Set<string>()
for (const p of resolved)
  for (const d of p.days)
    for (const slot of d.slots) {
      assert(slot.exercisePool.length > 0, `${p.name}/${d.label}/${slot.label}: empty pool`)
      for (const x of slot.exercisePool) assert(ids.has(x), `bad id ${x} in ${p.name}/${d.label}`)
      assert(!slotIds.has(slot.id), `duplicate slot id ${slot.id}`)
      slotIds.add(slot.id)
    }
const counts = resolved.reduce<Record<string, number>>((m, p) => ((m[p.goal] = (m[p.goal] || 0) + 1), m), {})
assert(counts['muscle-growth'] === 4 && counts['stay-active'] === 3 && counts['weight-loss'] === 3, `goal counts off: ${JSON.stringify(counts)}`)

console.log(`✓ starter plans: ${resolved.length} plans (${JSON.stringify(counts)}), ${resolved.flatMap((p) => p.days).length} days`)
