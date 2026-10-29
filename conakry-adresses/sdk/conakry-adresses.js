/*!
 * Conakry Adresses : bibliothèque d'adressage (navigateur et Node.js)
 * Plan d'adressage PROVISOIRE de la zone spéciale de Conakry, en attendant les plans officiels.
 * Mêmes règles que le plan de Kaloum : un numéro tous les 10 m le long de la rue,
 * impair à gauche et pair à droite dans le sens des numéros croissants, un code postal par quartier.
 * Données des rues : © contributeurs OpenStreetMap (licence ODbL).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ConakryAdresses = factory();
}(typeof self !== 'undefined' ? self : this, function () {
'use strict';

const VERSION = '1.0.0';
const ATTRIBUTION = 'Plan d\'adressage provisoire Conakry Adresses · rues © contributeurs OpenStreetMap (ODbL)';
/* mêmes constantes que le plan de Kaloum : les numéros y sont identiques */
const STEP = 10, R = 6371000, mLat = 111320, mLon = 111320 * Math.cos(9.51 * Math.PI / 180);
const REF = { lat: 9.60, lng: -13.62 };              /* centre de référence pour les Plus Codes courts */
/* ville du référentiel (index.json « ville ») : Conakry par défaut, pour les référentiels d'avant les autres villes */
const VILLE_DEFAUT = { code: 'conakry', nom: 'Conakry', centre: [REF.lat, REF.lng] };
const MAX_RUE = 60;                                  /* au-delà, pas d'adresse de rue : quartier + Plus Code */
const rad = d => d * Math.PI / 180;

function dist(a, b) {
  const dLa = rad(b.lat - a.lat), dLo = rad(b.lon - a.lon);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const NK = p => p.lat.toFixed(6) + ',' + p.lon.toFixed(6);

/* ---------------------------------------------------------------------
   1. NUMÉROTATION (copie exacte de l'appli agent de Kaloum)
   On suit le tracé depuis le point de départ figé ; chaque tranche de 10 m
   reçoit un numéro impair à gauche et pair à droite.
   --------------------------------------------------------------------- */
function chainOf(s) {
  let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
  s.segs.forEach(g => g.forEach(p => { a = Math.min(a, p.lon); b = Math.max(b, p.lon); c = Math.min(c, p.lat); d = Math.max(d, p.lat); }));
  const horiz = (b - a) * mLon >= (d - c) * mLat;
  const adj = new Map(); const put = (k, e) => { if (!adj.has(k)) adj.set(k, []); adj.get(k).push(e); };
  s.segs.forEach((g, i) => { put(NK(g[0]), { i, rev: false, p: g[0] }); put(NK(g[g.length - 1]), { i, rev: true, p: g[g.length - 1] }); });
  let cands = Array.from(adj.values()).filter(l => l.length === 1); if (!cands.length) cands = Array.from(adj.values());
  const fixed = s.fixed;
  const score = l => fixed ? Math.hypot((l[0].p.lat - fixed[0]) * mLat, (l[0].p.lon - fixed[1]) * mLon) : (horiz ? l[0].p.lon : l[0].p.lat);
  cands.sort((x, y) => score(x) - score(y));
  const used = new Set(), chain = [], jumps = new Set();
  let cur = NK(cands[0][0].p), pdx = 0, pdy = 0;
  function walk() {
    for (;;) {
      const opts = (adj.get(cur) || []).filter(e => !used.has(e.i)); if (!opts.length) break;
      let best = opts[0];
      if (opts.length > 1 && (pdx || pdy)) {
        let bs = -Infinity;
        opts.forEach(o => { const g = s.segs[o.i], A = o.rev ? g[g.length - 1] : g[0], B = o.rev ? g[g.length - 2] : g[1];
          const dx = (B.lon - A.lon) * mLon, dy = (B.lat - A.lat) * mLat, n = Math.hypot(dx, dy) || 1, sc = (dx * pdx + dy * pdy) / n;
          if (sc > bs) { bs = sc; best = o; } });
      }
      used.add(best.i);
      const g = best.rev ? s.segs[best.i].slice().reverse() : s.segs[best.i];
      Array.prototype.push.apply(chain, chain.length ? g.slice(1) : g);
      const P = chain[chain.length - 2], Q = chain[chain.length - 1];
      pdx = (Q.lon - P.lon) * mLon; pdy = (Q.lat - P.lat) * mLat; const n = Math.hypot(pdx, pdy) || 1; pdx /= n; pdy /= n;
      cur = NK(Q);
    }
  }
  walk();
  if (chain.length < 2) { chain.length = 0; Array.prototype.push.apply(chain, s.segs[0]); used.add(0); }
  const dPoly = (pl, p) => { let bb = Infinity; for (let i = 1; i < pl.length; i++) { const ax = pl[i - 1].lon * mLon, ay = pl[i - 1].lat * mLat, vx = pl[i].lon * mLon - ax, vy = pl[i].lat * mLat - ay, L2 = vx * vx + vy * vy || 1, px = p.lon * mLon, py = p.lat * mLat, t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / L2)); bb = Math.min(bb, Math.hypot(px - ax - t * vx, py - ay - t * vy)); } return bb; };
  const parallel = new Set(s.segs.map((g, i) => i).filter(i => { const g = s.segs[i]; return !used.has(i) && dPoly(chain, g[Math.floor(g.length / 2)]) <= 40; }));
  for (;;) {
    const rest = s.segs.map((g, i) => i).filter(i => !used.has(i) && !parallel.has(i)); if (!rest.length) break;
    const E = chain[chain.length - 1]; let bi = -1, brev = false, bd = Infinity;
    rest.forEach(i => { const g = s.segs[i], d0 = dist(E, g[0]), d1 = dist(E, g[g.length - 1]); if (d0 < bd) { bd = d0; bi = i; brev = false; } if (d1 < bd) { bd = d1; bi = i; brev = true; } });
    used.add(bi);
    const g2 = brev ? s.segs[bi].slice().reverse() : s.segs[bi];
    jumps.add(chain.length); Array.prototype.push.apply(chain, g2);
    const P2 = chain[chain.length - 2], Q2 = chain[chain.length - 1];
    pdx = (Q2.lon - P2.lon) * mLon; pdy = (Q2.lat - P2.lat) * mLat; const n2 = Math.hypot(pdx, pdy) || 1; pdx /= n2; pdy /= n2;
    cur = NK(Q2); walk();
  }
  s.jumps = jumps; s.chain = chain; s.cum = [0];
  for (let i = 1; i < chain.length; i++) s.cum.push(s.cum[i - 1] + dist(chain[i - 1], chain[i]));
  s.total = s.cum[s.cum.length - 1];
  s.maxNo = 2 * Math.floor(s.total / STEP) + 2;
  return s;
}
function refOn(s, lat, lon) {
  const px = lon * mLon, py = lat * mLat; let best = null;
  for (let i = 1; i < s.chain.length; i++) {
    if (s.jumps.has(i)) continue;
    const A = s.chain[i - 1], B = s.chain[i], ax = A.lon * mLon, ay = A.lat * mLat, vx = B.lon * mLon - ax, vy = B.lat * mLat - ay, L2 = vx * vx + vy * vy; if (!L2) continue;
    const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / L2)), qx = ax + t * vx, qy = ay + t * vy, dd = Math.hypot(px - qx, py - qy);
    if (!best || dd < best.dist) best = { dist: dd, d: s.cum[i - 1] + t * Math.sqrt(L2), left: vx * (py - ay) - vy * (px - ax) > 0, q: { lon: qx / mLon, lat: qy / mLat } };
  }
  return best;
}
const houseNo = (dd, left) => 2 * Math.floor(Math.max(0, dd) / STEP) + (left ? 1 : 2);
/* point de la porte n° « no » : au milieu de sa tranche de 10 m, à 7 m de l'axe, du bon côté */
function pointOfNumber(s, no) {
  const left = no % 2 === 1, k = Math.floor((no - (left ? 1 : 2)) / 2);
  let d = Math.min(s.total - 0.5, k * STEP + STEP / 2), i = 1;
  while (i < s.cum.length - 1 && (s.cum[i] < d || s.jumps.has(i))) i++;
  const A = s.chain[i - 1], B = s.chain[i], L = (s.cum[i] - s.cum[i - 1]) || 1, t = Math.max(0, Math.min(1, (d - s.cum[i - 1]) / L));
  const x = A.lon * mLon + (B.lon - A.lon) * mLon * t, y = A.lat * mLat + (B.lat - A.lat) * mLat * t;
  let ux = (B.lon - A.lon) * mLon, uy = (B.lat - A.lat) * mLat; const n = Math.hypot(ux, uy) || 1; ux /= n; uy /= n;
  const off = 7, sx = x + (left ? -uy : uy) * off, sy = y + (left ? ux : -ux) * off;
  return { lat: sy / mLat, lng: sx / mLon, rue: { lat: y / mLat, lng: x / mLon } };
}

