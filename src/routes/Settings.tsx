import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useRxData } from '../db/useRxData'
import type { Exclusion } from '../db/schema'
import { addExclusion, removeExclusion } from '../db/exclusions'
import {
  usePrefs, setEnvironment, setEquipment, setRestSec, setWorkSec, setMaxSets,
  ALL_EQUIPMENT, type Environment,
} from '../lib/prefs'

// The 17 catalog primaryMuscles (source: scripts/seed-catalog.ts output).
const MUSCLES = [
  'quadriceps', 'shoulders', 'abdominals', 'chest', 'hamstrings', 'triceps', 'biceps', 'lats',
  'middle back', 'calves', 'lower back', 'forearms', 'glutes', 'traps', 'adductors', 'neck', 'abductors',
]

// Duration presets for an exclusion; null = forever.
const DURATIONS: { label: string; days: number | null }[] = [
  { label: '3 days', days: 3 },
  { label: '1 week', days: 7 },
  { label: '2 weeks', days: 14 },
  { label: 'Forever', days: null },
]

const today = () => new Date().toISOString().slice(0, 10)
const daysLeft = (until: string) =>
  Math.max(0, Math.round((Date.parse(until + 'T00:00:00') - Date.parse(today() + 'T00:00:00')) / 86400000))

export function Settings() {
  const { user } = useAuth()
  const userId = user?.id ?? ''
  const prefs = usePrefs()

  const exclusions = useRxData<Exclusion>(
    (db) => db.exclusions.find({ selector: { userId, deletedAt: null } }),
    [userId],
  )
  const active = exclusions.filter((e) => e.until == null || e.until >= today())

  const toggleEquip = (item: string) =>
    setEquipment(
      prefs.equipment.includes(item)
        ? prefs.equipment.filter((e) => e !== item)
        : [...prefs.equipment, item],
    )

  return (
    <section className="pb-12">
      <Link to="/app/today" className="-ml-1 mb-3 flex items-center gap-1 text-sm font-semibold text-fog hover:text-chalk">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="m15 18-6-6 6-6" />
        </svg>
        Back
      </Link>
      <h1 className="font-display text-3xl font-black tracking-tight">Settings</h1>

      {/* Environment */}
      <h2 className="mt-6 mb-2 text-sm font-bold uppercase tracking-wider text-fog">Environment</h2>
      <div role="group" aria-label="Environment" className="flex overflow-hidden rounded-xl border border-steel-700 text-sm font-bold">
        {(['home', 'gym'] as Environment[]).map((env) => (
          <button
            key={env}
            type="button"
            onClick={() => setEnvironment(env)}
            aria-pressed={prefs.environment === env}
            className={`flex-1 py-3 capitalize transition-colors ${prefs.environment === env ? 'bg-amber text-ink' : 'text-fog hover:text-chalk'}`}
          >
            {env}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-xs text-fog">Picking an environment pre-checks its usual kit — tweak below.</p>

      {/* Equipment */}
      <h2 className="mt-6 mb-2 text-sm font-bold uppercase tracking-wider text-fog">Available equipment</h2>
      <div className="flex flex-wrap gap-2">
        {ALL_EQUIPMENT.map((item) => {
          const on = prefs.equipment.includes(item)
          return (
            <button
              key={item}
              type="button"
              onClick={() => toggleEquip(item)}
              aria-pressed={on}
              className={`rounded-lg px-3 py-2 text-sm font-semibold capitalize transition-colors ${on ? 'bg-amber text-ink' : 'bg-steel-800 text-fog hover:text-chalk'}`}
            >
              {item}
            </button>
          )
        })}
      </div>
      <p className="mt-1.5 text-xs text-fog">Generation only suggests exercises you can do. Bodyweight always counts.</p>

      {/* Workout timing — calibrates the Start-day time budget */}
      <h2 className="mt-7 mb-2 text-sm font-bold uppercase tracking-wider text-fog">Workout timing</h2>
      <div className="space-y-2">
        <NumberPref label="Rest between sets" value={prefs.restSec} onChange={setRestSec} suffix="sec" />
        <NumberPref label="Working set time" value={prefs.workSec} onChange={setWorkSec} suffix="sec" />
        <NumberPref label="Max sets per exercise" value={prefs.maxSets} onChange={setMaxSets} suffix="sets" step="1" min="1" />
      </div>
      <p className="mt-1.5 text-xs text-fog">
        Your real per-set timing. The Start-day time budget uses rest + set time to decide how many
        sets fit, up to the max above. Reps are set by exercise type (heavy lifts lower, isolation higher).
      </p>

      {/* Exclusions */}
      <h2 className="mt-7 mb-2 text-sm font-bold uppercase tracking-wider text-fog">Resting / avoiding</h2>
      <AddExclusion userId={userId} existing={active} />
      {active.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {active.map((e) => (
            <li key={e.id} className="flex items-center gap-3 rounded-xl border border-steel-800 bg-steel-900 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold capitalize">{e.label}</span>
                <span className="text-xs uppercase tracking-wide text-fog">
                  {e.kind} · {e.until == null ? 'forever' : `${daysLeft(e.until)} days left`}
                </span>
              </span>
              <button
                type="button"
                onClick={() => void removeExclusion(e.id)}
                className="shrink-0 rounded-lg bg-steel-800 px-3 py-2 text-xs font-bold uppercase tracking-wide text-fog hover:text-chalk"
              >
                End now
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 rounded-xl border border-dashed border-steel-700 px-4 py-6 text-center text-sm text-fog">
          Nothing excluded. Rest a muscle group here, or tap “Rest” on any exercise.
        </p>
      )}
    </section>
  )
}

function NumberPref({
  label, value, onChange, suffix, step = '5', min = '0',
}: { label: string; value: number; onChange: (n: number) => void; suffix: string; step?: string; min?: string }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-xl border border-steel-800 bg-steel-900 px-4 py-3">
      <span className="text-sm font-semibold uppercase tracking-wide text-fog">{label}</span>
      <span className="flex items-baseline gap-1.5">
        <input
          type="number"
          inputMode="numeric"
          min={min}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          aria-label={`${label} in ${suffix}`}
          className="nums w-16 bg-transparent text-right text-2xl font-black text-chalk outline-none"
        />
        <span className="text-sm font-semibold text-fog">{suffix}</span>
      </span>
    </label>
  )
}

function AddExclusion({ userId, existing }: { userId: string; existing: Exclusion[] }) {
  const [muscle, setMuscle] = useState('')
  const blocked = new Set(existing.filter((e) => e.kind === 'muscle').map((e) => e.value))

  const add = (days: number | null) => {
    if (!muscle) return
    void addExclusion(userId, 'muscle', muscle, muscle, days)
    setMuscle('')
  }

  return (
    <div className="rounded-xl border border-steel-800 bg-steel-900 p-3">
      <select
        value={muscle}
        onChange={(e) => setMuscle(e.target.value)}
        aria-label="Muscle group to rest"
        className="w-full rounded-lg border border-steel-700 bg-steel-800 px-3 py-2.5 text-sm font-semibold capitalize text-chalk outline-none focus-visible:border-amber"
      >
        <option value="">Rest a muscle group…</option>
        {MUSCLES.filter((m) => !blocked.has(m)).map((m) => (
          <option key={m} value={m} className="capitalize">{m}</option>
        ))}
      </select>
      {muscle && (
        <div className="mt-2 flex flex-wrap gap-2">
          {DURATIONS.map((d) => (
            <button
              key={d.label}
              type="button"
              onClick={() => add(d.days)}
              className="rounded-lg bg-steel-800 px-3 py-2 text-sm font-semibold text-fog hover:bg-amber hover:text-ink"
            >
              {d.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
