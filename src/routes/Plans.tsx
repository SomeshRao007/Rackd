import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useRxData } from '../db/useRxData'
import type { Plan, PlanDay, Exercise, CustomExercise } from '../db/schema'
import { createPlan, deletePlan, adoptPlan, fetchSharedPlan, enrollPlan, unenrollPlan, substituteEquipment } from '../db/plans'
import { countByEquipment, type SubstitutionSummary } from '../lib/substitute'
import { parseSchedule, type PlanSchedule } from '../lib/schedule'
import { customToExercise } from '../db/customExercises'
import { CreateCustomExercise } from '../components/CreateCustomExercise'
import { ExerciseFilters } from '../components/ExerciseFilters'
import { filterExercises, equipmentOptionsOf, type ExerciseFilter } from '../lib/exerciseFilter'
import { usePrefs } from '../lib/prefs'

type StarterGoal = 'muscle-growth' | 'stay-active' | 'weight-loss'
type Starter = { id: string; goal: StarterGoal; name: string; description: string; days: PlanDay[] }
const GOAL_ORDER: StarterGoal[] = ['muscle-growth', 'stay-active', 'weight-loss']
const GOAL_LABEL: Record<StarterGoal, string> = {
  'muscle-growth': 'Muscle growth',
  'stay-active': 'Stay active',
  'weight-loss': 'Weight loss',
}
const parseDays = (p: Plan): PlanDay[] => {
  try {
    return JSON.parse(p.days) as PlanDay[]
  } catch {
    return []
  }
}

const plural = (n: number) => (n === 1 ? '' : 's')
const summaryText = (s: SubstitutionSummary): string =>
  s.replaced === 0
    ? `No swaps — no dumbbell equivalent found for ${s.kept} lift${plural(s.kept)}.`
    : `Swapped ${s.replaced} lift${plural(s.replaced)} to dumbbell` +
      (s.kept ? ` · ${s.kept} kept (no dumbbell equivalent)` : '') +
      '. Takes effect from your next session.'

