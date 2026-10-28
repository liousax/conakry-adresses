/* Conakry Adresses : construction du référentiel à partir d'OpenStreetMap (utilisé par l'atelier).
   Fonctions pures : elles marchent dans le navigateur et dans Node.js. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core.js'), require('./noms.js'));
  else root.AtelierConakry = factory(root.ConakryAdresses, root.NomsConakry);
}(typeof self !== 'undefined' ? self : this, function (CA, NOMS) {
'use strict';
const { chainOf, dist, norm, encodeLine, CLASSES, MAJEUR, mLat, mLon } = CA._interne;

/* ---------- les 13 communes de la zone spéciale de Conakry ---------- */
const COMMUNES = [
  { code: 'KAL', nom: 'Kaloum', cp: '88000', alias: ['kaloum'] },
  { code: 'DIX', nom: 'Dixinn', cp: '88100', alias: ['dixinn'] },
  { code: 'MTM', nom: 'Matam', cp: '88200', alias: ['matam'] },
  { code: 'RAT', nom: 'Ratoma', cp: '88300', alias: ['ratoma'] },
  { code: 'MTT', nom: 'Matoto', cp: '88400', alias: ['matoto'] },
  { code: 'KAS', nom: 'Kassa', cp: '88500', alias: ['kassa', 'ile de kassa', 'iles de loos', 'ile kassa'], parent: 'KAL' },
  { code: 'LAM', nom: 'Lambanyi', cp: '88600', alias: ['lambanyi', 'lambandji', 'lambanyie'], parent: 'RAT' },
  { code: 'SON', nom: 'Sonfonia', cp: '88700', alias: ['sonfonia'], parent: 'RAT' },
  { code: 'GBE', nom: 'Gbessia', cp: '88800', alias: ['gbessia'], parent: 'MTT' },
  { code: 'TOM', nom: 'Tombolia', cp: '88900', alias: ['tombolia'], parent: 'MTT' },
  { code: 'KAG', nom: 'Kagbélen', cp: '89000', alias: ['kagbelen', 'kagbelin'] },
  { code: 'MAN', nom: 'Manéah', cp: '89100', alias: ['maneah', 'manea'] },
  { code: 'SAN', nom: 'Sanoyah', cp: '89200', alias: ['sanoyah', 'sanoya'], parent: 'MAN' }
];
/* quartiers des communes issues du redécoupage de Ratoma et Matoto (Guinéenews, 29 avril 2024) */
const OFFICIEL = {
  RAT: ['Taouyah', 'Ratoma Dispensaire', 'Ratoma Centre', 'Kaporo Rails', 'Hamdallaye 1', 'Hamdallaye 2', 'Koloma Soloprimo', 'Kipé', 'Kaporo Centre'],
  LAM: ['Nongo-centre', 'Nongo Taady', 'Lambanyi', 'Yembeya', 'Waréah', 'Simbaya Gare', 'Yattaya centre', 'Nassouroulaye', 'Bantounka 1', 'Bantounka 2', 'Soumambossia', 'Wanindara', 'Wanindara Rails', 'Kinifi'],
  SON: ['Kobayah', 'Yattaya Fossidet', 'Yattaya centre', 'Sonfonia Gare 1', 'Sonfonia Gare 2', 'Sonfonia Centre 1', 'Sonfonia Centre 2'],
  MTT: ['Matoto Centre', 'Simbaya 2', 'Simbaya Ecole', 'Matoto Marché', 'Matoto Khabitaya', 'Sangoyah Mosquée', 'Sangoyah Marché', 'Kissosso', 'Kissosso Plateau', 'Marché Enco 5', 'Wanindara Dispensaire', 'Wanindara Marché'],
  GBE: ['Dabondy 1', 'Dabondy 2', 'Dabondy 3', 'Dabondy Ecole', 'Dabondy Rails', 'Gbessia Cité 1', 'Gbessia Cité 2', 'Gbessia Cité 3', 'Gbessia Ecole', 'Gbessia Centre', 'Gbessia Port 1', 'Gbessia Port 2', 'Dar-Es-Salam', "Cité de l'air", 'Béhanzin', 'Tanènè Marché', 'Tanènè Mosquée', 'Yimbaya Ecole', 'Yimbaya Permanence', 'Yimbaya Port', 'Hamdallaye Mosquée', 'Yimbaya Tannerie', 'Simbaya 1', 'Koloma 1', 'Koloma 2', 'Nassouroulaye'],
  TOM: ['Enta Marché', 'Enta Fassa', 'Tombolia', 'Tombolia Plateau', 'Dabompa Village', 'Dabompa Plateau', 'Lansanayah']
};
const BBOX = { s: 9.38, w: -13.90, n: 9.86, e: -13.30 };   /* zone téléchargée (un peu plus large que Conakry) */
const HW = /^(trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|residential|unclassified|living_street|pedestrian|track)$/;
const PLACES = /^(suburb|quarter|neighbourhood|village|hamlet)$/;

