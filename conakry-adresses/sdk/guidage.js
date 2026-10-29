/* Conakry Adresses : guidage pas à pas sur la carte du plan d'adressage, sans Google Maps.
   - Le moteur suit la position GPS le long de l'itinéraire, donne la prochaine manœuvre, prépare les annonces
     vocales, recalcule l'itinéraire quand on s'en écarte, repère l'arrivée et le côté de la porte.
   - L'écran montre la carte plein écran, orientée dans le sens de la marche, avec le bandeau de la manœuvre,
     le temps restant et l'heure d'arrivée.
   Le guidage n'utilise pas internet : les rues viennent du référentiel déjà chargé, aucun fond de carte n'est téléchargé.
   Utilisation :  GuidageConakry.ouvrir(conteneur, referentiel, adresse, { mode: 'moto' })
   Dans une appli, la position peut venir du GPS du téléphone : { positions: 'externe' }, puis guidage.position({ lat, lng, … }). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GuidageConakry = factory();
}(typeof self !== 'undefined' ? self : this, function () {
'use strict';
const RAD = Math.PI / 180;
const SCRIPT = typeof document !== 'undefined' && document.currentScript ? document.currentScript.src : null;

/* ---------- outils ---------- */
const plan = lat0 => { const kx = 111320 * Math.cos(lat0 * RAD), ky = 110574; return p => ({ x: p.lng * kx, y: p.lat * ky }); };
const capDe = (dx, dy) => (Math.atan2(dx, dy) / RAD + 360) % 360;          /* 0 = nord, 90 = est */
const ecartCap = (a, b) => { let d = (b - a) % 360; if (d > 180) d -= 360; if (d < -180) d += 360; return d; };
const POINTS = ['le nord', 'le nord-est', 'l\'est', 'le sud-est', 'le sud', 'le sud-ouest', 'l\'ouest', 'le nord-ouest'];
const versCap = c => POINTS[Math.round(((c % 360) + 360) % 360 / 45) % 8];
const minuscule = t => t ? t[0].toLowerCase() + t.slice(1) : t;
const nombre = (x, d) => (d ? x.toFixed(d) : String(Math.round(x))).replace('.', ',');
function distanceTexte(m) {
  if (m < 1000) return (m < 100 ? Math.round(m / 10) * 10 : Math.round(m / 50) * 50) + ' m';
  return nombre(Math.round(m / 100) / 10, m < 10000 ? 1 : 0) + ' km';
}
function distanceVoix(m) {
  if (m >= 950) { const k = Math.round(m / 100) / 10; return nombre(k, k % 1 ? 1 : 0) + (k >= 2 ? ' kilomètres' : ' kilomètre'); }
  const r = m < 100 ? Math.max(10, Math.round(m / 10) * 10) : m < 300 ? Math.round(m / 50) * 50 : Math.round(m / 100) * 100;
  return r + ' mètres';
}
function dureeTexte(s) {
  if (s < 90) return '1 min';
  if (s < 3600) return Math.round(s / 60) + ' min';
  return Math.floor(s / 3600) + ' h ' + String(Math.round(s % 3600 / 60)).padStart(2, '0');
}
/* « Tournez à droite sur Rue X » → « Tournez à droite » */
const verbeDe = e => e.nom && e.instruction.endsWith(' sur ' + e.nom) ? e.instruction.slice(0, -(e.nom.length + 5)) : e.instruction;

/* adresse de la bibliothèque (ou simple point) → destination du guidage ; on vise la rue devant la porte */
function destination(a) {
  if (!a) return null;
  const pos = a.position || a.Position;
  if (pos) {
    const rue = a.pointRue || a.PointRue || pos;
    return { lat: +rue.lat, lng: +rue.lng, titre: a.ligne1 || a.Ligne1 || '', sousTitre: a.ligne2 || a.Ligne2 || '', porte: { lat: +pos.lat, lng: +pos.lng } };
  }
  return { lat: +a.lat, lng: +a.lng, titre: a.titre || '', sousTitre: a.sousTitre || '', porte: a.porte || null };
}

/* ---------- itinéraire prêt pour le suivi : points en mètres, distances cumulées, début de chaque étape ---------- */
function preparer(it) {
  const xy = plan(it.ligne[0][0]);
  const pts = it.ligne.map(q => { const p = { lat: q[0], lng: q[1] }; return Object.assign(p, xy(p)); });
  const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const etapes = []; let j = 0;
  for (const e of it.etapes) {
    const q = xy(e.position); let best = j, bd = Infinity;
    for (let i = j; i < pts.length; i++) { const d = Math.hypot(pts[i].x - q.x, pts[i].y - q.y); if (d < bd) { bd = d; best = i; } if (d < 0.5) break; }
    j = best; etapes.push(Object.assign({}, e, { debut: cum[best], verbe: verbeDe(e) }));
  }
  return { it, xy, pts, cum, total: cum[cum.length - 1], etapes };
}
/* premier point dont la distance cumulée atteint s */
function indice(P, s) { let lo = 1, hi = P.cum.length - 1; if (s <= 0) return 1; while (lo < hi) { const m = (lo + hi) >> 1; if (P.cum[m] < s) lo = m + 1; else hi = m; } return lo; }
/* point de l'itinéraire le plus proche de p, sur les tronçons [de, a[ */
function projeter(P, p, de, a) {
  let b = null;
  for (let i = Math.max(1, de); i < Math.min(P.pts.length, a); i++) {
    const A = P.pts[i - 1], B = P.pts[i], vx = B.x - A.x, vy = B.y - A.y, L2 = vx * vx + vy * vy;
    let t = L2 ? ((p.x - A.x) * vx + (p.y - A.y) * vy) / L2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const d = Math.hypot(p.x - (A.x + t * vx), p.y - (A.y + t * vy));
    if (!b || d < b.d - 0.01) b = { i, t, d, s: P.cum[i - 1] + t * Math.sqrt(L2), lat: A.lat + t * (B.lat - A.lat), lng: A.lng + t * (B.lng - A.lng), cap: L2 ? capDe(vx, vy) : null };
  }
  return b;
}
/* point de l'itinéraire à la distance s du départ */
function pointA(P, s) {
  const i = indice(P, s), A = P.pts[i - 1], B = P.pts[i], L = P.cum[i] - P.cum[i - 1], t = L ? Math.max(0, Math.min(1, (s - P.cum[i - 1]) / L)) : 0;
  return { x: A.x + t * (B.x - A.x), y: A.y + t * (B.y - A.y) };
}

