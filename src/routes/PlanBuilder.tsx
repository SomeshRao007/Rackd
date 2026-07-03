import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useAuth } from '../auth/AuthContext'
import { useDb, useRxData } from '../db/useRxData'
import type { Exercise, Plan, PlanDay, PlanSlot, SchemeId } from '../db/schema'
import { updatePlan, deletePlan, publishPlan } from '../db/plans'
import { SCHEMES } from '../lib/suggest'
import { ExercisePicker } from '../components/ExercisePicker'

const uid = () => crypto.randomUUID()

export function PlanBuilder() {
  const { id: planId } = useParams()
  const { user, token } = useAuth()
  const navigate = useNavigate()
  const db = useDb()

  const [name, setName] = useState('')
  const [scheme, setScheme] = useState<SchemeId>('double')
  const [days, setDays] = useState<PlanDay[]>([])
  const [loaded, setLoaded] = useState(false)
  const [pickerSlot, setPickerSlot] = useState<string | null>(null)
  const [shareCode, setShareCode] = useState('')
  const [shareNote, setShareNote] = useState('')

  const exercises = useRxData<Exercise>((d) => d.exercises.find(), [])
  const nameOf = useMemo(() => new Map(exercises.map((e) => [e.id, e.name])), [exercises])

  // Load once into local state (the editor's source of truth); persist on change.
  useEffect(() => {
    if (!db || !planId) return
    let alive = true
    db.plans.findOne(planId).exec().then((doc) => {
      if (!alive || !doc) {
        if (alive) setLoaded(true)
        return
      }
      const p = doc.toJSON() as Plan
      setName(p.name)
      setScheme((p.scheme as SchemeId | null) ?? 'double')
      try {
        setDays(JSON.parse(p.days) as PlanDay[])
      } catch {
        setDays([])
      }
      setLoaded(true)
    })
    return () => {
      alive = false
    }
  }, [db, planId])

  const commitDays = (next: PlanDay[]) => {
    setDays(next)
    if (planId) void updatePlan(planId, { days: JSON.stringify(next) })
  }
  const commitName = (n: string) => {
    setName(n)
    if (planId) void updatePlan(planId, { name: n })
  }

  // ── mutations ─────────────────────────────────────────────────────────────
  const addDay = () => commitDays([...days, { id: uid(), label: `Day ${days.length + 1}`, slots: [] }])
  const renameDay = (dayId: string, label: string) =>
    commitDays(days.map((d) => (d.id === dayId ? { ...d, label } : d)))
  const removeDay = (dayId: string) => commitDays(days.filter((d) => d.id !== dayId))
  const moveDay = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= days.length) return
    commitDays(arrayMove(days, i, j))
  }
  const addSlot = (dayId: string) =>
    commitDays(days.map((d) => (d.id === dayId ? { ...d, slots: [...d.slots, { id: uid(), label: 'New slot', exercisePool: [] }] } : d)))
  const renameSlot = (slotId: string, label: string) =>
    commitDays(days.map((d) => ({ ...d, slots: d.slots.map((s) => (s.id === slotId ? { ...s, label } : s)) })))
  const removeSlot = (slotId: string) =>
    commitDays(days.map((d) => ({ ...d, slots: d.slots.filter((s) => s.id !== slotId) })))
  const addExercise = (slotId: string, exId: string) =>
    commitDays(days.map((d) => ({
      ...d,
      slots: d.slots.map((s) =>
        s.id === slotId && !s.exercisePool.includes(exId) ? { ...s, exercisePool: [...s.exercisePool, exId] } : s,
      ),
    })))
  const removeExercise = (slotId: string, exId: string) =>
    commitDays(days.map((d) => ({
      ...d,
      slots: d.slots.map((s) => (s.id === slotId ? { ...s, exercisePool: s.exercisePool.filter((x) => x !== exId) } : s)),
    })))

  // ── drag reorder: one root DndContext; ids namespaced so they're globally unique ─
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    const a = String(active.id)
    const o = String(over.id)
    if (a.includes(':')) {
      // pool item "slotId:exerciseId" — reorder only within the same slot
      const slotId = a.slice(0, a.indexOf(':'))
      if (slotId !== o.slice(0, o.indexOf(':'))) return
      commitDays(days.map((d) => ({
        ...d,
        slots: d.slots.map((s) => {
          if (s.id !== slotId) return s
          const keys = s.exercisePool.map((ex) => `${slotId}:${ex}`)
          const moved = arrayMove(keys, keys.indexOf(a), keys.indexOf(o))
          return { ...s, exercisePool: moved.map((k) => k.slice(k.indexOf(':') + 1)) }
        }),
      })))
    } else {
      // slot — reorder within its day
      const day = days.find((d) => d.slots.some((s) => s.id === a))
      if (!day || !day.slots.some((s) => s.id === o)) return
      commitDays(days.map((d) =>
        d.id !== day.id
          ? d
          : { ...d, slots: arrayMove(d.slots, d.slots.findIndex((s) => s.id === a), d.slots.findIndex((s) => s.id === o)) },
      ))
    }
  }

  async function onShare() {
    if (!token) {
      setShareNote('Sign in with the server running to share.')
      return
    }
    setShareNote('')
    const code = await publishPlan({ id: planId, userId: user?.id, name, days: JSON.stringify(days) } as Plan, token).catch(() => null)
    if (!code) {
      setShareNote('Could not publish (is the backend running?).')
      return
    }
    setShareCode(code)
    void navigator.clipboard?.writeText(code).catch(() => {})
  }

  if (!loaded) return <p className="mt-8 text-center text-fog">Loading…</p>

  return (
    <section className="pb-24">
      <Link to="/app/plans" className="-ml-1 mb-3 flex items-center gap-1 text-sm font-semibold text-fog hover:text-chalk">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="m15 18-6-6 6-6" />
        </svg>
        Plans
      </Link>

      <input
        value={name}
        onChange={(e) => commitName(e.target.value)}
        placeholder="Plan name"
        aria-label="Plan name"
        className="w-full bg-transparent font-display text-3xl font-black tracking-tight text-chalk outline-none placeholder:text-steel-700"
      />

      <div className="mt-3 flex gap-2">
        <button type="button" onClick={onShare} className="rounded-lg border border-steel-700 px-4 py-2 text-sm font-bold text-chalk transition-colors hover:bg-steel-800">
          Share
        </button>
        <button
          type="button"
          onClick={() => {
            if (planId && confirm('Delete this plan?')) {
              void deletePlan(planId)
              navigate('/app/plans')
            }
          }}
          className="rounded-lg border border-steel-700 px-4 py-2 text-sm font-bold text-fog transition-colors hover:bg-steel-800 hover:text-red-400"
        >
          Delete
        </button>
      </div>
      {shareCode && (
        <p className="mt-2 break-all rounded-lg bg-steel-900 px-3 py-2 text-xs text-fog">
          Share code (copied): <span className="font-bold text-amber">{shareCode}</span>
        </p>
      )}
      {shareNote && <p className="mt-2 text-sm text-red-400">{shareNote}</p>}

      {/* Progression scheme (M5): how every lift in this plan advances session to session. */}
      <div className="mt-6 rounded-2xl border border-steel-800 bg-steel-900/60 p-4">
        <h2 className="font-display text-xl font-bold">Progression</h2>
        <div className="mt-3 space-y-2.5">
          {SCHEMES.map((s) => {
            const active = scheme === s.id
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setScheme(s.id)
                  if (planId) void updatePlan(planId, { scheme: s.id })
                }}
                aria-pressed={active}
                className={`w-full rounded-xl border bg-steel-900 p-3 text-left transition-colors ${
                  active ? 'border-amber ring-1 ring-amber' : 'border-steel-800 hover:border-steel-700'
                }`}
              >
                <span className={`block font-bold ${active ? 'text-amber' : 'text-chalk'}`}>{s.name}</span>
                <span className="mt-1 block text-sm text-fog">{s.blurb}</span>
              </button>
            )
          })}
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <div className="mt-6 space-y-5">
          {days.map((day, i) => (
            <div key={day.id} className="rounded-2xl border border-steel-800 bg-steel-900/60 p-4">
              <div className="flex items-center gap-2">
                <input
                  value={day.label}
                  onChange={(e) => renameDay(day.id, e.target.value)}
                  aria-label="Day name"
                  className="min-w-0 flex-1 bg-transparent font-display text-xl font-bold text-chalk outline-none"
                />
                <IconBtn label="Move day up" onClick={() => moveDay(i, -1)} disabled={i === 0}>
                  <path d="m18 15-6-6-6 6" />
                </IconBtn>
                <IconBtn label="Move day down" onClick={() => moveDay(i, 1)} disabled={i === days.length - 1}>
                  <path d="m6 9 6 6 6-6" />
                </IconBtn>
                <IconBtn label="Delete day" onClick={() => removeDay(day.id)} danger>
                  <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
                </IconBtn>
              </div>

              <SortableContext items={day.slots.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                <div className="mt-3 space-y-2.5">
                  {day.slots.map((slot) => (
                    <SlotCard
                      key={slot.id}
                      slot={slot}
                      nameOf={nameOf}
                      onRename={(label) => renameSlot(slot.id, label)}
                      onRemove={() => removeSlot(slot.id)}
                      onAddExercise={() => setPickerSlot(slot.id)}
                      onRemoveExercise={(exId) => removeExercise(slot.id, exId)}
                    />
                  ))}
                </div>
              </SortableContext>

              <button type="button" onClick={() => addSlot(day.id)} className="mt-3 w-full rounded-lg border border-dashed border-steel-700 py-2 text-sm font-semibold text-fog transition-colors hover:border-amber hover:text-amber">
                + Add slot
              </button>
            </div>
          ))}
        </div>
      </DndContext>

      <button type="button" onClick={addDay} className="mt-5 w-full rounded-xl bg-amber py-3 font-display font-black uppercase tracking-wide text-ink transition-colors hover:bg-amber-bright">
        + Add day
      </button>

      {pickerSlot && (
        <ExercisePicker
          title="Add to pool"
          exclude={days.flatMap((d) => d.slots).find((s) => s.id === pickerSlot)?.exercisePool ?? []}
          onPick={(e) => addExercise(pickerSlot, e.id)}
          onClose={() => setPickerSlot(null)}
        />
      )}
    </section>
  )
}

