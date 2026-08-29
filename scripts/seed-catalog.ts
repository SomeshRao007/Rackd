import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { CUSTOM_EXERCISES } from './custom-exercises'

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
const ALIAS_OUT = new URL('../public/catalog/aliases.v1.json', import.meta.url)

const s = (v: unknown) => (typeof v === 'string' ? v : '')
const arr = (v: unknown) => (Array.isArray(v) ? v.map(String) : [])
const normName = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '')

// ExerciseDB ships a handful of mis-encoded degree signs ("sled 45в° leg press").
const fixEncoding = (name: string) => name.replace(/в°/g, '°')

// A camera angle / demo-model / re-shoot marker on an otherwise identical movement.
const VARIANT = /\((?:male|female|[a-z ]*pov)\)|\bv\.?\s*\d+\b/gi
const isVariant = (name: string) => name.replace(VARIANT, '') !== name

// Same movement ⇒ same key. Word ORDER is dropped ("Front Barbell Squat" ≡ "barbell front
// squat" — 97 such pairs the old punctuation-only key let through), as are the variant markers
// above. Anagram collisions are theoretically possible; all 97 groups were eyeballed, none are.
const dedupKey = (name: string) =>
  name.toLowerCase().replace(VARIANT, ' ').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').sort().join(' ')

// Display name of a survivor with no twin — "sissy squat (male)" is just a sissy squat.
const tidyName = (name: string) => name.replace(VARIANT, '').replace(/\s{2,}/g, ' ').trim()

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
  const name = fixEncoding(s(r.name).trim())
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

// ── 3. hand-authored additions (M8.3): standard conditioning/mobility moves the sources lack ──
let custom = 0
for (const rec of CUSTOM_EXERCISES) {
  if (byNorm.has(normName(rec.name)) || usedIds.has(rec.id)) continue // never shadow a real source record
  catalog.push(rec)
  usedIds.add(rec.id)
  byNorm.set(normName(rec.name), rec)
  custom++
}

// ── 4. collapse duplicate movements ──────────────────────────────────────────
// Runs as a POST-pass, deliberately: the id-minting loop above must stay byte-identical to the
// previous build or kept records would shift ids (and orphan every plan/log referencing them).
// Winner keeps its id and gains the loser's GIF; losers become aliases the client remaps to.
// ponytail: `rank` is 3 buckets, not a scoring system — hand-authored ids are referenced by the
// starter plans, free-exercise-db carries the curated instructions, everything else is fungible.
const rank = (e: CatalogRecord) =>
  (e.source === 'custom-seed' ? 0 : e.source === 'free-exercise-db' ? 2 : 4) + (isVariant(e.name) ? 1 : 0)

const kept = new Map<string, CatalogRecord>()
const aliases: Record<string, string> = {}
for (const rec of catalog) {
  const key = dedupKey(rec.name)
  const cur = kept.get(key)
  if (!cur) {
    kept.set(key, rec)
    continue
  }
  const [win, lose] = rank(rec) < rank(cur) ? [rec, cur] : [cur, rec]
  win.gifId ??= lose.gifId
  aliases[lose.id] = win.id
  kept.set(key, win)
}
// A record that won one round and lost the next leaves a stale hop — follow it to the survivor.
for (const id of Object.keys(aliases)) {
  let target = aliases[id]
  while (aliases[target]) target = aliases[target]
  aliases[id] = target
}
const deduped = [...kept.values()].map((e) => ({ ...e, name: tidyName(e.name) }))

await mkdir(new URL('.', OUT), { recursive: true })
await writeFile(OUT, JSON.stringify(deduped, null, 2))
await writeFile(ALIAS_OUT, JSON.stringify(aliases, null, 2))

// ── assertions ───────────────────────────────────────────────────────────────
assert(deduped.length > 1800, `expected > 1800 records, got ${deduped.length}`)
assert(new Set(deduped.map((e) => e.id)).size === deduped.length, 'duplicate ids')
const keptIds = new Set(deduped.map((e) => e.id))
for (const [from, to] of Object.entries(aliases)) {
  assert(keptIds.has(to), `alias target dropped: ${from} → ${to}`)
  assert(!keptIds.has(from), `alias source still in catalog: ${from}`)
}
for (const e of deduped) {
  assert(e.name === tidyName(e.name), `variant suffix survived: ${e.name}`)
  assert(!/в°/.test(e.name), `mojibake survived: ${e.name}`)
  assert(e.name, `empty name: ${e.id}`)
  assert(e.primaryMuscles.length > 0, `empty primaryMuscles: ${e.id}`)
  for (const url of e.images) assert(url.startsWith('https://'), `bad image url: ${url}`)
  if (e.gifId != null) assert(/^[A-Za-z0-9]+$/.test(e.gifId), `bad gifId: ${e.id} ${e.gifId}`)
}

const withGif = deduped.filter((e) => e.gifId).length
console.log(`free-exercise-db: skipped ${feSkipped}`)
console.log(`exercisedb: matched ${matched}, added ${added}, skipped ${edbSkipped}`)
console.log(`custom-seed: added ${custom}`)
console.log(`dedup: dropped ${Object.keys(aliases).length} duplicate movements`)
console.log(`✓ catalog: ${deduped.length} exercises (${withGif} with GIF)`)
