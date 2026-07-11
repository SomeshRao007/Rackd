import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { useRxData } from '../../db/useRxData'
import type { BodyMetric } from '../../db/schema'
import { logBodyMetric } from '../../db/metrics'
import { useUnit, formatWeight, kgToUnit, unitToKg } from '../../lib/units'
import { ageFromDob } from '../../lib/dates'

const MEASURES = ['waist', 'chest', 'arms', 'thighs', 'hips'] as const
const today = () => new Date().toISOString().slice(0, 10)

export function BodyView() {
  const { user } = useAuth()
  const userId = user?.id ?? ''
  const unit = useUnit()

  const metrics = useRxData<BodyMetric>(
    (db) => db.bodymetrics.find({ selector: { userId, deletedAt: null }, sort: [{ date: 'asc' }] }),
    [userId],
  )

  const age = user?.dob ? ageFromDob(user.dob) : null

  const [date, setDate] = useState(today)
  const [weight, setWeight] = useState('')
  const [measures, setMeasures] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const withWeight = metrics.filter((m) => m.weightKg != null)
  const latest = withWeight.at(-1)
  const prev = withWeight.at(-2)
  const deltaKg = latest && prev ? latest.weightKg! - prev.weightKg! : null

  async function save() {
    if (!userId) return
    setSaving(true)
    const w = weight.trim() ? unitToKg(Number(weight), unit) : null
    const m: Record<string, number> = {}
    for (const key of MEASURES) {
      const v = measures[key]?.trim()
      if (v) m[key] = Number(v)
    }
    await logBodyMetric({ userId, date, weightKg: w, measurements: m })
    setWeight('')
    setMeasures({})
    setSaving(false)
  }

  return (
    <div className="space-y-6">
      <section className="flex items-center justify-between rounded-2xl border border-steel-800 bg-steel-900 p-4">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide text-fog">Profile</div>
          <div className="truncate font-display text-2xl font-black text-chalk">{user?.name || 'Athlete'}</div>
        </div>
        {age != null ? (
          <div className="shrink-0 text-right">
            <div className="nums font-display text-3xl font-black text-amber">{age}</div>
            <div className="text-xs uppercase tracking-wide text-fog">years old</div>
          </div>
        ) : (
          <Link to="/app/settings" className="shrink-0 text-sm font-bold text-amber hover:underline">
            Add date of birth
          </Link>
        )}
      </section>

      {latest ? (
        <section className="rounded-2xl border border-steel-800 bg-steel-900 p-4">
          <div className="flex items-end justify-between">
            <div>
              <div className="text-xs uppercase tracking-wide text-fog">Current weight</div>
              <div className="nums font-display text-4xl font-black text-chalk">
                {formatWeight(latest.weightKg!, unit)}
              </div>
            </div>
            {deltaKg != null && Math.abs(deltaKg) > 0.001 && (
              <div className={`nums text-sm font-bold ${deltaKg < 0 ? 'text-amber' : 'text-fog'}`}>
                {deltaKg < 0 ? '▼' : '▲'} {formatWeight(Math.abs(deltaKg), unit)}
              </div>
            )}
          </div>
          <Sparkline values={withWeight.map((m) => kgToUnit(m.weightKg!, unit))} />
        </section>
      ) : (
        <div className="rounded-2xl border border-dashed border-steel-700 px-6 py-10 text-center text-fog">
          Log your first weigh-in to start tracking.
        </div>
      )}

      <LatestMeasurements latest={metrics.at(-1)} />

      <section>
        <h2 className="font-display text-lg font-black text-chalk">Log a weigh-in</h2>
        <div className="mt-3 space-y-3">
          <label className="flex items-center justify-between rounded-xl bg-steel-800 px-3 py-2 text-sm text-chalk">
            <span className="text-fog">Date</span>
            <input
              type="date"
              value={date}
              max={today()}
              onChange={(e) => setDate(e.target.value)}
              className="nums bg-transparent text-right text-chalk outline-none"
            />
          </label>

          <label className="block rounded-xl bg-steel-800 px-3 py-3">
            <span className="block text-center text-xs font-semibold uppercase tracking-wide text-fog">
              Weight ({unit})
            </span>
            <input
              type="number" inputMode="decimal" step="0.5" min="0" placeholder="0"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className="nums mt-1 w-full bg-transparent text-center text-4xl font-black text-chalk outline-none placeholder:text-steel-700"
            />
          </label>

          <div className="grid grid-cols-3 gap-2">
            {MEASURES.map((key) => (
              <label key={key} className="rounded-xl bg-steel-800 px-2 py-2">
                <span className="block text-center text-[0.65rem] font-semibold uppercase tracking-wide text-fog">
                  {key} (cm)
                </span>
                <input
                  type="number" inputMode="decimal" step="0.5" min="0" placeholder="0"
                  value={measures[key] ?? ''}
                  onChange={(e) => setMeasures((m) => ({ ...m, [key]: e.target.value }))}
                  className="nums mt-1 w-full bg-transparent text-center text-2xl font-black text-chalk outline-none placeholder:text-steel-700"
                />
              </label>
            ))}
          </div>

          <button
            type="button"
            onClick={save}
            disabled={saving || (!weight.trim() && !MEASURES.some((k) => measures[k]?.trim()))}
            className="w-full rounded-xl bg-amber py-4 font-display text-lg font-black uppercase tracking-wide text-ink transition-colors hover:bg-amber-bright disabled:bg-steel-700 disabled:text-fog"
          >
            Save
          </button>
        </div>
      </section>
    </div>
  )
}

function LatestMeasurements({ latest }: { latest: BodyMetric | undefined }) {
  const entries = useMemo(() => {
    if (!latest?.measurements) return []
    const m = JSON.parse(latest.measurements) as Record<string, number>
    return MEASURES.filter((k) => m[k] != null).map((k) => [k, m[k]] as const)
  }, [latest])
  if (!entries.length) return null
  return (
    <section className="rounded-2xl border border-steel-800 bg-steel-900 p-4">
      <h2 className="font-display text-lg font-black text-chalk">Latest measurements</h2>
      <ul className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
        {entries.map(([k, v]) => (
          <li key={k} className="flex justify-between">
            <span className="capitalize text-fog">{k}</span>
            <span className="nums text-chalk">{v} cm</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

// Hand-rolled trend line — no chart dep. Scales the last ~12 points to the box.
function Sparkline({ values }: { values: number[] }) {
  const pts = values.slice(-12)
  if (pts.length < 2) return null
  const W = 300, H = 64, P = 6
  const min = Math.min(...pts), max = Math.max(...pts)
  const span = max - min || 1
  const x = (i: number) => P + (i / (pts.length - 1)) * (W - 2 * P)
  const y = (v: number) => H - P - ((v - min) / span) * (H - 2 * P)
  const d = pts.map((v, i) => `${x(i)},${y(v)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="mt-3" preserveAspectRatio="none" role="img" aria-label="Weight trend">
      <polyline points={d} fill="none" stroke="#ff8a3d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(pts.length - 1)} cy={y(pts.at(-1)!)} r="3" fill="#ffae5e" />
    </svg>
  )
}