/* ---------- outils géométriques ---------- */
const P2 = p => [p.lon * mLon, p.lat * mLat];
function inRings(rings, p) { for (const r of rings) if (CA._interne.inRing(r, p.lon, p.lat)) return true; return false; }
function ringsArea(rings) { return rings.reduce((a, r) => a + CA._interne.ringArea(r), 0); }
function simplify(pts, tolM) {           /* Douglas-Peucker sur [lon,lat] */
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [a, b] = st.pop(); let md = 0, mi = -1;
    const ax = pts[a][0] * mLon, ay = pts[a][1] * mLat, bx = pts[b][0] * mLon, by = pts[b][1] * mLat, vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy || 1;
    for (let i = a + 1; i < b; i++) { const px = pts[i][0] * mLon, py = pts[i][1] * mLat, t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / L2)), d = Math.hypot(px - ax - t * vx, py - ay - t * vy); if (d > md) { md = d; mi = i; } }
    if (md > tolM) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  return pts.filter((p, i) => keep[i]);
}
function hull(points) {                  /* enveloppe convexe [lon,lat] */
  const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
function grow(ring, m) {                 /* agrandit un polygone convexe de m mètres */
  const cx = ring.reduce((a, p) => a + p[0], 0) / ring.length, cy = ring.reduce((a, p) => a + p[1], 0) / ring.length;
  return ring.map(p => { const dx = (p[0] - cx) * mLon, dy = (p[1] - cy) * mLat, n = Math.hypot(dx, dy) || 1; return [p[0] + dx / n * m / mLon, p[1] + dy / n * m / mLat]; });
}
/* anneaux extérieurs d'une relation OpenStreetMap (géométrie « out geom ») */
function ringsOf(rel) {
  const k = p => p.lat.toFixed(7) + ',' + p.lon.toFixed(7);
  const pool = (rel.members || []).filter(m => m.type === 'way' && m.role !== 'inner' && m.geometry && m.geometry.length > 1).map(m => m.geometry.slice());
  const rings = [];
  while (pool.length) {
    let ring = pool.pop();
    for (let guard = 0; guard < 5000 && k(ring[0]) !== k(ring[ring.length - 1]); guard++) {
      const end = k(ring[ring.length - 1]); let found = -1, rev = false;
      for (let i = 0; i < pool.length; i++) { if (k(pool[i][0]) === end) { found = i; break; } if (k(pool[i][pool[i].length - 1]) === end) { found = i; rev = true; break; } }
      if (found < 0) break;
      const w = pool.splice(found, 1)[0]; ring = ring.concat((rev ? w.reverse() : w).slice(1));
    }
    if (ring.length >= 4 && (k(ring[0]) === k(ring[ring.length - 1]) || dist(ring[0], ring[ring.length - 1]) < 80)) rings.push(ring.map(p => [p.lon, p.lat]));
  }
  return rings;
}
const owOf = t => t.oneway === '-1' ? -1 : (['yes', 'true', '1'].includes(t.oneway) || t.junction === 'roundabout' || t.junction === 'circular') ? 1 : 0;
const hwOf = h => h.replace(/_link$/, '');
const lenOf = g => g.reduce((s, p, i) => i ? s + dist(g[i - 1], p) : 0, 0);
const NK = p => p.lat.toFixed(6) + ',' + p.lon.toFixed(6);
function nameOf(t) {
  const n = (t.name || t['name:fr'] || '').trim(); if (n) return n;
  const r = (t.ref || '').trim(); if (!r) return '';
  return /^(RN|N|RP)\s*\d/i.test(r) ? 'Route ' + r.toUpperCase() : 'Rue ' + r;
}
const TYPES = /^(rue|ruelle|avenue|boulevard|route|impasse|place|corniche|autoroute|voie|allee|quai|pont|rond point|chemin|sentier|piste|passage|carrefour|penetrante|bretelle)\s+/;
const ART = /^(de la|du|des|de l|de|d|la|le|les|l)\s+/;
function codeBase(name) {
  let n = norm(name).replace(TYPES, '').replace(ART, '');
  let c = n.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (c.length < 4) c = norm(name).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return c.slice(0, 16) || 'VOIE';
}
/* clé d'un nom, sans le type de voie ni l'article : « Rue des Manguiers » → « manguiers » */
const cle = n => norm(n).replace(TYPES, '').replace(ART, '').trim();

/* ---------- noms : un vrai nom, ou seulement un numéro ? (même règle que le plan de Kaloum) ---------- */
const DATE = /\b\d{1,2}(er)?\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\b/;
const SEUL = /^(rue|ruelle|avenue|boulevard|route|piste|chemin|sentier|voie|impasse|allee|passage|pont|place|carrefour|rond point|bretelle|autoroute|corniche|quai)$/;
function nomReel(n) {
  const k = norm(n);
  if (k.length <= 3 || SEUL.test(k)) return false;
  if (/\b(sans nom|unnamed|no name|inconnue?)\b/.test(k)) return false;
  return !/\d/.test(k) || DATE.test(k);                    /* « Rue DI 501 », « 5e Avenue », « Route N1 » : un numéro ; « Avenue du 3 Avril 1984 » : un nom */
}
/* type de voie d'un nom proposé : Avenue pour les grands axes (comme à Kaloum), Impasse pour un cul-de-sac */
function typeVoie(s) {
  if (MAJEUR[s.hw]) return 'Avenue';
  if (s.hw === 'track') return 'Chemin';
  if (s.hw === 'pedestrian') return 'Passage';
  return s.impasse ? 'Impasse' : 'Rue';
}
/* « Route Le Prince » → « de la Route Le Prince » (nom d'une bretelle) */
const FEM = new Set(['rue', 'ruelle', 'avenue', 'route', 'autoroute', 'corniche', 'impasse', 'place', 'voie', 'allee', 'penetrante', 'piste', 'rocade', 'chaussee']);
const MAS = new Set(['boulevard', 'chemin', 'pont', 'quai', 'carrefour', 'rond', 'passage', 'sentier']);
function deNom(n) {
  const k = norm(n), w = k.split(' ')[0];
  if (/^le /.test(k)) return 'du ' + n.replace(/^le\s+/i, '');
  if (/^les /.test(k)) return 'des ' + n.replace(/^les\s+/i, '');
  if (/^la /.test(k)) return 'de ' + n;
  if (FEM.has(w)) return (/^[aeiouy]/.test(w) ? "de l'" : 'de la ') + n;
  if (MAS.has(w)) return 'du ' + n;
  return (/^[aeiouy]/.test(k) ? "d'" : 'de ') + n;
}
/* distance d'édition au plus 1 (« Telli » / « Telly ») */
function lev1(a, b) {
  if (a === b) return true;
  const la = a.length, lb = b.length; if (Math.abs(la - lb) > 1) return false;
  let i = 0, j = 0, e = 0;
  while (i < la && j < lb) { if (a[i] === b[j]) { i++; j++; continue; } if (++e > 1) return false; if (la > lb) i++; else if (lb > la) j++; else { i++; j++; } }
  return e + (la - i) + (lb - j) <= 1;
}
const proche = (a, b) => a === b || (a.length >= 5 && b.length >= 5 && a[0] === b[0] && lev1(a, b));
const PART = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'el', 'al', 'ibn', 'ben', 'bin', 'van', 'von', 'der', 'dos', 'da', 'wa', 'et', 'hadj', 'hadja', 'hadji', 'elhadj', 'almamy', 'tierno', 'thierno', 'cheick', 'cheikh',
  'imam', 'reine', 'roi', 'emir', 'saint', 'dr', 'docteur', 'general', 'colonel', 'president', 'professeur', 'sir', 'mansa', 'karamoko', 'alfa', 'alpha', 'princesse', 'prince', 'mbuya', 'ier', 'ii', 'iii',
  'rue', 'avenue', 'boulevard', 'route', 'impasse', 'place', 'rond', 'point', 'pont', 'carrefour', 'corniche', 'autoroute', 'allee', 'chemin', 'voie', 'quai', 'penetrante', 'passage']);
const sig = n => { const t = norm(n).split(' ').filter(w => w.length >= 2 && !PART.has(w)); return t.length ? t : norm(n).split(' ').filter(Boolean); };

/* ---------- attribution des noms ----------
   1. un vrai nom OpenStreetMap est gardé (nom d'usage) ;
   2. une rue qui n'a qu'un numéro, ou pas de nom, reçoit un nom proposé, gardé d'une version à l'autre :
      - les rues les plus importantes : une personnalité (Guinée, puis Afrique, puis le monde), une seule fois dans la ville ;
      - les autres : un nom des séries, jamais deux fois dans la même commune (si une commune a plus de rues
        que de noms, un nom revient, mais jamais deux fois dans le même quartier) ;
   3. une bretelle prend le nom de la route qu'elle dessert. */
