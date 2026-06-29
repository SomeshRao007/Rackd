import {
  replicateRxCollection,
  type RxReplicationState,
} from 'rxdb/plugins/replication'
import type { RxCollection } from 'rxdb'
import { getDb } from './database'

// Checkpoint = the LWW key. Must match the server's (updatedAt, id) tuple.
type Checkpoint = { id: string; updatedAt: string }

const COLLECTIONS = ['sessions', 'setlogs', 'plans'] as const

// Module-level so a stray double-start is a no-op and stopSync can cancel cleanly.
let states: RxReplicationState<unknown, Checkpoint>[] = []
let listening = false

async function authedPost(path: string, body: unknown, token: string) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  // throw on failure → RxDB backs off and retries the whole cycle (offline-safe).
  if (!res.ok) throw new Error(`${path} → ${res.status}`)
  return res.json()
}

/** Replicate one collection to /sync/{pull,push}/<name>. Exported so the M2 test
 *  exercises the exact shipping handlers rather than a copy. */
export function replicateCollection(
  collection: RxCollection,
  name: string,
  token: string,
): RxReplicationState<unknown, Checkpoint> {
  return replicateRxCollection<unknown, Checkpoint>({
    replicationIdentifier: `sync-${name}-/sync`,
    collection,
    live: true,
    retryTime: 5000,
    autoStart: true,
    pull: {
      handler: (checkpoint, batchSize) =>
        authedPost(`/sync/pull/${name}`, { checkpoint: checkpoint ?? null, limit: batchSize }, token),
    },
    push: {
      handler: async (rows) =>
        (await authedPost(`/sync/push/${name}`, { rows }, token)).documents,
    },
  })
}

/** Start replicating sessions + setlogs to /sync. Idempotent; returns the live states. */
export function startSync(token: string): RxReplicationState<unknown, Checkpoint>[] {
  if (states.length) return states
  void getDb().then((db) => {
    for (const name of COLLECTIONS) states.push(replicateCollection(db[name], name, token))
    addListeners()
  })
  return states
}

const resyncAll = () => states.forEach((s) => s.reSync())
const onVisible = () => document.visibilityState === 'visible' && resyncAll()

function addListeners() {
  if (listening) return
  listening = true
  // reconnect / app-foreground → pull anything the other device wrote.
  window.addEventListener('online', resyncAll)
  document.addEventListener('visibilitychange', onVisible)
}

export async function stopSync(): Promise<void> {
  window.removeEventListener('online', resyncAll)
  document.removeEventListener('visibilitychange', onVisible)
  listening = false
  const current = states
  states = []
  await Promise.all(current.map((s) => s.cancel()))
}
