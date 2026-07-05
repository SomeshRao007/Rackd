import { useEffect, useMemo, useState } from 'react'
import { GROUP_LABELS, SLUG_TO_GROUP, slugsForMuscles, type MuscleGroupId } from '../lib/muscles'
import { useSex, type Sex } from '../lib/sex'

// M8 anatomical body-map. Renders MuscleMap's vendored SVG paths (public/bodymap/paths.v1.json,
// MIT — see scripts/extract-bodymap.ts) as a male/female front+back figure. Two modes:
//   • heatmap  — pass `value(group)`→0..1 (+ optional `onSelect`); every slug's amber tracks its
//     group's intensity. This keeps the M6 API so MusclesView is unchanged.
//   • highlight — pass `highlight={primary,[secondary]}` (catalog muscle names) for an exercise
//     card: primary muscles full amber, secondary dimmer, everything else quiet base silhouette.
const AMBER = '#ff8a3d'
const BASE = '#2b3340'

type Muscle = { left: string[]; right: string[]; common: string[] }
type Figure = { viewBox: number[]; muscles: Record<string, Muscle> }
type Paths = { figures: Record<Sex, { front: Figure; back: Figure }> }

let cache: Paths | null = null
let inflight: Promise<Paths> | null = null
function useBodyPaths(): Paths | null {
  const [data, setData] = useState<Paths | null>(cache)
  useEffect(() => {
    if (cache) return
    let alive = true
    inflight ??= fetch('/bodymap/paths.v1.json').then((r) => r.json()).then((d: Paths) => (cache = d))
    inflight.then((d) => alive && setData(d))
    return () => { alive = false }
  }, [])
  return data
}

export function BodyMap({
  value,
  onSelect,
  highlight,
  sex,
}: {
  value?: (regionId: MuscleGroupId) => number
  onSelect?: (regionId: MuscleGroupId) => void
  highlight?: { primary: string[]; secondary?: string[] }
  sex?: Sex
}) {
  const paths = useBodyPaths()
  const pref = useSex()
  const who = sex ?? pref

  const hot = useMemo(() => new Set(highlight ? slugsForMuscles(highlight.primary) : []), [highlight])
  const warm = useMemo(() => new Set(highlight?.secondary ? slugsForMuscles(highlight.secondary) : []), [highlight])

  if (!paths) {
    return <div className="h-72 animate-pulse rounded-2xl border border-steel-800 bg-steel-900" aria-hidden />
  }

  const fig = paths.figures[who]
  const paint = (slug: string): { fill: string; opacity: number; group?: MuscleGroupId } => {
    if (highlight) {
      if (hot.has(slug)) return { fill: AMBER, opacity: 1 }
      if (warm.has(slug)) return { fill: AMBER, opacity: 0.4 }
      return { fill: BASE, opacity: 1 }
    }
    const group = SLUG_TO_GROUP[slug]
    if (group && value) return { fill: AMBER, opacity: 0.12 + 0.88 * Math.max(0, Math.min(1, value(group) || 0)), group }
    return { fill: BASE, opacity: 1 }
  }

  return (
    <div className="rounded-2xl border border-steel-800 bg-steel-900 p-3">
      <div className="grid grid-cols-2 gap-2">
        <Side data={fig.front} label="Front" paint={paint} onSelect={onSelect} />
        <Side data={fig.back} label="Back" paint={paint} onSelect={onSelect} />
      </div>
      {value && !highlight && <Legend />}
    </div>
  )
}

function Side({
  data, label, paint, onSelect,
}: {
  data: Figure
  label: string
  paint: (slug: string) => { fill: string; opacity: number; group?: MuscleGroupId }
  onSelect?: (regionId: MuscleGroupId) => void
}) {
  return (
    <figure className="m-0">
      <svg viewBox={data.viewBox.join(' ')} preserveAspectRatio="xMidYMid meet" width="100%"
        role="img" aria-label={`${label} muscle map`} className="block h-auto w-full">
        {Object.entries(data.muscles).map(([slug, rec]) => {
          const { fill, opacity, group } = paint(slug)
          const clickable = group && onSelect
          return (
            <g key={slug} fill={fill} fillOpacity={opacity} stroke="#0b0f17" strokeWidth={1.1}
              style={{ cursor: clickable ? 'pointer' : 'default' }}
              onClick={clickable ? () => onSelect!(group) : undefined}
              role={clickable ? 'button' : undefined}
              aria-label={group ? GROUP_LABELS[group] : undefined}>
              {group && <title>{GROUP_LABELS[group]}</title>}
              {[...rec.left, ...rec.right, ...rec.common].map((d, i) => <path key={i} d={d} />)}
            </g>
          )
        })}
      </svg>
      <figcaption className="mt-1 text-center text-[0.6rem] uppercase tracking-wide text-fog">{label}</figcaption>
    </figure>
  )
}

function Legend() {
  return (
    <div className="mt-2 flex items-center justify-center gap-1.5 text-[0.6rem] uppercase tracking-wide text-fog">
      <span>less</span>
      {[0.15, 0.4, 0.7, 1].map((o) => (
        <span key={o} className="inline-block size-3 rounded-sm" style={{ backgroundColor: AMBER, opacity: o }} />
      ))}
      <span>more</span>
    </div>
  )
}
