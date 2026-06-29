/**
 * Build the starter-plan catalog. Authored by exercise NAME, resolved to real
 * catalog ids at build time (fails loud on any miss → no silently-broken rotation).
 * Output shape matches adoptPlan's snapshot: { id, name, days: PlanDay[] }.
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

// Authoring shape: day → slot (a muscle position) → a POOL of movements that rotate.
type Authored = { name: string; days: { label: string; slots: { label: string; pool: string[] }[] }[] }

const PLANS: Authored[] = [
  {
    name: 'Push / Pull / Legs',
    days: [
      {
        label: 'Push',
        slots: [
          { label: 'Chest', pool: ['Barbell Bench Press - Medium Grip', 'Dumbbell Bench Press', 'Decline Barbell Bench Press'] },
          { label: 'Shoulders', pool: ['Standing Military Press', 'Dumbbell Shoulder Press', 'Arnold Dumbbell Press'] },
          { label: 'Side delts', pool: ['Side Lateral Raise', 'Seated Side Lateral Raise'] },
          { label: 'Triceps', pool: ['Triceps Pushdown', 'EZ-Bar Skullcrusher', 'Standing Dumbbell Triceps Extension'] },
        ],
      },
      {
        label: 'Pull',
        slots: [
          { label: 'Vertical pull', pool: ['Wide-Grip Lat Pulldown', 'Pullups', 'Chin-Up'] },
          { label: 'Horizontal pull', pool: ['Bent Over Barbell Row', 'Seated Cable Rows', 'Bent Over Two-Dumbbell Row'] },
          { label: 'Rear delts', pool: ['Face Pull', 'Cable Rear Delt Fly'] },
          { label: 'Biceps', pool: ['Barbell Curl', 'Dumbbell Bicep Curl', 'Alternate Hammer Curl'] },
        ],
      },
      {
        label: 'Legs',
        slots: [
          { label: 'Quads', pool: ['Barbell Squat', 'Leg Press', 'Leg Extensions'] },
          { label: 'Hamstrings', pool: ['Barbell Deadlift', 'Lying Leg Curls'] },
          { label: 'Calves', pool: ['Standing Calf Raises', 'Rocking Standing Calf Raise'] },
        ],
      },
    ],
  },
  {
    name: 'Upper / Lower',
    days: [
      {
        label: 'Upper',
        slots: [
          { label: 'Chest', pool: ['Barbell Bench Press - Medium Grip', 'Dumbbell Bench Press'] },
          { label: 'Back', pool: ['Bent Over Barbell Row', 'Wide-Grip Lat Pulldown', 'Seated Cable Rows'] },
          { label: 'Shoulders', pool: ['Dumbbell Shoulder Press', 'Standing Military Press'] },
          { label: 'Biceps', pool: ['Barbell Curl', 'Alternate Hammer Curl'] },
          { label: 'Triceps', pool: ['Triceps Pushdown', 'EZ-Bar Skullcrusher'] },
        ],
      },
      {
        label: 'Lower',
        slots: [
          { label: 'Quads', pool: ['Barbell Squat', 'Leg Press'] },
          { label: 'Hamstrings', pool: ['Barbell Deadlift', 'Lying Leg Curls'] },
          { label: 'Accessory', pool: ['Leg Extensions', 'Barbell Lunge'] },
          { label: 'Calves', pool: ['Standing Calf Raises', 'Rocking Standing Calf Raise'] },
        ],
      },
    ],
  },
]

const resolved = PLANS.map((p) => {
  const ps = slug(p.name)
  return {
    id: `starter-${ps}`,
    name: p.name,
    days: p.days.map((d) => ({
      id: `${ps}-${slug(d.label)}`,
      label: d.label,
      slots: d.slots.map((s) => ({
        id: `${ps}-${slug(d.label)}-${slug(s.label)}`,
        label: s.label,
        exercisePool: s.pool.map(id),
      })),
    })),
  }
})

await writeFile(OUT, JSON.stringify(resolved, null, 2))

// one runnable check: every pool is non-empty and resolved to ids that exist.
const ids = new Set(catalog.map((e) => e.id))
for (const p of resolved)
  for (const d of p.days)
    for (const s of d.slots) {
      assert(s.exercisePool.length > 0, `${p.name}/${d.label}/${s.label}: empty pool`)
      for (const x of s.exercisePool) assert(ids.has(x), `bad id ${x} in ${p.name}/${d.label}`)
    }

console.log(`✓ starter plans: ${resolved.length} plans, ${resolved.flatMap((p) => p.days).length} days`)
