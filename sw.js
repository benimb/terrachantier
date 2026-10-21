/* TerraSuite en ligne (TerraChantier, TerraContacts) : fonctionnement hors réseau.
   L'application (pages, scripts, bibliothèques) est mise en cache à l'installation ; les données restent dans la base du navigateur (IndexedDB). */
const VERSION = 'tc-0.5';
const SHELL = ['./', 'index.html', 'contacts.html', 'style.css', 'common.js', 'carnet.js', 'contacts-app.js', 'app.js', 'db.js', 'plan.js', 'export.js', 'sync.js', 'manifest.webmanifest',
  'vendor/pdf.min.js', 'vendor/pdf.worker.min.js', 'vendor/jspdf.umd.min.js', 'vendor/xlsx.full.min.js', 'vendor/supabase.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting())); }); // fichiers frais, sans le cache du navigateur
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION && k !== 'tc-fonts').map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // polices : mises en cache au premier usage
  if (/fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)) { e.respondWith(caches.open('tc-fonts').then(c => c.match(e.request).then(r => r || fetch(e.request).then(n => { c.put(e.request, n.clone()); return n; })))); return; }
  if (u.origin !== location.origin) return; // Supabase et autres services : toujours en direct
  // application : le cache d'abord, mise à jour en arrière-plan
  e.respondWith(caches.open(VERSION).then(c => c.match(e.request, { ignoreSearch: true }).then(r => {
    const net = fetch(e.request).then(n => { if (n.ok) c.put(e.request, n.clone()); return n; }).catch(() => r);
    return r || net;
  })));
});
self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });
