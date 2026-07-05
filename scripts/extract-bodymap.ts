import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'

// ETL: MuscleMap (github.com/melihcolpan/MuscleMap, MIT) stores each muscle as standard SVG
// path `d` strings in Swift source. We fetch the four figure files, parse them, drop the
// redundant fine sub-region slugs (they render as floating "circles" our 6-group/17-muscle
// model never needs), and emit one static JSON the BodyMap component fetches at runtime.

const BASE = 'https://raw.githubusercontent.com/melihcolpan/MuscleMap/main/Sources/MuscleMap/Data/'
const FILES = { front: 'Front', back: 'Back' } as const
const OUT = new URL('../public/bodymap/paths.v1.json', import.meta.url)

// Sub-regions folded away (overlap a parent mass or fall outside our taxonomy).
const DROP = new Set([
  'frontDeltoid', 'rearDeltoid', 'hipFlexors', 'upperChest', 'lowerChest',
  'upperAbs', 'lowerAbs', 'innerQuad', 'outerQuad', 'upperTrapezius', 'lowerTrapezius',
])

// viewBox per figure (front/back and male/female use independent coordinate spaces).
// Baked from the kept-path bounding boxes; dropped slugs are interior so they don't affect these.
const VIEWBOX: Record<string, [number, number, number, number]> = {
  'male.front': [41, 84, 646, 1268],
  'male.back': [761, 85, 646, 1269],
  'female.front': [-6, -12, 653, 1452],
  'female.back': [816, -12, 653, 1452],
}

type Muscle = { left: string[]; right: string[]; common: string[] }

function parse(swift: string): Record<string, Muscle> {
  const out: Record<string, Muscle> = {}
  for (const block of swift.split('BodyPartPathData(').slice(1)) {
    const slug = block.match(/slug:\s*\.(\w+)/)?.[1]
    if (!slug || DROP.has(slug)) continue
    const rec: Muscle = { left: [], right: [], common: [] }
    for (const key of ['left', 'right', 'common'] as const) {
      const seg = block.match(new RegExp(`\\b${key}:\\s*\\[([\\s\\S]*?)\\]`))?.[1]
      if (seg) rec[key] = [...seg.matchAll(/"([^"]*)"/g)].map((m) => m[1])
    }
    out[slug] = rec
  }
  return out
}

const figures: Record<string, Record<string, unknown>> = { male: {}, female: {} }
for (const sex of ['male', 'female'] as const) {
  for (const [side, suffix] of Object.entries(FILES)) {
    const file = `${sex === 'male' ? 'Male' : 'Female'}${suffix}Paths.swift`
    const swift = await (await fetch(BASE + file)).text()
    figures[sex][side] = { viewBox: VIEWBOX[`${sex}.${side}`], muscles: parse(swift) }
  }
}

const payload = {
  version: 1,
  source: 'MuscleMap — github.com/melihcolpan/MuscleMap',
  license: 'MIT (© Melih Colpan)',
  figures,
}

await mkdir(new URL('.', OUT), { recursive: true })
await writeFile(OUT, JSON.stringify(payload))

for (const sex of ['male', 'female'] as const) {
  for (const side of ['front', 'back'] as const) {
    const m = (figures[sex][side] as { muscles: Record<string, Muscle> }).muscles
    assert(Object.keys(m).length > 8, `${sex}.${side}: too few slugs`)
    for (const drop of DROP) assert(!(drop in m), `${sex}.${side}: ${drop} not dropped`)
  }
}
assert('quadriceps' in (figures.male.front as { muscles: object }).muscles, 'missing quadriceps')
assert('gluteal' in (figures.male.back as { muscles: object }).muscles, 'missing gluteal')
console.log('✓ bodymap paths extracted →', OUT.pathname)
