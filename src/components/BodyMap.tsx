import type { ReactNode } from 'react'
import { GROUP_LABELS, type MuscleGroupId } from '../lib/muscles'

// Reusable muscle-group heatmap (M6 pull-forward of the M8 body-map). A stylized front+back
// figure; each of the 6 groups is an addressable region whose amber fill tracks a 0..1 intensity
// from `value`. The API is generic over region ids so M8 can add a 17-muscle `regionSet` later.
// ponytail: simplified 6-group SVG; M8 swaps in a 17-muscle region set behind the same API (m6-deferred.md #3).
export function BodyMap({
  value,
  regionSet = 'group',
  onSelect,
}: {
  value: (regionId: MuscleGroupId) => number
  regionSet?: 'group' | 'muscle' // 'muscle' reserved for M8; M6 renders group regions
  onSelect?: (regionId: MuscleGroupId) => void
}) {
  void regionSet
  return (
    <div className="rounded-2xl border border-steel-800 bg-steel-900 p-3">
      <svg viewBox="0 0 240 210" width="100%" role="img" aria-label="Muscle coverage map" className="mx-auto max-w-xs">
        <Figure cx={62} back={false} value={value} onSelect={onSelect} />
        <Figure cx={178} back value={value} onSelect={onSelect} />
        <text x="62" y="205" textAnchor="middle" className="fill-fog" fontSize="9">Front</text>
        <text x="178" y="205" textAnchor="middle" className="fill-fog" fontSize="9">Back</text>
      </svg>
      <Legend />
    </div>
  )
}

function Figure({
  cx, back, value, onSelect,
}: {
  cx: number; back: boolean; value: (id: MuscleGroupId) => number; onSelect?: (id: MuscleGroupId) => void
}) {
  return (
    <g>
      {/* neutral head + neck */}
      <circle cx={cx} cy={16} r={10} fill="#1e2531" stroke="#2b3340" />
      <rect x={cx - 4} y={25} width={8} height={7} fill="#1e2531" stroke="#2b3340" />

      <R id="shoulders" value={value} onSelect={onSelect}>
        <ellipse cx={cx - 21} cy={42} rx={10} ry={8} />
        <ellipse cx={cx + 21} cy={42} rx={10} ry={8} />
      </R>

      <R id="arms" value={value} onSelect={onSelect}>
        <rect x={cx - 35} y={44} width={12} height={46} rx={6} />
        <rect x={cx + 23} y={44} width={12} height={46} rx={6} />
      </R>

      {back ? (
        <R id="back" value={value} onSelect={onSelect}>
          <rect x={cx - 19} y={40} width={38} height={52} rx={8} />
        </R>
      ) : (
        <>
          <R id="chest" value={value} onSelect={onSelect}>
            <rect x={cx - 18} y={40} width={36} height={24} rx={8} />
          </R>
          <R id="core" value={value} onSelect={onSelect}>
            <rect x={cx - 15} y={66} width={30} height={28} rx={6} />
          </R>
        </>
      )}

      <R id="legs" value={value} onSelect={onSelect}>
        <rect x={cx - 18} y={98} width={16} height={82} rx={7} />
        <rect x={cx + 2} y={98} width={16} height={82} rx={7} />
      </R>
    </g>
  )
}

// One addressable region: shapes tinted by intensity, clickable if onSelect is given.
function R({
  id, value, onSelect, children,
}: {
  id: MuscleGroupId; value: (id: MuscleGroupId) => number; onSelect?: (id: MuscleGroupId) => void; children: ReactNode
}) {
  const intensity = Math.max(0, Math.min(1, value(id) || 0))
  return (
    <g
      fill="#ff8a3d"
      fillOpacity={0.1 + 0.9 * intensity}
      stroke="#2b3340"
      strokeWidth={1}
      style={{ cursor: onSelect ? 'pointer' : 'default' }}
      onClick={onSelect ? () => onSelect(id) : undefined}
      role={onSelect ? 'button' : undefined}
      aria-label={onSelect ? GROUP_LABELS[id] : undefined}
    >
      <title>{GROUP_LABELS[id]}</title>
      {children}
    </g>
  )
}

function Legend() {
  return (
    <div className="mt-1 flex items-center justify-center gap-1.5 text-[0.6rem] uppercase tracking-wide text-fog">
      <span>less</span>
      {[0.15, 0.4, 0.7, 1].map((o) => (
        <span key={o} className="inline-block size-3 rounded-sm" style={{ backgroundColor: '#ff8a3d', opacity: o }} />
      ))}
      <span>more</span>
    </div>
  )
}
