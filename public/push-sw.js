// Web Push handlers (M7 Part G), imported into the vite-plugin-pwa generated service worker via
// workbox.importScripts (see vite.config.ts). Kept as a plain public/ script so generateSW stays
// untouched. Payload shape matches functions/push/send.ts: { title, body, url }.
/* eslint-disable no-undef */

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch (e) {
    data = { title: 'Rackd', body: event.data ? event.data.text() : '' }
  }
  const title = data.title || 'Rackd'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      data: { url: data.url || '/app/today' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/app/today'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus an open tab if we have one; otherwise open a new one.
      for (const client of clients) {
        if ('focus' in client) return client.focus()
      }
      return self.clients.openWindow(url)
    }),
  )
})