function nommer(rues, ctx) {
  const { plan, Q, prev, rapport } = ctx;
  const R = rapport.noms = { gardes: 0, numerotes: 0, proposes: 0, personnalites: 0, series: 0, herites: 0, bretelles: 0, repetes: 0, memeCommune: 0 };
  const PERS = NOMS.personnalites(), THEME = NOMS.series();
  const persById = {}; PERS.forEach(p => { persById[p.id] = p; });
  const persByNom = {}; PERS.forEach(p => { persByNom[norm(p.nom)] = p; });
  const dedicace = p => (p.dates ? p.dates + ' · ' : '') + p.bio;
  /* noms déjà pris : rues avec un vrai nom, plan de Kaloum, quartiers, communes */
  const existants = [];
  const used = new Map(), usedQ = new Map();
  const U = k => { if (!used.has(k)) used.set(k, new Set()); return used.get(k); };
  const UQ = k => { if (!usedQ.has(k)) usedQ.set(k, new Set()); return usedQ.get(k); };
  const pris = new Set();
  const prend = (s, nom) => { const k = cle(nom); U(s.commune).add(k); UQ(s.qcp).add(k); };
  if (plan) for (const r of plan.rues) for (const n of [r.n, r.a, r.p]) if (n) { existants.push(n); pris.add(cle(n)); U('KAL').add(cle(n)); }
  for (const s of rues) {
    if (s.link) continue;
    if (s.name && nomReel(s.name)) { s.nom = s.name; s.st = 'usage'; R.gardes++; existants.push(s.name); pris.add(cle(s.name)); prend(s, s.name); }
    else if (s.name) { s.ancien = s.name; R.numerotes++; }
  }
  const lieux = Q.map(q => q.nom).concat(COMMUNES.map(c => c.nom));
  existants.push(...lieux);
  const lieuxTok = lieux.map(n => norm(n).split(' ').filter(Boolean));
  /* une personnalité déjà honorée par une rue ou un lieu (« Diallo Telli » ≈ « Boulevard Diallo Telly ») */
  const exTok = existants.map(n => norm(n).split(' ').filter(Boolean));
  const tokIdx = new Map(); exTok.forEach((t, i) => t.forEach(w => { if (!tokIdx.has(w)) tokIdx.set(w, []); tokIdx.get(w).push(i); }));
  const toks = [...tokIdx.keys()];
  const honoree = p => {
    const s = sig(p.nom);
    const cand = new Set(); for (const w of toks) if (proche(s[0], w)) for (const i of tokIdx.get(w)) cand.add(i);
    for (const i of cand) if (s.every(w => exTok[i].some(x => proche(w, x)))) return true;
    return false;
  };
  /* nom d'une série qui ressemble à un quartier ou à une commune (« de Lansanaya » / « Lansanayah ») */
  const commeLieu = k => { const kt = k.split(' '); return lieuxTok.some(t => { for (let i = 0; i + kt.length <= t.length; i++) if (kt.every((w, j) => proche(w, t[i + j]))) return true; return false; }); };
  /* noms retirés (publiés puis abandonnés) : jamais redonnés */
  const retires = JSON.parse(JSON.stringify((prev && prev.sources && prev.sources.retires) || {}));
  for (const [k, list] of Object.entries(retires)) if (k !== '*') list.forEach(x => U(k).add(x));
  const persPris = new Set(retires['*'] || []);
  /* 1. noms hérités de la version publiée */
  for (const s of rues) {
    if (s.link || s.nom || !s.prev) continue;
    const pv = s.prev; if (!pv.n || pv.x || pv.st === 'a_nommer' || pv.st === 'provisoire') continue;
    s.nom = pv.n; s.st = pv.st === 'officiel' ? 'officiel' : pv.st === 'usage' ? 'usage' : 'propose';
    if (pv.p) { s.p = pv.p; persPris.add(pv.p); } if (pv.b) s.b = pv.b;
    if (pv.a && !s.ancien) s.ancien = pv.a;
    prend(s, s.nom); R.herites++;
  }
  /* un nom proposé déjà publié, remplacé depuis par un vrai nom : il reste reconnu comme ancien nom */
  for (const s of rues) if (s.st === 'usage' && s.prev && s.prev.st === 'propose' && s.prev.n && norm(s.prev.n) !== norm(s.nom)) { s.ancien = s.prev.n; prend(s, s.prev.n); if (s.prev.p) persPris.add(s.prev.p); }
  if (plan) for (const r of plan.rues) if (r.p) { const p = persByNom[norm(r.p)]; if (p) persPris.add(p.id); }
  /* 2. personnalités : les rues les plus importantes de toute la ville */
  const RANK = { trunk: 0, primary: 0, secondary: 1, tertiary: 2, residential: 3, unclassified: 3, living_street: 4, pedestrian: 4, track: 5 };
  const todo = rues.filter(s => !s.link && !s.nom);
  const pool = PERS.filter(p => !persPris.has(p.id) && !honoree(p));
  R.personnalitesLibres = pool.length;
  let pi = 0;
  for (const s of todo.slice().sort((a, b) => RANK[a.hw] - RANK[b.hw] || b.len - a.len)) {
    if (pi >= pool.length) break;
    if (RANK[s.hw] > 3 || s.impasse || s.len < 100) continue;
    const p = pool[pi++];
    s.nom = typeVoie(s) + ' ' + p.c; s.st = 'propose'; s.p = p.id; s.b = dedicace(p); prend(s, s.nom); R.personnalites++;
  }
  /* 3. séries : commune par commune, quartier par quartier (les rues voisines prennent des noms de la même série) */
  const tk = THEME.map(x => cle(x.c)), tOk = tk.map(k => !pris.has(k) && !commeLieu(k));
  /* noms qui se ressemblent (« des Saules » / « des Sauges ») : jamais ensemble dans une commune */
  const near = tk.map(() => []);
  for (let i = 0; i < tk.length; i++) for (let j = i + 1; j < tk.length; j++) if (tk[i].length >= 5 && tk[j].length >= 5 && proche(tk[i], tk[j])) { near[i].push(j); near[j].push(i); }
  const libre = (i, set) => tOk[i] && !set.has(tk[i]) && near[i].every(j => !set.has(tk[j]));
  const ordreC = {}; COMMUNES.forEach((c, i) => { ordreC[c.code] = i; });
  let cur = 0;
  const rest = todo.filter(s => !s.nom).sort((a, b) => ordreC[a.commune] - ordreC[b.commune] || (a.qcp < b.qcp ? -1 : a.qcp > b.qcp ? 1 : 0) || RANK[a.hw] - RANK[b.hw] || b.len - a.len);
  for (const s of rest) {
    const uc = U(s.commune), uq = UQ(s.qcp); let pick = -1;
    for (let n = 0; n < tk.length && pick < 0; n++) { const i = (cur + n) % tk.length; if (libre(i, uc)) pick = i; }
    if (pick < 0) { for (let n = 0; n < tk.length && pick < 0; n++) { const i = (cur + n) % tk.length; if (libre(i, uq)) pick = i; } if (pick >= 0) R.memeCommune++; }
    if (pick < 0) pick = cur % tk.length;
    cur = pick + 1;
    s.nom = typeVoie(s) + ' ' + THEME[pick].c; s.st = 'propose'; s.serie = THEME[pick].s; prend(s, s.nom); R.series++;
  }
  R.proposes = R.personnalites + R.series;
  /* noms des séries portés dans plusieurs communes */
  const parCle = new Map(); for (const s of rues) if (s.serie) { const k = cle(s.nom); if (!parCle.has(k)) parCle.set(k, new Set()); parCle.get(k).add(s.commune); }
  R.repetes = [...parCle.values()].filter(x => x.size > 1).length;
  if (R.memeCommune) rapport.avertissements.push(R.memeCommune + ' rue(s) portent un nom déjà donné ailleurs dans leur commune (jamais dans le même quartier) : la liste de noms est plus courte que le nombre de rues de la commune.');
  /* 4. bretelles : le nom de la route qu'elles desservent */
  const atNode = new Map();
  rues.forEach((s, i) => { if (s.link) return; for (const g of s.segs) for (const p of g) { const k = NK(p), o = atNode.get(k); if (o === undefined || RANK[rues[o].hw] > RANK[s.hw] || (RANK[rues[o].hw] === RANK[s.hw] && rues[o].len < s.len)) atNode.set(k, i); } });
  for (let pass = 0; pass < 3; pass++) for (const s of rues) {
    if (!s.link || s.nom) continue;
    let best = null;
    for (const g of s.segs) for (const p of [g[0], g[g.length - 1]]) { const i = atNode.get(NK(p)); if (i !== undefined && rues[i].nom && (!best || RANK[rues[i].hw] < RANK[best.hw])) best = rues[i]; }
    if (!best && pass < 2) continue;
    s.nom = best ? (best.link ? best.nom : 'Bretelle ' + deNom(best.nom)) : 'Bretelle de ' + ((Q.find(q => q.cp === s.qcp) || {}).nom || 'Conakry');
    s.st = best ? best.st : 'propose'; R.bretelles++;
    for (const g of s.segs) for (const p of g) if (!atNode.has(NK(p))) atNode.set(NK(p), rues.indexOf(s));
  }
  /* noms proposés publiés puis abandonnés (rue disparue d'OpenStreetMap…) : retirés pour de bon */
  if (prev && prev.voies) {
    const now = new Map(); for (const s of rues) for (const n of [s.nom, s.ancien]) if (n) { const k = s.commune + '|' + cle(n); now.set(k, 1); }
    const persNow = new Set(rues.map(s => s.p).filter(Boolean));
    for (const v of prev.voies.voies) {
      if (v.st !== 'propose' || v.k === 'KAL' || v.x) continue;
      if (!now.has(v.k + '|' + cle(v.n))) { (retires[v.k] = retires[v.k] || []).includes(cle(v.n)) || retires[v.k].push(cle(v.n)); }
      if (v.p && !persNow.has(v.p)) { (retires['*'] = retires['*'] || []).includes(v.p) || retires['*'].push(v.p); }
    }
  }
  return { retires, persById, persByNom, dedicace };
}