/* ---------- moteur ---------- */
class Moteur {
  /* ref : référentiel chargé ; dest : adresse de la bibliothèque ou { lat, lng, titre } ;
     opts : { mode: 'voiture' | 'moto' | 'pied', itineraire: trajet déjà calculé (facultatif) } */
  constructor(ref, dest, opts) {
    opts = opts || {};
    this.ref = ref; this.mode = opts.mode || 'voiture'; this.dest = destination(dest);
    this.P = opts.itineraire && opts.itineraire.ligne && opts.itineraire.ligne.length > 1 ? preparer(opts.itineraire) : null;
    this.s = 0; this.nHors = 0; this.horsDepuis = 0; this.tCalcul = -1e12; this.dit = new Set(); this.fini = false;
    this.premier = true; this.cap = null; this.nContre = 0; this.tContre = -1e12; this.dernier = null; this.ecartDepart = 0;
  }
  _calculer(pos, t) {
    this.tCalcul = t;
    const it = this.ref.itineraire({ lat: pos.lat, lng: pos.lng }, { lat: this.dest.lat, lng: this.dest.lng }, { mode: this.mode });
    if (!it || !it.ligne || it.ligne.length < 2) return false;
    this.P = preparer(it); this.s = 0; this.nHors = 0; this.horsDepuis = 0; this.nContre = 0;
    /* distance entre la position et la rue de départ (cour, parking…) : pas encore « hors de l'itinéraire » */
    const d0 = projeter(this.P, this.P.xy(pos), 1, Math.min(this.P.pts.length, 8)); this.ecartDepart = d0 ? d0.d : 0;
    return true;
  }
  /* point de l'itinéraire où l'on se trouve : d'abord près de la dernière position, sinon plus loin (raccourci) */
  _suivre(P, p, v, seuil) {
    let pr = projeter(P, p, indice(P, this.s - 40), indice(P, this.s + 300 + (v || 0) * 4) + 1);
    if (!pr || pr.d > seuil) { const g = projeter(P, p, 1, P.pts.length); if (g && g.d <= seuil && g.s > this.s) pr = g; else if (!pr || (g && g.d < pr.d)) pr = pr || g; }
    return pr;
  }
  /* côté de la porte, dans le sens d'arrivée */
  cote() {
    const P = this.P, d = this.dest && this.dest.porte; if (!P || !d) return null;
    const B = P.pts[P.pts.length - 1], A = pointA(P, Math.max(0, P.total - 15)), D = P.xy(d);
    const vx = B.x - A.x, vy = B.y - A.y, wx = D.x - B.x, wy = D.y - B.y;
    if (Math.hypot(wx, wy) < 2.5 || Math.hypot(vx, vy) < 1) return null;
    return vx * wy - vy * wx > 0 ? 'gauche' : 'droite';
  }
  /* sans chemin sur le plan : distance et direction à vol d'oiseau */
  _direct(pos, annonces) {
    const xy = plan(pos.lat), a = xy(pos), b = xy(this.dest), dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), c = capDe(dx, dy);
    if (pos.vitesse > 2 && pos.cap != null) this.cap = pos.cap;
    if (!this.dit.has('sans')) { this.dit.add('sans'); annonces.push({ texte: 'Aucun chemin trouvé sur le plan. La destination est à ' + distanceVoix(d) + ', vers ' + versCap(c) + '.', prio: 2 }); }
    return this.dernier = { etat: 'sans-chemin', bandeau: { icone: 'direct', distance: d, verbe: 'Pas de chemin sur le plan', nom: 'Destination vers ' + versCap(c), capDirect: c },
      suite: null, restant: { distance: d, duree: null }, position: { lat: pos.lat, lng: pos.lng }, cap: this.cap, ligne: [[pos.lng, pos.lat], [this.dest.lng, this.dest.lat]],
      annonces, cote: null, imprecis: pos.precision > 100 };
  }
  /* nouvelle position : { lat, lng, precision (m), cap (degrés), vitesse (m/s), t (ms) } → état du guidage */
  maj(pos) {
    if (!pos || !isFinite(pos.lat) || !isFinite(pos.lng)) return this.dernier;
    if (this.fini) return this.dernier;
    const t = pos.t || Date.now(), acc = pos.precision == null || !isFinite(pos.precision) ? 15 : pos.precision;
    const v = pos.vitesse == null || !isFinite(pos.vitesse) ? null : pos.vitesse, capGps = pos.cap == null || !isFinite(pos.cap) ? null : pos.cap;
    const annonces = [], pied = this.mode === 'pied';
    /* 1. itinéraire : calculé à la première position, recalculé quand on s'en écarte */
    let recalcul = false;
    if (!this.P) {
      if (t - this.tCalcul < 8000) return this._direct(pos, annonces);
      if (!this._calculer(pos, t)) return this._direct(pos, annonces);
      recalcul = this.dit.has('start') || this.dit.has('sans');
    }
    let P = this.P, p = P.xy(pos);
    const seuil = (pied ? 25 : 35) + Math.min(acc, 50) * 0.5;
    let pr = this._suivre(P, p, v, seuil);
    /* hors de l'itinéraire ? (au départ, on peut être loin de la rue : cour, parking) */
    const dehors = q => !(q && (q.d <= seuil || (q.s < 30 && q.d <= this.ecartDepart + 25)));
    if (acc <= 100 && dehors(pr)) {
      if (!this.horsDepuis) this.horsDepuis = t;
      this.nHors++;
      const loin = pr ? pr.d : Infinity;
      if (((this.nHors >= 2 && t - this.horsDepuis >= 2500) || loin > 150 || (this.premier && loin > 60)) && t - this.tCalcul >= 4000) {
        const avant = this.P;
        if (this._calculer(pos, t)) { P = this.P; p = P.xy(pos); pr = this._suivre(P, p, v, seuil); recalcul = true; }
        else this.P = avant;
      }
    } else if (!dehors(pr)) { this.nHors = 0; this.horsDepuis = 0; }
    this.premier = false;
    const surRoute = !dehors(pr);
    /* loin de l'itinéraire et aucun nouveau chemin (pas de rue du plan à proximité) : rejoindre l'itinéraire */
    if (!surRoute && pr && pr.d > 150 && !recalcul) {
      const c = capDe(P.xy(pr).x - p.x, P.xy(pr).y - p.y);
      if (!this.dit.has('rejoindre') || t - (this.tRejoindre || 0) > 60000) { this.dit.add('rejoindre'); this.dit.add('start'); this.tRejoindre = t; annonces.push({ texte: 'Rejoignez l\'itinéraire, à ' + distanceVoix(pr.d) + ' vers ' + versCap(c) + '.', prio: 2 }); }
      if (capGps != null && v != null && v > 2) this.cap = capGps;
      return this.dernier = { etat: 'hors-route', bandeau: { icone: 'direct', distance: pr.d, verbe: 'Rejoignez l\'itinéraire', nom: 'vers ' + versCap(c), capDirect: c }, suite: null,
        restant: { distance: Math.max(0, P.total - this.s) + pr.d, duree: null }, position: { lat: pos.lat, lng: pos.lng }, gps: { lat: pos.lat, lng: pos.lng, precision: acc }, cap: this.cap,
        ligne: [[pos.lng, pos.lat]].concat(P.pts.slice(pr.i - 1).map(q => [q.lng, q.lat])), annonces, cote: null, ecart: Math.round(pr.d), imprecis: acc > 100 };
    }
    if (surRoute && (pr.s >= this.s || this.s - pr.s > 12)) this.s = pr.s;        /* petits reculs du GPS ignorés */
    const s = this.s, reste = Math.max(0, P.total - s), E = P.etapes;
    /* on remonte l'itinéraire à contresens */
    if (surRoute && v != null && v > 3 && capGps != null && pr.cap != null && Math.abs(ecartCap(capGps, pr.cap)) > 130) this.nContre++; else this.nContre = 0;
    /* 2. prochaine manœuvre */
    let k = 1; while (k < E.length && E[k].debut <= s + 3) k++;
    const prochaine = k < E.length ? E[k] : null, D = prochaine ? prochaine.debut - s : reste;
    const B = P.pts[P.pts.length - 1], dFin = Math.hypot(p.x - B.x, p.y - B.y);
    const arrive = acc <= 60 && (reste <= (pied ? 10 : 18) || (dFin <= 15 && reste <= 60));
    const cote = this.cote();
    const vit = v == null ? (pied ? 1.4 : 7) : v;
    const pres = pied ? 18 : Math.min(90, Math.max(35, vit * 5)), loin = pied ? 70 : vit > 12 ? 600 : 300;
    /* 3. annonces */
    const debut = !this.dit.has('start');
    if (recalcul && !debut) this.dit = new Set(['start']);
    if (debut || recalcul) {
      this.dit.add('start');
      const cap0 = P.pts.length > 1 ? capDe(P.pts[1].x - P.pts[0].x, P.pts[1].y - P.pts[0].y) : null;
      const demiTour = capGps != null && v != null && v > 3 && cap0 != null && Math.abs(ecartCap(capGps, cap0)) > 120;
      let tx = debut ? 'C\'est parti.' : 'Nouvel itinéraire.';
      if (demiTour) tx += ' Faites demi-tour dès que possible.';
      else if (debut) tx += ' ' + E[0].instruction + '.';
      if (prochaine && D <= 400) { tx += ' Dans ' + distanceVoix(D) + ', ' + minuscule(prochaine.instruction) + '.'; this.dit.add('loin:' + k); if (D <= pres) this.dit.add('pres:' + k); }
      else if (prochaine && !debut && !demiTour) tx += ' Suivez ' + E[k - 1].nom + ' sur ' + distanceVoix(D) + '.';
      annonces.push({ texte: tx, prio: 2 });
    } else if (this.nContre >= 4 && t - this.tContre > 30000) {
      this.tContre = t; annonces.push({ texte: 'Faites demi-tour dès que possible.', prio: 2 });
    } else if (prochaine && !arrive) {
      const avant = prochaine.debut - E[k - 1].debut;
      if (D <= pres && !this.dit.has('pres:' + k)) {
        this.dit.add('pres:' + k); this.dit.add('loin:' + k);
        let tx = prochaine.instruction; const suite = E[k + 1];
        if (suite && suite.debut - prochaine.debut <= 60) { tx += ', puis ' + minuscule(suite.instruction); this.dit.add('loin:' + (k + 1)); }
        else if (!suite && P.total - prochaine.debut <= 60) { tx += ', puis vous serez à destination'; this.dit.add('fin'); }
        annonces.push({ texte: tx + '.', prio: 2 });
      } else if (D <= loin && D > pres + 40 && !this.dit.has('loin:' + k) && prochaine.manoeuvre !== 'tout-droit' && avant > pres + 60) {
        this.dit.add('loin:' + k);
        annonces.push({ texte: 'Dans ' + distanceVoix(D) + ', ' + minuscule(prochaine.instruction) + '.', prio: 1 });
      }
    }
    if (!prochaine && !arrive && reste <= (pied ? 40 : 120) && reste > (pied ? 15 : 30) && !this.dit.has('fin')) {
      this.dit.add('fin');
      annonces.push({ texte: 'Dans ' + distanceVoix(reste) + ', vous serez à destination' + (cote ? ', porte à votre ' + cote : '') + '.', prio: 1 });
    }
    if (arrive) {
      this.fini = true;
      annonces.push({ texte: 'Vous êtes à destination' + (this.dest.titre ? ' : ' + this.dest.titre : '') + '.' + (cote ? ' La porte est à votre ' + cote + '.' : ''), prio: 3 });
    }
    /* 4. affichage */
    if (surRoute && pr.cap != null) { const a = pointA(P, s), b = pointA(P, Math.min(P.total, s + 12)); this.cap = Math.hypot(b.x - a.x, b.y - a.y) > 2 ? capDe(b.x - a.x, b.y - a.y) : pr.cap; }
    else if (capGps != null && v != null && v > 2) this.cap = capGps;
    if (this.cap == null && P.pts.length > 1) this.cap = capDe(P.pts[1].x - P.pts[0].x, P.pts[1].y - P.pts[0].y);
    const aff = surRoute && pr.d <= seuil ? { lat: pr.lat, lng: pr.lng } : { lat: pos.lat, lng: pos.lng };
    const bandeau = arrive ? { icone: 'arrivee', distance: null, verbe: 'Vous êtes à destination', nom: this.dest.titre || '', sous: cote ? 'Porte à votre ' + cote : (this.dest.sousTitre || '') }
      : this.nContre >= 4 ? { icone: 'demi-tour', distance: null, verbe: 'Faites demi-tour', nom: 'dès que possible' }
      : prochaine ? { icone: prochaine.manoeuvre, distance: D, verbe: prochaine.verbe, nom: prochaine.nom }
      : { icone: 'arrivee', distance: reste, verbe: 'Destination', nom: this.dest.titre || '', sous: cote ? 'Porte à votre ' + cote : '' };
    const sv = prochaine && E[k + 1] && E[k + 1].debut - prochaine.debut <= 100 ? { icone: E[k + 1].manoeuvre, verbe: E[k + 1].verbe, nom: E[k + 1].nom }
      : prochaine && k === E.length - 1 && P.total - prochaine.debut <= 100 ? { icone: 'arrivee', verbe: 'Destination', nom: 'destination' } : null;
    const debutLigne = surRoute && pr ? pr.i : indice(P, s);
    const ligne = [[aff.lng, aff.lat]].concat(P.pts.slice(debutLigne).map(q => [q.lng, q.lat]));
    const etat = arrive ? 'arrive' : recalcul && !debut ? 'recalcul' : surRoute ? 'route' : 'hors-route';
    return this.dernier = { etat, bandeau, suite: arrive ? null : sv, restant: { distance: reste, duree: P.total ? Math.round(P.it.duree * reste / P.total) : 0 },
      position: aff, gps: { lat: pos.lat, lng: pos.lng, precision: acc }, cap: this.cap, ligne, annonces, cote, ecart: pr ? Math.round(pr.d) : null, imprecis: acc > 100 };
  }
}

