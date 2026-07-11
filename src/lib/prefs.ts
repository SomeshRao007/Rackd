import { useSyncExternalStore } from 'react'

// Per-device generation preferences (ponytail: localStorage, per-device — equipment is contextual
// home-vs-gym, so it shouldn't follow you across devices; see m4-deferred #3).
export type Environment = 'home' | 'gym'
export type Prefs = {
  environment: Environment
  equipment: string[]
  customEquipment: string[] // user-added equipment types beyond the built-in 12
  budgetMin: number
  barKg: number
  restSec: number // rest interval between sets — feeds the time-budget estimate
  workSec: number // rough time to perform one working set
  maxSets: number // ceiling on sets per exercise the time budget will assign
}

// The 12 catalog equipment values (source: scripts/seed-catalog.ts output). 'body only' + ''
// (empty) need nothing, so they're always implicitly available regardless of selection.
export const ALL_EQUIPMENT = [
  'barbell', 'dumbbell', 'cable', 'machine', 'body only', 'kettlebells',
  'bands', 'e-z curl bar', 'medicine ball', 'exercise ball', 'foam roll', 'other',
] as const

// home/gym presets pre-check a sensible subset; the user tweaks individual items afterwards.
export const ENVIRONMENT_PRESETS: Record<Environment, string[]> = {
  gym: [...ALL_EQUIPMENT],
  home: ['dumbbell', 'kettlebells', 'bands', 'body only', 'exercise ball', 'foam roll'],
}

// Keys mirror units.ts; equipment is comma-joined (values have spaces, never commas) so reads
// can't throw on a parse — no JSON, no try/catch.
const K_ENV = 'wa_env', K_EQUIP = 'wa_equip', K_BUDGET = 'wa_budget', K_BAR = 'wa_bar'
const K_REST = 'wa_rest', K_WORK = 'wa_work', K_MAXSETS = 'wa_maxsets', K_CUSTOM_EQUIP = 'wa_equip_custom'

const readEnv = (): Environment => (localStorage.getItem(K_ENV) as Environment) || 'gym'
const readEquip = (): string[] => {
  const raw = localStorage.getItem(K_EQUIP)
  if (raw === null) return [...ALL_EQUIPMENT] // never set → everything available
  return raw ? raw.split(',') : [] // '' = user cleared all
}
const readCustomEquip = (): string[] => {
  const raw = localStorage.getItem(K_CUSTOM_EQUIP)
  return raw ? raw.split(',') : []
}
const readBudget = (): number => Number(localStorage.getItem(K_BUDGET)) || 0 // 0 = no time budget
const readBar = (): number => Number(localStorage.getItem(K_BAR)) || 20 // standard Olympic bar
const readRest = (): number => Number(localStorage.getItem(K_REST)) || 120 // ~2 min between sets
const readWork = (): number => Number(localStorage.getItem(K_WORK)) || 40 // ~40s to lift one set
const readMaxSets = (): number => Number(localStorage.getItem(K_MAXSETS)) || 6 // budget set ceiling

// Cached snapshot so useSyncExternalStore gets a stable reference between changes.
let snapshot: Prefs = compute()
function compute(): Prefs {
  // SSR/node-safe (tests import the db layer with no localStorage) → fall back to defaults.
  if (typeof localStorage === 'undefined')
    return { environment: 'gym', equipment: [...ALL_EQUIPMENT], customEquipment: [], budgetMin: 0, barKg: 20, restSec: 120, workSec: 40, maxSets: 6 }
  return {
    environment: readEnv(), equipment: readEquip(), customEquipment: readCustomEquip(), budgetMin: readBudget(),
    barKg: readBar(), restSec: readRest(), workSec: readWork(), maxSets: readMaxSets(),
  }
}
const listeners = new Set<() => void>()
function emit() {
  snapshot = compute()
  listeners.forEach((l) => l())
}

export const getPrefs = (): Prefs => snapshot

export function setEnvironment(env: Environment) {
  localStorage.setItem(K_ENV, env)
  localStorage.setItem(K_EQUIP, ENVIRONMENT_PRESETS[env].join(',')) // preset pre-checks its subset
  emit()
}
export function setEquipment(equipment: string[]) {
  localStorage.setItem(K_EQUIP, equipment.join(','))
  emit()
}
// Add a user-defined equipment type. Sanitized (lowercase, no commas — the store is comma-joined);
// ignored if blank, a built-in, or already added. New types are auto-marked available.
export function addCustomEquipment(name: string): void {
  const item = name.trim().toLowerCase().replace(/,/g, '')
  if (!item || (ALL_EQUIPMENT as readonly string[]).includes(item) || readCustomEquip().includes(item)) return
  localStorage.setItem(K_CUSTOM_EQUIP, [...readCustomEquip(), item].join(','))
  localStorage.setItem(K_EQUIP, [...readEquip(), item].join(','))
  emit()
}
export function removeCustomEquipment(name: string): void {
  localStorage.setItem(K_CUSTOM_EQUIP, readCustomEquip().filter((e) => e !== name).join(','))
  localStorage.setItem(K_EQUIP, readEquip().filter((e) => e !== name).join(','))
  emit()
}
export function setBudgetMin(min: number) {
  localStorage.setItem(K_BUDGET, String(min))
  emit()
}
export function setBarKg(kg: number) {
  localStorage.setItem(K_BAR, String(kg))
  emit()
}
export function setRestSec(sec: number) {
  localStorage.setItem(K_REST, String(sec))
  emit()
}
export function setWorkSec(sec: number) {
  localStorage.setItem(K_WORK, String(sec))
  emit()
}
export function setMaxSets(n: number) {
  localStorage.setItem(K_MAXSETS, String(n))
  emit()
}

export function usePrefs(): Prefs {
  return useSyncExternalStore((cb) => {
    listeners.add(cb)
    return () => listeners.delete(cb)
  }, getPrefs)
}

/** Built-in equipment types plus the user's custom ones — the full selectable/filterable vocabulary. */
export const allEquipmentTypes = (prefs: Prefs): string[] => [...ALL_EQUIPMENT, ...prefs.customEquipment]

/** True if an exercise's equipment is usable given the available set (bodyweight always passes). */
export const equipmentAvailable = (equipment: string, available: string[]): boolean =>
  equipment === 'body only' || equipment === '' || available.includes(equipment)
