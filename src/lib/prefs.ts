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
  increments: Record<string, number> // equipment → smallest load jump it allows
  exerciseSteps: Record<string, number> // exerciseId → override for one stubborn machine
  plateKg: number[] // plate sizes actually on the rack, heaviest first
}

// The 12 catalog equipment values (source: scripts/seed-catalog.ts output). 'body only' + ''
// (empty) need nothing, so they're always implicitly available regardless of selection.
export const ALL_EQUIPMENT = [
  'barbell', 'dumbbell', 'cable', 'machine', 'body only', 'kettlebells',
  'bands', 'e-z curl bar', 'medicine ball', 'exercise ball', 'foam roll', 'other',
] as const

// Smallest jump each kit allows. A gym's dumbbells go up in 2 kg, its pin stacks in 5, its plates
// in 2.5 — a single global 2.5 kg step walks half of them wrong. Per-machine variance beyond this
// (a 4.5 kg leg press next to a 2 kg lateral raise) is what `exerciseSteps` overrides.
export const DEFAULT_INCREMENTS: Record<string, number> = {
  barbell: 2.5, 'e-z curl bar': 2.5, dumbbell: 2, cable: 2.5, machine: 5, kettlebells: 4,
  bands: 2.5, 'medicine ball': 1, 'exercise ball': 1, 'body only': 2.5, 'foam roll': 2.5, other: 2.5,
}
export const FALLBACK_STEP = 2.5

// Plate sizes to offer in Settings; the default inventory is a standard commercial rack.
export const ALL_PLATES = [25, 20, 15, 10, 5, 2.5, 1.25, 1, 0.5]
export const DEFAULT_PLATES = [20, 15, 10, 5, 2.5, 1.25]

// home/gym presets pre-check a sensible subset; the user tweaks individual items afterwards.
export const ENVIRONMENT_PRESETS: Record<Environment, string[]> = {
  gym: [...ALL_EQUIPMENT],
  home: ['dumbbell', 'kettlebells', 'bands', 'body only', 'exercise ball', 'foam roll'],
}

// Keys mirror units.ts; equipment is comma-joined (values have spaces, never commas) so reads
// can't throw on a parse — no JSON, no try/catch.
const K_ENV = 'wa_env', K_EQUIP = 'wa_equip', K_BUDGET = 'wa_budget', K_BAR = 'wa_bar'
const K_REST = 'wa_rest', K_WORK = 'wa_work', K_MAXSETS = 'wa_maxsets', K_CUSTOM_EQUIP = 'wa_equip_custom'
const K_INC = 'wa_inc', K_INC_EX = 'wa_inc_ex', K_PLATES = 'wa_plates'

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
// "key:value,key:value" — same comma-joined idiom as equipment, so a read can't throw on a parse.
// Keys are equipment names / exercise ids, neither of which contains a comma or a colon.
const readMap = (key: string): Record<string, number> => {
  const out: Record<string, number> = {}
  for (const pair of (localStorage.getItem(key) || '').split(',')) {
    const i = pair.lastIndexOf(':')
    const n = Number(pair.slice(i + 1))
    if (i > 0 && n > 0) out[pair.slice(0, i)] = n
  }
  return out
}
const writeMap = (key: string, map: Record<string, number>) =>
  localStorage.setItem(key, Object.entries(map).map(([k, v]) => `${k}:${v}`).join(','))
const readIncrements = (): Record<string, number> => ({ ...DEFAULT_INCREMENTS, ...readMap(K_INC) })
const readPlates = (): number[] => {
  const raw = localStorage.getItem(K_PLATES)
  if (raw === null) return [...DEFAULT_PLATES]
  return raw ? raw.split(',').map(Number).filter((n) => n > 0).sort((a, b) => b - a) : []
}

// Cached snapshot so useSyncExternalStore gets a stable reference between changes.
let snapshot: Prefs = compute()
function compute(): Prefs {
  // SSR/node-safe (tests import the db layer with no localStorage) → fall back to defaults.
  if (typeof localStorage === 'undefined')
    return {
      environment: 'gym', equipment: [...ALL_EQUIPMENT], customEquipment: [], budgetMin: 0, barKg: 20,
      restSec: 120, workSec: 40, maxSets: 6,
      increments: { ...DEFAULT_INCREMENTS }, exerciseSteps: {}, plateKg: [...DEFAULT_PLATES],
    }
  return {
    environment: readEnv(), equipment: readEquip(), customEquipment: readCustomEquip(), budgetMin: readBudget(),
    barKg: readBar(), restSec: readRest(), workSec: readWork(), maxSets: readMaxSets(),
    increments: readIncrements(), exerciseSteps: readMap(K_INC_EX), plateKg: readPlates(),
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

export function setIncrement(equipment: string, kg: number) {
  writeMap(K_INC, { ...readMap(K_INC), [equipment]: kg > 0 ? kg : DEFAULT_INCREMENTS[equipment] ?? FALLBACK_STEP })
  emit()
}
/** Per-exercise override; 0 clears it and the equipment default takes over again. */
export function setExerciseStep(exerciseId: string, kg: number) {
  const map = readMap(K_INC_EX)
  if (kg > 0) map[exerciseId] = kg
  else delete map[exerciseId]
  writeMap(K_INC_EX, map)
  emit()
}
export function setPlates(plateKg: number[]) {
  localStorage.setItem(K_PLATES, [...plateKg].sort((a, b) => b - a).join(','))
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

/** Needs no kit: the catalog's 'body only' tag, or '' (unset — e.g. a programmatically created
 *  custom exercise). Extracted from equipmentAvailable so the logger's bodyweight mode (M8.6)
 *  and the generation filter can't drift apart on what counts as bodyweight. */
export const isBodyweightEquipment = (equipment: string): boolean =>
  equipment === 'body only' || equipment === ''

/** True if an exercise's equipment is usable given the available set (bodyweight always passes). */
export const equipmentAvailable = (equipment: string, available: string[]): boolean =>
  isBodyweightEquipment(equipment) || available.includes(equipment)

/** Smallest load jump for one exercise: its own override, else what its kit allows, else 2.5 kg.
 *  Drives the next-weight suggestion, the warm-up ramp rounding and the weight input's arrows. */
export const stepFor = (prefs: Prefs, equipment: string | undefined, exerciseId: string): number =>
  prefs.exerciseSteps[exerciseId] ?? prefs.increments[equipment ?? ''] ?? FALLBACK_STEP
