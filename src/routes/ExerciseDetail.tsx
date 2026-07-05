import { useMemo, useState, type ReactNode } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useRxData } from '../db/useRxData'
import type { Exercise, SetLog, CustomExercise } from '../db/schema'
import { BodyMap } from '../components/BodyMap'
import { customToExercise } from '../db/customExercises'
import { useUnit, formatWeight, type Unit } from '../lib/units'
import { epley1RM } from '../lib/lifting'

// M8 reusable exercise detail (R9). Instructions ⇄ Records is a free two-way toggle (not a
// sequence); Instructions is the landing view. The body-map lights this exercise's muscles, so
// catalog and custom exercises alike get their visual for free. Reachable from anywhere via
// /app/exercises/:id.
type Tab = 'instructions' | 'records'

export function ExerciseDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const userId = user?.id ?? ''
  const unit = useUnit()
  const [tab, setTab] = useState<Tab>('instructions')

  // Unified lookup: catalog first, then the user's custom exercises (ids never collide — slug vs UUID).
  const found = useRxData<Exercise>((db) => db.exercises.find({ selector: { id } }), [id])
  const foundCustom = useRxData<CustomExercise>((db) => db.customexercises.find({ selector: { id } }), [id])
  const ex = found[0] ?? (foundCustom[0] ? customToExercise(foundCustom[0]) : null)

  const sets = useRxData<SetLog>(
    (db) => db.setlogs.find({ selector: { userId, exerciseId: id, deletedAt: null }, sort: [{ createdAt: 'desc' }] }),
    [userId, id],
  )

  return (
    <section className="pb-10">
      <button
        type="button"
        onClick={() => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/app/today'))}
        className="-ml-1 mb-3 flex items-center gap-1 text-sm font-semibold text-fog hover:text-chalk"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="m15 18-6-6 6-6" />
        </svg>
        Back
      </button>

      {!ex ? (
        <p className="mt-10 text-center text-sm text-fog">Loading…</p>
      ) : (
        <>
          <h1 className="font-display text-3xl font-black tracking-tight">{ex.name}</h1>
          {ex.equipment && <p className="mt-1 text-sm capitalize text-fog">{ex.equipment}</p>}

          <div className="mt-4">
            <BodyMap highlight={{ primary: ex.primaryMuscles, secondary: ex.secondaryMuscles }} />
          </div>

          <div role="tablist" aria-label="Exercise info" className="mt-5 flex gap-2">
            {(['instructions', 'records'] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={`flex-1 rounded-xl py-2.5 text-sm font-bold uppercase tracking-wide transition-colors ${
                  tab === t ? 'bg-amber text-ink' : 'bg-steel-800 text-fog hover:text-chalk'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {tab === 'instructions' ? <Instructions ex={ex} /> : <Records sets={sets} unit={unit} />}
        </>
      )}
    </section>
  )
}

function Instructions({ ex }: { ex: Exercise }) {
  const yt = `https://www.youtube.com/results?search_query=${encodeURIComponent(`${ex.name} proper form`)}`
  const secondary = ex.secondaryMuscles ?? []
  const instructions = ex.instructions ?? []
  return (
    <div className="mt-5 space-y-6">
      <div className="rounded-2xl border border-steel-800 bg-steel-900 p-4">
        <Label>Focus area</Label>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {ex.primaryMuscles.map((m) => <Chip key={m} text={m} />)}
          {secondary.map((m) => <Chip key={m} text={m} dim />)}
        </div>
        {ex.equipment && (
          <>
            <Label className="mt-4">Equipment</Label>
            <p className="mt-1 text-sm font-semibold capitalize text-chalk">{ex.equipment}</p>
          </>
        )}
      </div>

      {instructions.length > 0 && (
        <div>
          <Label>How to perform</Label>
          <ol className="mt-2 space-y-3">
            {instructions.map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-steel-800 text-xs font-black text-amber">{i + 1}</span>
                <p className="text-sm leading-relaxed text-chalk">{step}</p>
              </li>
            ))}
          </ol>
        </div>
      )}

      <a
        href={yt}
        target="_blank"
        rel="noreferrer"
        className="flex items-center justify-center gap-2 rounded-xl border border-steel-700 py-3 text-sm font-bold text-chalk transition-colors hover:border-amber hover:text-amber"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
        Watch on YouTube
      </a>
    </div>
  )
}

function Records({ sets, unit }: { sets: SetLog[]; unit: Unit }) {
  const byDate = useMemo(() => {
    const map = new Map<string, SetLog[]>()
    for (const s of sets) {
      const d = s.createdAt.slice(0, 10)
      ;(map.get(d) ?? map.set(d, []).get(d)!).push(s)
    }
    return [...map.entries()] // sets came in createdAt desc → dates already newest-first
  }, [sets])

  if (sets.length === 0) {
    return (
      <p className="mt-8 rounded-2xl border border-dashed border-steel-700 px-6 py-10 text-center text-sm text-fog">
        No sets logged for this lift yet. Log it from Today and your records show up here.
      </p>
    )
  }

  const heaviest = Math.max(...sets.map((s) => s.weightKg))
  const bestE1rm = Math.max(...sets.map((s) => epley1RM(s.weightKg, s.reps, s.rir ?? 0)))

  return (
    <div className="mt-5 space-y-6">
      <div className="grid grid-cols-3 gap-3">
        <Stat value={formatWeight(heaviest, unit)} label="heaviest" />
        <Stat value={formatWeight(bestE1rm, unit)} label="best e1RM" />
        <Stat value={sets.length} label="total sets" />
      </div>

      <div className="space-y-4">
        {byDate.map(([date, daySets]) => (
          <div key={date}>
            <h3 className="mb-1.5 text-sm font-bold text-chalk">
              {new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
            </h3>
            <ul className="space-y-1.5">
              {[...daySets].reverse().map((s, i) => (
                <li key={s.id} className="flex items-center justify-between rounded-xl bg-steel-900 px-4 py-2.5 text-sm">
                  <span className="text-fog">Set {i + 1}</span>
                  <span className="nums font-semibold text-chalk">
                    {formatWeight(s.weightKg, unit)} × {s.reps}
                    {s.rir != null && <span className="ml-2 text-fog">RIR {s.rir}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}

function Label({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`text-xs font-bold uppercase tracking-wider text-fog ${className}`}>{children}</p>
}

function Chip({ text, dim }: { text: string; dim?: boolean }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${dim ? 'bg-steel-800 text-fog' : 'bg-amber/15 text-amber'}`}>
      {text}
    </span>
  )
}

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="rounded-xl bg-steel-900 px-2 py-3 text-center">
      <div className="nums font-display text-lg font-black text-amber">{value}</div>
      <div className="mt-0.5 text-[0.65rem] uppercase tracking-wide text-fog">{label}</div>
    </div>
  )
}