/* ---------------------------------------------------------------------
   2. PLUS CODES (Open Location Code, format ouvert lisible par Google Maps)
   --------------------------------------------------------------------- */
const OLC = '23456789CFGHJMPQRVWX';
function plusCode(lat, lng, len) {
  len = len || 11;
  lat = Math.min(90, Math.max(-90, lat)); lng = ((lng + 180) % 360 + 360) % 360 - 180;
  const FLAT = 8000 * 3125, FLNG = 8000 * 1024;
  if (lat === 90) lat -= 1e-9;
  let latV = Math.floor(Math.round((lat + 90) * FLAT * 1e6) / 1e6), lngV = Math.floor(Math.round((lng + 180) * FLNG * 1e6) / 1e6);
  let code = '';
  if (len > 10) {
    for (let i = 0; i < 5; i++) { code = OLC[(latV % 5) * 4 + (lngV % 4)] + code; latV = Math.floor(latV / 5); lngV = Math.floor(lngV / 4); }
  } else { latV = Math.floor(latV / 3125); lngV = Math.floor(lngV / 1024); }
  for (let i = 0; i < 5; i++) { code = OLC[lngV % 20] + code; code = OLC[latV % 20] + code; latV = Math.floor(latV / 20); lngV = Math.floor(lngV / 20); }
  code = code.slice(0, 8) + '+' + code.slice(8);
  return code.slice(0, len + 1);
}
/* forme courte, avec le nom de la ville : « 8QCJ+2VX Conakry », « 8QCJ+2VX Labé » */
const plusCodeCourt = (lat, lng, ville) => plusCode(lat, lng, 11).slice(4) + ' ' + (ville || 'Conakry');
/* ref : centre de la ville, pour compléter un code court (Conakry par défaut) */
function plusCodeDecode(code, ref) {
  ref = ref && isFinite(ref.lat) && isFinite(ref.lng) ? ref : REF;
  const c = String(code).toUpperCase().replace(/\s+.*$/, '');
  const m = c.match(/^([23456789CFGHJMPQRVWX]{2,8})\+([23456789CFGHJMPQRVWX]*)$/); if (!m) return null;
  let s = m[1] + m[2];
  if (m[1].length < 8) {                   /* code court : on complète avec le début du code du centre de la ville */
    const pad = 8 - m[1].length, res = Math.pow(20, 2 - pad / 2), debut = plusCode(ref.lat, ref.lng, 10).replace('+', '');
    const full = plusCodeDecode(debut.slice(0, pad) + m[1] + '+' + m[2]); if (!full) return null;
    let { lat, lng } = full;
    if (ref.lat + res / 2 < lat && lat - res >= -90) lat -= res; else if (ref.lat - res / 2 > lat && lat + res <= 90) lat += res;
    if (ref.lng + res / 2 < lng) lng -= res; else if (ref.lng - res / 2 > lng) lng += res;
    return { lat, lng };
  }
  let lat = -90, lng = -180, res = 20;
  const pairs = s.slice(0, 10);
  for (let i = 0; i < pairs.length; i += 2) {
    lat += OLC.indexOf(pairs[i]) * res; if (i + 1 < pairs.length) lng += OLC.indexOf(pairs[i + 1]) * res;
    if (i + 2 < pairs.length) res /= 20;
  }
  let latR = res, lngR = res;
  for (const ch of s.slice(10)) { latR /= 5; lngR /= 4; const k = OLC.indexOf(ch); lat += Math.floor(k / 4) * latR; lng += (k % 4) * lngR; }
  return { lat: lat + latR / 2, lng: lng + lngR / 2 };
}