export function Plans() {
  const { user, token } = useAuth()
  const userId = user?.id ?? ''
  const navigate = useNavigate()

  const plans = useRxData<Plan>(
    (db) => db.plans.find({ selector: { userId, deletedAt: null }, sort: [{ updatedAt: 'desc' }] }),
    [userId],
  )
  // Catalog map for the "use dumbbells instead" affordance (equipment per pool id).
  const exercises = useRxData<Exercise>((db) => db.exercises.find(), [])
  const exMap = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises])

  // Tab lives in the URL (?tab=exercises) so returning from an exercise detail (navigate(-1))
  // restores the Exercises tab instead of resetting to Plans. Toggle only the `tab` key so the
  // Exercises filter params (also in the URL) survive a tab switch.
  const [searchParams, setSearchParams] = useSearchParams()
  const view = searchParams.get('tab') === 'exercises' ? 'exercises' : 'plans'
  const setView = (v: 'plans' | 'exercises') =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (v === 'exercises') next.set('tab', 'exercises')
        else next.delete('tab')
        return next
      },
      { replace: true },
    )
  const [browsing, setBrowsing] = useState(false)
  const [enrolling, setEnrolling] = useState<Plan | null>(null)
  const [starters, setStarters] = useState<Starter[]>([])
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [flash, setFlash] = useState('')

  async function onSubstitute(p: Plan, count: number) {
    if (!confirm(`Replace ${count} barbell lift${plural(count)} in “${p.name || 'this plan'}” with dumbbell equivalents?`)) return
    setFlash(summaryText(await substituteEquipment(p.id, 'barbell', 'dumbbell')))
  }

  async function onNew() {
    const p = await createPlan(userId, 'New plan')
    navigate(`/app/plans/${p.id}`)
  }

  async function openStarters() {
    setBrowsing(true)
    if (starters.length === 0) {
      const res = await fetch('/catalog/starter-plans.v1.json')
      if (res.ok) setStarters(await res.json())
    }
  }

  async function onAdoptStarter(s: Starter) {
    const p = await adoptPlan(userId, { name: s.name, days: s.days })
    setBrowsing(false)
    navigate(`/app/plans/${p.id}`)
  }

  async function onAdoptCode() {
    const c = code.trim()
    if (!c || !token) return
    setBusy(true)
    setNotice('')
    const snap = await fetchSharedPlan(c, token).catch(() => null)
    setBusy(false)
    if (!snap) {
      setNotice('Could not find a plan for that code.')
      return
    }
    const p = await adoptPlan(userId, { name: snap.name, days: snap.days, shareCode: snap.shareCode })
    setCode('')
    navigate(`/app/plans/${p.id}`)
  }

  return (
    <section>
      <h1 className="font-display text-3xl font-black tracking-tight">Plans</h1>

      <div role="tablist" aria-label="View" className="mt-4 flex gap-2">
        {(['plans', 'exercises'] as const).map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={view === v}
            onClick={() => setView(v)}
            className={`flex-1 rounded-xl py-2 text-sm font-bold uppercase tracking-wide transition-colors ${
              view === v ? 'bg-amber text-ink' : 'bg-steel-800 text-fog hover:text-chalk'
            }`}
          >
            {v}
          </button>
        ))}
      </div>

      {view === 'exercises' ? (
        <ExercisesList />
      ) : (
      <>
      <p className="mt-4 text-sm text-fog">Build a split; exercises rotate across sessions.</p>

      {flash && (
        <p className="mt-4 rounded-lg border border-green-500/40 bg-green-500/10 px-3 py-2 text-sm text-green-300">
          {flash}
        </p>
      )}

      {plans.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-steel-700 px-4 py-8 text-center text-sm text-fog">
          No plans yet. Create one or adopt a starter below.
        </p>
      ) : (
        <ul className="mt-5 space-y-3">
          {plans.map((p) => {
            const days = parseDays(p)
            const isEnrolled = p.enrolledAt != null
            const barbellCount = countByEquipment(days, exMap, 'barbell')
            return (
              <li
                key={p.id}
                className={`rounded-2xl border p-4 ${isEnrolled ? 'border-amber bg-amber/5' : 'border-steel-800 bg-steel-900'}`}
              >
                <div className="flex items-center gap-2">
                  <Link to={`/app/plans/${p.id}`} className="min-w-0 flex-1 font-display text-lg font-bold hover:text-amber">
                    {p.name || 'Untitled plan'}
                    {isEnrolled && (
                      <span className="ml-2 inline-block translate-y-[-2px] rounded-full bg-amber px-2 py-0.5 align-middle text-[0.6rem] font-black uppercase tracking-wide text-ink">
                        Enrolled
                      </span>
                    )}
                  </Link>
                  <Link
                    to={`/app/plans/${p.id}`}
                    aria-label="Edit plan"
                    className="grid size-8 place-items-center rounded-lg text-fog transition-colors hover:bg-steel-800 hover:text-chalk"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                    </svg>
                  </Link>
                  <button
                    type="button"
                    aria-label="Delete plan"
                    onClick={() => {
                      if (confirm(`Delete “${p.name || 'this plan'}”?`)) void deletePlan(p.id)
                    }}
                    className="grid size-8 place-items-center rounded-lg text-fog transition-colors hover:bg-steel-800 hover:text-red-400"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
                    </svg>
                  </button>
                </div>
                {days.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {days.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => navigate(`/app/plans/${p.id}/start/${d.id}`)}
                        className="rounded-full bg-amber/15 px-3.5 py-1.5 text-sm font-bold text-amber transition-colors hover:bg-amber hover:text-ink"
                      >
                        Start {d.label}
                      </button>
                    ))}
                  </div>
                )}
                {isEnrolled ? (
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-fog">{scheduleSummary(p.schedule)}</p>
                    <div className="flex items-center gap-3">
                      {barbellCount > 0 && (
                        <button
                          type="button"
                          onClick={() => void onSubstitute(p, barbellCount)}
                          className="text-xs font-semibold text-fog underline-offset-2 transition-colors hover:text-chalk hover:underline"
                        >
                          Use dumbbells
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void unenrollPlan(p.id)}
                        className="text-xs font-semibold text-fog underline-offset-2 transition-colors hover:text-chalk hover:underline"
                      >
                        Unenroll
                      </button>
                    </div>
                  </div>
                ) : (
                  days.length > 0 && (
                    <>
                      <button
                        type="button"
                        onClick={() => setEnrolling(p)}
                        className="mt-3 w-full rounded-xl border border-amber/60 py-2 text-sm font-black uppercase tracking-wide text-amber transition-colors hover:bg-amber hover:text-ink"
                      >
                        Enroll
                      </button>
                      {barbellCount > 0 && (
                        <button
                          type="button"
                          onClick={() => void onSubstitute(p, barbellCount)}
                          className="mt-2 w-full text-center text-xs font-semibold text-fog underline-offset-2 transition-colors hover:text-chalk hover:underline"
                        >
                          Use dumbbells instead ({barbellCount} barbell lift{plural(barbellCount)})
                        </button>
                      )}
                    </>
                  )
                )}
              </li>
            )
          })}
        </ul>
      )}

      <div className="mt-6 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={onNew}
          className="rounded-xl bg-amber py-3 font-display font-black uppercase tracking-wide text-ink transition-colors hover:bg-amber-bright"
        >
          New plan
        </button>
        <button
          type="button"
          onClick={openStarters}
          className="rounded-xl border border-steel-700 py-3 font-display font-black uppercase tracking-wide text-chalk transition-colors hover:bg-steel-800"
        >
          Starters
        </button>
      </div>

      <div className="mt-4 rounded-xl border border-steel-800 bg-steel-900 p-3">
        <label className="block text-xs font-semibold uppercase tracking-wide text-fog">Adopt by share code</label>
        <div className="mt-2 flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Paste a code…"
            className="min-w-0 flex-1 rounded-lg border border-steel-700 bg-steel-950 px-3 py-2 text-sm text-chalk placeholder:text-steel-600 focus-visible:border-amber focus-visible:outline-none"
          />
          <button
            type="button"
            onClick={onAdoptCode}
            disabled={!code.trim() || busy}
            className="rounded-lg bg-steel-700 px-4 text-sm font-bold text-chalk transition-colors hover:bg-steel-600 disabled:opacity-50"
          >
            Adopt
          </button>
        </div>
        {notice && <p className="mt-2 text-sm text-red-400">{notice}</p>}
      </div>
      </>
      )}

      {browsing && (
        <StarterBrowser starters={starters} onAdopt={onAdoptStarter} onClose={() => setBrowsing(false)} />
      )}
      {enrolling && (
        <EnrollDialog
          plan={enrolling}
          barbellCount={countByEquipment(parseDays(enrolling), exMap, 'barbell')}
          onConfirm={async (schedule, useDumbbells) => {
            await enrollPlan(userId, enrolling.id, schedule)
            if (useDumbbells)
              setFlash(summaryText(await substituteEquipment(enrolling.id, 'barbell', 'dumbbell')))
            setEnrolling(null)
          }}
          onClose={() => setEnrolling(null)}
        />
      )}
    </section>
  )
}

