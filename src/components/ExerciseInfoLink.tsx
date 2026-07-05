import { Link } from 'react-router-dom'

// Small ⓘ affordance that opens an exercise's M8 detail page (instructions + records) from anywhere
// it appears in a list. stopPropagation so it works when it sits inside/next to a clickable row.
export function ExerciseInfoLink({ exerciseId, label }: { exerciseId: string; label?: string }) {
  return (
    <Link
      to={`/app/exercises/${exerciseId}`}
      onClick={(e) => e.stopPropagation()}
      aria-label={label ? `Info for ${label}` : 'Exercise info'}
      title="Instructions & records"
      className="grid size-7 shrink-0 place-items-center rounded-full text-fog transition-colors hover:bg-steel-800 hover:text-amber"
    >
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5" strokeLinecap="round" />
        <circle cx="12" cy="7.5" r="0.6" fill="currentColor" stroke="none" />
      </svg>
    </Link>
  )
}
