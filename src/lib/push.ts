// Web Push client (M7 Part G). Subscribes the browser to native Web Push and hands the subscription
// to functions/push/subscribe.ts. Uses the existing service worker (vite-plugin-pwa, generateSW +
// public/push-sw.js handlers). No third-party SDK — this is the W3C Push API.
//
// ponytail: deploy-gated. Real delivery needs VAPID keys + an HTTPS deploy + (on iOS) an installed
// PWA on 16.4+. `pushConfigured()` gates the Settings toggle so nothing half-wired shows in dev.

const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC as string | undefined

/** The browser can do Web Push at all (Chrome/Firefox/Edge; Safari 16.4+ when installed). */
export const pushSupported = (): boolean =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

/** A VAPID public key is configured for this build — otherwise subscribing can't work. */
export const pushConfigured = (): boolean => !!VAPID_PUBLIC

export const pushPermission = (): NotificationPermission =>
  'Notification' in window ? Notification.permission : 'denied'

/** VAPID keys are base64url — the Push API wants a Uint8Array (over a concrete ArrayBuffer). */
function urlBase64ToUint8Array(base64: string) {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

/** Request permission, subscribe, and persist the subscription server-side. Returns a status string. */
export async function subscribeToPush(token: string): Promise<'ok' | 'unsupported' | 'unconfigured' | 'denied' | 'error'> {
  if (!pushSupported()) return 'unsupported'
  if (!VAPID_PUBLIC) return 'unconfigured'

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return 'denied'

  try {
    const reg = await navigator.serviceWorker.ready
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
      }))
    const res = await fetch('/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(sub.toJSON()),
    })
    return res.ok ? 'ok' : 'error'
  } catch {
    return 'error' // never surface a raw exception to the UI
  }
}