// Mon-first weekday chips; values are Date.getDay() 0–6.
const WEEKDAYS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
]

function scheduleSummary(raw: string | null | undefined): string {
  const s = parseSchedule(raw)
  if (!s) return ''
  const names = WEEKDAYS.filter((w) => s.weekdays.includes(w.value)).map((w) => w.label)
  return `Trains ${names.join(' · ')}`
}

// Enrollment (M8.2): start date + training weekdays; plan days rotate across those dates on Today.
function EnrollDialog({
  plan,
  barbellCount,
  onConfirm,
  onClose,
}: {
  plan: Plan
  barbellCount: number
  onConfirm: (schedule: PlanSchedule, useDumbbells: boolean) => Promise<void>
  onClose: () => void
}) {
  const [start, setStart] = useState(() => new Date().toISOString().slice(0, 10))
  const [picked, setPicked] = useState<number[]>([])
  const [useDumbbells, setUseDumbbells] = useState(false)
  const toggle = (v: number) =>
    setPicked((cur) => (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]))

  return (
    <div className="fixed inset-0 z-30 grid place-items-center bg-ink/95 p-4 backdrop-blur">
      <div className="w-full max-w-sm rounded-2xl border border-steel-800 bg-steel-900 p-5">
        <h2 className="font-display text-xl font-black tracking-tight">Enroll in {plan.name || 'this plan'}</h2>
        <p className="mt-1 text-sm text-fog">
          Pick your training days — the plan's days rotate across them, and Today shows what's up next.
        </p>

        <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-fog">
          Starting
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-steel-700 bg-steel-950 px-3 py-2 text-base text-chalk [color-scheme:dark] focus-visible:border-amber focus-visible:outline-none"
          />
        </label>

        <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-fog">Training days</p>
        <div className="mt-1.5 grid grid-cols-7 gap-1">
          {WEEKDAYS.map((w) => {
            const active = picked.includes(w.value)
            return (
              <button
                key={w.value}
                type="button"
                onClick={() => toggle(w.value)}
                aria-pressed={active}
                className={`rounded-lg py-2 text-xs font-bold transition-colors ${
                  active ? 'bg-amber text-ink' : 'bg-steel-800 text-fog hover:text-chalk'
                }`}
              >
                {w.label}
              </button>
            )
          })}
        </div>

        {barbellCount > 0 && (
          <button
            type="button"
            aria-pressed={useDumbbells}
            onClick={() => setUseDumbbells((v) => !v)}
            className={`mt-4 w-full rounded-lg py-2 text-xs font-bold transition-colors ${
              useDumbbells ? 'bg-amber text-ink' : 'bg-steel-800 text-fog hover:text-chalk'
            }`}
          >
            Use dumbbells instead of barbell ({barbellCount} lift{plural(barbellCount)})
          </button>
        )}

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-steel-700 py-3 font-display font-black uppercase tracking-wide text-chalk transition-colors hover:bg-steel-800"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={picked.length === 0 || !start}
            onClick={() => void onConfirm({ start, weekdays: picked }, useDumbbells)}
            className="rounded-xl bg-amber py-3 font-display font-black uppercase tracking-wide text-ink transition-colors hover:bg-amber-bright disabled:opacity-50"
          >
            Enroll
          </button>
        </div>
      </div>
    </div>
  )
}