/* ---------- écran de guidage ---------- */
const SVG = {
  'tout-droit': '<path d="M24 41V9M12 21 24 9l12 12"/>',
  depart: '<path d="M24 41V9M12 21 24 9l12 12"/>',
  droite: '<path d="M15 41V25a7 7 0 0 1 7-7h17M30 9l9 9-9 9"/>',
  gauche: '<path d="M33 41V25a7 7 0 0 0-7-7H9M18 9l-9 9 9 9"/>',
  'legerement-droite': '<path d="M18 41V27l15-15M22 11h12v12"/>',
  'legerement-gauche': '<path d="M30 41V27L15 12M26 11H14v12"/>',
  'demi-tour': '<path d="M15 41V19a9 9 0 0 1 18 0v15M26 28l7 7 7-7"/>',
  arrivee: '<path d="M24 43s13-13.4 13-23.5a13 13 0 0 0-26 0C11 29.6 24 43 24 43z"/><circle cx="24" cy="19.5" r="4.5"/>',
  direct: '<path d="M24 41V9M12 21 24 9l12 12"/>',
  gps: '<circle cx="24" cy="24" r="8"/><path d="M24 4v8M24 36v8M4 24h8M36 24h8"/>'
};
const CSS = `.gc{position:fixed;inset:0;z-index:60;background:#ece6d9;color:#17231b;font-family:var(--body,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif);-webkit-tap-highlight-color:transparent;overflow:hidden}
.gc-carte{position:absolute;inset:0}
.gc-haut{position:absolute;left:10px;right:10px;top:calc(env(safe-area-inset-top,0px) + 10px);z-index:2}
.gc-band{display:flex;gap:12px;align-items:center;background:#0f5e3a;color:#fff;border-radius:16px;padding:12px 14px;box-shadow:0 6px 18px rgba(0,0,0,.3);min-height:80px}
.gc.sans .gc-band{background:#8a5a00}.gc.arrive .gc-band{background:#0f7a46}.gc.hors .gc-band{background:#3f4a43}
.gc-ic{flex:none;width:54px;height:54px;display:grid;place-items:center}
.gc-ic svg{width:54px;height:54px;fill:none;stroke:#fff;stroke-width:4.6;stroke-linecap:round;stroke-linejoin:round;transition:transform .4s}
.gc-tx{min-width:0;flex:1}
.gc-d{font:800 30px/1 var(--display,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif);letter-spacing:-.01em;font-variant-numeric:tabular-nums}
.gc-v{font-size:15px;line-height:1.25;opacity:.92;margin-top:3px}
.gc-n{font-weight:700;font-size:19px;line-height:1.2;margin-top:2px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.gc-s{font-size:14px;opacity:.9;margin-top:2px}
.gc-puis{display:inline-flex;gap:8px;align-items:center;margin:0 0 0 12px;background:#0b4a2d;color:#fff;border-radius:0 0 12px 12px;padding:5px 12px 6px;font-size:14px;font-weight:600;box-shadow:0 6px 14px rgba(0,0,0,.22)}
.gc-puis svg{width:22px;height:22px;fill:none;stroke:#fff;stroke-width:4.6;stroke-linecap:round;stroke-linejoin:round}
.gc-msg{position:absolute;z-index:3;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom,0px) + 104px);background:#17231b;color:#fff;padding:9px 14px;border-radius:10px;font-weight:600;font-size:14px;max-width:calc(100% - 32px);text-align:center;box-shadow:0 4px 12px rgba(0,0,0,.3)}
.gc-bas{position:absolute;z-index:2;left:0;right:0;bottom:0;background:#fff;border-radius:18px 18px 0 0;box-shadow:0 -4px 18px rgba(0,0,0,.2);padding:12px 14px calc(10px + env(safe-area-inset-bottom,0px));display:flex;align-items:center;gap:8px}
.gc-eta{flex:1;min-width:0}.gc-eta b{display:block;font:800 26px/1.1 var(--display,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif);color:#0f7a46;font-variant-numeric:tabular-nums}.gc-eta span{display:block;font-size:14px;color:#5b5f57;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gc-eta small{display:block;font-size:10.5px;color:#8a8f86;margin-top:2px}
.gc-b{border:0;border-radius:12px;min-height:48px;min-width:48px;padding:0 14px;font:700 15px var(--body,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif);background:#eef1ec;color:#17231b;cursor:pointer;display:grid;place-items:center}
.gc-b svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
.gc-fin{background:#c8312a;color:#fff}
.gc-centre{position:absolute;z-index:2;right:12px;bottom:calc(env(safe-area-inset-bottom,0px) + 96px);box-shadow:0 3px 12px rgba(0,0,0,.28);background:#fff}
.gc [hidden]{display:none!important}
.gc-moi{width:46px;height:46px}.gc-moi svg{width:46px;height:46px;display:block}
.gc-pin{width:30px;height:42px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.4))}
@media (prefers-color-scheme:dark){.gc{background:#1b201c;color:#eef1ec}.gc-bas{background:#222a24}.gc-eta span{color:#b9bfb6}.gc-b{background:#2f3831;color:#eef1ec}.gc-centre{background:#2f3831}.gc-fin{background:#c8312a;color:#fff}}`;
const COUL = {
  clair: { fond: '#ece6d9', rue: '#ffffff', rueB: '#d3c9b6', maj: '#ffe7a3', majB: '#d4ab4e', txt: '#2a2f2b', halo: '#ffffff', impair: '#8a4b0f', route: '#1a73e8', routeB: '#0d4fb0' },
  sombre: { fond: '#1b201c', rue: '#3a423c', rueB: '#262c27', maj: '#6a5a2c', majB: '#3b3220', txt: '#e8ebe6', halo: '#1b201c', impair: '#e6a865', route: '#4c9bff', routeB: '#1d4f9a' }
};
const glyphOk = c => { const n = c.codePointAt(0); return n < 1024 || (n >= 7680 && n < 7936) || (n >= 8192 && n < 8448); };
const sur = t => [...String(t || '')].map(c => glyphOk(c) ? c : [...c.normalize('NFD')].filter(glyphOk).join('')).join('');
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]));
const MAJ = { trunk: 1, primary: 1, secondary: 1 };
const FC = f => ({ type: 'FeatureCollection', features: f || [] });