/* ---------------------------------------------------------------------
   3. OUTILS
   --------------------------------------------------------------------- */
const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/œ/g, 'oe').replace(/[^a-z0-9]+/g, ' ').trim();
const ABBR = { av: 'avenue', ave: 'avenue', bd: 'boulevard', bld: 'boulevard', blvd: 'boulevard', boul: 'boulevard', r: 'rue', rte: 'route', imp: 'impasse', pl: 'place', cor: 'corniche', aut: 'autoroute' };
const STOP = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'a', 'au', 'aux', 'et', 'en']);
const TYPES = new Set(['rue', 'avenue', 'boulevard', 'route', 'impasse', 'place', 'corniche', 'autoroute', 'voie', 'allee', 'quai', 'pont', 'rond', 'point', 'chemin', 'carrefour', 'penetrante']);
const toks = t => norm(t).split(' ').filter(Boolean).map(w => ABBR[w] || w).filter(w => !STOP.has(w));
function lev(a, b) { if (Math.abs(a.length - b.length) > 2) return 3; const m = []; for (let i = 0; i <= a.length; i++) { m[i] = [i]; } for (let j = 1; j <= b.length; j++) m[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return m[a.length][b.length]; }
function inRing(ring, lng, lat) { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1]; if ((yi > lat) !== (yj > lat) && lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) c = !c; } return c; }
/* test « point dans polygone » rapide : les côtés sont rangés par bandes de latitude */
function ringIndex(ring) {
  const B = 0.004, bands = new Map(); let s = Infinity, n = -Infinity, w = Infinity, e = -Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j], b = ring[i]; s = Math.min(s, b[1]); n = Math.max(n, b[1]); w = Math.min(w, b[0]); e = Math.max(e, b[0]);
    const y0 = Math.floor(Math.min(a[1], b[1]) / B), y1 = Math.floor(Math.max(a[1], b[1]) / B);
    for (let y = y0; y <= y1; y++) { let l = bands.get(y); if (!l) bands.set(y, l = []); l.push(a[0], a[1], b[0], b[1]); }
  }
  return { B, bands, s, n, w, e };
}
function inRingIdx(ix, lng, lat) {
  if (lat < ix.s || lat > ix.n || lng < ix.w || lng > ix.e) return false;
  const l = ix.bands.get(Math.floor(lat / ix.B)); if (!l) return false; let c = false;
  for (let k = 0; k < l.length; k += 4) { const xj = l[k], yj = l[k + 1], xi = l[k + 2], yi = l[k + 3]; if ((yi > lat) !== (yj > lat) && lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) c = !c; }
  return c;
}
function ringArea(ring) { let a = 0; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]); return Math.abs(a / 2); }
/* géométrie compacte : entiers (1e-6 degré) codés en différences */
function decodeLine(a) { const out = []; let x = 0, y = 0; for (let i = 0; i < a.length; i += 2) { x += a[i]; y += a[i + 1]; out.push({ lon: x / 1e6, lat: y / 1e6 }); } return out; }
function encodeLine(pts) { const a = []; let x = 0, y = 0; for (const p of pts) { const X = Math.round(p.lon * 1e6), Y = Math.round(p.lat * 1e6); a.push(X - x, Y - y); x = X; y = Y; } return a; }