// Browsable exercise library (M8) — the Log tab's global search now lives under Plans. Every row
// opens the reusable ExerciseDetail (instructions ⇄ records). Catalog + the user's custom exercises
// (M8 R1) share the list; custom lifts are tagged and a "＋ Create custom" affordance seeds new ones.
function ExercisesList() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const userId = user?.id ?? ''
  const prefs = usePrefs()
  // Filters live in the URL (one param each) so opening an exercise and coming back — navigate(-1),
  // which restores the full previous URL — brings the filters back, just like the tab. Writes are
  // `replace: true` so per-keystroke edits don't flood the history stack, and preserve `tab`.
  const [searchParams, setSearchParams] = useSearchParams()
  const filter = useMemo<ExerciseFilter>(
    () => ({
      query: searchParams.get('q') ?? '',
      group: (searchParams.get('group') as ExerciseFilter['group']) || null,
      equip: searchParams.get('equip') || null,
      pattern: (searchParams.get('pattern') as ExerciseFilter['pattern']) || null,
      onlyCustom: searchParams.get('custom') === '1',
    }),
    [searchParams],
  )
  const setFilter = (patch: Partial<ExerciseFilter>) => {
    const next = { ...filter, ...patch }
    setSearchParams(
      (prev) => {
        const sp = new URLSearchParams(prev)
        const put = (k: string, v: string | null) => (v ? sp.set(k, v) : sp.delete(k))
        put('q', next.query || null)
        put('group', next.group)
        put('equip', next.equip)
        put('pattern', next.pattern)
        put('custom', next.onlyCustom ? '1' : null)
        return sp
      },
      { replace: true },
    )
  }
  const [creating, setCreating] = useState(false)

  const exercises = useRxData<Exercise>((db) => db.exercises.find(), [])
  const custom = useRxData<CustomExercise>(
    (db) => db.customexercises.find({ selector: { userId, deletedAt: null } }),
    [userId],
  )

  const customIds = useMemo(() => new Set(custom.map((c) => c.id)), [custom])
  const all = useMemo(() => [...custom.map(customToExercise), ...exercises], [custom, exercises])
  const equipmentOptions = useMemo(() => equipmentOptionsOf(all, prefs.customEquipment), [all, prefs.customEquipment])
  const matches = useMemo(() => filterExercises(all, filter, customIds), [all, filter, customIds])

  return (
    <div className="mt-4">
      <input
        type="search"
        inputMode="search"
        autoComplete="off"
        aria-label="Search exercises"
        placeholder="Bench, squat, curl…"
        value={filter.query}
        onChange={(e) => setFilter({ query: e.target.value })}
        className="w-full rounded-xl border border-steel-700 bg-steel-900 px-4 py-3 text-base text-chalk placeholder:text-steel-600 focus-visible:border-amber focus-visible:outline-none"
      />

      {/* Shared filter chips: one active muscle group + one equipment type + custom, combined with search. */}
      <ExerciseFilters filter={filter} setFilter={setFilter} equipmentOptions={equipmentOptions} />

      <button
        type="button"
        onClick={() => setCreating(true)}
        className="mt-3 w-full rounded-xl border border-dashed border-steel-700 px-4 py-3 text-sm font-semibold text-fog transition-colors hover:border-amber hover:text-amber"
      >
        ＋ Create custom exercise
      </button>
      <ul className="mt-3 space-y-1.5">
        {matches.map((e) => (
          <li key={e.id}>
            <button
              type="button"
              onClick={() => navigate(`/app/exercises/${encodeURIComponent(e.id)}`)}
              className="flex w-full items-center gap-3 rounded-xl bg-steel-900 px-4 py-3 text-left transition-colors hover:bg-steel-800 focus-visible:outline-2 focus-visible:outline-amber"
            >
              <span className="flex-1 font-semibold">{e.name}</span>
              {customIds.has(e.id) && (
                <span className="rounded-full bg-amber/15 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide text-amber">custom</span>
              )}
              <span className="text-xs uppercase tracking-wide text-fog">{e.primaryMuscles[0] ?? e.equipment}</span>
            </button>
          </li>
        ))}
        {matches.length === 0 && <li className="py-8 text-center text-sm text-fog">No lifts match.</li>}
      </ul>

      {creating && (
        <CreateCustomExercise
          initialName={filter.query}
          onCreated={(id) => navigate(`/app/exercises/${encodeURIComponent(id)}`)}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  )
}

function StarterBrowser({
  starters,
  onAdopt,
  onClose,
}: {
  starters: Starter[]
  onAdopt: (s: Starter) => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-ink/95 backdrop-blur">
      <div className="mx-auto flex h-full w-full max-w-lg flex-col px-4 pt-5">
        <div className="mb-3 flex items-center gap-3">
          <h2 className="flex-1 font-display text-xl font-black tracking-tight">Starter plans</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-9 place-items-center rounded-lg text-fog transition-colors hover:bg-steel-800 hover:text-chalk"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 space-y-6 overflow-y-auto pb-5">
          {starters.length === 0 && <p className="py-8 text-center text-sm text-fog">Loading…</p>}
          {GOAL_ORDER.map((g) => {
            const group = starters.filter((s) => s.goal === g)
            if (group.length === 0) return null
            return (
              <section key={g}>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-amber">{GOAL_LABEL[g]}</h3>
                <ul className="space-y-3">
                  {group.map((s) => (
                    <StarterCard key={s.id} starter={s} onAdopt={onAdopt} />
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// One starter card: name + 2–3 line description + day labels, plus a "timed circuit" hint when the
// plan has an interval day (M8.3).
function StarterCard({ starter, onAdopt }: { starter: Starter; onAdopt: (s: Starter) => void }) {
  const circuit = starter.days.find((d) => d.mode === 'circuit')
  return (
    <li className="rounded-2xl border border-steel-800 bg-steel-900 p-4">
      <div className="flex items-start gap-2">
        <span className="flex-1 font-display text-lg font-bold">{starter.name}</span>
        <button
          type="button"
          onClick={() => onAdopt(starter)}
          className="shrink-0 rounded-lg bg-amber px-4 py-2 text-sm font-black uppercase tracking-wide text-ink transition-colors hover:bg-amber-bright"
        >
          Adopt
        </button>
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-fog">{starter.description}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span className="text-steel-500">{starter.days.map((d) => d.label).join(' · ')}</span>
        {circuit && (
          <span className="nums rounded bg-amber/15 px-1.5 py-0.5 font-bold text-amber">
            timed · {circuit.workSec}s/{circuit.restSec}s ×{circuit.rounds}
          </span>
        )}
      </div>
    </li>
  )
}
