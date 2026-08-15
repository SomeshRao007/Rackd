import type { ReactNode } from 'react'

/** One rung of Today's rail: WARM-UP, CHEST, SIDE DELTS, COOLDOWN.
 *  The eyebrow is StartDay's slot treatment; `meta` carries live state (sets logged, moves + time)
 *  rather than decoration, and goes green on the same signal a finished exercise row does. */
export function SectionHeader({
  label,
  meta,
  done,
  action,
}: {
  label: string
  meta?: string
  done?: boolean
  action?: ReactNode
}) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-3">
      <h2
        className={`truncate text-xs font-bold uppercase tracking-widest ${
          done ? 'text-green-400' : 'text-amber'
        }`}
      >
        {label}
      </h2>
      <div className="flex shrink-0 items-baseline gap-3">
        {meta && (
          <span className={`nums text-xs font-bold ${done ? 'text-green-400' : 'text-fog'}`}>{meta}</span>
        )}
        {action}
      </div>
    </div>
  )
}
