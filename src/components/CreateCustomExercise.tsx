import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import type { Exercise } from '../db/schema'
import { MUSCLES } from '../lib/muscles'
import { usePrefs, allEquipmentTypes } from '../lib/prefs'
import { classify } from '../lib/classify'
import { createCustomExercise, updateCustomExercise } from '../db/customExercises'

// M8 R1 — create OR edit a custom exercise. The name auto-classifies its muscles (classify.ts); the
// user edits the picks, so a wrong guess is harmless. Pass `edit` to update an existing one in place
// (id preserved). Once saved it joins the Exercises library + pickers and renders the body-map free.
export function CreateCustomExercise({
  initialName = '',
  edit,
  onCreated,
  onClose,
}: {
  initialName?: string
  edit?: Exercise
  onCreated: (id: string) => void
  onClose: () => void
}) {
  const { user } = useAuth()
  const userId = user?.id ?? ''
  const [name, setName] = useState(edit?.name ?? initialName)
  const [primary, setPrimary] = useState<string[]>(() => edit?.primaryMuscles ?? classify(initialName).primary)
  const [equipment, setEquipment] = useState(edit?.equipment || 'body only')
  const [instructions, setInstructions] = useState<string[]>(() => edit?.instructions ?? [])
  const [busy, setBusy] = useState(false)
  const equipmentTypes = allEquipmentTypes(usePrefs())

  const toggle = (m: string) =>
    setPrimary((p) => (p.includes(m) ? p.filter((x) => x !== m) : [...p, m]))

  const suggest = () => setPrimary(classify(name).primary)

  const save = async () => {
    if (!name.trim() || primary.length === 0 || busy) return
    setBusy(true)
    // Keep the existing secondaries when editing; classify fresh on create.
    const secondaryMuscles = (edit ? edit.secondaryMuscles ?? [] : classify(name).secondary).filter((m) => !primary.includes(m))
    const steps = instructions.map((s) => s.trim()).filter(Boolean)
    if (edit) {
      await updateCustomExercise(edit.id, { name, primaryMuscles: primary, secondaryMuscles, equipment, instructions: steps })
      onCreated(edit.id)
      return
    }
    const id = await createCustomExercise(userId, { name, primaryMuscles: primary, secondaryMuscles, equipment, instructions: steps })
    onCreated(id)
  }

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-ink/95 backdrop-blur">
      <div className="mx-auto flex h-full w-full max-w-lg flex-col px-4 pt-5">
        <div className="mb-4 flex items-center gap-3">
          <h2 className="flex-1 font-display text-xl font-black tracking-tight">{edit ? 'Edit exercise' : 'New exercise'}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-9 place-items-center rounded-lg text-fog transition-colors hover:bg-steel-800 hover:text-chalk"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto pb-24">
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wider text-fog">Name</span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Hip Thrust"
              className="mt-1.5 w-full rounded-xl border border-steel-700 bg-steel-900 px-4 py-3 text-base text-chalk placeholder:text-steel-600 focus-visible:border-amber focus-visible:outline-none"
            />
          </label>

          <div>
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-fog">Muscles worked</span>
              <button type="button" onClick={suggest} className="text-xs font-bold text-amber hover:underline">
                ↻ Suggest from name
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {MUSCLES.map((m) => {
                const on = primary.includes(m)
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => toggle(m)}
                    aria-pressed={on}
                    className={`rounded-lg px-3 py-2 text-sm font-semibold capitalize transition-colors ${on ? 'bg-amber text-ink' : 'bg-steel-800 text-fog hover:text-chalk'}`}
                  >
                    {m}
                  </button>
                )
              })}
            </div>
          </div>

          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wider text-fog">Equipment</span>
            <select
              value={equipment}
              onChange={(e) => setEquipment(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-steel-700 bg-steel-900 px-4 py-3 text-base capitalize text-chalk focus-visible:border-amber focus-visible:outline-none"
            >
              {equipmentTypes.map((eq) => (
                <option key={eq} value={eq} className="capitalize">{eq}</option>
              ))}
            </select>
          </label>

          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-fog">How to perform</span>
            {instructions.length > 0 && (
              <ol className="mt-2 space-y-2">
                {instructions.map((step, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-2.5 grid size-6 shrink-0 place-items-center rounded-full bg-steel-800 text-xs font-black text-amber">{i + 1}</span>
                    <textarea
                      value={step}
                      onChange={(e) => setInstructions((s) => s.map((v, j) => (j === i ? e.target.value : v)))}
                      rows={2}
                      placeholder={`Step ${i + 1}`}
                      className="min-w-0 flex-1 resize-y rounded-xl border border-steel-700 bg-steel-900 px-3 py-2 text-sm text-chalk placeholder:text-steel-600 focus-visible:border-amber focus-visible:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setInstructions((s) => s.filter((_, j) => j !== i))}
                      aria-label={`Remove step ${i + 1}`}
                      className="mt-1 grid size-8 shrink-0 place-items-center rounded-lg text-fog transition-colors hover:bg-steel-800 hover:text-chalk"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                    </button>
                  </li>
                ))}
              </ol>
            )}
            <button
              type="button"
              onClick={() => setInstructions((s) => [...s, ''])}
              className="mt-2 w-full rounded-xl border border-dashed border-steel-700 px-4 py-2.5 text-sm font-semibold text-fog transition-colors hover:border-amber hover:text-amber"
            >
              + Add step
            </button>
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 mx-auto max-w-lg border-t border-steel-800 bg-ink/95 px-4 py-4 backdrop-blur">
          <button
            type="button"
            onClick={save}
            disabled={!name.trim() || primary.length === 0 || busy}
            className="w-full rounded-xl bg-amber py-3.5 font-display font-black uppercase tracking-wide text-ink transition-colors hover:bg-amber-bright disabled:opacity-50"
          >
            {busy ? 'Saving…' : edit ? 'Save changes' : 'Save exercise'}
          </button>
        </div>
      </div>
    </div>
  )
}
