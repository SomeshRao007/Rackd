import { formatWeight, type Unit } from '../lib/units'
import type { SetLog } from '../db/schema'

/** One logged set. Optional onDelete renders a destructive affordance. */
export function SetRow({
  set,
  unit,
  index,
  onDelete,
}: {
  set: SetLog
  unit: Unit
  index: number
  onDelete?: (id: string) => void
}) {
  return (
    <li className="flex items-center gap-3 rounded-xl bg-steel-800 px-4 py-3">
      <span className="grid size-7 shrink-0 place-items-center rounded-md bg-steel-700 text-sm font-bold text-fog">
        {index + 1}
      </span>
      <span className="min-w-0 flex-1">
        <span className="nums block text-lg font-semibold">
          {formatWeight(set.weightKg, unit)}
          <span className="px-2 text-fog">×</span>
          {set.reps}
          <span className="pl-1 text-sm font-normal text-fog"> reps</span>
          {set.rir != null && <span className="pl-2 text-xs font-normal text-fog">@ RIR {set.rir}</span>}
        </span>
        {set.note && <span className="block truncate text-xs text-fog">{set.note}</span>}
      </span>
      {onDelete && (
        <button
          type="button"
          onClick={() => onDelete(set.id)}
          aria-label={`Delete set ${index + 1}`}
          className="grid size-9 shrink-0 place-items-center rounded-lg text-fog transition-colors hover:bg-steel-700 hover:text-amber focus-visible:outline-2 focus-visible:outline-amber"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
          </svg>
        </button>
      )}
    </li>
  )
}
