// Exercise imagery comes from two merged sources and neither covers the whole catalog: 873 lifts
// carry static demo photos (free-exercise-db, GitHub raw) and 1,287 carry an ExerciseDB animation
// id — only 133 have both, and 15 have nothing. So every surface that shows a picture needs the
// same ordered-fallback walk, which is why this lives here instead of in one component.
// Media is HOTLINKED and therefore online-only; callers must degrade quietly when it 404s.
export const GIF_BASE = 'https://static.exercisedb.dev/media/'

export type MediaSource = { url: string; animated: boolean }

/**
 * Ordered image candidates for an exercise; callers advance on error.
 * `prefer: 'still'` puts the photo first — right for a scrolling list, where a 64px thumbnail only
 * has to be recognisable and a wall of animations would burn CPU. `'animated'` leads with the GIF,
 * which is what the detail page wants: there the movement IS the content.
 */
export function mediaSources(
  ex: { gifId?: string | null; images?: string[] },
  prefer: 'animated' | 'still' = 'animated',
): MediaSource[] {
  const gif: MediaSource[] = ex.gifId ? [{ url: GIF_BASE + ex.gifId + '.gif', animated: true }] : []
  const stills: MediaSource[] = (ex.images ?? []).map((url) => ({ url, animated: false }))
  return prefer === 'still' ? [...stills, ...gif] : [...gif, ...stills]
}
