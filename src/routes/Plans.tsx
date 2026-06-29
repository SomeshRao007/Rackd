import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useRxData } from '../db/useRxData'
import type { Plan, PlanDay } from '../db/schema'
import { createPlan, deletePlan, adoptPlan, fetchSharedPlan } from '../db/plans'

type Starter = { id: string; name: string; days: PlanDay[] }
const parseDays = (p: Plan): PlanDay[] => {
  try {
    return JSON.parse(p.days) as PlanDay[]
  } catch {
    return []
  }
}

export function Plans() {
  const { user, token } = useAuth()
  const userId = user?.id ?? ''
  const navigate = useNavigate()

  const plans = useRxData<Plan>(
    (db) => db.plans.find({ selector: { userId, deletedAt: null }, sort: [{ updatedAt: 'desc' }] }),
    [userId],
  )

  const [browsing, setBrowsing] = useState(false)
  const [starters, setStarters] = useState<Starter[]>([])
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

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
      <p className="mt-1 text-sm text-fog">Build a split; exercises rotate across sessions.</p>

      {plans.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-steel-700 px-4 py-8 text-center text-sm text-fog">
          No plans yet. Create one or adopt a starter below.
        </p>
      ) : (
        <ul className="mt-5 space-y-3">
          {plans.map((p) => {
            const days = parseDays(p)
            return (
              <li key={p.id} className="rounded-2xl border border-steel-800 bg-steel-900 p-4">
                <div className="flex items-center gap-2">
                  <Link to={`/app/plans/${p.id}`} className="flex-1 font-display text-lg font-bold hover:text-amber">
                    {p.name || 'Untitled plan'}
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

      {browsing && (
        <StarterBrowser starters={starters} onAdopt={onAdoptStarter} onClose={() => setBrowsing(false)} />
      )}
    </section>
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
        <ul className="flex-1 space-y-3 overflow-y-auto pb-5">
          {starters.length === 0 && <li className="py-8 text-center text-sm text-fog">Loading…</li>}
          {starters.map((s) => (
            <li key={s.id} className="rounded-2xl border border-steel-800 bg-steel-900 p-4">
              <div className="flex items-center gap-2">
                <span className="flex-1 font-display text-lg font-bold">{s.name}</span>
                <button
                  type="button"
                  onClick={() => onAdopt(s)}
                  className="rounded-lg bg-amber px-4 py-2 text-sm font-black uppercase tracking-wide text-ink transition-colors hover:bg-amber-bright"
                >
                  Adopt
                </button>
              </div>
              <p className="mt-1 text-sm text-fog">{s.days.map((d) => d.label).join(' · ')}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