/* nom d'une limite OpenStreetMap → commune (« Commune de Ratoma », « Sous-préfecture de Manéah »…) */
const EXTRA = new Set(['commune', 'de', 'du', 'la', 'sous', 'prefecture', 'urbaine', 'rurale', 'cu', 'cr', 'sp']);
function matchCommune(names) {
  for (const c of COMMUNES) for (const n of names) for (const a of c.alias) {
    const nt = n.split(' '), at = a.split(' ');
    for (let i = 0; i + at.length <= nt.length; i++) if (at.every((w, j) => nt[i + j] === w)) { const rest = nt.slice(0, i).concat(nt.slice(i + at.length)); if (rest.every(w => EXTRA.has(w))) return c; }
  }
  return null;
}

/* ---------- quartiers : rapprocher un nom d'OpenStreetMap des listes officielles ----------
   « Sonfonia Gare » → Sonfonia Gare 1 (Sonfonia) ; « Lambandji » → Lambanyi ; « Tanéné Daron » → Tanènè Marché (Gbessia) */
const GENQ = new Set(['centre', 'marche', 'gare', 'ecole', 'village', 'plateau', 'cite', 'port', 'mosquee', 'rails', 'permanence', 'dispensaire', 'quartier', 'secteur', 'les', 'des']);
const sansNo = k => k.replace(/(\s+(\d+|[ivx]+))+$/, '').trim();
const motsQ = k => k.split(' ').filter(w => w.length >= 3 && !GENQ.has(w) && !/^\d+$/.test(w));
function levMax(a, b, max) {                 /* distance d'édition, arrêtée dès qu'elle dépasse max */
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let best = i;
    for (let j = 1; j <= b.length; j++) { cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); if (cur[j] < best) best = cur[j]; }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}
/* mêmes sons, autre orthographe : « Soumambossia » / « Simanbossia », « Kobayah » / « Kobaya », « Lambandji » / « Lambanyi » */
const phon = w => w.replace(/ou/g, 'u').replace(/dj/g, 'j').replace(/y/g, 'i').replace(/h$/, '').replace(/(.)\1+/g, '$1');
const procheQ = (a, b) => { if (a === b) return true; if (a.length < 4 || b.length < 4) return false; const x = phon(a), y = phon(b); return x[0] === y[0] && levMax(x, y, 2) <= (Math.min(x.length, y.length) >= 7 ? 2 : 1); };
/* quartiers officiels, et le nom de chaque commune (son quartier principal porte souvent ce nom : « Sanoyah », « Gbessia ») */
const OFF = Object.entries(OFFICIEL).flatMap(([code, list]) => list.map(n => ({ code, nom: n })))
  .concat(COMMUNES.flatMap(c => [c.nom].concat(c.alias).map(n => ({ code: c.code, nom: n }))))
  .map(o => { const k = norm(o.nom); return Object.assign(o, { k, s: sansNo(k), m: motsQ(k) }); });
/* commune d'un quartier d'après son nom, parmi les communes d'une même ancienne limite : du rapprochement le plus sûr
   au plus large ; null si aucun quartier officiel ne ressemble, ou s'il en ressemble dans plusieurs communes */
