import { useSyncExternalStore } from 'react'

export type Unit = 'kg' | 'lb'
const KG_PER_LB = 0.45359237
const KEY = 'wa_unit'

export const kgToUnit = (kg: number, unit: Unit): number =>
  unit === 'kg' ? kg : kg / KG_PER_LB
export const unitToKg = (value: number, unit: Unit): number =>
  unit === 'kg' ? value : value * KG_PER_LB

/** Round for display (0.5 kg / 1 lb granularity is plenty for a barbell). */
export const formatWeight = (kg: number, unit: Unit): string =>
  `${Math.round(kgToUnit(kg, unit) * 2) / 2} ${unit}`

/**
 * One logged set's LOAD. Bodyweight sets carry 0 kg by design (M8.6) — rendering that as
 * "0 kg × 12" reads as missing data, so they say "BW" instead.
 * Deliberately NOT folded into formatWeight: session volume totals, bar weight, PR values and
 * bodyweight metrics all legitimately show 0 kg and must never say "BW".
 */
export const formatLoad = (kg: number, unit: Unit): string =>
  kg > 0 ? formatWeight(kg, unit) : 'BW'

// Tiny global unit preference backed by localStorage, reactive across components.
const listeners = new Set<() => void>()
const getUnit = (): Unit => (localStorage.getItem(KEY) as Unit) || 'kg'
export function setUnit(u: Unit) {
  localStorage.setItem(KEY, u)
  listeners.forEach((l) => l())
}
export function useUnit(): Unit {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    getUnit,
  )
}
