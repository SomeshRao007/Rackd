import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'

// Catalog build = merge of two open sources into our canonical shape:
//   • free-exercise-db (public domain, 873): curated step-by-step + static demo photos. Kept as-is.
//   • ExerciseDB v1 (hasaneyldrm/exercises-dataset, 1324): every entry has a `media_id` → an
//     animated GIF at static.exercisedb.dev/media/{media_id}.gif (hotlinked, online-only). Their
//     muscle/equipment vocab is remapped onto our taxonomy so the body-map + filters keep working.
// Dedup is by normalized name: a matched free-exercise-db record just gains a `gifId`; unmatched
// ExerciseDB records are added new. free-exercise-db ids are never regenerated (logs/plans ref them).

const FE_SRC = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json'
const FE_IMG_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/'
const EDB_SRC = 'https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main/data/exercises.json'
const OUT = new URL('../public/catalog/exercises.v1.json', import.meta.url)

const s = (v: unknown) => (typeof v === 'string' ? v : '')
const arr = (v: unknown) => (Array.isArray(v) ? v.map(String) : [])
const normName = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '')

type CatalogRecord = {
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

// ── ExerciseDB → our taxonomy maps ───────────────────────────────────────────
// ExerciseDB target/secondary_muscles → our 17 catalog muscles (src/lib/muscles.ts). Anything not
// listed is dropped; a record whose primary target maps to nothing (pure cardio) is skipped.
const MUSCLE_MAP: Record<string, string> = {
  abductors: 'abductors', abs: 'abdominals', adductors: 'adductors', biceps: 'biceps',
  brachialis: 'biceps', calves: 'calves', delts: 'shoulders', deltoids: 'shoulders',
  forearms: 'forearms', 'wrist extensors': 'forearms', 'wrist flexors': 'forearms',
  glutes: 'glutes', hamstrings: 'hamstrings', lats: 'lats', 'levator scapulae': 'neck',
  'lower back': 'lower back', 'upper back': 'middle back', pectorals: 'chest', quads: 'quadriceps',
  'rotator cuff': 'shoulders', 'serratus anterior': 'abdominals', soleus: 'calves',
  spine: 'lower back', traps: 'traps', triceps: 'triceps',
}
const mapMuscle = (m: string) => MUSCLE_MAP[m.trim().toLowerCase()]

// ExerciseDB equipment → our 12 catalog values (src/lib/prefs.ts ALL_EQUIPMENT). Keeps plate-calc
// (barbell / e-z curl bar) and the equipment filter working. Default → 'other'.
const EQUIP_MAP: Record<string, string> = {
  'body weight': 'body only', barbell: 'barbell', 'olympic barbell': 'barbell', 'trap bar': 'barbell',
  'ez barbell': 'e-z curl bar', dumbbell: 'dumbbell', cable: 'cable', kettlebell: 'kettlebells',
  'leverage machine': 'machine', hammer: 'machine', 'smith machine': 'machine', 'sled machine': 'machine',
  'skierg machine': 'machine', 'elliptical machine': 'machine', 'stationary bike': 'machine',
  'stepmill machine': 'machine', 'upper body ergometer': 'machine', band: 'bands', 'resistance band': 'bands',
  'medicine ball': 'medicine ball', 'stability ball': 'exercise ball', 'bosu ball': 'exercise ball',
  roller: 'foam roll', 'wheel roller': 'foam roll',
}
const mapEquip = (e: string) => EQUIP_MAP[e.trim().toLowerCase()] ?? 'other'

const titleCase = (name: string) =>
  name.trim().replace(/[^A-Za-z0-9\s-]/g, '').replace(/\s+/g, ' ').trim()
    .split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('_') || 'Exercise'

// English paragraph → numbered steps (split on sentence boundaries; keep the period).
const toSteps = (text: string) =>
  text.split(/(?<=[.!?])\s+/).map((t) => t.trim()).filter((t) => t.length > 1)

// ── 1. free-exercise-db (base, unchanged shape) ──────────────────────────────
const feRaw = (await (await fetch(FE_SRC)).json()) as Record<string, unknown>[]
let feSkipped = 0
const byNorm = new Map<string, CatalogRecord>()
const usedIds = new Set<string>()
const catalog: CatalogRecord[] = []

for (const r of feRaw) {
  const name = s(r.name)
  const primaryMuscles = arr(r.primaryMuscles)
  if (!name || primaryMuscles.length === 0) {
    feSkipped++
    continue
  }
  const rec: CatalogRecord = {
    id: s(r.id),
    name,
    primaryMuscles,
    secondaryMuscles: arr(r.secondaryMuscles),
    equipment: s(r.equipment),
    mechanic: s(r.mechanic),
    level: s(r.level),
    category: s(r.category),
    force: s(r.force),
    instructions: arr(r.instructions),
    images: arr(r.images).map((p) => FE_IMG_BASE + p),
    gifId: null,
    source: 'free-exercise-db',
    license: 'Unlicense',
  }
  catalog.push(rec)
  usedIds.add(rec.id)
  byNorm.set(normName(name), rec)
}

// ── 2. ExerciseDB: attach gifId to matches, add the rest ──────────────────────
const edbRaw = (await (await fetch(EDB_SRC)).json()) as Record<string, unknown>[]
let matched = 0
let edbSkipped = 0
let added = 0

for (const r of edbRaw) {
  const name = s(r.name).trim()
  const mediaId = s(r.media_id)
  if (!name || !mediaId) {
    edbSkipped++
    continue
  }
  const key = normName(name)

  const existing = byNorm.get(key)
  if (existing) {
    if (!existing.gifId) {
      existing.gifId = mediaId
      matched++
    }
    continue
  }

  // New exercise — remap onto our taxonomy.
  const primary = mapMuscle(s(r.target))
  if (!primary) {
    edbSkipped++ // pure cardio / unmappable target — our schema requires a primary muscle
    continue
  }
  const secondaryMuscles = [
    ...new Set(arr(r.secondary_muscles).map(mapMuscle).filter((m): m is string => !!m && m !== primary)),
  ]
  const instrEn = s((r.instructions as Record<string, unknown> | undefined)?.en)

  let id = titleCase(name)
  for (let n = 2; usedIds.has(id); n++) id = `${titleCase(name)}_${n}`
  usedIds.add(id)

  const rec: CatalogRecord = {
    id,
    name,
    primaryMuscles: [primary],
    secondaryMuscles,
    equipment: mapEquip(s(r.equipment)),
    mechanic: '',
    level: '',
    category: s(r.category),
    force: '',
    instructions: toSteps(instrEn),
    images: [],
    gifId: mediaId,
    source: 'exercisedb',
    license: 'ExerciseDB (media hotlinked; see attribution)',
  }
  catalog.push(rec)
  byNorm.set(key, rec)
  added++
}

await mkdir(new URL('.', OUT), { recursive: true })
await writeFile(OUT, JSON.stringify(catalog, null, 2))

// ── assertions ───────────────────────────────────────────────────────────────
assert(catalog.length > 1800, `expected > 1800 records, got ${catalog.length}`)
assert(new Set(catalog.map((e) => e.id)).size === catalog.length, 'duplicate ids')
for (const e of catalog) {
  assert(e.name, `empty name: ${e.id}`)
  assert(e.primaryMuscles.length > 0, `empty primaryMuscles: ${e.id}`)
  for (const url of e.images) assert(url.startsWith('https://'), `bad image url: ${url}`)
  if (e.gifId != null) assert(/^[A-Za-z0-9]+$/.test(e.gifId), `bad gifId: ${e.id} ${e.gifId}`)
}

const withGif = catalog.filter((e) => e.gifId).length
console.log(`free-exercise-db: skipped ${feSkipped}`)
console.log(`exercisedb: matched ${matched}, added ${added}, skipped ${edbSkipped}`)
console.log(`✓ catalog: ${catalog.length} exercises (${withGif} with GIF)`)
