import { useSyncExternalStore } from 'react'

// Tiny global body-figure preference backed by localStorage, reactive across components.
// Drives which MuscleMap figure the BodyMap renders (see src/components/BodyMap.tsx).
export type Sex = 'male' | 'female'
const KEY = 'wa_sex'

const listeners = new Set<() => void>()
const getSex = (): Sex => (localStorage.getItem(KEY) as Sex) || 'male'
export function setSex(s: Sex) {
  localStorage.setItem(KEY, s)
  listeners.forEach((l) => l())
}
export function useSex(): Sex {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    getSex,
  )
}
