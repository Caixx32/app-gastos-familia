// Cache sencillo para que la app funcione sin conexión.
// Cambiar este nombre (junto con APP_VERSION en app.js) en cada versión nueva: así el celular detecta
// que hay una actualización, la instala y la app se recarga sola.
const CACHE = 'gastos-familia-v5';
const ASSETS = ['./', 'index.html', 'styles.css', 'app.js', 'manifest.webmanifest', 'icon.svg', 'firebase-config.js'];

self.addEventListener('install', (event) => {
  // `reload` evita que la instalación tome archivos viejos de la caché del navegador.
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS.map((a) => new Request(a, { cache: 'reload' })))));
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
  // Los archivos de la app se revalidan siempre con el servidor (`no-cache`); la librería de Firebase
  // tiene la versión en la dirección, así que puede salir de la caché del navegador.
  const options = url.origin === self.location.origin ? { cache: 'no-cache' } : {};
  event.respondWith(
    fetch(event.request, options)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request)),
  );
});
