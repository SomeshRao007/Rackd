import { useMemo, useState } from 'react'
import { mediaSources } from '../lib/exerciseMedia'

/** Square thumbnail for an exercise row. Still photo first, animation as fallback, then a glyph —
 *  so the row keeps its height for the handful of lifts with no artwork at all.
 *  `loading="lazy"` is what makes this affordable in a 2,000-row list: the browser fetches only
 *  what's near the viewport, so scrolling costs a screenful of ~95KB images, not the whole catalog. */
export function ExerciseThumb({
  ex,
  className = 'size-16',
}: {
  ex: { gifId?: string | null; images?: string[] }
  className?: string
}) {
  const sources = useMemo(() => mediaSources(ex, 'still'), [ex])
  const [i, setI] = useState(0)
  const current = sources[i]

  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center overflow-hidden rounded-lg bg-steel-800 ${className}`}
    >
      {current ? (
        <img
          key={current.url}
          src={current.url}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setI((n) => n + 1)}
          className="size-full object-cover"
        />
      ) : (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-steel-600">
          <path d="M6 6v12M18 6v12M3 9v6M21 9v6M6 12h12" />
        </svg>
      )}
    </span>
  )
}
