/* Itina Geo (carte publique et studio) : garde l'appli et les plans publiés sur l'appareil, pour s'ouvrir sans internet.
   - le studio (studio.html et ses fichiers) : depuis l'appareil d'abord ; une nouvelle version s'installe en arrière-plan
     et le studio propose « Mettre à jour » ;
   - la carte publique (index.html) : internet d'abord, sinon la copie gardée à l'installation, même si elle n'a été ouverte qu'une fois ;
   - les plans publiés (data/) : internet d'abord (4 s au plus), sinon la copie de l'appareil (gardés à l'installation dans la limite de 15 Mo, et chaque plan ouvert) ;
   - les autres pages du site : internet d'abord, sinon la copie de l'appareil si elles ont déjà été ouvertes ;
   - fonds de carte et OpenStreetMap : internet seulement (rien n'est copié). */
const VERSION = 'e3af5d9db7a8';
const APPLI = 'itina-geo-appli-' + VERSION, DONNEES = 'itina-geo-donnees', PAGES = 'itina-geo-pages', POLICES = 'itina-geo-polices';
const FICHIERS = ["studio.html", "lib/studio.js", "style.css", "icone.svg", "studio-icone.svg", "studio-icone-180.png", "studio-icone-192.png", "studio-icone-512.png", "studio-icone-maskable-512.png", "studio.webmanifest", "lib/maplibre-gl.js", "lib/maplibre-gl.css", "sdk/conakry-adresses.js", "sdk/guidage.js", "sdk/lieux.js", "lib/noms.js", "lib/guinee.js", "lib/atelier-lib.js", "data/guinee.json", "sources/limites-officielles.json", "sources/kaloum-plan.json", "index.html", "geo-icone.svg", "geo-icone-180.png", "geo-icone-192.png", "geo-icone-512.png", "geo-icone-maskable-512.png", "itina-geo.webmanifest", "glyphs/NotoSansMedium/0-255.pbf", "glyphs/NotoSansMedium/256-511.pbf", "glyphs/NotoSansMedium/512-767.pbf", "glyphs/NotoSansMedium/768-1023.pbf", "glyphs/NotoSansMedium/7680-7935.pbf", "glyphs/NotoSansMedium/8192-8447.pbf"];
const BASE = new URL('./', self.location).pathname;
const BUDGET = 15e6;                                                /* plans gardés d'avance : 15 Mo au plus */

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(APPLI);
    await c.addAll(FICHIERS.map(f => new Request(f, { cache: 'reload' })));
    /* hors ligne dès la première ouverture : la liste des plans, le cadre national, puis les plans publiés — Conakry et ceux
       déjà ouverts sur cet appareil d'abord, les autres tant que l'ensemble reste sous BUDGET (estimé d'après le nombre de rues
       de chaque plan ; tout le pays serait trop lourd pour un téléphone, un plan non gardé se garde dès qu'on l'ouvre) */
    try {
      const d = await caches.open(DONNEES);
      const deja = new Set((await d.keys()).map(q => new URL(q.url).pathname.slice(BASE.length)));
      try { const g = await fetch('data/guinee.json', { cache: 'no-cache' }); if (g.ok) await d.put('data/guinee.json', g); } catch (err) { /* pas encore publié */ }
      const r = await fetch('data/villes.json', { cache: 'no-cache' });
      if (r.ok) {
        await d.put('data/villes.json', r.clone());
        const j = await r.json();
        const liste = (j && Array.isArray(j.villes) ? j.villes : []).filter(v => v && typeof v.dossier === 'string' && /^data\/([a-z]+\/)?$/.test(v.dossier));
        const prioritaire = v => v.dossier === 'data/' || deja.has(v.dossier + 'index.json');
        const poids = v => v.stats && +v.stats.voies > 0 ? +v.stats.voies * 340 : 1.5e6;   /* octets estimés du plan */
        let total = 0;
        for (const v of liste.filter(prioritaire).concat(liste.filter(v => !prioritaire(v)))) {
          if (!prioritaire(v) && total + poids(v) > BUDGET) continue;
          total += poids(v);
          try {
            const ix = await fetch(v.dossier + 'index.json', { cache: 'no-cache' }); if (!ix.ok) continue;
            const ij = await ix.clone().json(); await d.put(v.dossier + 'index.json', ix);
            const f = ij && ij.fichiers ? [ij.fichiers.voies, ij.fichiers.sources] : [];
            for (const n of f) if (typeof n === 'string' && /^[a-z]+\.json$/.test(n)) { const x = await fetch(v.dossier + n, { cache: 'no-cache' }); if (x.ok) await d.put(v.dossier + n, x); }
            /* les établissements de la ville (boutiques, écoles, hôpitaux…), s'il y en a */
            try { const x = await fetch(v.dossier + 'lieux.json', { cache: 'no-cache' }); if (x.ok) await d.put(v.dossier + 'lieux.json', x); } catch (err) { /* pas encore publiés */ }
          } catch (err) { /* une ville qui ne répond pas n'empêche pas l'installation */ }
        }
      }
    } catch (err) { /* hors ligne pendant l'installation : les plans seront gardés à la prochaine ouverture */ }
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('itina-geo-appli-') && k !== APPLI) await caches.delete(k);
    await self.clients.claim();
  })());
});

/* « Mettre à jour » dans le studio */
self.addEventListener('message', e => { if (e.data === 'activer') self.skipWaiting(); });

const attendre = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('lent')), ms))]);
/* internet d'abord ; trop lent ou coupé : la copie de l'appareil (la réponse arrivée plus tard met la copie à jour) */
async function reseauDabord(req, nom, ms, secours) {
  const c = await caches.open(nom);
  const f = fetch(req).then(r => { if (r && r.ok) c.put(req, r.clone()).catch(() => {}); return r; });
  try { return await attendre(f, ms); }
  catch (err) {
    const m = await caches.match(req, { ignoreSearch: true }) || (secours ? await caches.match(new URL(secours, self.location).href) : null);
    if (m) { f.catch(() => {}); return m; } return f;
  }
}
async function appareilDabord(req) { const m = await caches.match(req, { ignoreSearch: true }); return m || fetch(req); }
async function polices(req) {
  const c = await caches.open(POLICES), m = await c.match(req);
  const f = fetch(req).then(r => { if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone()).catch(() => {}); return r; }).catch(() => m);
  return m || f;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.origin === self.location.origin) {
    if (!u.pathname.startsWith(BASE)) return;                        /* autre site du même compte (carte de Kaloum) : réseau */
    const rel = u.pathname.slice(BASE.length);
    if (rel.startsWith('data/')) { e.respondWith(reseauDabord(req, DONNEES, 4000)); return; }
    if (req.mode === 'navigate') {
      if (rel === 'studio.html') { e.respondWith(appareilDabord(new Request(new URL('studio.html', self.location).href))); return; }
      e.respondWith(reseauDabord(req, PAGES, 4000, rel === '' || rel === 'index.html' ? 'index.html' : null)); return;
    }
    /* fichiers demandés par le studio : ceux de sa version ; par les autres pages : internet d'abord */
    e.respondWith((async () => {
      const cl = e.clientId ? await self.clients.get(e.clientId) : null;
      if (cl && new URL(cl.url).pathname.endsWith('/studio.html')) return appareilDabord(req);
      return reseauDabord(req, PAGES, 4000);
    })());
    return;
  }
  if (u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com') e.respondWith(polices(req));
});