function communeOfficielle(nom, communes) {
  const k = norm(nom), s = sansNo(k), m = motsQ(k), m0 = m[0];
  const L = OFF.filter(o => communes.includes(o.code));
  const essais = [o => o.k === k, o => o.s === s, o => !!m0 && o.m[0] === m0, o => !!m0 && !!o.m[0] && procheQ(m0, o.m[0]), o => m.some(w => w.length >= 5 && o.m.includes(w))];
  for (const e of essais) { const set = new Set(L.filter(e).map(o => o.code)); if (set.size === 1) return [...set][0]; if (set.size > 1) return null; }
  return null;
}
/* lieux d'OpenStreetMap qui ne sont pas des quartiers (« Domicile Mr … », « Kiosque … », « Secteur 3 ») */
const FAUX = /^(domicile|chez|kiosque|boutique|maison|magasin|station|pharmacie|restaurant|hotel|bar|garage|clinique|cabinet|bureau|entrepot|depot|usine|ecole|mosquee|eglise|mr|mme|monsieur|madame|secteur|district|zone|prefecture|sous prefecture|region|commune)\b|\bdomicile\b/;
/* centre d'une limite : centre de gravité de son plus grand anneau [lon,lat] */
function centre(rings) {
  let r = rings[0], ba = -1; for (const x of rings) { const a = CA._interne.ringArea(x); if (a > ba) { ba = a; r = x; } }
  const x0 = r[0][0], y0 = r[0][1]; let A = 0, x = 0, y = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const xi = r[i][0] - x0, yi = r[i][1] - y0, xj = r[j][0] - x0, yj = r[j][1] - y0, f = xj * yi - xi * yj;
    A += f; x += (xj + xi) * f; y += (yj + yi) * f;
  }
  if (!A) return { lon: r.reduce((s, p) => s + p[0], 0) / r.length, lat: r.reduce((s, p) => s + p[1], 0) / r.length };
  return { lon: x0 + x / (3 * A), lat: y0 + y / (3 * A) };
}
const km2 = a => (a * mLon * mLat / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' km²';

/* ---------- construction ---------- */
function construire(src) {
  /* src : { ways, relations, places, plan (Kaloum), precedent: {index, voies, sources} } */
  const rapport = { avertissements: [], communes: {} };
  const warn = m => rapport.avertissements.push(m);
  const plan = src.plan;
  const prev = src.precedent || null;

  /* 1. limites des communes */
  const polys = [], autres = [];
  for (const r of src.relations || []) {
    const t = r.tags || {}; if (t.boundary !== 'administrative') continue;
    const names = [t.name, t['name:fr'], t.official_name, t.alt_name].filter(Boolean).map(norm);
    const c = matchCommune(names), nom = (t['name:fr'] || t.name || '').trim();
    if (!c) { if (nom) autres.push({ r, nom }); continue; }
    const rings = ringsOf(r); if (!rings.length) { warn('Limite de ' + c.nom + ' incomplète dans OpenStreetMap (relation ' + r.id + ').'); continue; }
    polys.push({ c, rings, aire: ringsArea(rings), lvl: +t.admin_level || 99, id: r.id, nom: nom || c.nom });
  }
  const poly = {};
  for (const p of polys) { const o = poly[p.c.code]; if (!o || Math.abs(p.lvl - 8) < Math.abs(o.lvl - 8) || (p.lvl === o.lvl && p.aire > o.aire)) poly[p.c.code] = p; }
  /* OpenStreetMap a encore les limites des 5 communes d'avant le redécoupage : une « commune » bien plus petite que sa
     commune d'origine, et posée dedans, est l'ancien quartier du même nom (Lambanyi, Tombolia…). La commune est alors
     répartie par ses quartiers officiels, et cette limite sert de quartier. */
  for (const c of COMMUNES) {
    const p = poly[c.code], par = c.parent && poly[c.parent];
    if (p && par && p.aire < 0.15 * par.aire && inRings(par.rings, centre(p.rings))) {
      warn(c.nom + ' : la limite « ' + p.nom + ' » d\'OpenStreetMap (' + km2(p.aire) + ') est celle de l\'ancien quartier. La commune est répartie par ses quartiers officiels, à l\'intérieur de ' + COMMUNES.find(x => x.code === c.parent).nom + '.');
      delete poly[c.code];
    }
  }
  /* limites de quartier (petites limites qui ne sont pas celles d'une commune) : leur centre sert de point de quartier */
  const MAXQ = 12e6 / (mLon * mLat);           /* 12 km² */
  const qRel = polys.filter(p => poly[p.c.code] !== p && p.aire < MAXQ).map(p => ({ nom: p.nom, rings: p.rings }));
  for (const a of autres) { const rings = ringsOf(a.r); if (rings.length && ringsArea(rings) < MAXQ) qRel.push({ nom: a.nom, rings }); }
  /* limites tracées à la main dans l'atelier (communes absentes d'OpenStreetMap), gardées d'une version à l'autre */
  const manuel = {};
  if (prev && prev.index && prev.index.zones) for (const z of prev.index.zones) if (z.source === 'manuel') manuel[z.communes[0]] = z.rings.map(r => CA._interne.decodeLine(r).map(p => [p.lon, p.lat]));
  for (const [k, v] of Object.entries(src.manuelles || {})) { if (v) manuel[k] = v; else delete manuel[k]; }
  for (const c of COMMUNES) if (!poly[c.code] && manuel[c.code] && manuel[c.code].length) poly[c.code] = { c, rings: manuel[c.code], aire: ringsArea(manuel[c.code]), lvl: 8, id: 'manuel', manuel: true };

  /* Kaloum : la presqu'île vient du plan figé (lecture seule) ; les îles vont à Kassa */
  const planPts = plan ? plan.rues.flatMap(r => r.g.flat()) : [];
  const kHull = planPts.length ? hull(planPts) : null, kHullBig = kHull ? grow(kHull, 300) : null;
  if (plan && !poly.KAL) { poly.KAL = { c: COMMUNES[0], rings: [grow(kHull, 60)], aire: 0, lvl: 8, id: 'plan' }; poly.KAL.aire = ringsArea(poly.KAL.rings); warn('Limite de Kaloum absente : on utilise le contour des rues du plan de Kaloum.'); }
  const inKalPlan = p => kHullBig && CA._interne.inRing(kHullBig, p.lon, p.lat);

  /* zones : une par limite trouvée ; une commune sans limite est rattachée à sa commune d'origine */
  const zones = [];
  for (const c of COMMUNES) {
    if (!poly[c.code]) continue;
    const z = { nom: c.nom, communes: [c.code], rings: poly[c.code].manuel ? poly[c.code].rings : poly[c.code].rings.map(r => simplify(r, 12)), aire: poly[c.code].aire, source: poly[c.code].manuel ? 'manuel' : poly[c.code].id === 'plan' ? 'plan' : 'osm' };
    for (const ch of COMMUNES) if (ch.parent === c.code && !poly[ch.code]) z.communes.push(ch.code);
    zones.push(z);
  }
  for (const c of COMMUNES) {
    const r = rapport.communes[c.code] = { nom: c.nom, cp: c.cp, limite: poly[c.code] ? (poly[c.code].manuel ? 'tracée dans l\'atelier' : poly[c.code].id === 'plan' ? 'contour du plan de Kaloum' : 'OpenStreetMap') : null, quartiers: 0, voies: 0, km: 0, manuel: !!(poly[c.code] && poly[c.code].manuel) };
    if (!poly[c.code]) {
      const par = c.parent && poly[c.parent];
      if (par) r.limite = 'dans ' + COMMUNES.find(x => x.code === c.parent).nom + ' (par les quartiers)';
      else warn('Commune de ' + c.nom + ' : aucune limite dans OpenStreetMap. Tracez-la dans l\'aperçu pour inclure ses rues.');
    }
  }
  zones.forEach(z => { z.ix = z.rings.map(CA._interne.ringIndex); });
  const zoneOf = p => { let z = null; for (const k of zones) if ((!z || k.aire < z.aire) && k.ix.some(ix => CA._interne.inRingIdx(ix, p.lon, p.lat))) z = k; return z; };
  if (!zones.length) throw new Error('Aucune limite de commune trouvée : vérifiez le téléchargement OpenStreetMap.');

  /* 2. quartiers */
  const prevQ = {};
  if (prev && prev.index) for (const q of prev.index.quartiers) prevQ[q[4] + '|' + norm(q[0])] = q[1];
  const quartiers = [];
  if (plan) plan.quartiers.forEach(q => quartiers.push({ nom: q[0], cp: q[1], lat: q[2], lon: q[3], commune: 'KAL', fixe: true }));
  /* points de quartier : les lieux d'OpenStreetMap, puis le centre des limites de quartier */
  const lieux = [], ecartes = [], pend = [];
  for (const n of src.places || []) { const t = n.tags || {}; if (t.name && t.name.trim() && PLACES.test(t.place || '')) lieux.push({ nom: t.name.trim(), lat: n.lat, lon: n.lon, place: t.place }); }
  for (const r of qRel) { const c = centre(r.rings); lieux.push({ nom: r.nom, lat: c.lat, lon: c.lon, place: 'limite' }); }
  let parLimite = 0;
  for (const l of lieux) {
    if (FAUX.test(norm(l.nom))) { if (l.place !== 'limite') ecartes.push(l.nom); continue; }
    const p = { lat: l.lat, lon: l.lon }, z = zoneOf(p); if (!z) continue;
    let commune = null;
    if (z.communes.includes('KAL')) { if (inKalPlan(p)) continue; commune = z.communes.includes('KAS') ? 'KAS' : 'KAL'; if (commune === 'KAL') continue; }
    else if (z.communes.length === 1) commune = z.communes[0];
    else commune = communeOfficielle(l.nom, z.communes);
    const q = { nom: l.nom, lat: l.lat, lon: l.lon, commune, zone: z, place: l.place };
    if (l.place === 'limite') parLimite++;
    if (commune) quartiers.push(q); else pend.push(q);
  }
  rapport.quartiersParLimite = parLimite;
  if (ecartes.length) warn(ecartes.length + (ecartes.length > 1 ? ' lieux d\'OpenStreetMap écartés, qui ne sont pas des quartiers : ' : ' lieu d\'OpenStreetMap écarté, qui n\'est pas un quartier : ') + ecartes.slice(0, 6).join(', ') + (ecartes.length > 6 ? '…' : '') + '.');
  /* quartiers sans commune certaine : celle des quartiers voisins */
  for (const q of pend) {
    let b = null, bd = Infinity;
    for (const o of quartiers) if (o.commune && q.zone.communes.includes(o.commune)) { const d = Math.hypot((q.lat - o.lat) * mLat, (q.lon - o.lon) * mLon); if (d < bd) { bd = d; b = o; } }
    q.commune = b ? b.commune : q.zone.communes[0]; quartiers.push(q);
  }
  /* doublons (même nom, même commune, à moins de 1,5 km) */
  const uniq = [];
  for (const q of quartiers) {
    const d = uniq.find(o => o.commune === q.commune && norm(o.nom) === norm(q.nom) && Math.hypot((o.lat - q.lat) * mLat, (o.lon - q.lon) * mLon) < 1500);
    if (d) { if (!d.fixe) { d.lat = (d.lat + q.lat) / 2; d.lon = (d.lon + q.lon) / 2; } } else uniq.push(q);
  }
  /* codes postaux : commune + numéro du quartier, d'ouest en est ; un code déjà publié ne change pas */
  for (const c of COMMUNES) {
    const list = uniq.filter(q => q.commune === c.code && !q.fixe).sort((a, b) => a.lon - b.lon || a.lat - b.lat);
    const taken = new Set(uniq.filter(q => q.commune === c.code && q.fixe).map(q => q.cp));
    for (const q of list) { const p = prevQ[c.code + '|' + norm(q.nom)]; if (p && !taken.has(p)) { q.cp = p; taken.add(p); } }
    let n = 1;
    for (const q of list) { if (q.cp) continue; while (taken.has(String(+c.cp + n)) && n < 99) n++; if (n >= 99) { warn(c.nom + ' : plus de 98 quartiers, les suivants sont ignorés.'); q.drop = true; continue; } q.cp = String(+c.cp + n); taken.add(q.cp); }
  }
  const Q = uniq.filter(q => q.cp && !q.drop);
  for (const c of COMMUNES) rapport.communes[c.code].quartiers = Q.filter(q => q.commune === c.code).length;
  for (const c of COMMUNES) if (!Q.some(q => q.commune === c.code) && poly[c.code]) warn(c.nom + ' : aucun quartier trouvé dans OpenStreetMap.');
  for (const c of COMMUNES) if (c.parent && !poly[c.code] && poly[c.parent] && !Q.some(q => q.commune === c.code)) warn(c.nom + ' : aucun de ses quartiers n\'a été trouvé dans la limite de ' + COMMUNES.find(x => x.code === c.parent).nom + '. Tracez sa limite dans l\'aperçu pour inclure ses rues.');
  const couvre = (q, n) => { const a = norm(q), b = norm(n); return a === b || sansNo(a) === sansNo(b); };
  const sansPos = []; for (const [code, list] of Object.entries(OFFICIEL)) for (const n of list) if (!Q.some(q => q.commune === code && couvre(q.nom, n))) sansPos.push(n + ' (' + COMMUNES.find(c => c.code === code).nom + ')');
  rapport.quartiersOfficielsSansPosition = sansPos;

  /* référentiel temporaire pour trouver le quartier d'un point (mêmes règles que la bibliothèque) */
  const tmpIndex = { format: 'conakry-adresses', v: 1, communes: COMMUNES, quartiers: Q.map(q => [q.nom, q.cp, q.lat, q.lon, q.commune]),
    zones: zones.map(z => ({ nom: z.nom, communes: z.communes, source: z.source, rings: z.rings.map(r => encodeLine(r.map(p => ({ lon: p[0], lat: p[1] })))) })) };
  const ref = CA.depuis(tmpIndex, { voies: [] });

  /* 3. rues OpenStreetMap hors presqu'île de Kaloum (déjà dans le plan) */
  const kalIx = poly.KAL ? poly.KAL.rings.map(CA._interne.ringIndex) : null;
  const inKal = p => kalIx.some(ix => CA._interne.inRingIdx(ix, p.lon, p.lat));
  const planIds = new Set(plan ? plan.rues.flatMap(r => r.o || []) : []);
  const edgeOw = new Map(), hwById = new Map();
  const units = [];
  const seenWay = new Set();
  for (const w of src.ways || []) {
    if (seenWay.has(w.id)) continue; seenWay.add(w.id);
    const t = w.tags || {}; if (!HW.test(t.highway || '') || !w.geometry || w.geometry.length < 2) continue;
    const g = w.geometry.map(p => ({ lat: +p.lat.toFixed(6), lon: +p.lon.toFixed(6) }));
    const ow = owOf(t); hwById.set(w.id, hwOf(t.highway));
    for (let i = 1; i < g.length; i++) { edgeOw.set(NK(g[i - 1]) + '|' + NK(g[i]), ow); edgeOw.set(NK(g[i]) + '|' + NK(g[i - 1]), -ow); }
    /* on garde les morceaux dans la zone de Conakry, hors presqu'île de Kaloum */
    let run = [];
    const keep = p => { const z = zoneOf(p); if (!z) return false; if (kalIx && plan && inKal(p) && (planIds.has(w.id) || inKalPlan(p))) return false; return true; };
    const flush = () => { if (run.length > 1) units.push({ id: w.id, t, g: run, ow, hw: hwOf(t.highway), name: nameOf(t), link: /_link$/.test(t.highway) }); run = []; };
    for (const p of g) { if (keep(p)) run.push(p); else flush(); }
    flush();
  }

  /* 4. regroupement en rues */
  const streets = [];
  const named = new Map(), unnamed = [];
  for (const u of units) { if (u.name && !u.link) { const k = norm(u.name); if (!named.has(k)) named.set(k, []); named.get(k).push(u); } else unnamed.push(u); }
  /* même nom : un morceau par ensemble de tronçons qui se touchent (à 40 m près) */
  for (const list of named.values()) {
    const par = list.map((_, i) => i), find = i => par[i] === i ? i : (par[i] = find(par[i]));
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i].g, b = list[j].g;
      const ends = [[a[0], b[0]], [a[0], b[b.length - 1]], [a[a.length - 1], b[0]], [a[a.length - 1], b[b.length - 1]]];
      if (ends.some(([p, q]) => Math.abs(p.lat - q.lat) < 0.0005 && Math.abs(p.lon - q.lon) < 0.0005 && dist(p, q) < 40)) par[find(i)] = find(j);
    }
    const groups = new Map(); list.forEach((u, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(u); });
    for (const us of groups.values()) streets.push({ name: us[0].name, units: us });
  }
  /* sans nom : on relie les tronçons qui se suivent tout droit, y compris à travers un carrefour
     (une rue sans nom qui traverse plusieurs carrefours reste une seule rue, avec un seul nom et une seule numérotation) */
  const dirAt = (g, fromEnd) => {                   /* direction de la rue en partant d'un bout (sur 15 m au moins) */
    const a = fromEnd ? g[g.length - 1] : g[0]; let b = a;
    for (let i = 1; i < g.length; i++) { b = fromEnd ? g[g.length - 1 - i] : g[i]; if (dist(a, b) >= 15) break; }
    return Math.atan2((b.lat - a.lat) * mLat, (b.lon - a.lon) * mLon);
  };
  const ends = new Map();
  unnamed.forEach((u, i) => { for (const e of [0, 1]) { const k = NK(e ? u.g[u.g.length - 1] : u.g[0]); if (!ends.has(k)) ends.set(k, []); ends.get(k).push({ i, dir: dirAt(u.g, e) }); } });
  const par = unnamed.map((_, i) => i), find = i => par[i] === i ? i : (par[i] = find(par[i]));
  for (const l of ends.values()) {
    if (l.length < 2) continue;
    const lim = l.length === 2 ? Math.PI * 0.75 : Math.PI * 5 / 6;   /* écart toléré : 45° entre deux tronçons, 30° dans un carrefour */
    const pairs = [];
    for (let x = 0; x < l.length; x++) for (let y = x + 1; y < l.length; y++) {
      const a = l[x], b = l[y]; if (a.i === b.i) continue;
      if (unnamed[a.i].hw !== unnamed[b.i].hw || unnamed[a.i].link !== unnamed[b.i].link) continue;
      let d = Math.abs(a.dir - b.dir); if (d > Math.PI) d = 2 * Math.PI - d;
      if (d > lim) pairs.push([Math.PI - d, a, b]);
    }
    pairs.sort((p, q) => p[0] - q[0]);
    const pris = new Set();
    for (const [, a, b] of pairs) { if (pris.has(a) || pris.has(b)) continue; pris.add(a); pris.add(b); par[find(a.i)] = find(b.i); }
  }
  const ug = new Map(); unnamed.forEach((u, i) => { const r = find(i); if (!ug.has(r)) ug.set(r, []); ug.get(r).push(u); });
  for (const us of ug.values()) streets.push({ name: '', units: us, link: us[0].link });
  const RANK = { trunk: 0, primary: 0, secondary: 1, tertiary: 2, residential: 3, unclassified: 3, living_street: 4, pedestrian: 4, track: 5 };
  for (const s of streets) {
    s.segs = s.units.map(u => u.g); s.ow = s.units.map(u => u.ow); s.ids = [...new Set(s.units.map(u => u.id))];
    s.hw = s.units.reduce((h, u) => RANK[u.hw] < RANK[h] ? u.hw : h, s.units[0].hw);
    s.len = s.segs.reduce((a, g) => a + lenOf(g), 0);
  }
  let rues = streets.filter(s => s.len >= 25 || s.link);

  /* 5. commune et codes postaux de chaque rue */
  for (const s of rues) {
    const cps = new Set(); let mid = null, best = -1;
    for (const g of s.segs) { const L = lenOf(g); if (L > best) { best = L; mid = g[Math.floor(g.length / 2)]; } for (let i = 0; i < g.length; i += Math.max(1, Math.floor(g.length / 6))) { const q = ref.quartierDe(g[i].lat, g[i].lon); if (q) cps.add(q.cp); } }
    const q = ref.quartierDe(mid.lat, mid.lon); s.commune = q ? q.commune : null; s.cps = [...cps].sort(); s.qcp = q ? q.cp : (s.cps[0] || '');
    if (!s.commune) { const z = zoneOf(mid); s.commune = z ? z.communes[0] : null; }
  }
  rues = rues.filter(s => s.commune);
  /* culs-de-sac : un bout de la rue ne touche aucune autre rue */
  const touche = new Map();
  for (const s of streets) for (const g of s.segs) for (const p of g) { const k = NK(p); if (!touche.has(k)) touche.set(k, new Set()); touche.get(k).add(s); }
  for (const s of rues) {
    if (s.link || MAJEUR[s.hw] || s.hw === 'track' || s.hw === 'pedestrian' || s.len >= 200) continue;
    const deg = new Map(); for (const g of s.segs) for (const p of [g[0], g[g.length - 1]]) { const k = NK(p); deg.set(k, (deg.get(k) || 0) + 1); }
    const bouts = [...deg].filter(([, n]) => n === 1).map(([k]) => k);
    s.impasse = bouts.length === 2 && bouts.filter(k => touche.get(k).size === 1).length === 1;
  }

  /* 6. codes de voie : stables d'une génération à l'autre */
  const used = new Set(plan ? plan.rues.map(r => r.c) : []);
  const prevByCode = {}; if (prev && prev.voies) for (const v of prev.voies.voies) prevByCode[v.c] = v;
  const prevIds = prev && prev.sources ? prev.sources.voies : {};
  const idTo = new Map(); for (const [code, ids] of Object.entries(prevIds)) for (const id of ids) { if (!idTo.has(id)) idTo.set(id, []); idTo.get(id).push(code); }
  let herites = 0;
  for (const s of rues) {
    const cnt = {}; for (const id of s.ids) for (const c of idTo.get(id) || []) cnt[c] = (cnt[c] || 0) + 1;
    let bc = null, bn = 0; for (const [c, n] of Object.entries(cnt)) { const r = n / Math.max(s.ids.length, (prevIds[c] || []).length); if (r >= 0.5 && n > bn && !used.has(c)) { bn = n; bc = c; } }
    if (bc) { s.code = bc; used.add(bc); herites++; const pv = prevByCode[bc]; if (pv) { s.prev = pv; if (pv.d) s.fixed = pv.d; } }
  }
  /* 7. noms : vrais noms gardés, noms proposés pour les rues sans nom ou numérotées */
  const N = nommer(rues, { plan, Q, prev, rapport });
  /* codes des nouvelles voies, tirés du nom (même nom dans une autre commune : on ajoute le code de la commune, NATIONDIX) */
  const codeDe = s => s.p ? s.p.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16) : codeBase(s.nom);
  for (const s of rues.filter(s => !s.code && !s.link).sort((a, b) => (a.st === 'usage' ? 0 : 1) - (b.st === 'usage' ? 0 : 1) || b.len - a.len)) {
    const base = codeDe(s); let c = base;
    if (used.has(c)) { const b2 = base.slice(0, 13) + s.commune; c = b2; let n = 2; while (used.has(c)) c = b2 + (n++); }
    s.code = c; used.add(c);
  }
  const nb = {};
  for (const s of rues.filter(s => !s.code)) { const k = s.commune; nb[k] = nb[k] || 1; let c; do { c = 'BR' + k + String(nb[k]++).padStart(3, '0'); } while (used.has(c)); s.code = c; used.add(c); }
  rapport.codesHerites = herites;

  /* 8. point de départ de la numérotation (ouest pour une rue plutôt horizontale, sud sinon) */
  const voies = [], sources = { v: 1, voies: {}, retires: N.retires };
  if (plan) for (const r of plan.rues) {
    const segs = r.g.map(l => l.map(p => ({ lon: p[0], lat: p[1] })));
    const ow = segs.map(g => { for (let i = 1; i < g.length; i++) { const k = NK(g[i - 1]) + '|' + NK(g[i]); if (edgeOw.has(k)) return edgeOw.get(k); } return 0; });
    const st = r.s === 'conserve' ? 'officiel' : r.s === 'propose' ? 'propose' : 'a_nommer';
    const hws = (r.o || []).map(id => hwById.get(id)).filter(Boolean);
    const RK = { trunk: 0, primary: 0, secondary: 1, tertiary: 2, residential: 3, unclassified: 3, living_street: 4, pedestrian: 4, track: 5 };
    const hw = hws.reduce((h, x) => h === null || RK[x] < RK[h] ? x : h, null) || 'residential';
    const v = { c: r.c, n: r.n || 'Rue à nommer', a: r.a && r.a !== r.n ? r.a : undefined, st, h: CLASSES.indexOf(hw), k: 'KAL',
      q: (r.q || []).map(n => (plan.quartiers.find(q => q[0] === n) || [])[1]).filter(Boolean), d: r.d ? [r.d[1], r.d[0]] : undefined, m: r.m, g: segs.map(encodeLine), o: ow.some(x => x) ? ow : undefined };
    if (v.h < 0) v.h = 4;
    const pk = r.p && N.persByNom[norm(r.p)]; if (pk) { v.p = pk.id; v.b = N.dedicace(pk); }
    voies.push(v); sources.voies[r.c] = r.o || [];
    rapport.communes.KAL.voies++; rapport.communes.KAL.km += segs.reduce((a, g) => a + lenOf(g), 0) / 1000;
  }
  for (const s of rues) {
    const tmp = { segs: s.segs, fixed: s.fixed || null }; chainOf(tmp);
    const d = s.fixed || [tmp.chain[0].lat, tmp.chain[0].lon];
    const v = { c: s.code, n: s.nom, st: s.st, h: CLASSES.indexOf(s.hw), k: s.commune, q: s.cps, d: [+d[0].toFixed(6), +d[1].toFixed(6)], m: tmp.maxNo, g: s.segs.map(encodeLine) };
    if (s.ancien && norm(s.ancien) !== norm(s.nom)) v.a = s.ancien;
    if (s.p) v.p = s.p; if (s.b) v.b = s.b;
    if (s.ow.some(x => x)) v.o = s.ow;
    if (s.link) v.x = 1;
    voies.push(v); sources.voies[s.code] = s.ids;
    const rc = rapport.communes[s.commune]; if (rc) { rc.voies++; rc.km += s.len / 1000; }
  }
  for (const c of Object.values(rapport.communes)) c.km = Math.round(c.km * 10) / 10;

  const now = new Date(), date = now.toISOString().slice(0, 10);
  const index = {
    format: 'conakry-adresses', v: 1, nom: 'Conakry Adresses', version: date.replace(/-/g, '.'), date: now.toISOString(),
    source: 'OpenStreetMap (ODbL) · plan de Kaloum du ' + (plan ? plan.fige_le : '—'),
    avertissement: 'Plan d\'adressage provisoire, non officiel, pour les services de livraison et de transport. Les rues sans nom reçoivent un nom proposé, en attendant les noms officiels décidés par les communes et l\'État.',
    communes: COMMUNES.map(c => ({ code: c.code, nom: c.nom, cp: c.cp })),
    quartiers: Q.map(q => [q.nom, q.cp, +q.lat.toFixed(6), +q.lon.toFixed(6), q.commune]),
    zones: tmpIndex.zones,
    fichiers: { voies: 'voies.json', sources: 'sources.json' },
    stats: { voies: voies.length, quartiers: Q.length, km: Math.round(Object.values(rapport.communes).reduce((a, c) => a + c.km, 0)), avecNom: voies.filter(v => v.st !== 'a_nommer').length, proposes: voies.filter(v => v.st === 'propose' && !v.x).length, personnalites: voies.filter(v => v.p).length }
  };
  sources.quartiers = Q.map(q => [q.cp, q.nom, q.place || 'plan']);
  return { index, voies: { v: 1, voies }, sources, rapport };
}