function SlotCard({
  slot,
  nameOf,
  onRename,
  onRemove,
  onAddExercise,
  onRemoveExercise,
}: {
  slot: PlanSlot
  nameOf: Map<string, string>
  onRename: (label: string) => void
  onRemove: () => void
  onAddExercise: () => void
  onRemoveExercise: (exId: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: slot.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 }
  return (
    <div ref={setNodeRef} style={style} className="rounded-xl border border-steel-800 bg-steel-900 p-3">
      <div className="flex items-center gap-2">
        <button type="button" aria-label="Drag slot" className="cursor-grab touch-none text-steel-600 hover:text-fog" {...attributes} {...listeners}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" /><circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" /><circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" /></svg>
        </button>
        <input
          value={slot.label}
          onChange={(e) => onRename(e.target.value)}
          aria-label="Slot name"
          className="min-w-0 flex-1 bg-transparent text-sm font-bold uppercase tracking-wide text-amber outline-none"
        />
        <IconBtn label="Delete slot" onClick={onRemove} danger>
          <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
        </IconBtn>
      </div>

      <SortableContext items={slot.exercisePool.map((ex) => `${slot.id}:${ex}`)} strategy={verticalListSortingStrategy}>
        <div className="mt-2 space-y-1.5">
          {slot.exercisePool.map((exId) => (
            <PoolItem key={exId} id={`${slot.id}:${exId}`} name={nameOf.get(exId) ?? exId} onRemove={() => onRemoveExercise(exId)} />
          ))}
        </div>
      </SortableContext>

      {slot.exercisePool.length === 0 && <p className="mt-2 text-xs text-steel-600">No movements — rotation needs at least one.</p>}

      <button type="button" onClick={onAddExercise} className="mt-2 text-sm font-semibold text-fog transition-colors hover:text-amber">
        + Add exercise
      </button>
    </div>
  )
}

function PoolItem({ id, name, onRemove }: { id: string; name: string; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 }
  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 rounded-lg bg-steel-800 px-2.5 py-2">
      <button type="button" aria-label="Drag exercise" className="cursor-grab touch-none text-steel-600 hover:text-fog" {...attributes} {...listeners}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" /><circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" /><circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" /></svg>
      </button>
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-chalk">{name}</span>
      <button type="button" onClick={onRemove} aria-label="Remove exercise" className="text-steel-600 transition-colors hover:text-red-400">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
      </button>
    </div>
  )
}

function IconBtn({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`grid size-8 shrink-0 place-items-center rounded-lg text-fog transition-colors hover:bg-steel-800 disabled:opacity-30 ${danger ? 'hover:text-red-400' : 'hover:text-chalk'}`}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </button>
  )
}
