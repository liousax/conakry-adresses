/* Itina Geo · Lieux : les établissements sur la carte (boutiques, entreprises, écoles, hôpitaux, institutions,
   stations-service…), comme sur Google Maps.
   Ce module est partagé par la carte, la page de gestion et le service Itina Geo Connect (même vérification partout) :
   - CATEGORIES : nom, groupe, couleur, icône (24 × 24), rang d'affichage, mots de recherche, étiquettes OpenStreetMap ;
   - valider(fiche) : la fiche nettoyée, ou la liste des erreurs (champ par champ) ;
   - ouvert(lieu, date) et horairesTexte(lieu) : « Ouvert · ferme à 20:00 », à l'heure de Conakry (UTC, sans heure d'été) ;
   - chercher(lieux, texte, { pres }) et categorieDe(texte) : par nom, ou « pharmacie » pour les pharmacies proches ;
   - depuisOSM(élément) : un lieu tiré d'OpenStreetMap ; fusionner(fichier, service, miens) : les sources réunies ;
   - photos(lieu) et urlPhoto(base, idLieu, photo, miniature) : les photos vérifiées d'un lieu, dans l'espace public du service.
   Utilisation : <script src="sdk/lieux.js"></script> puis GeoLieux.… ; ou require('./lieux.js'). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GeoLieux = factory();
}(typeof self !== 'undefined' ? self : this, function () {
'use strict';
const VERSION = '1.1.0';
/* groupes de catégories, chacun sa couleur (comme les repères de Google Maps) */
const GROUPES = {
  sante: { nom: 'Santé', c: '#e5383b' }, education: { nom: 'Éducation', c: '#7c3aed' }, manger: { nom: 'Manger et boire', c: '#f97316' },
  commerces: { nom: 'Commerces', c: '#2563eb' }, transport: { nom: 'Transport', c: '#0284c7' }, argent: { nom: 'Argent', c: '#16a34a' },
  institutions: { nom: 'Institutions', c: '#475569' }, culte: { nom: 'Lieux de culte', c: '#0d9488' }, sortir: { nom: 'Hôtels et loisirs', c: '#db2777' },
  services: { nom: 'Entreprises et services', c: '#4f46e5' }
};
/* rang : 1 visible dès la ville entière (zoom 12,5), 2 dans le quartier (14,5), 3 dans la rue (16) */
const C = (nom, groupe, rang, ic, mots, osm) => ({ nom, groupe, rang, ic, mots, osm: osm || [] });
const CATEGORIES = {
  hopital: C('Hôpital', 'sante', 1, '<path d="M4 21V7l8-4 8 4v14M3 21h18M10 21v-4h4v4M12 7.5v6M9 10.5h6"/>', ['hopital', 'hopitaux', 'chu', 'urgences', 'urgence'], [['amenity', 'hospital'], ['healthcare', 'hospital']]),
  clinique: C('Clinique, centre de santé', 'sante', 2, '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v9M7.5 12h9"/>', ['clinique', 'cliniques', 'centre de sante', 'dispensaire', 'cabinet medical', 'medecin', 'docteur', 'dentiste', 'maternite', 'laboratoire'], [['amenity', 'clinic'], ['amenity', 'doctors'], ['amenity', 'dentist'], ['healthcare', '*']]),
  pharmacie: C('Pharmacie', 'sante', 2, '<path d="M9.5 3h5v6.5H21v5h-6.5V21h-5v-6.5H3v-5h6.5z"/>', ['pharmacie', 'pharmacies', 'officine', 'medicament', 'medicaments'], [['amenity', 'pharmacy'], ['healthcare', 'pharmacy'], ['shop', 'chemist']]),
  ecole: C('École, collège, lycée', 'education', 2, '<path d="M3 21h18M5 21V10l7-5 7 5v11M10 21v-5h4v5M12 5V2h3"/>', ['ecole', 'ecoles', 'college', 'colleges', 'lycee', 'lycees', 'primaire', 'maternelle', 'creche', 'jardin d enfants', 'complexe scolaire', 'groupe scolaire'], [['amenity', 'school'], ['amenity', 'kindergarten']]),
  universite: C('Université, formation', 'education', 1, '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2.5 9 2.5 12 0v-5M22 9v5"/>', ['universite', 'universites', 'fac', 'faculte', 'institut', 'formation', 'centre de formation', 'grande ecole'], [['amenity', 'university'], ['amenity', 'college']]),
  restaurant: C('Restaurant, maquis', 'manger', 3, '<path d="M7 3v8M5 3v4a2 2 0 0 0 4 0V3M7 11v10M17 3c-2.2 2-2.2 6 0 8v10"/>', ['restaurant', 'restaurants', 'resto', 'maquis', 'fast food', 'dibiterie', 'grillade', 'manger', 'cantine'], [['amenity', 'restaurant'], ['amenity', 'fast_food'], ['amenity', 'food_court']]),
  cafe: C('Café, bar', 'manger', 3, '<path d="M4 8h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM17 9.5h1a2.5 2.5 0 0 1 0 5h-1M8 3v2M12 3v2"/>', ['cafe', 'cafes', 'bar', 'bars', 'buvette', 'the', 'lounge'], [['amenity', 'cafe'], ['amenity', 'bar'], ['amenity', 'pub'], ['amenity', 'ice_cream']]),
  boulangerie: C('Boulangerie, pâtisserie', 'manger', 3, '<path d="M5 12a7 4.5 0 0 1 14 0v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2zM9 9.5v3M12 8.5v3M15 9.5v3"/>', ['boulangerie', 'boulangeries', 'pain', 'patisserie', 'patisseries'], [['shop', 'bakery'], ['shop', 'pastry'], ['shop', 'confectionery']]),
  supermarche: C('Supermarché, alimentation', 'commerces', 2, '<path d="M3 4h2l2.5 11h11L21 7H6.5"/><circle cx="9" cy="19.5" r="1.3"/><circle cx="18" cy="19.5" r="1.3"/>', ['supermarche', 'supermarches', 'alimentation', 'epicerie', 'superette', 'mini market', 'magasin alimentaire', 'courses'], [['shop', 'supermarket'], ['shop', 'convenience'], ['shop', 'greengrocer'], ['shop', 'butcher'], ['shop', 'beverages'], ['shop', 'seafood']]),
  marche: C('Marché', 'commerces', 1, '<path d="M3 9l2-5h14l2 5M3 9v1a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0V9M5 13v8h14v-8M10 21v-4h4v4"/>', ['marche', 'marches'], [['amenity', 'marketplace']]),
  boutique: C('Boutique, magasin', 'commerces', 3, '<path d="M5 8h14l-1.2 13H6.2z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>', ['boutique', 'boutiques', 'magasin', 'magasins', 'commerce', 'shop', 'vente'], [['shop', '*']]),
  telephonie: C('Téléphonie, électronique', 'commerces', 3, '<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18h2"/>', ['telephone', 'telephones', 'telephonie', 'portable', 'electronique', 'informatique', 'ordinateur', 'recharge', 'credit', 'puce'], [['shop', 'mobile_phone'], ['shop', 'electronics'], ['shop', 'computer'], ['shop', 'telecommunication']]),
  quincaillerie: C('Quincaillerie, matériaux', 'commerces', 3, '<path d="M14 5.5l4.5 4.5M3.5 20.5l8.5-8.5M12.5 3.5l8 8-2.5 2.5-8-8z"/>', ['quincaillerie', 'quincailleries', 'materiaux', 'materiaux de construction', 'ciment', 'fer', 'peinture', 'plomberie'], [['shop', 'hardware'], ['shop', 'doityourself'], ['shop', 'trade'], ['shop', 'paint']]),
  station: C('Station-service', 'transport', 2, '<path d="M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M3 21h12M4 10h10M14 8l3 2v7.5a1.5 1.5 0 0 0 3 0V9l-3-3"/>', ['station', 'stations', 'station service', 'station essence', 'essence', 'carburant', 'gasoil', 'gazole', 'total', 'shell', 'star oil', 'vivo'], [['amenity', 'fuel']]),
  garage: C('Garage, mécanique', 'transport', 3, '<path d="M5 16v-5l2-5h10l2 5v5M5 16h14M5 16v3M19 16v3"/><circle cx="8.5" cy="13" r="1"/><circle cx="15.5" cy="13" r="1"/>', ['garage', 'garages', 'mecanique', 'mecanicien', 'vulcanisateur', 'vulcanisation', 'pneu', 'pneus', 'lavage', 'lavage auto'], [['shop', 'car_repair'], ['shop', 'tyres'], ['shop', 'car'], ['shop', 'car_parts'], ['amenity', 'car_wash'], ['shop', 'motorcycle']]),
  gare: C('Gare routière, transport', 'transport', 1, '<rect x="5" y="3.5" width="14" height="13" rx="2"/><path d="M5 10.5h14M8 20.5v-4M16 20.5v-4M8.5 13.5h.01M15.5 13.5h.01"/>', ['gare', 'gare routiere', 'autogare', 'taxi', 'taxis', 'bus', 'transport', 'embarcadere', 'port', 'aeroport'], [['amenity', 'bus_station'], ['amenity', 'taxi'], ['amenity', 'ferry_terminal'], ['public_transport', 'station'], ['aeroway', 'aerodrome']]),
  parking: C('Parking', 'transport', 3, '<rect x="4.5" y="3" width="15" height="18" rx="2"/><path d="M10 17V7h3a3 3 0 0 1 0 6h-3"/>', ['parking', 'parkings', 'stationnement'], [['amenity', 'parking']]),
  banque: C('Banque', 'argent', 2, '<path d="M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18"/>', ['banque', 'banques', 'bank'], [['amenity', 'bank']]),
  dab: C('Distributeur (DAB)', 'argent', 3, '<rect x="4" y="4" width="16" height="10" rx="1.5"/><path d="M8 18h8M7 9h10"/>', ['dab', 'gab', 'distributeur', 'distributeur de billets', 'retrait', 'atm'], [['amenity', 'atm']]),
  transfert: C('Transfert d\'argent, Mobile Money', 'argent', 3, '<path d="M17 7H6l3-3M7 17h11l-3 3"/>', ['transfert', 'transfert d argent', 'orange money', 'momo', 'mobile money', 'western union', 'moneygram', 'ria', 'wari', 'bureau de change', 'change'], [['amenity', 'money_transfer'], ['amenity', 'bureau_de_change'], ['shop', 'money_lender']]),
  administration: C('Administration, mairie, ministère', 'institutions', 2, '<path d="M4 21h16M6 21V10h12v11M12 10V3l5 2-5 2M9 14h.01M15 14h.01M9 17.5h.01M15 17.5h.01"/>', ['mairie', 'mairies', 'ministere', 'ministeres', 'administration', 'prefecture', 'commune', 'gouvernorat', 'tribunal', 'impots', 'douane', 'douanes', 'etat civil', 'passeport'], [['amenity', 'townhall'], ['amenity', 'courthouse'], ['office', 'government'], ['government', '*']]),
  securite: C('Police, gendarmerie, pompiers', 'institutions', 2, '<path d="M12 3 4 6v5c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6z"/><path d="M9 12l2 2 4-4"/>', ['police', 'commissariat', 'gendarmerie', 'pompiers', 'protection civile', 'securite'], [['amenity', 'police'], ['amenity', 'fire_station']]),
  poste: C('Poste', 'institutions', 3, '<rect x="3" y="6" width="18" height="12" rx="1.5"/><path d="M3.5 7l8.5 6 8.5-6"/>', ['poste', 'la poste', 'courrier', 'colis'], [['amenity', 'post_office']]),
  ambassade: C('Ambassade, organisation internationale', 'institutions', 2, '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>', ['ambassade', 'ambassades', 'consulat', 'onu', 'unicef', 'pnud', 'organisation internationale'], [['office', 'diplomatic'], ['amenity', 'embassy'], ['diplomatic', '*'], ['office', 'international_organization']]),
  mosquee: C('Mosquée', 'culte', 2, '<path d="M4 21v-8a4 4 0 0 1 8 0v8M8 5.5v2.5M3 21h18M16 21V10l2-3 2 3v11"/>', ['mosquee', 'mosquees', 'masjid', 'priere'], [['amenity', 'place_of_worship', 'muslim']]),
  eglise: C('Église', 'culte', 2, '<path d="M12 2v6M9.5 4h5M6 21v-9l6-4 6 4v9M3 21h18M10 21v-4h4v4"/>', ['eglise', 'eglises', 'cathedrale', 'paroisse', 'temple', 'chapelle'], [['amenity', 'place_of_worship', 'christian']]),
  hotel: C('Hôtel, hébergement', 'sortir', 2, '<path d="M3 18V7M3 14h18v4M21 18v-5a3 3 0 0 0-3-3h-7v4"/><circle cx="7" cy="11" r="1.5"/>', ['hotel', 'hotels', 'auberge', 'residence', 'hebergement', 'chambre', 'motel'], [['tourism', 'hotel'], ['tourism', 'guest_house'], ['tourism', 'hostel'], ['tourism', 'motel'], ['tourism', 'apartment']]),
  loisirs: C('Loisirs, sport, salle des fêtes', 'sortir', 3, '<circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18M5.6 5.6c3.4 3.4 3.4 9.4 0 12.8M18.4 5.6c-3.4 3.4-3.4 9.4 0 12.8"/>', ['stade', 'sport', 'terrain', 'salle de sport', 'salle des fetes', 'cinema', 'theatre', 'plage', 'loisirs', 'piscine', 'club'], [['leisure', 'stadium'], ['leisure', 'sports_centre'], ['leisure', 'fitness_centre'], ['leisure', 'swimming_pool'], ['amenity', 'cinema'], ['amenity', 'theatre'], ['amenity', 'events_venue'], ['amenity', 'community_centre'], ['amenity', 'nightclub']]),
  entreprise: C('Entreprise, bureau', 'services', 3, '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5h6v2M3 13h18"/>', ['entreprise', 'entreprises', 'societe', 'bureau', 'bureaux', 'siege', 'agence', 'cabinet'], [['office', '*']]),
  ong: C('ONG, association', 'services', 3, '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>', ['ong', 'association', 'associations', 'fondation', 'cooperative'], [['office', 'ngo'], ['office', 'association'], ['office', 'charity']]),
  beaute: C('Coiffure, beauté', 'services', 3, '<circle cx="6.5" cy="6.5" r="2.5"/><circle cx="6.5" cy="17.5" r="2.5"/><path d="M8.6 8.1 20 19M8.6 15.9 20 5"/>', ['coiffure', 'coiffeur', 'coiffeuse', 'salon', 'salon de coiffure', 'beaute', 'esthetique', 'tresses', 'barbier'], [['shop', 'hairdresser'], ['shop', 'beauty'], ['shop', 'cosmetics']]),
  couture: C('Couture, mode', 'services', 3, '<path d="M18 3 6.5 14.5M14.5 3H18v3.5M6.5 14.5 3 21l6.5-3.5"/>', ['couture', 'couturier', 'couturiere', 'tailleur', 'mode', 'pagne', 'pagnes', 'tissu', 'tissus', 'vetements'], [['shop', 'tailor'], ['shop', 'fabric'], ['shop', 'clothes'], ['craft', 'tailor'], ['shop', 'shoes']]),
  autre: C('Autre', 'services', 3, '<path d="M12 21s7-6.6 7-12a7 7 0 0 0-14 0c0 5.4 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>', [], [])
};
const couleur = cat => { const k = CATEGORIES[cat] || CATEGORIES.autre; return GROUPES[k.groupe].c; };