function voixNavigateur() {
  const S = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null;
  if (!S || typeof SpeechSynthesisUtterance === 'undefined') return null;
  let voix = null;
  const choisir = () => { try { const l = S.getVoices(); voix = l.find(x => /^fr[-_]FR/i.test(x.lang)) || l.find(x => /^fr/i.test(x.lang)) || null; } catch (e) { } };
  choisir(); try { S.addEventListener('voiceschanged', choisir); } catch (e) { }
  const parler = (texte, prio) => {
    try { if (prio >= 2) S.cancel(); const u = new SpeechSynthesisUtterance(texte); u.lang = voix ? voix.lang : 'fr-FR'; if (voix) u.voice = voix; S.speak(u); } catch (e) { }
  };
  parler.debloquer = () => { try { const u = new SpeechSynthesisUtterance(''); u.volume = 0; S.speak(u); } catch (e) { } };
  parler.taire = () => { try { S.cancel(); } catch (e) { } };
  return parler;
}
const lire = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const ecrire = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { } };

/* ouvre le guidage plein écran dans conteneur (élément ou id) ; renvoie { position(p), arreter(), moteur } */
function ouvrir(conteneur, ref, adresse, opts) {
  opts = opts || {};
  const ML = opts.maplibregl || (typeof maplibregl !== 'undefined' ? maplibregl : null);
  if (!ML) throw new Error('MapLibre GL est nécessaire pour le guidage.');
  const box = typeof conteneur === 'string' ? document.getElementById(conteneur) : conteneur;
  const M = new Moteur(ref, adresse, { mode: opts.mode, itineraire: opts.itineraire });
  if (!document.getElementById('gc-style')) { const st = document.createElement('style'); st.id = 'gc-style'; st.textContent = CSS; document.head.appendChild(st); }
  const sombre = typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches && document.documentElement.dataset.theme !== 'light';
  const C = sombre ? COUL.sombre : COUL.clair;
  const el = document.createElement('div'); el.className = 'gc'; el.setAttribute('role', 'application'); el.setAttribute('aria-label', 'Guidage');
  el.innerHTML = `<div class="gc-carte"></div>
    <div class="gc-haut"><div class="gc-band" role="status" aria-live="polite"><div class="gc-ic"><svg viewBox="0 0 48 48" aria-hidden="true">${SVG.gps}</svg></div><div class="gc-tx"><div class="gc-d"></div><div class="gc-v">Recherche de votre position…</div><div class="gc-n"></div><div class="gc-s"></div></div></div><div class="gc-puis" hidden></div></div>
    <div class="gc-msg" hidden></div>
    <button type="button" class="gc-b gc-centre" hidden>Recentrer</button>
    <div class="gc-bas"><div class="gc-eta"><b>—</b><span>${esc(M.dest.titre)}</span><small>Rues © OpenStreetMap · plan provisoire</small></div>
      <button type="button" class="gc-b gc-son" aria-pressed="true" aria-label="Voix"></button><button type="button" class="gc-b gc-fin">Terminer</button></div>`;
  box.appendChild(el);
  const q = s => el.querySelector(s);
  const parlerDefaut = voixNavigateur();
  const parler = opts.parler || parlerDefaut;
  let voixOn = (opts.voix != null ? !!opts.voix : lire('conakry-guidage-voix') !== '0') && !!parler;
  const sonIc = () => { q('.gc-son').setAttribute('aria-pressed', voixOn ? 'true' : 'false'); q('.gc-son').innerHTML = voixOn ? '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>' : '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>'; };
  sonIc(); if (!parler) q('.gc-son').hidden = true;
  if (parlerDefaut && !opts.parler && parlerDefaut.debloquer) parlerDefaut.debloquer();      /* iPhone : la voix doit démarrer pendant le geste */

  /* carte : seulement les rues du plan (rien à télécharger) */
  const glyphs = (opts.glyphs ? new URL(opts.glyphs, location.href).href : new URL('../glyphs/{fontstack}/{range}.pbf', SCRIPT || location.href).href).replace('%7Bfontstack%7D', '{fontstack}').replace('%7Brange%7D', '{range}');
  const z = ['interpolate', ['exponential', 1.6], ['zoom']];
  const W = [[12, 2, .7], [13, 2.8, 1.2], [14, 4, 2], [15, 6, 3.4], [16, 9.5, 6.5], [17, 15, 11], [18, 24, 18], [19, 38, 28]];
  const larg = add => [...z, ...W.flatMap(([zz, Mj, m]) => [zz, ['case', ['==', ['get', 'm'], 1], Mj + add, m + add]])];
  const voies = FC(ref.voies.map(v => ({ type: 'Feature', properties: { n: sur(v.nom), m: MAJ[v.highway] ? 1 : 0 }, geometry: { type: 'MultiLineString', coordinates: v.segs.map(g => g.map(p => [p.lon, p.lat])) } })));
  const sources = { voies: { type: 'geojson', data: voies, tolerance: .3, buffer: 64 }, route: { type: 'geojson', data: FC() }, nums: { type: 'geojson', data: FC() } };
  const layers = [{ id: 'fond', type: 'background', paint: { 'background-color': C.fond } }];
  if (opts.fond) { sources.esri = { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 16 }; layers.push({ id: 'esri', type: 'raster', source: 'esri', paint: { 'raster-opacity': .5 } }); }
  const rond = { 'line-cap': 'round', 'line-join': 'round' };
  layers.push(
    { id: 'bord', type: 'line', source: 'voies', layout: rond, paint: { 'line-color': ['case', ['==', ['get', 'm'], 1], C.majB, C.rueB], 'line-width': larg(2.4) } },
    { id: 'voies', type: 'line', source: 'voies', layout: rond, paint: { 'line-color': ['case', ['==', ['get', 'm'], 1], C.maj, C.rue], 'line-width': larg(0) } },
    { id: 'route-b', type: 'line', source: 'route', layout: rond, paint: { 'line-color': C.routeB, 'line-width': [...z, 12, 7, 16, 16, 19, 34] } },
    { id: 'route', type: 'line', source: 'route', layout: rond, paint: { 'line-color': C.route, 'line-width': [...z, 12, 4.5, 16, 11, 19, 25] } },
    { id: 'nums', type: 'symbol', source: 'nums', minzoom: 17.2, layout: { 'text-field': ['get', 't'], 'text-font': ['NotoSansMedium'], 'text-size': 11.5, 'text-padding': 1 }, paint: { 'text-color': ['case', ['==', ['get', 'i'], 1], C.impair, C.txt], 'text-halo-color': C.halo, 'text-halo-width': 1.6 } },
    { id: 'noms', type: 'symbol', source: 'voies', minzoom: 14.5, layout: { 'text-field': ['get', 'n'], 'text-font': ['NotoSansMedium'], 'text-size': ['interpolate', ['linear'], ['zoom'], 15, 11, 18, 15], 'symbol-placement': 'line', 'text-max-angle': 35, 'symbol-spacing': 260, 'text-padding': 2, 'text-rotation-alignment': 'map', 'text-pitch-alignment': 'viewport' }, paint: { 'text-color': C.txt, 'text-halo-color': C.halo, 'text-halo-width': 1.8 } });
  const d0 = M.dest;
  const map = new ML.Map({ container: q('.gc-carte'), style: { version: 8, glyphs, sources, layers }, center: [d0.lng, d0.lat], zoom: 15, attributionControl: false, maxPitch: 65, pitchWithRotate: true });
  const pinEl = document.createElement('div'); pinEl.innerHTML = '<svg class="gc-pin" viewBox="0 0 30 42" aria-hidden="true"><path d="M15 41C15 41 28 25 28 14.5A13 13 0 0 0 2 14.5C2 25 15 41 15 41z" fill="#c8312a" stroke="#fff" stroke-width="2"/><circle cx="15" cy="14.5" r="5" fill="#fff"/></svg>';
  new ML.Marker({ element: pinEl, anchor: 'bottom' }).setLngLat([(d0.porte || d0).lng, (d0.porte || d0).lat]).addTo(map);
  const moiEl = document.createElement('div'); moiEl.className = 'gc-moi';
  moiEl.innerHTML = '<svg viewBox="0 0 46 46" aria-hidden="true"><circle cx="23" cy="23" r="21" fill="rgba(26,115,232,.2)"/><path d="M23 6 34.5 35 23 28.8 11.5 35z" fill="#1a73e8" stroke="#fff" stroke-width="2.6" stroke-linejoin="round"/></svg>';
  const moi = new ML.Marker({ element: moiEl, rotationAlignment: 'map', pitchAlignment: 'map' });
  let pret = false, suivre = true, tSuivi = 0, affiche = null, anim = 0, enAttente = null, tPos = 0, fini = false;
  map.on('load', () => { pret = true; if (M.P) dessinerRoute(M.P.pts.map(p => [p.lng, p.lat])); if (enAttente) { const e = enAttente; enAttente = null; afficher(e); } else if (M.P) { const xs = M.P.pts.map(p => p.lng), ys = M.P.pts.map(p => p.lat); map.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], { padding: { top: 130, bottom: 120, left: 40, right: 40 }, maxZoom: 17, duration: 0 }); } });
  const dessinerRoute = coords => { if (pret && map.getSource('route')) map.getSource('route').setData(FC(coords.length > 1 ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } }] : [])); };
  const numeros = () => {
    if (!pret || !ref.numerosDans) return;
    const e = M.dernier, cible = d0.porte || d0;
    if (map.getZoom() < 17.2 || !e || !(e.restant.distance < 400 || e.etat === 'arrive')) { map.getSource('nums').setData(FC()); return; }
    /* numéros des portes autour de la destination, pour compter les portes à l'arrivée */
    const kx = 111320 * Math.cos(cible.lat * RAD), R = 170, dl = R / 110574, dg = R / kx;
    const n = ref.numerosDans(cible.lat - dl, cible.lng - dg, cible.lat + dl, cible.lng + dg, 600).filter(x => Math.hypot((x.lat - cible.lat) * 110574, (x.lng - cible.lng) * kx) <= R);
    map.getSource('nums').setData(FC(n.map(x => ({ type: 'Feature', properties: { t: String(x.numero), i: x.impair ? 1 : 0 }, geometry: { type: 'Point', coordinates: [x.lng, x.lat] } }))));
  };
  let tNum = 0; map.on('moveend', () => { clearTimeout(tNum); tNum = setTimeout(numeros, 120); });
  const lacher = e => { if (e && e.originalEvent && !fini) { suivre = false; tSuivi = Date.now(); q('.gc-centre').hidden = false; } };
  ['dragstart', 'zoomstart', 'rotatestart', 'pitchstart'].forEach(ev => map.on(ev, lacher));
  const recentrer = () => { suivre = true; q('.gc-centre').hidden = true; if (M.dernier) camera(M.dernier, 600); };
  q('.gc-centre').onclick = recentrer;
  q('.gc-son').onclick = () => { voixOn = !voixOn; ecrire('conakry-guidage-voix', voixOn ? '1' : '0'); sonIc(); if (!voixOn && parler && parler.taire) parler.taire(); };
  const zoomPour = e => { const v = e && e.vitesse; return M.mode === 'pied' ? 18 : v == null ? 17.2 : v < 6 ? 17.6 : v < 12 ? 17 : 16.3; };
  let derniereVitesse = null;
  function camera(e, duree) {
    if (!pret) return;
    const H = map.getContainer().clientHeight, bas = q('.gc-bas').offsetHeight, haut = q('.gc-haut').offsetHeight;
    map.easeTo({ center: [e.position.lng, e.position.lat], bearing: e.cap == null ? map.getBearing() : e.cap, pitch: 52, zoom: zoomPour({ vitesse: derniereVitesse }),
      padding: { top: Math.max(haut + 20, Math.round(H * 0.42)), bottom: bas + 10, left: 0, right: 0 }, duration: duree, easing: x => x });
  }
  function bouger(vers, duree) {
    cancelAnimationFrame(anim);
    if (!affiche) { affiche = vers; moi.setLngLat([vers.lng, vers.lat]).addTo(map); return; }
    const de = affiche, t0 = performance.now();
    const pas = now => { const k = Math.min(1, (now - t0) / duree); affiche = { lat: de.lat + (vers.lat - de.lat) * k, lng: de.lng + (vers.lng - de.lng) * k }; moi.setLngLat([affiche.lng, affiche.lat]); if (k < 1) anim = requestAnimationFrame(pas); };
    anim = requestAnimationFrame(pas);
  }
  const message = m => { const x = q('.gc-msg'); x.textContent = m || ''; x.hidden = !m; };
  function afficher(e) {
    if (!e) return;
    if (!pret) { enAttente = e; return; }
    el.classList.toggle('sans', e.etat === 'sans-chemin'); el.classList.toggle('arrive', e.etat === 'arrive'); el.classList.toggle('hors', e.etat === 'hors-route');
    const b = e.bandeau, ic = q('.gc-ic svg');
    ic.innerHTML = SVG[b.icone] || SVG['tout-droit'];
    ic.style.transform = b.icone === 'direct' && b.capDirect != null ? 'rotate(' + Math.round(b.capDirect - map.getBearing()) + 'deg)' : '';
    q('.gc-d').textContent = b.distance == null ? '' : distanceTexte(b.distance);
    q('.gc-v').textContent = b.verbe || ''; q('.gc-n').textContent = b.nom || ''; q('.gc-s').textContent = b.sous || '';
    const puis = q('.gc-puis');
    if (e.suite) { puis.hidden = false; puis.innerHTML = 'Puis <svg viewBox="0 0 48 48" aria-hidden="true">' + (SVG[e.suite.icone] || '') + '</svg>' + esc(e.suite.nom || e.suite.verbe || ''); } else puis.hidden = true;
    const r = e.restant;
    q('.gc-eta b').textContent = e.etat === 'arrive' ? 'Arrivée' : r.duree == null ? distanceTexte(r.distance) : dureeTexte(r.duree);
    q('.gc-eta span').textContent = e.etat === 'arrive' ? (M.dest.titre + (M.dest.sousTitre ? ' · ' + M.dest.sousTitre : ''))
      : r.duree == null ? 'à vol d\'oiseau' : distanceTexte(r.distance) + ' · arrivée ' + new Date(Date.now() + r.duree * 1000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    dessinerRoute(e.etat === 'arrive' ? [] : e.ligne);
    bouger(e.position, 900);
    if (e.cap != null) moi.setRotation(e.cap);
    if (suivre || Date.now() - tSuivi > 15000) { if (!suivre) { suivre = true; q('.gc-centre').hidden = true; } camera(e, 900); }
    message(e.imprecis ? 'Signal GPS faible : position approximative.' : e.etat === 'recalcul' ? 'Nouvel itinéraire' : '');
  }
  function position(p) {
    if (fini) return null;
    tPos = Date.now(); derniereVitesse = p.vitesse == null || !isFinite(p.vitesse) ? derniereVitesse : p.vitesse;
    const e = M.maj(p);
    if (!e) return null;
    /* la voix et l'état partent tout de suite, même si la carte n'est pas encore affichée */
    if (voixOn && parler) for (const a of e.annonces) parler(a.texte, a.prio);
    if (opts.surEtat) try { opts.surEtat(e); } catch (x) { }
    afficher(e); return e;
  }
  /* GPS du navigateur, sauf si l'appli donne la position elle-même */
  let veille = null, idGps = null;
  if ((opts.positions || 'navigateur') === 'navigateur') {
    if (!navigator.geolocation) message('Ce navigateur ne donne pas la position.');
    else idGps = navigator.geolocation.watchPosition(g => position({ lat: g.coords.latitude, lng: g.coords.longitude, precision: g.coords.accuracy, cap: g.coords.heading, vitesse: g.coords.speed, t: g.timestamp }),
      err => message(err.code === 1 ? 'Localisation refusée : autorisez-la pour être guidé.' : 'Recherche du signal GPS…'), { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 });
  }
  const perdu = setInterval(() => { if (!fini && tPos && Date.now() - tPos > 15000) message('Signal GPS perdu…'); }, 5000);
  /* écran toujours allumé pendant le guidage */
  let verrou = null;
  const garder = async () => { try { if (navigator.wakeLock && document.visibilityState === 'visible') verrou = await navigator.wakeLock.request('screen'); } catch (x) { } };
  const vis = () => { if (document.visibilityState === 'visible' && !fini) garder(); };
  garder(); document.addEventListener('visibilitychange', vis);
  function arreter(raison) {
    if (fini && !el.isConnected) return;
    fini = true; cancelAnimationFrame(anim); clearInterval(perdu); clearTimeout(tNum);
    if (idGps != null) try { navigator.geolocation.clearWatch(idGps); } catch (x) { }
    document.removeEventListener('visibilitychange', vis);
    try { if (verrou) verrou.release(); } catch (x) { }
    if (parler && parler.taire) parler.taire();
    try { map.remove(); } catch (x) { }
    el.remove();
    if (opts.surFin) try { opts.surFin(raison || 'termine', M.dernier); } catch (x) { }
  }
  q('.gc-fin').onclick = () => arreter(M.fini ? 'arrive' : 'termine');
  const api = { position, arreter, moteur: M, carte: map, recentrer };
  el.guidage = api;
  return api;
}

return { ouvrir, Moteur, preparer, destination, distanceTexte, distanceVoix, dureeTexte, versCap };
}));
