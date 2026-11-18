importScripts("/precache-manifest.23be8ab733c84227063663e9f789fc8d.js", "/workbox-v4.3.1/workbox-sw.js");
workbox.setConfig({modulePathPrefix: "/workbox-v4.3.1"});
workbox.core.setCacheNameDetails({ prefix: 'gomoku-calculator' })
workbox.core.skipWaiting()
workbox.core.clientsClaim()

self.__precacheManifest = [].concat(self.__precacheManifest || [])
workbox.precaching.precache(self.__precacheManifest)
workbox.precaching.cleanupOutdatedCaches()

const buildStrategy = new workbox.strategies.CacheFirst({
  cacheName: 'rapfi-engine-cache',
  plugins: [
    new workbox.expiration.Plugin({
      maxEntries: 10,
      maxAgeSeconds: 30 * 24 * 60 * 60,
    }),
    new workbox.cacheableResponse.Plugin({
      statuses: [0, 200],
    }),
  ],
})

function addCoiHeaders(response) {
  if (!response || response.status === 0) return response
  const headers = new Headers(response.headers)
  headers.set('Cross-Origin-Embedder-Policy', 'require-corp')
  headers.set('Cross-Origin-Opener-Policy', 'same-origin')
  headers.set('Cross-Origin-Resource-Policy', 'cross-origin')
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  const cacheKey = workbox.precaching.getCacheKeyForURL(req.url)
  if (cacheKey) {
    event.respondWith(
      caches.match(cacheKey).then((cached) => {
        const p = cached ? Promise.resolve(cached) : fetch(req)
        return p.then(addCoiHeaders)
      })
    )
    return
  }

  if (/\/build\/.*\.(data|wasm|js)$/.test(url.pathname)) {
    event.respondWith(buildStrategy.handle({ event, request: req }).then(addCoiHeaders))
    return
  }

  event.respondWith(
    fetch(req)
      .then(addCoiHeaders)
      .catch(() => caches.match(req).then(addCoiHeaders))
  )
})

