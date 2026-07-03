/** Optional reps-in-reserve input (M5): six one-tap chips 0–5; tapping the selected chip clears it. */
export function RirChips({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-fog">Reps in reserve</span>
      <span className="flex gap-1.5">
        {[0, 1, 2, 3, 4, 5].map((n) => {
          const active = value === n
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(active ? null : n)}
              aria-pressed={active}
              className={`nums grid size-8 place-items-center rounded-lg text-sm font-bold transition-colors ${
                active ? 'bg-amber text-ink' : 'bg-steel-800 text-fog hover:text-chalk'
              }`}
            >
              {n}
            </button>
          )
        })}
      </span>
    </div>
  )
}