const CLASSES = ['trunk', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'living_street', 'pedestrian', 'track'];
const MAJEUR = { trunk: 1, primary: 1, secondary: 1 };
const VITESSE = { trunk: 8.3, primary: 8.3, secondary: 6.9, tertiary: 6.0, residential: 5.0, unclassified: 5.0, living_street: 3.5, pedestrian: 1.4, track: 3.0 };
const STATUTS = { officiel: 'nom officiel', propose: 'nom proposé', usage: 'nom d\'usage', a_nommer: 'rue à nommer', provisoire: 'code provisoire' };
const statutTexte = v => v.statut === 'propose' && v.commune === 'KAL' ? 'nom proposé (plan de Kaloum)' : v.statut === 'a_nommer' && v.commune === 'KAL' ? 'rue à nommer (plan de Kaloum)' : STATUTS[v.statut] || '';
const CN = ['est', 'nord-est', 'nord', 'nord-ouest', 'ouest', 'sud-ouest', 'sud', 'sud-est'];
const vers = (dx, dy) => { const c = CN[(Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8]; return 'vers ' + (c[0] === 'e' || c[0] === 'o' ? 'l\'' : 'le ') + c; };

/* ---------------------------------------------------------------------
   4. RÉFÉRENTIEL CHARGÉ
   --------------------------------------------------------------------- */
class Referentiel {
  constructor(index, voies) {
    const vi = index.ville && index.ville.nom ? index.ville : null;
    this.ville = vi ? { code: vi.code || norm(vi.nom).replace(/ /g, ''), nom: vi.nom, centre: Array.isArray(vi.centre) ? vi.centre : VILLE_DEFAUT.centre } : VILLE_DEFAUT;
    this._ref = { lat: this.ville.centre[0], lng: this.ville.centre[1] };
    this.info = { nom: index.nom, version: index.version, date: index.date, source: index.source, ville: this.ville.nom, codeVille: this.ville.code,
      attribution: vi ? ATTRIBUTION.replace('Conakry Adresses', index.nom || this.ville.nom + ' Adresses') : ATTRIBUTION, avertissement: index.avertissement };
    this.communes = index.communes.map(c => ({ code: c.code, nom: c.nom, cp: c.cp }));
    this.communeParCode = {}; this.communes.forEach(c => { this.communeParCode[c.code] = c; });
    this.quartiers = index.quartiers.map(q => ({ nom: q[0], cp: q[1], lat: q[2], lng: q[3], commune: q[4] }));
    this.quartierParCp = {}; this.quartiers.forEach(q => { this.quartierParCp[q.cp] = q; });
    this.zones = (index.zones || []).map(z => ({ nom: z.nom, communes: z.communes, rings: z.rings.map(decodeLine).map(r => r.map(p => [p.lon, p.lat])) }));
    this.zones.forEach(z => { z.aire = z.rings.reduce((a, r) => a + ringArea(r), 0); z.idx = z.rings.map(ringIndex); z.qs = this.quartiers.filter(q => z.communes.indexOf(q.commune) >= 0); });
    this.voies = voies.voies.map((v, k) => ({
      k, code: v.c, nom: v.n, nomUsuel: v.a || null, statut: v.st, dedicace: v.b || null, personnalite: v.p || null, highway: CLASSES[v.h] || 'residential', commune: v.k,
      cps: v.q || [], fixed: v.d ? [v.d[0], v.d[1]] : null, maxRef: v.m || null, lien: !!v.x,
      segs: v.g.map(decodeLine), ow: v.o || v.g.map(() => 0)
    }));
    this.voieParCode = {}; this.voies.forEach(v => { this.voieParCode[v.code] = v; });
    this._grid = null; this._graph = {}; this._search = null;
  }
  get bbox() { let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity; this.voies.forEach(v => v.segs.forEach(g => g.forEach(p => { a = Math.min(a, p.lon); b = Math.max(b, p.lon); c = Math.min(c, p.lat); d = Math.max(d, p.lat); }))); return [a, c, b, d]; }
  _chain(v) { if (!v.chain) chainOf(v); return v; }
  /* grille de recherche rapide des tronçons (cases d'environ 110 m) */
  _idx() {
    if (this._grid) return this._grid;
    const C = 0.001, grid = new Map(), E = [];
    this.voies.forEach((v, vi) => v.segs.forEach((g, gi) => { for (let i = 1; i < g.length; i++) {
      const e = E.length; E.push(vi, gi, i);
      const x0 = Math.floor(Math.min(g[i - 1].lon, g[i].lon) / C), x1 = Math.floor(Math.max(g[i - 1].lon, g[i].lon) / C), y0 = Math.floor(Math.min(g[i - 1].lat, g[i].lat) / C), y1 = Math.floor(Math.max(g[i - 1].lat, g[i].lat) / C);
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) { const k = x * 1e6 + y; let l = grid.get(k); if (!l) grid.set(k, l = []); l.push(e); }
    } }));
    return this._grid = { C, grid, E };
  }
  /* tronçon le plus proche d'un point (dans un rayon en mètres) */
  _nearest(lat, lng, maxM, filter) {
    const { C, grid, E } = this._idx(), px = lng * mLon, py = lat * mLat, r = Math.ceil(maxM / 100) + 1;
    const cx = Math.floor(lng / C), cy = Math.floor(lat / C); let best = null; const seen = new Set();
    for (let x = cx - r; x <= cx + r; x++) for (let y = cy - r; y <= cy + r; y++) {
      const l = grid.get(x * 1e6 + y); if (!l) continue;
      for (const e of l) {
        if (seen.has(e)) continue; seen.add(e);
        const v = this.voies[E[e]]; if (filter && !filter(v)) continue;
        const g = v.segs[E[e + 1]], i = E[e + 2], ax = g[i - 1].lon * mLon, ay = g[i - 1].lat * mLat, vx = g[i].lon * mLon - ax, vy = g[i].lat * mLat - ay, L2 = vx * vx + vy * vy; if (!L2) continue;
        const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / L2)), d = Math.hypot(px - ax - t * vx, py - ay - t * vy);
        if (d <= maxM && (!best || d < best.d)) best = { d, v, gi: E[e + 1], i, t, p: { lat: (ay + t * vy) / mLat, lon: (ax + t * vx) / mLon } };
      }
    }
    return best;
  }
  /* commune et quartier d'un point */
  zoneDe(lat, lng) { let z = null; for (const k of this.zones) if ((!z || k.aire < z.aire) && k.idx.some(ix => inRingIdx(ix, lng, lat))) z = k; return z; }
  quartierDe(lat, lng) {
    const z = this.zoneDe(lat, lng);
    let list = z ? z.qs : this.quartiers;
    if (!list.length) list = this.quartiers;
    let b = null, bd = Infinity;
    for (const q of list) { const d = Math.hypot((lat - q.lat) * mLat, (lng - q.lng) * mLon); if (d < bd) { bd = d; b = q; } }
    if (!z && bd > 3000) return null;          /* hors de Conakry */
    return b;
  }
  _adresseObj(v, no, q, pos, pr) {
    const c = this.communeParCode[q ? q.commune : v.commune] || null;
    const nom = v.nom, l1 = no ? no + ', ' + nom : nom;
    const l2 = (q ? q.cp + ' ' + q.nom : '') + (c && (!q || q.nom !== c.nom) ? (q ? ' · ' : '') + c.nom : '');
    return {
      id: no && q ? 'GN-' + q.cp + '-' + v.code + '-' + no : null,
      numero: no || null, cote: no ? (no % 2 ? 'impair (gauche)' : 'pair (droite)') : null,
      voie: { code: v.code, nom, nomUsuel: v.nomUsuel, statut: v.statut, statutTexte: statutTexte(v), dedicace: v.dedicace },
      quartier: q ? { nom: q.nom, cp: q.cp } : null, commune: c ? { code: c.code, nom: c.nom, cp: c.cp } : null,
      ville: this.ville.nom, pays: 'Guinée',
      ligne1: l1, ligne2: l2, texte: l1 + (q ? ', ' + q.cp + ' ' + q.nom : '') + (c && (!q || q.nom !== c.nom) ? ', ' + c.nom : '') + (c && c.nom === this.ville.nom ? '' : ', ' + this.ville.nom),
      position: { lat: pos.lat, lng: pos.lng }, plusCode: plusCode(pos.lat, pos.lng, 11), plusCodeCourt: plusCodeCourt(pos.lat, pos.lng, this.ville.nom),
      precision: pr
    };
  }
  /* ADRESSE D'UN POINT : numéro de la porte la plus proche, ou quartier + Plus Code si aucune rue à moins de 60 m */
  adresse(lat, lng) {
    lat = +lat; lng = +lng; if (!isFinite(lat) || !isFinite(lng)) return null;
    const n = this._nearest(lat, lng, MAX_RUE, v => !v.lien);
    const q = n ? this.quartierDe(n.p.lat, n.p.lon) : this.quartierDe(lat, lng);
    if (!n) {
      if (!q) return null;
      const c = this.communeParCode[q.commune];
      const t = 'Près de ' + q.nom + ', ' + q.cp + (c && c.nom !== q.nom ? ' ' + c.nom : '');
      return { id: null, numero: null, cote: null, voie: null, quartier: { nom: q.nom, cp: q.cp }, commune: c ? { code: c.code, nom: c.nom, cp: c.cp } : null,
        ville: this.ville.nom, pays: 'Guinée', ligne1: plusCodeCourt(lat, lng, this.ville.nom), ligne2: t, texte: plusCodeCourt(lat, lng, this.ville.nom) + ' · ' + t + (c && c.nom === this.ville.nom ? '' : ', ' + this.ville.nom),
        position: { lat, lng }, plusCode: plusCode(lat, lng, 11), plusCodeCourt: plusCodeCourt(lat, lng, this.ville.nom), precision: 'quartier' };
    }
    const v = this._chain(n.v), r = refOn(v, lat, lng);
    const qq = this.quartierDe(r.q.lat, r.q.lon) || q;
    const a = this._adresseObj(v, houseNo(r.d, r.left), qq, { lat, lng }, 'porte');
    a.distanceRue = Math.round(r.dist); a.pointRue = { lat: r.q.lat, lng: r.q.lon };
    return a;
  }
  /* adresse d'un numéro sur une voie donnée (sans risque de tomber sur la rue voisine) */
  _adresseVoie(v, no) {
    this._chain(v); const n = Math.max(1, Math.min(no, v.maxNo)), p = pointOfNumber(v, n);
    const q = this.quartierDe(p.rue.lat, p.rue.lng) || this.quartierDe(p.lat, p.lng);
    const a = this._adresseObj(v, n, q, { lat: p.lat, lng: p.lng }, 'porte');
    a.distanceRue = 7; a.pointRue = { lat: p.rue.lat, lng: p.rue.lng };
    return a;
  }
  /* POSITION D'UN IDENTIFIANT : « GN-88001-3AVRIL1984-98 » */
  position(id) {
    const m = String(id || '').trim().toUpperCase().match(/^GN-(\d{5})-([A-Z0-9]+)-(\d{1,5})$/); if (!m) return null;
    const v = this.voieParCode[m[2]]; if (!v) return null;
    this._chain(v); const a = this._adresseVoie(v, +m[3]);
    a.limite = +m[3] > v.maxNo ? v.maxNo : null;
    return a;
  }
  voie(code) { const v = this.voieParCode[String(code || '').toUpperCase()]; if (!v) return null; this._chain(v); return { code: v.code, nom: v.nom, nomUsuel: v.nomUsuel, statut: v.statut, statutTexte: statutTexte(v), dedicace: v.dedicace, commune: v.commune, codesPostaux: v.cps, longueur: Math.round(v.total), numeroMax: v.maxNo, segments: v.segs.map(g => g.map(p => [p.lat, p.lon])) }; }
  /* numéros visibles dans un rectangle (pour les afficher sur une carte) */
  numerosDans(s, w, n, e, max) {
    max = max || 1500; const out = [], seen = new Set(), { C, grid, E } = this._idx();
    for (let x = Math.floor(w / C); x <= Math.floor(e / C); x++) for (let y = Math.floor(s / C); y <= Math.floor(n / C); y++) { const l = grid.get(x * 1e6 + y); if (l) for (const k of l) seen.add(E[k]); }
    for (const vi of seen) {
      if (this.voies[vi].lien) continue;
      const v = this._chain(this.voies[vi]);
      for (let k = STEP; k < v.total; k += 2 * STEP) {
        for (const left of [true, false]) {
          const no = houseNo(k, left), p = pointOfNumber(v, no);
          if (p.lat < s || p.lat > n || p.lng < w || p.lng > e) continue;
          out.push({ lat: p.lat, lng: p.lng, numero: no, impair: left });
          if (out.length >= max) return out;
        }
      }
    }
    return out;
  }
  /* ---------- RECHERCHE ---------- */
  _searchIdx() {
    if (this._search) return this._search;
    const idx = this.voies.filter(v => !v.lien).map(v => { const t = toks(v.nom), u = v.nomUsuel ? toks(v.nomUsuel) : []; return { v, t, u, core: t.filter(w => !TYPES.has(w)), coreU: u.filter(w => !TYPES.has(w)) }; });
    const lieux = [].concat(this.quartiers.map(q => ({ type: 'quartier', q, t: toks(q.nom) })), this.communes.map(c => ({ type: 'commune', c, t: toks(c.nom) })));
    return this._search = { idx, lieux };
  }
  chercher(texte, opts) {
    opts = opts || {}; const max = opts.max || 8, out = [];
    const raw = String(texte || '').trim(); if (!raw) return out;
    /* identifiant d'adresse */
    if (/^GN-/i.test(raw)) { const a = this.position(raw); if (a) out.push({ type: 'adresse', libelle: a.texte, adresse: a, lat: a.position.lat, lng: a.position.lng, score: 1 }); return out; }
    /* Plus Code */
    if (/^[23456789CFGHJMPQRVWX]{2,8}\+[23456789CFGHJMPQRVWX]*/i.test(raw.replace(/\s.*/, ''))) {
      const p = plusCodeDecode(raw, this._ref); if (p) { const a = this.adresse(p.lat, p.lng); out.push({ type: 'pluscode', libelle: raw.toUpperCase().replace(/\s.*/, '') + (a ? ' · ' + a.ligne2 : ''), adresse: a, lat: p.lat, lng: p.lng, score: 1 }); }
      return out;
    }
    /* coordonnées « 9.51, -13.71 » */
    const cm = raw.match(/^(-?\d{1,2}\.\d+)\s*[,; ]\s*(-?\d{1,3}\.\d+)$/);
    if (cm) { const a = this.adresse(+cm[1], +cm[2]); out.push({ type: 'position', libelle: a ? a.texte : raw, adresse: a, lat: +cm[1], lng: +cm[2], score: 1 }); return out; }
    /* « 12 bis, Avenue … , Ratoma » */
    const mm = raw.match(/^\s*(\d{1,5})\s*(bis|ter|[a-c])?\b[\s,]*(.*)$/i);
    const no = mm ? +mm[1] : null, rest = mm ? mm[3] : raw;
    let q = toks(rest); if (!q.length) return out;
    const { idx, lieux } = this._searchIdx();
    /* commune ou quartier cité dans la recherche */
    let lieu = null;
    for (const l of lieux) { const n = l.t.length; for (let i = 0; i + n <= q.length; i++) if (l.t.every((w, j) => q[i + j] === w)) { if (!lieu || n > lieu.n) lieu = { l, n, i }; } }
    let qs = q;
    if (lieu && lieu.n < q.length) qs = q.slice(0, lieu.i).concat(q.slice(lieu.i + lieu.n));
    const qCore = qs.filter(w => !TYPES.has(w)), qType = qs.filter(w => TYPES.has(w));
    const match = (w, list) => list.some(x => x === w || (w.length >= 3 && x.startsWith(w)) || (w.length >= 5 && lev(w, x) <= 1));
    const cand = [];
    const codeQ = qs.filter(w => w !== 'voie' && w !== 'rue').join('');
    for (const e of idx) {
      const codeHit = codeQ.length >= 3 && codeQ === e.v.code.toLowerCase();
      if (!qCore.length && !codeHit) continue;
      let best = 0;
      for (const [core, all] of [[e.core, e.t], [e.coreU, e.u]]) {
        if (!core.length) continue;
        const hit = qCore.filter(w => match(w, core)).length; if (!hit) continue;
        let sc = hit / qCore.length - 0.15 * Math.max(0, core.length - hit) / core.length;
        if (qType.length && qType.every(w => all.indexOf(w) >= 0)) sc += 0.1;
        best = Math.max(best, sc);
      }
      if (codeHit) best = 1.2;
      if (best >= 0.6) {
        if (lieu) { const inLieu = lieu.l.type === 'commune' ? e.v.commune === lieu.l.c.code : e.v.cps.indexOf(lieu.l.q.cp) >= 0; best += inLieu ? 0.3 : -0.4; }
        cand.push({ e, sc: best + (MAJEUR[e.v.highway] ? 0.02 : 0) });
      }
    }
    cand.sort((a, b) => b.sc - a.sc);
    for (const { e, sc } of cand.slice(0, max)) {
      const v = this._chain(e.v);
      let n = no; if (!n) n = 1; const lim = n > v.maxNo; if (lim) n = v.maxNo;
      const a = this._adresseVoie(v, n);
      const c = this.communeParCode[v.commune];
      out.push({ type: no ? 'adresse' : 'voie', libelle: no ? a.texte : v.nom + (c ? ' · ' + c.nom : ''), voie: v.code, adresse: a, lat: a.position.lat, lng: a.position.lng, limite: lim ? v.maxNo : null, score: +sc.toFixed(2) });
    }
    if (out.length < max && lieu && !qCore.length) {
      const l = lieu.l;
      if (l.type === 'quartier') out.unshift({ type: 'quartier', libelle: 'Quartier ' + l.q.nom + ' · ' + l.q.cp + ' ' + ((this.communeParCode[l.q.commune] || {}).nom || ''), lat: l.q.lat, lng: l.q.lng, score: 1 });
      else { const qs2 = this.quartiers.filter(x => x.commune === l.c.code); if (qs2.length) out.unshift({ type: 'commune', libelle: 'Commune de ' + l.c.nom + ' · ' + l.c.cp, lat: qs2.reduce((a, x) => a + x.lat, 0) / qs2.length, lng: qs2.reduce((a, x) => a + x.lng, 0) / qs2.length, score: 1 }); }
    }
    if (!out.length) {                          /* nom de quartier seul */
      for (const l of lieux) if (l.type === 'quartier' && q.every(w => match(w, l.t))) out.push({ type: 'quartier', libelle: 'Quartier ' + l.q.nom + ' · ' + l.q.cp, lat: l.q.lat, lng: l.q.lng, score: 0.8 });
    }
    return out.slice(0, max);
  }
  /* ---------- ITINÉRAIRE ---------- */
  _graphe(mode) {
    if (this._graph[mode]) return this._graph[mode];
    const pied = mode === 'pied', ids = new Map(), pts = [], adj = [];
    const id = p => { const k = NK(p); let i = ids.get(k); if (i === undefined) { i = pts.length; ids.set(k, i); pts.push(p); adj.push([]); } return i; };
    this.voies.forEach((v, vi) => {
      if (!pied && v.highway === 'pedestrian') return;
      const vit = pied ? 1.35 : (VITESSE[v.highway] || 5) * (mode === 'moto' ? 1.2 : 1);
      v.segs.forEach((g, gi) => { const ow = pied ? 0 : (v.ow[gi] || 0); for (let i = 1; i < g.length; i++) {
        const a = id(g[i - 1]), b = id(g[i]); if (a === b) continue; const L = dist(g[i - 1], g[i]);
        if (ow >= 0) adj[a].push([b, L, L / vit, vi, gi, i]); if (ow <= 0) adj[b].push([a, L, L / vit, vi, gi, -i]);
      } });
    });
    /* raccords : un bout de rue qui s'arrête à quelques mètres d'une autre rue sans la toucher (deux sources de
       données qui se rejoignent, comme le plan de Kaloum et OpenStreetMap). On relie toujours ce qui est à 3 m ou
       moins ; jusqu'à 25 m, seulement si l'on ne peut pas déjà aller de l'un à l'autre et revenir. Les adresses ne bougent pas. */
    const n = pts.length, voisins = Array.from({ length: n }, () => new Set()), rue = new Int32Array(n).fill(-1);
    adj.forEach((l, a) => l.forEach(e => { voisins[a].add(e[0]); voisins[e[0]].add(a); rue[a] = e[3]; rue[e[0]] = e[3]; }));
    /* morceaux du réseau où l'on peut aller et revenir (composantes fortement connexes, sens uniques compris) */
    const comp = new Int32Array(n).fill(-1);
    { const ordre = [], vu = new Uint8Array(n), radj = Array.from({ length: n }, () => []);
      adj.forEach((l, a) => l.forEach(e => radj[e[0]].push(a)));
      for (let s0 = 0; s0 < n; s0++) { if (vu[s0]) continue; const pile = [[s0, 0]]; vu[s0] = 1;
        while (pile.length) { const top = pile[pile.length - 1], l = adj[top[0]];
          if (top[1] < l.length) { const w = l[top[1]++][0]; if (!vu[w]) { vu[w] = 1; pile.push([w, 0]); } } else { ordre.push(top[0]); pile.pop(); } } }
      let c = 0; for (let k = ordre.length - 1; k >= 0; k--) { const s0 = ordre[k]; if (comp[s0] >= 0) continue; const pile = [s0]; comp[s0] = c;
        while (pile.length) { const u = pile.pop(); for (const w of radj[u]) if (comp[w] < 0) { comp[w] = c; pile.push(w); } } c++; } }
    const C = 0.0003, grille = new Map();
    pts.forEach((p, i) => { const k = Math.floor(p.lon / C) * 1e6 + Math.floor(p.lat / C); let l = grille.get(k); if (!l) grille.set(k, l = []); l.push(i); });
    let raccords = 0;
    for (let u = 0; u < n; u++) {
      if (voisins[u].size !== 1) continue;                         /* bout d'une rue qui ne touche rien */
      const p = pts[u], x0 = Math.floor(p.lon / C), y0 = Math.floor(p.lat / C); let w = -1, dw = Infinity;
      for (let x = x0 - 1; x <= x0 + 1; x++) for (let y = y0 - 1; y <= y0 + 1; y++) for (const j of grille.get(x * 1e6 + y) || []) {
        if (j === u || voisins[u].has(j)) continue;
        const d = dist(p, pts[j]); if (d > 25 || d >= dw) continue;
        if (d <= 3 || comp[j] !== comp[u]) { dw = d; w = j; }
      }
      if (w < 0) continue;
      const vi = rue[u], v = this.voies[vi], vit = pied ? 1.35 : ((v && VITESSE[v.highway]) || 5) * (mode === 'moto' ? 1.2 : 1);
      adj[u].push([w, dw, dw / vit, vi, -1, 0]); adj[w].push([u, dw, dw / vit, vi, -1, 0]); voisins[u].add(w); voisins[w].add(u); raccords++;
    }
    return this._graph[mode] = { pts, adj, ids, raccords, vmax: pied ? 1.35 : 8.3 * (mode === 'moto' ? 1.2 : 1) };
  }
  itineraire(de, a, opts) {
    opts = opts || {}; const mode = ({ voiture: 'voiture', car: 'voiture', moto: 'moto', pied: 'pied', walk: 'pied' })[opts.mode || 'voiture'] || 'voiture';
    const G = this._graphe(mode);
    const okV = v => mode === 'pied' || v.highway !== 'pedestrian';
    const S = this._nearest(de.lat, de.lng, 150, okV), T = this._nearest(a.lat, a.lng, 150, okV);
    if (!S || !T) return null;
    const node = p => this._idNode(G, p);
    /* points de départ et d'arrivée raccrochés à la rue la plus proche */
    const sA = node(S.v.segs[S.gi][S.i - 1]), sB = node(S.v.segs[S.gi][S.i]), tA = node(T.v.segs[T.gi][T.i - 1]), tB = node(T.v.segs[T.gi][T.i]);
    const vitS = mode === 'pied' ? 1.35 : (VITESSE[S.v.highway] || 5), vitT = mode === 'pied' ? 1.35 : (VITESSE[T.v.highway] || 5);
    const LS = dist(S.v.segs[S.gi][S.i - 1], S.v.segs[S.gi][S.i]), LT = dist(T.v.segs[T.gi][T.i - 1], T.v.segs[T.gi][T.i]);
    const owS = mode === 'pied' ? 0 : (S.v.ow[S.gi] || 0), owT = mode === 'pied' ? 0 : (T.v.ow[T.gi] || 0);
    const N = G.pts.length, SRC = N, DST = N + 1;
    const extra = new Map(); const push = (k, e) => { if (!extra.has(k)) extra.set(k, []); extra.get(k).push(e); };
    if (owS >= 0) push(SRC, [sB, (1 - S.t) * LS, (1 - S.t) * LS / vitS, -1]);
    if (owS <= 0) push(SRC, [sA, S.t * LS, S.t * LS / vitS, -1]);
    if (owT >= 0) push(tA, [DST, T.t * LT, T.t * LT / vitT, -1]);
    if (owT <= 0) push(tB, [DST, (1 - T.t) * LT, (1 - T.t) * LT / vitT, -1]);
    if (S.v === T.v && S.gi === T.gi && S.i === T.i && ((owS >= 0 && T.t >= S.t) || (owS <= 0 && T.t <= S.t))) push(SRC, [DST, Math.abs(T.t - S.t) * LS, Math.abs(T.t - S.t) * LS / vitS, -1]);
    const P = k => k === SRC ? S.p : k === DST ? T.p : G.pts[k];
    const h = k => dist(P(k), T.p) / G.vmax;
    const g = new Map([[SRC, 0]]), prev = new Map(), heap = [[h(SRC), SRC]], done = new Set();
    const hpush = x => { heap.push(x); let i = heap.length - 1; while (i) { const j = (i - 1) >> 1; if (heap[j][0] <= heap[i][0]) break; [heap[i], heap[j]] = [heap[j], heap[i]]; i = j; } };
    const hpop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[i], heap[m]] = [heap[m], heap[i]]; i = m; } } return top; };
    while (heap.length) {
      const [, u] = hpop(); if (done.has(u)) continue; done.add(u); if (u === DST) break;
      const gu = g.get(u), list = u < N ? G.adj[u] : []; const ex = extra.get(u);
      for (const e of ex ? list.concat(ex) : list) { const nd = gu + e[2]; if (nd < (g.has(e[0]) ? g.get(e[0]) : Infinity)) { g.set(e[0], nd); prev.set(e[0], [u, e]); hpush([nd + (e[0] === DST ? 0 : h(e[0])), e[0]]); } }
    }
    if (!prev.has(DST)) return null;
    const legs = []; let k = DST;
    while (k !== SRC) { const [u, e] = prev.get(k); legs.unshift({ a: P(u), b: P(k), len: e[1], t: e[2], v: e[3] >= 0 ? this.voies[e[3]] : (u === SRC ? S.v : T.v) }); k = u; }
    const ligne = [[legs[0].a.lat, legs[0].a.lon]].concat(legs.map(l => [l.b.lat, l.b.lon]));
    const distance = legs.reduce((x, l) => x + l.len, 0), duree = legs.reduce((x, l) => x + l.t, 0);
    /* étapes : une par rue, avec le sens du virage */
    const brg = (p, q) => Math.atan2((q.lat - p.lat) * mLat, (q.lon - p.lon) * mLon) * 180 / Math.PI;
    const etapes = []; let cur = null;
    for (const l of legs) {
      if (l.len < 0.5) continue;
      if (cur && cur.v === l.v) { cur.len += l.len; cur.last = brg(l.a, l.b); continue; }
      const b = brg(l.a, l.b); let turn = 'depart';
      if (cur) { let d = b - cur.last; while (d > 180) d -= 360; while (d < -180) d += 360; turn = Math.abs(d) > 150 ? 'demi-tour' : d > 55 ? 'gauche' : d > 20 ? 'legerement-gauche' : d < -55 ? 'droite' : d < -20 ? 'legerement-droite' : 'tout-droit'; }
      cur = { v: l.v, len: l.len, turn, b, last: b, at: l.a }; etapes.push(cur);
    }
    const TXT = { gauche: 'Tournez à gauche sur ', droite: 'Tournez à droite sur ', 'legerement-gauche': 'Prenez légèrement à gauche sur ', 'legerement-droite': 'Prenez légèrement à droite sur ', 'tout-droit': 'Continuez tout droit sur ', 'demi-tour': 'Faites demi-tour sur ' };
    return {
      mode, distance: Math.round(distance), duree: Math.round(duree), ligne,
      etapes: etapes.map(s => ({ manoeuvre: s.turn, voie: s.v.code, nom: s.v.nom, distance: Math.round(s.len), position: { lat: s.at.lat, lng: s.at.lon },
        instruction: s.turn === 'depart' ? 'Partez ' + vers(Math.cos(s.b * Math.PI / 180), Math.sin(s.b * Math.PI / 180)) + ' sur ' + s.v.nom : TXT[s.turn] + s.v.nom }))
    };
  }
  _idNode(G, p) { return G.ids.get(NK(p)); }
}

