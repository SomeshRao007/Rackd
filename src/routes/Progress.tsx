import { useState } from 'react'
import { MusclesView } from './progress/MusclesView'
import { GoalsView } from './progress/GoalsView'
import { BodyView } from './progress/BodyView'

// M6 hub: three tracking sections behind one bottom-nav tab. Each view lives in its own file
// under progress/ so the features stay decoupled.
const TABS = [
  { id: 'muscles', label: 'Muscles' },
  { id: 'goals', label: 'Goals' },
  { id: 'body', label: 'Body' },
] as const
type TabId = (typeof TABS)[number]['id']

export function Progress() {
  const [tab, setTab] = useState<TabId>('muscles')
  return (
    <section>
      <h1 className="font-display text-3xl font-black tracking-tight">Progress</h1>
      <p className="mt-1 text-sm text-fog">Muscle coverage, goals, and body metrics.</p>

      <div role="tablist" aria-label="Progress section" className="mt-5 flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 rounded-xl py-2 text-sm font-semibold transition-colors ${
              tab === t.id ? 'bg-amber text-ink' : 'bg-steel-800 text-fog hover:text-chalk'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === 'muscles' && <MusclesView />}
        {tab === 'goals' && <GoalsView />}
        {tab === 'body' && <BodyView />}
      </div>
    </section>
  )
}