/* ---------- textes ---------- */
const normaliser = t => String(t == null ? '' : t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/['’`]/g, ' ').replace(/[^a-z0-9+]+/g, ' ').trim();
const nettoyer = (t, max) => String(t == null ? '' : t).replace(/[<>]/g, '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const ID_ADRESSE = /^GN-\d{5}-[A-Z0-9]{1,40}-\d{1,5}$/;
const HEURE = /^([01]\d|2[0-3]):[0-5]\d$|^24:00$/;
/* Guinée : +224 et 9 chiffres (6… pour les mobiles) ; numéros de la diaspora au format international */
function telephone(t) {
  if (t == null || t === '') return '';
  let s = String(t).replace(/[\s.\-()/]/g, '');
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (/^[2-7]\d{8}$/.test(s)) s = '+224' + s;
  else if (/^224\d{9}$/.test(s)) s = '+' + s;
  return /^\+\d{8,15}$/.test(s) ? s : null;
}
const telTexte = s => { const m = /^\+224(\d{3})(\d{2})(\d{2})(\d{2})$/.exec(s || ''); return m ? '+224 ' + m.slice(1).join(' ') : s || ''; };
function siteWeb(t) {
  if (t == null || t === '') return '';
  let s = String(t).trim(); if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  if (s.length > 200 || /\s/.test(s)) return null;
  try { const u = new URL(s); return /^https?:$/.test(u.protocol) && /\./.test(u.hostname) && !u.username && !u.password ? u.href : null; } catch (e) { return null; }
}
/* Guinée entière (et un peu autour) : une fiche hors du pays est refusée */
const GUINEE = { s: 7.1, n: 12.8, o: -15.2, e: -7.5 };

/* ---------- vérification d'une fiche (la même sur la carte, la page de gestion et le serveur) ---------- */
function valider(f, opts) {
  opts = opts || {};
  const erreurs = [], err = (champ, message) => erreurs.push({ champ, message });
  if (!f || typeof f !== 'object' || Array.isArray(f)) return { ok: false, erreurs: [{ champ: '', message: 'Fiche absente.' }] };
  const l = {};
  const nom = nettoyer(f.nom, 81);
  if (nom.length < 2) err('nom', 'Le nom doit faire au moins 2 caractères.'); else if (nom.length > 80) err('nom', 'Le nom fait plus de 80 caractères.'); else l.nom = nom;
  if (!Object.prototype.hasOwnProperty.call(CATEGORIES, f.cat)) err('cat', 'Choisissez une catégorie.'); else l.cat = f.cat;
  const lat = Number(f.lat), lng = Number(f.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < GUINEE.s || lat > GUINEE.n || lng < GUINEE.o || lng > GUINEE.e) err('position', 'L\'emplacement doit être en Guinée, sur la carte.');
  else { l.lat = Math.round(lat * 1e6) / 1e6; l.lng = Math.round(lng * 1e6) / 1e6; }
  if (f.ville != null && f.ville !== '') { if (/^[a-z]{2,20}$/.test(f.ville)) l.ville = f.ville; else err('ville', 'Ville inconnue.'); }
  if (f.adr != null && f.adr !== '') { const a = String(f.adr).toUpperCase(); if (ID_ADRESSE.test(a)) l.adr = a; else err('adr', 'Identifiant d\'adresse invalide.'); }
  for (const k of ['tel', 'wa']) { const t = telephone(f[k]); if (t === null) err(k, 'Numéro de téléphone invalide (par exemple 622 12 34 56 ou +33 6 12 34 56 78).'); else if (t) l[k] = t; }
  const w = siteWeb(f.web); if (w === null) err('web', 'Adresse de site invalide.'); else if (w) l.web = w;
  if (f.h24 === true) l.h24 = true;
  else if (f.horaires != null) {
    const h = Array.isArray(f.horaires) ? f.horaires : null, bons = [];
    if (!h || h.length > 14) err('horaires', 'Horaires invalides.');
    else for (const x of h) {
      const j = x && Array.isArray(x.j) ? [...new Set(x.j.map(Number))].filter(n => Number.isInteger(n) && n >= 0 && n <= 6).sort() : [];
      if (!x || !j.length || !HEURE.test(x.o) || !HEURE.test(x.f) || x.o === x.f || x.o === '24:00') { err('horaires', 'Horaires invalides : choisissez les jours, l\'ouverture et la fermeture.'); break; }
      bons.push({ j, o: x.o, f: x.f });
    }
    if (bons.length && !erreurs.some(e => e.champ === 'horaires')) l.horaires = bons;
  }
  const d = nettoyer(f.desc, 301); if (d.length > 300) err('desc', 'La description fait plus de 300 caractères.'); else if (d) l.desc = d;
  if (opts.prive) { const c = nettoyer(f.contact, 121); if (c.length > 120) err('contact', 'Contact trop long.'); else if (c) l.contact = c; }
  if (f.verifie === true && opts.equipe) l.verifie = true;
  if (opts.equipe && Array.isArray(f.photos)) { const p = photos(f); if (p.length) l.photos = p; }
  if (typeof f.id === 'string' && /^[A-Za-z0-9_-]{3,40}$/.test(f.id)) l.id = f.id;
  if (typeof f.src === 'string' && /^(itina|osm)$/.test(f.src)) l.src = f.src;
  return erreurs.length ? { ok: false, erreurs } : { ok: true, lieu: l };
}

/* ---------- photos : [{ id, l, h }] (largeur, hauteur) ; fichiers <base>/<id du lieu>/<id>.jpg et <id>-m.jpg (miniature) ---------- */
const PHOTO = /^p-[a-z2-9]{10}$/, PHOTOS_MAX = 8;
const BASE_PHOTOS = /^https:\/\/[a-z0-9-]{3,40}\.supabase\.co\/storage\/v1\/object\/public\/lieux-photos$/;
function photos(l) {
  return (l && Array.isArray(l.photos) ? l.photos : []).filter(p => p && PHOTO.test(p.id) && p.l > 0 && p.h > 0 && p.l <= 4096 && p.h <= 4096)
    .slice(0, PHOTOS_MAX).map(p => ({ id: p.id, l: Math.round(p.l), h: Math.round(p.h) }));
}
const basePhotos = b => typeof b === 'string' && BASE_PHOTOS.test(b) ? b : null;
const urlPhoto = (base, lieu, p, mini) => basePhotos(base) && /^[A-Za-z0-9_-]{3,40}$/.test(lieu) && p && PHOTO.test(p.id) ? base + '/' + lieu + '/' + p.id + (mini ? '-m' : '') + '.jpg' : null;

/* ---------- horaires, à l'heure de Conakry (UTC toute l'année) ---------- */
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const minutes = h => +h.slice(0, 2) * 60 + +h.slice(3);
function plages(l, jour) {             /* plages du jour (minutes), y compris la fin d'une plage commencée la veille */
  const out = [];
  for (const x of l.horaires || []) {
    const o = minutes(x.o), f = minutes(x.f), nuit = f <= o;
    if (x.j.includes(jour)) out.push([o, nuit ? 1440 : f]);
    if (nuit && x.j.includes((jour + 6) % 7) && f > 0) out.push([0, f]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}
const hhmm = m => String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
function ouvert(l, date) {
  if (!l) return { etat: 'inconnu', texte: '' };
  if (l.h24) return { etat: 'ouvert', texte: 'Ouvert 24 h/24' };
  if (!l.horaires || !l.horaires.length) return { etat: 'inconnu', texte: '' };
  const d = date || new Date(), jour = d.getUTCDay(), m = d.getUTCHours() * 60 + d.getUTCMinutes();
  const now = plages(l, jour).find(([o, f]) => m >= o && m < f);
  if (now) {
    let fin = now[1];
    if (fin === 1440) { const s = plages(l, (jour + 1) % 7).find(([o]) => o === 0); if (s) fin = 1440 + s[1]; }
    if (fin >= 2880) return { etat: 'ouvert', texte: 'Ouvert 24 h/24' };
    return { etat: 'ouvert', texte: (fin - m <= 60 ? 'Ferme bientôt · ' : 'Ouvert · ferme à ') + hhmm(fin) };
  }
  for (let k = 0; k < 8; k++) {
    const j = (jour + k) % 7, p = plages(l, j).find(([o]) => k > 0 || o > m);
    if (p) return { etat: 'ferme', texte: 'Fermé · ouvre ' + (k === 0 ? 'à ' : k === 1 ? 'demain à ' : JOURS[j] + ' à ') + hhmm(p[0]) };
  }
  return { etat: 'ferme', texte: 'Fermé' };
}
/* horaires de la semaine, du lundi au dimanche */
function horairesTexte(l) {
  if (!l) return [];
  if (l.h24) return [{ jour: 'Tous les jours', texte: '24 h/24' }];
  if (!l.horaires || !l.horaires.length) return [];
  return [1, 2, 3, 4, 5, 6, 0].map(j => {
    const p = (l.horaires || []).filter(x => x.j.includes(j)).map(x => x.o === '00:00' && x.f === '24:00' ? '24 h/24' : x.o + ' – ' + x.f);
    return { jour: JOURS[j][0].toUpperCase() + JOURS[j].slice(1), texte: p.length ? p.join(', ') : 'Fermé' };
  });
}
/* choix rapides du formulaire : jours ouvrés */
const SEMAINES = { tous: [0, 1, 2, 3, 4, 5, 6], lunsam: [1, 2, 3, 4, 5, 6], lunven: [1, 2, 3, 4, 5] };

/* ---------- recherche ---------- */
const distM = (a, b) => Math.hypot((a.lat - b.lat) * 110574, (a.lng - b.lng) * 111320 * Math.cos(a.lat * Math.PI / 180));
const MOTS = (() => { const m = []; for (const [k, c] of Object.entries(CATEGORIES)) for (const w of c.mots) m.push([w, k]); return m.sort((a, b) => b[0].length - a[0].length); })();
/* « pharmacie », « pharmacies près de moi », « station essence » → la catégorie */
function categorieDe(texte) {
  const t = ' ' + normaliser(texte) + ' ';
  if (t.trim().length < 3) return null;
  for (const [w, k] of MOTS) if (t.startsWith(' ' + w + ' ')) return k;
  return null;
}
function chercher(lieux, texte, opts) {
  opts = opts || {};
  const q = normaliser(texte), mots = q.split(' ').filter(w => w.length > 1 || /\d/.test(w));
  if (!q || !mots.length) return [];
  const cat = categorieDe(texte), pres = opts.pres && Number.isFinite(opts.pres.lat) ? opts.pres : null, out = [];
  for (const l of lieux || []) {
    if (!l || !l.nom) continue;
    const n = normaliser(l.nom), nm = n.split(' ');
    let s = 0;
    if (n === q) s = 1;
    else if (n.startsWith(q)) s = 0.95;
    else {
      const ok = mots.filter(w => nm.some(x => x.startsWith(w))).length;
      if (ok === mots.length) s = 0.85; else if (ok) s = 0.4 * ok / mots.length;
    }
    if (cat && l.cat === cat) s = Math.max(s, 0.7);
    if (s <= 0.15) continue;
    out.push({ lieu: l, score: s, d: pres ? distM(pres, l) : null });
  }
  out.sort((a, b) => b.score - a.score || (a.d != null && b.d != null ? a.d - b.d : 0) || a.lieu.nom.localeCompare(b.lieu.nom, 'fr'));
  return out.slice(0, opts.max || 20);
}

/* ---------- OpenStreetMap ---------- */
function categorieOSM(t) {
  for (const [k, c] of Object.entries(CATEGORIES)) for (const r of c.osm) {
    if (r[1] !== '*' && t[r[0]] === r[1] && (!r[2] || t.religion === r[2])) return k;
  }
  for (const [k, c] of Object.entries(CATEGORIES)) for (const r of c.osm) if (r[1] === '*' && t[r[0]] && t[r[0]] !== 'no' && t[r[0]] !== 'vacant') return k;
  return null;
}
/* « 24/7 », « Mo-Sa 08:00-20:00; Su 09:00-13:00 » : les formes simples ; le reste n'est pas repris */
const JOSM = { Su: 0, Mo: 1, Tu: 2, We: 3, Th: 4, Fr: 5, Sa: 6 };
function horairesOSM(oh) {
  if (!oh || typeof oh !== 'string') return null;
  const s = oh.trim();
  if (s === '24/7') return { h24: true };
  const out = [];
  for (const part of s.split(';').map(x => x.trim()).filter(Boolean)) {
    const m = /^((?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?(?:,(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?)*)\s+((?:\d\d:\d\d-\d\d:\d\d)(?:,\d\d:\d\d-\d\d:\d\d)*)$/.exec(part);
    if (!m) return null;
    const j = [];
    for (const g of m[1].split(',')) { const [a, b] = g.split('-'); let x = JOSM[a]; const y = JOSM[b == null ? a : b]; for (let n = 0; n < 7; n++) { j.push(x); if (x === y) break; x = (x + 1) % 7; } }
    for (const p of m[2].split(',')) { const [o, f] = p.split('-'); out.push({ j: [...new Set(j)].sort(), o, f }); }
  }
  return out.length ? { horaires: out } : null;
}
function depuisOSM(e) {
  if (!e || !e.tags) return null;
  const t = e.tags, nom = t['name:fr'] || t.name, cat = categorieOSM(t);
  const lat = e.lat != null ? e.lat : e.center && e.center.lat, lng = e.lon != null ? e.lon : e.center && e.center.lon;
  if (!nom || !cat) return null;
  const f = { id: 'osm-' + String(e.type || 'n')[0] + e.id, src: 'osm', nom, cat, lat, lng };
  const tel = telephone(t.phone || t['contact:phone']); if (tel) f.tel = tel;
  const wa = telephone(t['contact:whatsapp']); if (wa) f.wa = wa;
  const web = siteWeb(t.website || t['contact:website']); if (web) f.web = web;
  const h = horairesOSM(t.opening_hours); if (h) Object.assign(f, h);
  const v = valider(f);
  if (v.ok) return v.lieu;
  const g = valider({ id: f.id, src: 'osm', nom, cat, lat, lng });     /* un champ abîmé n'empêche pas de garder le lieu */
  return g.ok ? g.lieu : null;
}

/* ---------- sources réunies : fichier publié sur le site, service (publiés, retirés), fiches envoyées depuis ce téléphone ---------- */
function fusionner(fichier, service, miens) {
  const m = new Map();
  for (const l of fichier || []) if (l && l.id) m.set(l.id, l);
  for (const l of service || []) { if (!l || !l.id) continue; if (l.statut === 'retire' || l.statut === 'refuse') m.delete(l.id); else m.set(l.id, l); }
  for (const l of miens || []) if (l && l.id && !m.has(l.id)) m.set(l.id, Object.assign({}, l, { enAttente: true }));
  return [...m.values()];
}

return { VERSION, GROUPES, CATEGORIES, couleur, normaliser, telephone, telTexte, siteWeb, valider, ouvert, horairesTexte, JOURS, SEMAINES,
  chercher, categorieDe, distM, depuisOSM, horairesOSM, fusionner, ID_ADRESSE, photos, basePhotos, urlPhoto, PHOTOS_MAX };
}));