/* requêtes OpenStreetMap (Overpass) */
function requetes(bbox) {
  bbox = bbox || BBOX;
  const b = [bbox.s, bbox.w, bbox.n, bbox.e].join(',');
  const tiles = []; const S = 0.12;
  for (let s = bbox.s; s < bbox.n - 1e-9; s += S) for (let w = bbox.w; w < bbox.e - 1e-9; w += S) {
    const t = [s, w, Math.min(bbox.n, s + S), Math.min(bbox.e, w + S)].map(x => +x.toFixed(3));
    tiles.push({ id: t.join('_'), q: '[out:json][timeout:180];way["highway"~"' + HW.source + '"](' + t.join(',') + ');out tags geom qt;' });
  }
  return {
    limites: '[out:json][timeout:180];rel["boundary"="administrative"]["admin_level"~"^(6|7|8|9|10)$"](' + b + ');out geom;',
    lieux: '[out:json][timeout:120];node["place"~"' + PLACES.source + '"](' + b + ');out;',
    tuiles: tiles
  };
}

/* petit fichier zip (sans compression) pour tout télécharger d'un coup */
function zip(files) {
  const enc = new TextEncoder(), parts = [], dir = []; let off = 0;
  const crcT = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
  const crc = u => { let c = 0xFFFFFFFF; for (let i = 0; i < u.length; i++) c = crcT[(c ^ u[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const le = (n, b) => { const a = []; for (let i = 0; i < b; i++) a.push((n >>> (8 * i)) & 0xFF); return a; };
  for (const f of files) {
    const name = enc.encode(f.name), data = typeof f.data === 'string' ? enc.encode(f.data) : f.data, c = crc(data);
    const head = [0x50, 0x4B, 0x03, 0x04, ...le(20, 2), ...le(0x0800, 2), ...le(0, 2), ...le(0, 2), ...le(0x21, 2), ...le(c, 4), ...le(data.length, 4), ...le(data.length, 4), ...le(name.length, 2), ...le(0, 2)];
    parts.push(new Uint8Array(head), name, data);
    dir.push(new Uint8Array([0x50, 0x4B, 0x01, 0x02, ...le(20, 2), ...le(20, 2), ...le(0x0800, 2), ...le(0, 2), ...le(0, 2), ...le(0x21, 2), ...le(c, 4), ...le(data.length, 4), ...le(data.length, 4), ...le(name.length, 2), ...le(0, 2), ...le(0, 2), ...le(0, 2), ...le(0, 2), ...le(0, 4), ...le(off, 4)]), name);
    off += head.length + name.length + data.length;
  }
  const dlen = dir.reduce((a, p) => a + p.length, 0);
  const end = new Uint8Array([0x50, 0x4B, 0x05, 0x06, ...le(0, 2), ...le(0, 2), ...le(files.length, 2), ...le(files.length, 2), ...le(dlen, 4), ...le(off, 4), ...le(0, 2)]);
  return new Blob([...parts, ...dir, end], { type: 'application/zip' });
}

return { COMMUNES, OFFICIEL, BBOX, construire, requetes, zip, codeBase, ringsOf, simplify, matchCommune, nomReel, cle, deNom, communeOfficielle, FAUX, centre };
}));
