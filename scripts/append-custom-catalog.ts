// Offline catalog top-up (M8.3): append CUSTOM_EXERCISES to the existing exercises.v1.json without
// re-fetching the two upstream sources — so adding a few hand-authored moves doesn't risk pulling
// unrelated upstream churn (or need network). Idempotent: skips anything already present by id or
// normalized name. seed-catalog.ts remains the full generator; this is the incremental path.
// Run: `npx tsx scripts/append-custom-catalog.ts`
import { readFile, writeFile } from 'node:fs/promises'
import { CUSTOM_EXERCISES } from './custom-exercises'

const OUT = new URL('../public/catalog/exercises.v1.json', import.meta.url)
const normName = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '')

const catalog = JSON.parse(await readFile(OUT, 'utf8')) as { id: string; name: string }[]
const ids = new Set(catalog.map((e) => e.id))
const names = new Set(catalog.map((e) => normName(e.name)))

let added = 0
for (const rec of CUSTOM_EXERCISES) {
  if (ids.has(rec.id) || names.has(normName(rec.name))) continue
  catalog.push(rec)
  ids.add(rec.id)
  added++
}

await writeFile(OUT, JSON.stringify(catalog, null, 2))
console.log(`appended ${added} custom exercises → ${catalog.length} total`)
