// Cache sencillo para que la app funcione sin conexión.
const CACHE = 'gastos-familia-v2';
const ASSETS = ['./', 'index.html', 'styles.css', 'app.js', 'manifest.webmanifest', 'icon.svg', 'firebase-config.js'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

// Red primero (para recibir actualizaciones) y caché como respaldo sin conexión.
// Solo los archivos de la app y la librería de Firebase: las conexiones a la base de datos no se tocan.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const cacheable = url.origin === self.location.origin || url.href.startsWith('https://www.gstatic.com/firebasejs/');
  if (event.request.method !== 'GET' || !cacheable) return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request)),
  );
});
