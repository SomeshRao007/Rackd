import type { ReactNode } from 'react'
import { GROUP_IDS, GROUP_LABELS } from '../lib/muscles'
import { PATTERN_IDS, PATTERN_LABELS, type ExerciseFilter } from '../lib/exerciseFilter'

export function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition-colors ${
        active ? 'bg-amber text-ink' : 'bg-steel-800 text-fog hover:text-chalk'
      }`}
    >
      {children}
    </button>
  )
}

// The shared filter-chip rows: an optional Custom toggle + one active muscle group + one equipment
// type. Lives in a `max-w-lg px-4` container in both callers, so the -mx-4/px-4 bleed lines up.
export function ExerciseFilters({
  filter,
  setFilter,
  equipmentOptions,
  showCustom = true,
}: {
  filter: ExerciseFilter
  setFilter: (patch: Partial<ExerciseFilter>) => void
  equipmentOptions: string[]
  showCustom?: boolean
}) {
  const { group, equip, pattern, onlyCustom } = filter
  return (
    <>
      <div className="mt-3 -mx-4 flex gap-2 overflow-x-auto px-4 pb-1" style={{ scrollbarWidth: 'none' }}>
        {showCustom && (
          <FilterChip active={onlyCustom} onClick={() => setFilter({ onlyCustom: !onlyCustom })}>
            Custom
          </FilterChip>
        )}
        {GROUP_IDS.map((g) => (
          <FilterChip key={g} active={group === g} onClick={() => setFilter({ group: group === g ? null : g })}>
            {GROUP_LABELS[g]}
          </FilterChip>
        ))}
      </div>
      {/* Movement pattern / training style — a cross-cut of the muscle groups (M8.3). */}
      <div className="mt-2 -mx-4 flex gap-2 overflow-x-auto px-4 pb-1" style={{ scrollbarWidth: 'none' }}>
        {PATTERN_IDS.map((pat) => (
          <FilterChip key={pat} active={pattern === pat} onClick={() => setFilter({ pattern: pattern === pat ? null : pat })}>
            {PATTERN_LABELS[pat]}
          </FilterChip>
        ))}
      </div>
      {equipmentOptions.length > 0 && (
        <div className="mt-2 -mx-4 flex gap-2 overflow-x-auto px-4 pb-1" style={{ scrollbarWidth: 'none' }}>
          {equipmentOptions.map((eq) => (
            <FilterChip key={eq} active={equip === eq} onClick={() => setFilter({ equip: equip === eq ? null : eq })}>
              {eq}
            </FilterChip>
          ))}
        </div>
      )}
    </>
  )
}
