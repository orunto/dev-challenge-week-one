export function serviceWorkerSource(paths: string[], version: string): string {
  return `
const CACHE = ${JSON.stringify(`hobbymaxx-shell-${version}`)};
const ASSETS = new Set(${JSON.stringify(paths)});
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll([...ASSETS].map((path) => new Request(path, { cache: 'reload' })))));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('hobbymaxx-shell-') && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('message', (event) => {
  if (event.data === 'activate-update') self.skipWaiting();
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  // Inference, health checks, external URLs, and writes never enter this cache.
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname === '/health' || url.pathname === '/ready') return;
  if (request.mode === 'navigate' && (url.pathname === '/' || url.pathname === '/index.html')) {
    event.respondWith(fetch(request).then(async (response) => {
      if (response.ok && response.headers.get('content-type')?.includes('text/html')) {
        const cache = await caches.open(CACHE);
        await cache.put('/', response.clone());
      }
      return response;
    }).catch(async () => (await caches.open(CACHE)).match('/') .then((cached) => cached || new Response('Open HobbyMaxx online once to prepare offline access.', { status: 503 }))));
    return;
  }
  if (!ASSETS.has(url.pathname)) return;
  event.respondWith(caches.open(CACHE).then(async (cache) => {
    const cached = await cache.match(url.pathname);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) await cache.put(url.pathname, response.clone());
    return response;
  }));
});
`;
}
