importScripts("/precache-manifest.3698cd060b68bbea2e2b0f58ab68b99f.js", "/workbox-v4.3.1/workbox-sw.js");
workbox.setConfig({modulePathPrefix: "/workbox-v4.3.1"});
workbox.core.setCacheNameDetails({ prefix: 'gomoku-calculator' })
workbox.core.skipWaiting()
workbox.core.clientsClaim()

self.__precacheManifest = [].concat(self.__precacheManifest || [])
workbox.precaching.precache(self.__precacheManifest)
workbox.precaching.cleanupOutdatedCaches()

const ENGINE_CACHE_NAME = 'rapfi-engine-cache-v4'

const buildStrategy = new workbox.strategies.CacheFirst({
  cacheName: ENGINE_CACHE_NAME,
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

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith('rapfi-engine-cache-') && k !== ENGINE_CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    )
  )
})

function addCoiHeaders(response) {
  if (!response || response.status === 0) return response
  if (response.status === 204 || response.status === 205 || response.status === 304) return response
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
      .catch(async () => {
        const cached = await caches.match(req)
        return cached ? addCoiHeaders(cached) : Response.error()
      })
  )
})

