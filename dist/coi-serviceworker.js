/*! coi-serviceworker v0.1.7 - Guido Zuidhof, licensed under MIT */
let coep = 'require-corp';
let coop = 'same-origin';

if (typeof window === 'undefined') {
  self.addEventListener("install", () => self.skipWaiting());
  self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

  self.addEventListener("fetch", function (event) {
    if (event.request.cache === "only-if-cached" && event.request.mode !== "same-origin") {
      return;
    }

    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.status === 0) {
            return response;
          }

          const newHeaders = new Headers(response.headers);
          newHeaders.set("Cross-Origin-Embedder-Policy", coep);
          newHeaders.set("Cross-Origin-Opener-Policy", coop);

          return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders,
          });
        })
        .catch((e) => console.error(e))
    );
  });
} else {
  if (window.crossOriginIsolated === false) {
    const n = navigator.serviceWorker;
    if (n) {
      n.register(window.document.currentScript.src).then(
        (registration) => {
          console.log("COI: registered", registration);
          registration.addEventListener("updatefound", () => {
            console.log("COI: updatefound", registration);
            window.location.reload();
          });

          if (registration.active && !n.controller) {
            console.log("COI: active", registration);
            window.location.reload();
          }
        },
        (err) => {
          console.error("COI: registration failed", err);
        }
      );
    }
  }
}