/* ---------------------------------------------------------------------
   5. CHARGEMENT
   --------------------------------------------------------------------- */
async function charger(opts) {
  opts = typeof opts === 'string' ? { base: opts } : (opts || {});
  let base = opts.base || (typeof document !== 'undefined' && document.currentScript ? new URL('../data/', document.currentScript.src).href : './data/');
  if (!/\/$/.test(base)) base += '/';
  try { base = new URL(base, typeof location !== 'undefined' ? location.href : undefined).href; }
  catch (e) { throw new Error('Adresse du référentiel invalide : donnez une adresse complète, par ex. https://liousax.github.io/conakry-adresses/data/'); }
  const get = async u => { const r = await fetch(new URL(u, base).href, { cache: opts.cache || 'default' }); if (!r.ok) throw new Error('Référentiel introuvable (' + r.status + ') : ' + u); return r.json(); };
  const index = await get('index.json');
  if (!index || index.format !== 'conakry-adresses' || index.v !== 1) throw new Error('Format de référentiel inconnu');
  const voies = await get(index.fichiers.voies);
  return new Referentiel(index, voies);
}
/* même chose à partir d'objets déjà en mémoire */
const depuis = (index, voies) => new Referentiel(index, voies);

/* scripts chargés avant le DOM (balise <script src=…>) : mémorise l'emplacement */
const _src = (typeof document !== 'undefined' && document.currentScript) ? document.currentScript.src : null;
async function chargerAuto(opts) { opts = opts || {}; if (!opts.base && _src) opts.base = new URL('../data/', _src).href; return charger(opts); }

const api = {
  version: VERSION, attribution: ATTRIBUTION,
  charger: chargerAuto, depuis,
  plusCode, plusCodeCourt, plusCodeDecode,
  /* outils pour l'atelier et les tests */
  _interne: { chainOf, refOn, houseNo, pointOfNumber, dist, norm, toks, encodeLine, decodeLine, inRing, ringArea, ringIndex, inRingIdx, CLASSES, MAJEUR, mLat, mLon, STEP }
};
/* noms anglais pour les développeurs qui préfèrent */
Referentiel.prototype.reverse = Referentiel.prototype.adresse;
Referentiel.prototype.search = Referentiel.prototype.chercher;
Referentiel.prototype.route = Referentiel.prototype.itineraire;
Referentiel.prototype.locate = Referentiel.prototype.position;
api.load = chargerAuto;
return api;
}));
