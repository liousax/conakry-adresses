/* Itina Geo · Studio
   Carte, adresses, guidage, noms des rues, limites des communes et génération du référentiel, sur un seul écran.
   Marche sans internet une fois ouvert : sw.js garde l'appli et les villes publiées ; les rues d'OpenStreetMap déjà
   téléchargées et les décisions restent dans la mémoire de l'appareil (la même que celle de l'atelier). */
(()=>{
'use strict';
const $=id=>document.getElementById(id),CA=window.ConakryAdresses,A=window.AtelierConakry,NM=window.NomsConakry;
if(!window.maplibregl||!CA||!A||!NM){$('status').innerHTML='<div><h3>Le studio ne peut pas démarrer</h3><p class="hint">Un fichier du studio manque. Rechargez la page une fois connecté.</p></div>';return}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const css=v=>getComputedStyle(document.documentElement).getPropertyValue(v).trim();
let toastT;const toast=m=>{const t=$('toast');t.textContent=m;t.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>{t.hidden=true},3600)};
const nf=n=>Number(n||0).toLocaleString('fr-FR');
const pl=(n,m,p)=>nf(n)+' '+(n>1?(p||m+'s'):m);
const fmtD=m=>m<1000?Math.round(m/10)*10+' m':(m/1000).toFixed(1).replace('.',',')+' km';
const fmtT=s=>s<60?'moins d\'1 min':s<3600?Math.round(s/60)+' min':Math.floor(s/3600)+' h '+String(Math.round(s%3600/60)).padStart(2,'0');
const dateFr=t=>{try{return new Date(t).toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'})}catch(e){return''}};
/* les noms passent par les polices de la carte : caractères hors des plages fournies remplacés par leur lettre de base */
const glyphOk=c=>{const n=c.codePointAt(0);return n<1024||(n>=7680&&n<7936)||(n>=8192&&n<8448)};
const safe=t=>[...String(t||'')].map(c=>glyphOk(c)?c:[...c.normalize('NFD')].filter(glyphOk).join('')).join('');
const FC=f=>({type:'FeatureCollection',features:f||[]});
const tel=()=>matchMedia('(max-width:820px)').matches;
const norm=s=>CA._interne.norm(String(s||''));
const D=CA._interne.decodeLine;
function telecharger(blob,nom){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=nom;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),3000)}
const enLigne=()=>navigator.onLine!==false;

/* ---------- villes ---------- */
const ORDRE=['conakry','boke','faranah','kankan','kindia','labe','mamou','nzerekore','siguiri'].filter(k=>A.VILLES[k]);
const VI=k=>A.VILLES[k];
const sous=k=>k==='conakry'?'':k+'/';
const dossier=k=>'data/'+sous(k);
const aVille=k=>typeof k==='string'&&Object.prototype.hasOwnProperty.call(A.VILLES,k);
const CMD=k=>Object.fromEntries(VI(k).communes.map(c=>[c.code,c]));

/* ---------- état ---------- */
const S={ville:null,pub:null,sources:null,ref:null,vueRef:null,dec:{},publiees:[],apercu:null,onglet:'carte',trace:null,charge:0};
const refVue=()=>S.vueRef||S.ref;

/* ---------- mémoire de l'appareil : la même base que l'atelier (rues d'OpenStreetMap, limites tracées, décisions) ---------- */
const DB=new Promise((res,rej)=>{let r;try{r=indexedDB.open('conakry-atelier',1)}catch(e){rej(e);return}r.onupgradeneeded=()=>r.result.createObjectStore('osm');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
DB.catch(()=>{});
const idb=(mode,f)=>DB.then(db=>new Promise((res,rej)=>{const t=db.transaction('osm',mode),s=t.objectStore('osm'),q=f(s);t.oncomplete=()=>res(q&&q.result);t.onerror=()=>rej(t.error)}));
const cget=k=>idb('readonly',s=>s.get(k)).catch(()=>undefined),cput=(k,v)=>idb('readwrite',s=>s.put(v,k)),cdel=k=>idb('readwrite',s=>s.delete(k)),ckeys=()=>idb('readonly',s=>s.getAllKeys()).catch(()=>[]);

/* décisions de la ville : { code de voie: { act, n, p?, b?, t, avant: { n, st, p, b } } } */
async function lireDecisions(v){
  const d=await cget('dec:'+v),out={};if(!d||typeof d!=='object')return out;
  const ok=A.decisionsValides(d);for(const c of Object.keys(ok)){out[c]=Object.assign({},ok[c]);const av=d[c]&&d[c].avant;if(av&&typeof av==='object')out[c].avant={n:String(av.n||'').slice(0,120),st:String(av.st||'').slice(0,12)}}
  return out;
}
async function ecrireDecisions(){try{await cput('dec:'+S.ville,S.dec);return true}catch(e){toast('Impossible d\'enregistrer sur cet appareil : la mémoire du navigateur est bloquée (navigation privée ?).');return false}}
/* une décision appliquée à une voie publiée */
function voieDecidee(v,d){
  if(!d||v.k==='KAL'||v.x)return v;
  const w=Object.assign({},v);
  if(d.act==='valider'){w.st='officiel';if(d.n)w.n=d.n}
  else if(d.act==='renommer'){if(!w.a&&v.st==='propose'&&norm(v.n)!==norm(d.n))w.a=v.n;w.n=d.n;w.st='officiel';if(d.p){w.p=d.p;w.b=d.b}else{delete w.p;delete w.b}}
  else if(d.act==='refuser')w.st='a_nommer';
  return w;
}
const voiesDecidees=(vj,dec)=>({v:1,voies:vj.voies.map(v=>voieDecidee(v,dec[v.c]))});
/* une décision déjà publiée n'a plus à rester sur l'appareil : nom officiel en ligne, ou nom refusé remplacé */
function nettoyer(){
  if(!S.pub)return false;let n=0;const P=pubParCode();
  for(const [c,d] of Object.entries(S.dec)){const v=P[c];
    if(!v||v.k==='KAL'||v.x){delete S.dec[c];n++;continue}
    if((d.act==='valider'||d.act==='renommer')&&v.st==='officiel'&&norm(v.n)===norm(d.n)){delete S.dec[c];n++}
    else if(d.act==='refuser'&&norm(v.n)!==norm(d.n)){delete S.dec[c];n++}}
  return n>0;
}
let PPC=null;const pubParCode=()=>PPC||(PPC=S.pub?Object.fromEntries(S.pub.voies.voies.map(v=>[v.c,v])):{});

/* ---------- carte ---------- */
const ESRI='https://server.arcgisonline.com/ArcGIS/rest/services/';
const sombre=()=>matchMedia('(prefers-color-scheme: dark)').matches&&document.documentElement.dataset.theme!=='light';
const map=new maplibregl.Map({container:'map',attributionControl:false,maxPitch:60,doubleClickZoom:true,
  style:{version:8,glyphs:new URL('glyphs/{fontstack}/{range}.pbf',location.href).href.replace('%7Bfontstack%7D','{fontstack}').replace('%7Brange%7D','{range}'),
    sources:{plan:{type:'raster',tiles:[ESRI+'Canvas/'+(sombre()?'World_Dark_Gray_Base':'World_Light_Gray_Base')+'/MapServer/tile/{z}/{y}/{x}'],tileSize:256,maxzoom:16,attribution:'Fond © Esri'},
      sat:{type:'raster',tiles:[ESRI+'World_Imagery/MapServer/tile/{z}/{y}/{x}'],tileSize:256,maxzoom:18,attribution:'Images © Esri, Maxar'}},
    layers:[{id:'bg',type:'background',paint:{'background-color':css('--paper')}},{id:'plan',type:'raster',source:'plan',paint:{'raster-opacity':.5},layout:{visibility:enLigne()?'visible':'none'}},{id:'sat',type:'raster',source:'sat',layout:{visibility:'none'}}]},
  center:[-13.62,9.60],zoom:11,
  locale:{'NavigationControl.ZoomIn':'Zoomer','NavigationControl.ZoomOut':'Dézoomer','NavigationControl.ResetBearing':'Remettre le nord en haut','AttributionControl.ToggleAttribution':'Sources','Popup.Close':'Fermer'}});
map.addControl(new maplibregl.AttributionControl({compact:true,customAttribution:'Rues © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> · plan provisoire'}),'bottom-right');
map.addControl(new maplibregl.NavigationControl({visualizePitch:true}),'bottom-right');
map.addControl(new maplibregl.ScaleControl({unit:'metric',maxWidth:90}),'bottom-left');
window.__studioCarte=map;
const pret=()=>new Promise(r=>{const t=()=>{if(map.isStyleLoaded())r();else setTimeout(t,60)};t()});
let saveT;map.on('moveend',()=>{clearTimeout(saveT);saveT=setTimeout(()=>{if(!S.ville)return;const c=map.getCenter();try{localStorage.setItem('itina-geo-vue-'+S.ville,JSON.stringify({lat:+c.lat.toFixed(5),lng:+c.lng.toFixed(5),z:+map.getZoom().toFixed(2)}))}catch(e){}},400)});
const lireVue=k=>{try{const v=JSON.parse(localStorage.getItem('itina-geo-vue-'+k)||'null'),n=x=>typeof x==='number'&&isFinite(x);return v&&n(v.lat)&&n(v.lng)&&n(v.z)&&Math.abs(v.lat)<85&&Math.abs(v.lng)<=180&&v.z>=0&&v.z<=22?v:null}catch(e){return null}};
$('fabSat').onclick=()=>{
  const on=$('fabSat').getAttribute('aria-pressed')!=='true';
  if(on&&!enLigne()){toast('La vue satellite demande internet : hors ligne, le plan garde ses rues.');return}
  $('fabSat').setAttribute('aria-pressed',on?'true':'false');map.setLayoutProperty('sat','visibility',on?'visible':'none');
  map.setLayoutProperty('plan','visibility',!on&&enLigne()?'visible':'none');map.setPaintProperty('bg','background-color',on?'#20251f':css('--paper'))};
/* couches du plan : retirées puis reposées à chaque ville ou aperçu */
const COUCHES=['zones','man-f','man-l','casing','voies','sel-c','sel','route-c','route','moi-f','moi-l','nums','noms-p','noms','noms-m','quartiers','communes','tr-f','tr-l','tr-p'];
const SOURCES=['zones','man','voies','sel','route','moi','nums','quartiers','communes','tr'];
const RENDU={suivi:false,lim:true};
try{const r=JSON.parse(localStorage.getItem('itina-geo-rendu')||'{}')||{};for(const k of['suivi','lim'])if(typeof r[k]==='boolean')RENDU[k]=r[k]}catch(e){}
function voiesFC(ref){const P=S.ref===ref?S.dec:{};return FC(ref.voies.map(v=>({type:'Feature',id:v.k,properties:{c:v.code,n:safe(v.nom),m:CA._interne.MAJEUR[v.highway]?1:0,p:v.statut==='a_nommer'||v.statut==='provisoire'||v.lien?1:0,t:v.highway==='track'?1:0,
  s:P[v.code]?3:v.statut==='propose'?1:v.statut==='a_nommer'||v.statut==='provisoire'?2:0},geometry:{type:'MultiLineString',coordinates:v.segs.map(g=>g.map(p=>[p.lon,p.lat]))}})))}
const zonesFC=ref=>FC(ref.zones.flatMap(z=>z.rings.map(r=>({type:'Feature',properties:{n:z.nom},geometry:{type:'LineString',coordinates:r.concat([r[0]])}}))));
const quartiersFC=ref=>FC(ref.quartiers.map(q=>({type:'Feature',properties:{n:safe(q.nom)+'\n'+q.cp},geometry:{type:'Point',coordinates:[q.lng,q.lat]}})));
const communesFC=ref=>FC(ref.communes.map(c=>{const qs=ref.quartiers.filter(q=>q.commune===c.code);if(!qs.length)return null;return{type:'Feature',properties:{n:safe(c.nom)},geometry:{type:'Point',coordinates:[qs.reduce((a,q)=>a+q.lng,0)/qs.length,qs.reduce((a,q)=>a+q.lat,0)/qs.length]}}}).filter(Boolean));
function poserCouches(ref){
  for(const id of COUCHES)if(map.getLayer(id))map.removeLayer(id);
  for(const id of SOURCES)if(map.getSource(id))map.removeSource(id);
  const z=['interpolate',['exponential',1.6],['zoom']];
  const W=[[10,.8,.2],[11,1.2,.4],[12,2,.7],[13,2.8,1.2],[14,4,2],[15,6,3.2],[16,9,6],[17,14,10],[18,22,16]];
  const width=add=>[...z,...W.flatMap(([zz,M,m])=>[zz,['case',['==',['get','m'],1],M+add,m+add]])];
  const off=ref&&ref.zones.some(x=>x.source==='officiel');
  map.addSource('zones',Object.assign({type:'geojson',data:ref?zonesFC(ref):FC()},off?{attribution:'Limites des communes © <a href="https://www.geoboundaries.org" target="_blank" rel="noopener noreferrer">geoBoundaries</a> (PAM, OCHA, CC BY 3.0 IGO)'}:{}));
  map.addSource('man',{type:'geojson',data:FC()});map.addSource('tr',{type:'geojson',data:FC()});
  map.addSource('voies',{type:'geojson',data:ref?voiesFC(ref):FC(),tolerance:.25,buffer:64});
  map.addSource('sel',{type:'geojson',data:FC()});map.addSource('route',{type:'geojson',data:FC()});map.addSource('moi',{type:'geojson',data:FC()});map.addSource('nums',{type:'geojson',data:FC()});
  map.addSource('quartiers',{type:'geojson',data:ref?quartiersFC(ref):FC()});map.addSource('communes',{type:'geojson',data:ref?communesFC(ref):FC()});
  map.addLayer({id:'zones',type:'line',source:'zones',paint:{'line-color':css('--quartier'),'line-width':[...z,10,1,15,2.4],'line-dasharray':[4,2,1,2],'line-opacity':.75}});
  map.addLayer({id:'man-f',type:'fill',source:'man',paint:{'fill-color':'#d9650b','fill-opacity':.1}});
  map.addLayer({id:'man-l',type:'line',source:'man',paint:{'line-color':'#d9650b','line-width':2.5,'line-dasharray':[2,1.5]}});
  map.addLayer({id:'casing',type:'line',source:'voies',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':['case',['==',['get','m'],1],css('--major-casing'),css('--casing')],'line-width':width(2.2),'line-opacity':['interpolate',['linear'],['zoom'],11,0,12.5,1]}});
  map.addLayer({id:'voies',type:'line',source:'voies',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':couleurVoies(),'line-width':width(0)}});
  map.addLayer({id:'sel-c',type:'line',source:'sel',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#ffffff','line-width':[...z,11,7,16,16,18,26]}});
  map.addLayer({id:'sel',type:'line',source:'sel',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#e8b100','line-width':[...z,11,4,16,10,18,18]}});
  map.addLayer({id:'route-c',type:'line',source:'route',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#ffffff','line-width':[...z,11,5,16,12,18,20]}});
  map.addLayer({id:'route',type:'line',source:'route',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':css('--blue'),'line-width':[...z,11,3,16,7,18,13]}});
  map.addLayer({id:'moi-f',type:'fill',source:'moi',paint:{'fill-color':'#2a7de1','fill-opacity':.12}});
  map.addLayer({id:'moi-l',type:'line',source:'moi',paint:{'line-color':'#2a7de1','line-opacity':.5,'line-width':1.2}});
  map.addLayer({id:'nums',type:'symbol',source:'nums',minzoom:17.3,layout:{'text-field':['get','t'],'text-font':['NotoSansMedium'],'text-size':10.5,'text-padding':1},paint:{'text-color':['case',['==',['get','i'],1],css('--quartier'),css('--text')],'text-halo-color':css('--halo'),'text-halo-width':1.4}});
  const lab=(id,filter,minz,size,color,ls)=>map.addLayer({id,type:'symbol',source:'voies',minzoom:minz,filter,layout:{'text-field':['get','n'],'text-font':['NotoSansMedium'],'text-size':size,'symbol-placement':'line','text-max-angle':38,'symbol-spacing':280,'text-padding':2,'text-rotation-alignment':'map','text-pitch-alignment':'viewport','text-letter-spacing':ls||0},paint:{'text-color':color,'text-halo-color':css('--halo'),'text-halo-width':1.6}});
  lab('noms-p',['==',['get','p'],1],16.3,['interpolate',['linear'],['zoom'],16,9.5,18,12],css('--provisoire'));
  lab('noms',['all',['==',['get','p'],0],['==',['get','m'],0]],14.8,['interpolate',['linear'],['zoom'],15,9.5,17,12,19,14],css('--text'));
  lab('noms-m',['all',['==',['get','p'],0],['==',['get','m'],1]],12.5,['interpolate',['linear'],['zoom'],12.5,10,15,12,18,15],css('--text'),.05);
  map.addLayer({id:'quartiers',type:'symbol',source:'quartiers',minzoom:13,maxzoom:17.5,layout:{'text-field':['get','n'],'text-font':['NotoSansMedium'],'text-size':['interpolate',['linear'],['zoom'],13,10.5,16,13],'text-transform':'uppercase','text-letter-spacing':.18,'text-max-width':9,'text-padding':6},paint:{'text-color':css('--quartier'),'text-halo-color':css('--halo'),'text-halo-width':1.8,'text-opacity':.9}});
  map.addLayer({id:'communes',type:'symbol',source:'communes',maxzoom:13.2,layout:{'text-field':['get','n'],'text-font':['NotoSansMedium'],'text-size':['interpolate',['linear'],['zoom'],9,11,12,15],'text-transform':'uppercase','text-letter-spacing':.22},paint:{'text-color':css('--fg'),'text-halo-color':css('--halo'),'text-halo-width':2}});
  map.addLayer({id:'tr-f',type:'fill',source:'tr',filter:['==',['geometry-type'],'Polygon'],paint:{'fill-color':'#d9650b','fill-opacity':.15}});
  map.addLayer({id:'tr-l',type:'line',source:'tr',filter:['!=',['geometry-type'],'Point'],paint:{'line-color':'#d9650b','line-width':2.5}});
  map.addLayer({id:'tr-p',type:'circle',source:'tr',filter:['==',['geometry-type'],'Point'],paint:{'circle-radius':6,'circle-color':'#fff','circle-stroke-color':'#d9650b','circle-stroke-width':2.5}});
  appliquerRendu();
}
/* couleur des rues : plan de ville, ou suivi des noms (onglet Rues) : proposé, gardé, à nommer, décidé sur l'appareil */
const suiviActif=()=>RENDU.suivi||S.onglet==='rues';
const couleurVoies=()=>suiviActif()?['match',['get','s'],0,css('--street-keep'),1,css('--street-prop'),2,css('--street-todo'),3,css('--street-dec'),css('--street')]:['case',['==',['get','m'],1],css('--major'),['==',['get','t'],1],'#efe9dd',css('--street')];
function appliquerRendu(){
  if(!map.getLayer('voies'))return;
  map.setPaintProperty('voies','line-color',couleurVoies());
  const v=(id,on)=>{if(map.getLayer(id))map.setLayoutProperty(id,'visibility',on?'visible':'none')};
  v('zones',RENDU.lim||S.onglet==='limites');v('man-f',S.onglet==='limites'||S.onglet==='generer');v('man-l',S.onglet==='limites'||S.onglet==='generer');
  try{localStorage.setItem('itina-geo-rendu',JSON.stringify(RENDU))}catch(e){}
}
function drawNums(){
  const ref=refVue();if(!ref||!map.getSource('nums'))return;
  if(map.getZoom()<17.3){map.getSource('nums').setData(FC());return}
  const b=map.getBounds();map.getSource('nums').setData(FC(ref.numerosDans(b.getSouth(),b.getWest(),b.getNorth(),b.getEast(),1500).map(x=>({type:'Feature',properties:{t:String(x.numero),i:x.impair?1:0},geometry:{type:'Point',coordinates:[x.lng,x.lat]}}))));
}
map.on('moveend',()=>setTimeout(drawNums,0));
const majVoies=()=>{if(map.getSource('voies')&&!S.vueRef&&S.ref)map.getSource('voies').setData(voiesFC(S.ref))};
/* marge de la carte : le panneau de gauche, ou le panneau du bas sur téléphone */
/* marges du cadrage : sur téléphone, la feuille du bas cache la carte ; si elle en prend presque tout, on garde au moins
   une bande de 100 px au-dessus d'elle (sinon MapLibre refuse de cadrer et la carte ne bouge pas) */
const marge=()=>{if(!tel())return{top:60,left:40,right:80,bottom:40};
  const h=map.getContainer().clientHeight||innerHeight,b=($('sheet').offsetHeight||200)+90;
  return{top:120,left:24,right:24,bottom:Math.max(20,Math.min(b,h-120-100))}};
/* MapLibre garde la marge passée à easeTo/flyTo (fiche d'une adresse) et l'ajoute à celle de fitBounds : sur téléphone,
   les deux ensemble dépassaient la hauteur de l'écran et la carte refusait de se cadrer sur la rue. On ne passe que l'écart. */
const margeCadrage=()=>{const m=marge(),c=map.getPadding();return{top:Math.max(0,m.top-c.top),bottom:Math.max(0,m.bottom-c.bottom),left:Math.max(0,m.left-c.left),right:Math.max(0,m.right-c.right)}};
function cadrer(bb,maxZoom){if(bb&&isFinite(bb[0]))map.fitBounds([[bb[0],bb[1]],[bb[2],bb[3]]],{padding:margeCadrage(),maxZoom:maxZoom||17,duration:500})}
function bboxSegs(segs){let a=Infinity,b=Infinity,c=-Infinity,d=-Infinity;for(const g of segs)for(const p of g){a=Math.min(a,p.lon);b=Math.min(b,p.lat);c=Math.max(c,p.lon);d=Math.max(d,p.lat)}return[a,b,c,d]}

/* ---------- ouverture d'une ville ---------- */
async function chargerPublie(k){
  const d=dossier(k),g=u=>fetch(u).then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.json()});
  try{const index=await g(d+'index.json');if(!index||index.format!=='conakry-adresses'||index.v!==1)return null;
    if(index.ville&&index.ville.code&&index.ville.code!==k)return null;
    return{index,voies:await g(d+index.fichiers.voies)}}catch(e){return null}
}
async function sourcesPubliees(){
  if(S.sources)return S.sources;
  const k=S.ville;let s={v:1,voies:{}};
  if(S.pub)try{const r=await fetch(dossier(k)+(S.pub.index.fichiers.sources||'sources.json'));if(r.ok)s=await r.json()}catch(e){}
  if(S.ville===k)S.sources=s;return s;
}
async function ouvrirVille(k,opts){
  opts=opts||{};if(!aVille(k))k='conakry';
  const jeton=++S.charge;
  finApercu(true);arreterTrace();fermerVilles();
  S.ville=k;S.pub=null;S.sources=null;S.ref=null;S.dec={};PPC=null;R.code=null;R.commune='';CARTE.vue='accueil';CARTE.a=null;
  history.replaceState(null,'',location.pathname+(k==='conakry'?'':'?ville='+k)+(opts.hash||''));
  try{localStorage.setItem('itina-geo-ville',k)}catch(e){}
  $('villeNom').textContent=VI(k).nom;$('vinfo').textContent='Ouverture…';
  const [pub,dec]=await Promise.all([chargerPublie(k),lireDecisions(k)]);
  if(jeton!==S.charge)return;
  S.pub=pub;S.dec=dec;
  if(pub&&nettoyer())ecrireDecisions();
  S.ref=pub?CA.depuis(pub.index,voiesDecidees(pub.voies,S.dec)):null;window.__ref=S.ref;
  await pret();if(jeton!==S.charge)return;
  poserCouches(S.ref);majMan();epingle(null);
  $('vinfo').textContent=S.ref?pl(S.ref.voies.length,'rue')+' · '+pl(S.ref.quartiers.length,'quartier'):'Plan pas encore publié';
  badgeRues();rendre();             /* le panneau d'abord : sa hauteur compte pour cadrer la carte sur téléphone */
  const vue=lireVue(k);
  if(opts.hash&&S.ref&&ouvrirHash(opts.hash)){}
  else if(vue)map.jumpTo({center:[vue.lng,vue.lat],zoom:vue.z});
  else if(S.ref){const b=S.ref.bbox;map.fitBounds([[b[0],b[1]],[b[2],b[3]]],{padding:margeCadrage(),duration:0})}
  else map.jumpTo({center:[VI(k).centre[1],VI(k).centre[0]],zoom:12.5});
  drawNums();
  $('status').hidden=true;
}

/* ---------- menu des villes ---------- */
function menuVilles(){
  const pub=new Set(S.publiees.map(v=>v.code));
  $('villeMenu').innerHTML=ORDRE.map(k=>`<li role="none"><button type="button" role="menuitem" data-v="${k}"${k===S.ville?' aria-current="true"':''}><span>${esc(VI(k).nom)}</span><small>${pub.has(k)?'en ligne':'à générer'}</small></button></li>`).join('');
  $('villeMenu').querySelectorAll('[data-v]').forEach(b=>b.onclick=()=>{fermerVilles();if(b.dataset.v!==S.ville)ouvrirVille(b.dataset.v)});
}
function fermerVilles(){$('villeMenu').hidden=true;$('villeBtn').setAttribute('aria-expanded','false')}
$('villeBtn').onclick=e=>{e.stopPropagation();const o=$('villeMenu').hidden;menuVilles();$('villeMenu').hidden=!o;$('villeBtn').setAttribute('aria-expanded',o?'true':'false');if(o){const r=$('villeBtn').getBoundingClientRect();$('villeMenu').style.left=r.left+'px';$('villeMenu').style.top=(r.bottom+6)+'px';$('villeMenu').style.position='fixed';const b=$('villeMenu').querySelector('[aria-current]')||$('villeMenu').querySelector('button');b&&b.focus()}};
document.addEventListener('click',e=>{if(!e.target.closest('#villeMenu')&&!e.target.closest('#villeBtn'))fermerVilles()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){fermerVilles();if(S.trace)arreterTrace()}});

/* ---------- onglets et panneau ---------- */
const ONGLETS=['carte','rues','limites','generer'];
function onglet(k,garder){
  if(!ONGLETS.includes(k))k='carte';
  if(S.trace&&k!=='limites')arreterTrace();
  S.onglet=k;
  for(const o of ONGLETS){const t=$('tab-'+o);t.setAttribute('aria-selected',o===k?'true':'false');t.tabIndex=o===k?0:-1;$('pane-'+o).hidden=o!==k}
  if(k!=='rues')selection(null);
  appliquerRendu();if(!garder)rendre();
  $('sheet').classList.remove('replie');$('sheet').scrollTop=0;
}
ONGLETS.forEach((o,i)=>{const t=$('tab-'+o);t.onclick=()=>onglet(o);t.onkeydown=e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();const j=(i+(e.key==='ArrowRight'?1:ONGLETS.length-1))%ONGLETS.length;onglet(ONGLETS[j]);$('tab-'+ONGLETS[j]).focus()}}});
function rendre(){({carte:rendreCarte,rues:rendreRues,limites:rendreLimites,generer:rendreGenerer})[S.onglet]()}
$('handle').onclick=()=>{const s=$('sheet');if(s.classList.contains('replie')){s.classList.remove('replie')}else if(s.classList.contains('grand')){s.classList.remove('grand');s.classList.add('replie')}else s.classList.add('grand')};
new ResizeObserver(()=>document.documentElement.style.setProperty('--sheet',$('sheet').offsetHeight+'px')).observe($('sheet'));
/* réseau */
function reseau(){const on=enLigne();$('net').textContent=on?'En ligne':'Hors ligne';$('net').classList.toggle('off',!on);
  if(map.getLayer('plan')&&$('fabSat').getAttribute('aria-pressed')!=='true')map.setLayoutProperty('plan','visibility',on?'visible':'none');
  if(S.onglet==='generer'&&S.ville)rendreGenerer()}
addEventListener('online',reseau);addEventListener('offline',reseau);reseau();

/* =====================================================================
   1. CARTE : recherche, adresse d'un point, « Où suis-je ? », itinéraire, guidage
   ===================================================================== */
const CARTE={vue:'accueil',a:null};
let pin=null,me=null,mePos=null,mePosT=0,route=null,picking=false,RT={de:null,deTxt:'',a:null,mode:'voiture'},guide=null;
function rendreCarte(){
  const p=$('pane-carte');
  if(!p.querySelector('#find')){
    p.innerHTML=`<form class="find" id="find" role="search" autocomplete="off"><input type="search" id="q" placeholder="Adresse, rue ou quartier" aria-label="Chercher une adresse, une rue, un quartier ou un Plus Code" aria-controls="sugg" maxlength="120" enterkeyhint="search"><button class="btn primary" type="submit">Chercher</button></form>
      <ul class="sugg" id="sugg" role="listbox" hidden></ul><div id="fiche"></div>
      <div class="toggles"><label><input type="checkbox" id="tSuivi"> Couleur des rues selon leur nom</label><div class="leg" id="legSuivi" hidden><span><i style="background:var(--street-keep)"></i>Nom gardé</span><span><i style="background:var(--street-prop)"></i>Nom proposé</span><span><i style="background:var(--street-todo)"></i>À nommer</span><span><i style="background:var(--street-dec)"></i>Décidé sur l'appareil</span></div>
      <label><input type="checkbox" id="tLim"> Limites des communes</label></div>`;
    brancherRecherche();
    $('tSuivi').onchange=e=>{RENDU.suivi=e.target.checked;$('legSuivi').hidden=!RENDU.suivi;appliquerRendu()};
    $('tLim').onchange=e=>{RENDU.lim=e.target.checked;appliquerRendu()};
  }
  $('tSuivi').checked=RENDU.suivi;$('legSuivi').hidden=!RENDU.suivi;$('tLim').checked=RENDU.lim;
  $('q').disabled=!S.ref;
  if(CARTE.vue==='adresse'&&CARTE.a&&refVue())montrerAdresse(CARTE.a,'garde');
  else if(CARTE.vue==='itineraire'&&RT.a&&RT.de&&refVue())calculer();
  else accueil();
}
const fiche=()=>$('fiche');
function accueil(){
  CARTE.vue='accueil';route=null;if(map.getSource('route'))map.getSource('route').setData(FC());
  if(!fiche())return;
  const V=VI(S.ville),ref=S.ref;
  if(!ref){fiche().innerHTML=`<div class="vide-ville"><b>${esc(V.nom)}</b> n'a pas encore de plan publié. Allez dans l'onglet <b>Générer</b> pour le fabriquer à partir d'OpenStreetMap.</div>`;return}
  const nd=Object.keys(S.dec).length,idx=S.pub.index;
  fiche().innerHTML=`<div class="eyebrow">Plan de ${esc(V.nom)} · version du ${esc(dateFr(idx.date))}</div>
    <div class="kpis"><div class="kpi"><b>${nf(ref.voies.length)}</b><span>rues</span></div><div class="kpi"><b>${nf(ref.quartiers.length)}</b><span>quartiers</span></div><div class="kpi"><b>${nf(idx.stats&&idx.stats.km)}</b><span>km</span></div></div>
    <p class="lead" style="margin:0">Touchez la carte pour l'adresse d'une porte, ou cherchez une adresse.</p>
    ${nd?`<p class="st prov">${pl(nd,'décision','décisions')} sur les noms, enregistrée${nd>1?'s':''} sur cet appareil, pas encore publiée${nd>1?'s':''} (onglet Rues).</p>`:''}
    <div class="row"><button class="btn primary" type="button" id="ouSuisJe"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>Où suis-je ?</button></div>`;
  $('ouSuisJe').onclick=ouSuisJe;
}
const STAT={officiel:'Nom officiel',propose:'Nom proposé, en attendant le choix de la commune',usage:'Nom d\'usage (OpenStreetMap)',a_nommer:'Rue à nommer',provisoire:'Code provisoire'};
const honore=n=>String(n).replace(/^(Rue|Avenue|Boulevard|Impasse|Chemin|Passage|Allée|Route)\s+/,'').replace(/^(du|des|de la|de l'|de|d')\s*/,'').replace(/^./,c=>c.toUpperCase());
const XFERMER='<button class="x" type="button" aria-label="Fermer"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>';
function epingle(p){
  if(!p){pin&&pin.remove();return}
  if(!pin){const el=document.createElement('div');el.innerHTML='<svg class="pin" viewBox="0 0 30 42" aria-hidden="true"><path d="M15 41C15 41 28 25 28 14.5A13 13 0 0 0 2 14.5C2 25 15 41 15 41z" fill="#c8312a" stroke="#fff" stroke-width="2"/><circle cx="15" cy="14.5" r="5" fill="#fff"/></svg>';pin=new maplibregl.Marker({element:el,anchor:'top-left'})}
  pin.setLngLat([p.lng,p.lat]).addTo(map);
}
function montrerAdresse(a,from){
  if(S.onglet!=='carte')onglet('carte',true);
  if(!fiche())rendreCarte();
  if(!a){toast('Hors de la zone de '+VI(S.ville).nom+'.');return}
  CARTE.vue='adresse';CARTE.a=a;
  const gps=from==='gps',acc=gps&&mePos?mePos.acc:0;
  if(gps)epingle(null);else epingle(a.position);
  const infos=[];
  if(a.voie&&a.corrige)infos.push(a.limite?'la rue s\'arrête au n° '+a.limite+' (le lien demandait '+esc(a.idDemande)+')':'identifiant mis à jour : le lien disait '+esc(a.idDemande));
  if(a.voie){const d=S.dec[a.voie.code];infos.push(d?({valider:'Nom validé',renommer:'Nom choisi',refuser:'Nom refusé'})[d.act]+' sur cet appareil, pas encore publié':(a.voie.statut==='propose'&&a.commune&&a.commune.code==='KAL'?'Nom proposé par le plan de Kaloum':STAT[a.voie.statut]||''));
    if(a.voie.nomUsuel)infos.push('connue comme « '+esc(a.voie.nomUsuel)+' »');if(a.distanceRue>25)infos.push('à '+a.distanceRue+' m de la rue')}
  fiche().innerHTML=`<div class="fiche"><div class="eyebrow">${gps?'Vous êtes ici':a.precision==='porte'?'Adresse':'Lieu sans rue proche'}${S.vueRef?' · aperçu':''}${XFERMER}</div>
    <h2>${esc(a.ligne1)}</h2><div class="l2">${esc(a.ligne2)}</div>
    ${gps&&acc?`<p class="st${acc>100?' prov':''}">${acc>100?'Position approximative, à '+acc+' m près.':'Position du GPS, à '+acc+' m près.'}</p>`:''}
    ${a.voie?`<p class="st">${infos.join(' · ')}</p>${a.voie.dedicace?`<p class="ded"><b>${esc(honore(a.voie.nom))}</b> · ${esc(a.voie.dedicace)}</p>`:''}`:'<p class="st">Aucune rue à moins de 60 m : le Plus Code situe l\'endroit à 3 m près.</p>'}
    <div class="chips">${a.id?`<button class="chip" type="button" data-copy="${esc(a.id)}">${esc(a.id)}</button>`:''}<button class="chip pc" type="button" data-copy="${esc(a.plusCodeCourt)}">${esc(a.plusCodeCourt)}</button></div>
    <div class="row"><button class="btn primary" type="button" id="goHere">Y aller</button>${a.voie&&!S.vueRef?'<button class="btn" type="button" id="voirRue">La rue et son nom</button>':''}<button class="btn" type="button" id="share">Partager</button></div></div>`;
  fiche().querySelector('.x').onclick=()=>{epingle(null);accueil()};
  fiche().querySelectorAll('[data-copy]').forEach(b=>b.onclick=()=>copier(b.dataset.copy));
  $('goHere').onclick=()=>itineraire(a);$('share').onclick=()=>partager(a);
  if($('voirRue'))$('voirRue').onclick=()=>{onglet('rues');ouvrirRue(a.voie.code)};
  if(from!=='tap'&&from!=='garde')map.easeTo({center:[a.position.lng,a.position.lat],zoom:Math.max(map.getZoom(),17.2),padding:marge(),duration:600});
}
function copier(t){(navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(()=>toast('Copié : '+t)).catch(()=>toast(t))}
function partager(a){
  const url=new URL('./'+(S.ville==='conakry'?'':'?ville='+S.ville),location.href).href+'#'+(a.id||a.position.lat.toFixed(6)+','+a.position.lng.toFixed(6));
  const text=a.texte+'\nPlus Code : '+a.plusCodeCourt;
  if(navigator.share)navigator.share({title:'Adresse',text,url}).catch(()=>{});else copier(text+'\n'+url);
}
function setMe(p){
  mePos={lat:p.coords.latitude,lng:p.coords.longitude,acc:Math.round(p.coords.accuracy||0)};mePosT=Date.now();
  if(!me){const el=document.createElement('div');el.className='me';me=new maplibregl.Marker({element:el})}
  me.setLngLat([mePos.lng,mePos.lat]).addTo(map);
  const r=Math.min(mePos.acc,3000),k=111320*Math.cos(mePos.lat*Math.PI/180),c=[];
  if(r>=5)for(let i=0;i<=48;i++){const t=i/48*2*Math.PI;c.push([mePos.lng+r*Math.cos(t)/k,mePos.lat+r*Math.sin(t)/110574])}
  if(map.getSource('moi'))map.getSource('moi').setData(FC(c.length?[{type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[c]}}]:[]));
}
function ouSuisJe(){
  if(!navigator.geolocation){toast('Ce navigateur ne donne pas la position.');return}
  if(!refVue()){toast('Pas de plan pour cette ville.');return}
  toast('Recherche de votre position…');
  navigator.geolocation.getCurrentPosition(p=>{setMe(p);$('toast').hidden=true;const a=refVue().adresse(mePos.lat,mePos.lng);
    if(a)montrerAdresse(a,'gps');else{map.easeTo({center:[mePos.lng,mePos.lat],zoom:13,duration:600});toast('Vous n\'êtes pas dans la zone de '+VI(S.ville).nom+'.')}},
    err=>toast(err.code===1?'Localisation refusée : autorisez-la pour ce site dans les réglages du navigateur.':'Position introuvable : réessayez à découvert.'),{enableHighAccuracy:true,timeout:20000,maximumAge:0});
}
$('fabLoc').onclick=()=>{if(S.onglet!=='carte')onglet('carte');ouSuisJe()};
/* itinéraire */
function itineraire(a){
  RT.a=a;RT.de=null;
  const choisir=m=>{if(m)toast(m);picking=true;toast('Touchez la carte pour choisir le départ.')};
  if(mePos&&Date.now()-mePosT<120000&&refVue().quartierDe(mePos.lat,mePos.lng)){RT.de=mePos;RT.deTxt='Ma position';return calculer()}
  if(!navigator.geolocation)return choisir();
  toast('Recherche de votre position…');
  navigator.geolocation.getCurrentPosition(p=>{setMe(p);$('toast').hidden=true;
    if(refVue().quartierDe(mePos.lat,mePos.lng)){RT.de=mePos;RT.deTxt='Ma position';calculer()}else choisir('Vous n\'êtes pas à '+VI(S.ville).nom+' : touchez la carte pour choisir le départ.')},
    ()=>choisir('Position introuvable : touchez la carte pour choisir le départ.'),{enableHighAccuracy:true,timeout:10000,maximumAge:30000});
}
function calculer(){
  const ref=refVue(),r=ref.itineraire(RT.de,RT.a.position,{mode:RT.mode});route=r;CARTE.vue='itineraire';
  map.getSource('route').setData(FC(r?[{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:r.ligne.map(p=>[p[1],p[0]])}}]:[]));
  const gps=RT.deTxt==='Ma position';
  fiche().innerHTML=`<div class="fiche"><div class="eyebrow">Itinéraire${XFERMER}</div><h2>${esc(RT.a.ligne1)}</h2>
    <div class="pts"><i class="a"></i><span>${esc(RT.deTxt)}<button class="lien" type="button" id="rDe">Changer</button></span><i class="b"></i><span>${esc(RT.a.ligne1)} · ${esc(RT.a.ligne2)}</span></div>
    <div class="modes" role="group" aria-label="Mode de transport">${[['voiture','Voiture'],['moto','Moto'],['pied','À pied']].map(([k,t])=>`<button type="button" data-m="${k}" aria-pressed="${RT.mode===k}">${t}</button>`).join('')}</div>
    ${r?`<div class="sum"><b>${fmtT(r.duree)}</b><span>${fmtD(r.distance)} par la route · sans bouchons</span></div>`:'<p class="st">Aucun chemin trouvé : le départ ou l\'arrivée est trop loin d\'une rue, ou les sens uniques bloquent le passage.</p>'}
    <div class="row">${r?(gps?'<button class="btn primary" type="button" id="rGo">Démarrer</button><button class="btn" type="button" id="rAp">Aperçu</button>':'<button class="btn primary" type="button" id="rAp">Aperçu du trajet</button>'):''}<button class="btn" type="button" id="rBack">Retour</button></div>
    ${r?`<ol class="steps">${r.etapes.map(e=>`<li><span>${esc(e.instruction)}</span><span>${fmtD(e.distance)}</span></li>`).join('')}</ol>`:''}</div>`;
  fiche().querySelector('.x').onclick=()=>{epingle(null);accueil()};
  fiche().querySelectorAll('[data-m]').forEach(b=>b.onclick=()=>{RT.mode=b.dataset.m;calculer()});
  if(r){if(gps)$('rGo').onclick=()=>guider('direct');$('rAp').onclick=()=>guider('apercu')}
  $('rDe').onclick=()=>{picking=true;toast('Touchez la carte pour choisir le départ.')};
  $('rBack').onclick=()=>{map.getSource('route').setData(FC());montrerAdresse(RT.a,'tap')};
  if(r){const xs=r.ligne.map(p=>p[1]),ys=r.ligne.map(p=>p[0]);cadrer([Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)],17)}
}
function guider(vue){
  if(guide)return;
  if(!window.GuidageConakry){toast('Guidage indisponible.');return}
  const box=document.createElement('div');document.body.appendChild(box);
  try{guide=GuidageConakry.ouvrir(box,refVue(),RT.a,{mode:RT.mode,itineraire:route,vue:vue==='apercu'?'apercu':'direct',fond:enLigne(),
    surFin:raison=>{guide=null;box.remove();if(raison==='arrive')montrerAdresse(RT.a,'tap');else calculer()}})}
  catch(e){guide=null;box.remove();toast('Le guidage ne peut pas démarrer : '+e.message)}
}
/* recherche */
let sel=-1,dern=[];
function brancherRecherche(){
  const sugg=$('sugg');
  const montrer=l=>{dern=l;sel=-1;if(!$('q').value.trim()){sugg.hidden=true;return}sugg.hidden=false;
    const id=idAdresse($('q').value),autre=id&&villeDuCode(id);
    sugg.innerHTML=l.length?l.map((r,i)=>`<li><button type="button" role="option" data-i="${i}"><b>${esc(r.adresse?r.adresse.ligne1:r.libelle.split(' · ')[0])}</b><small>${esc(r.adresse?r.adresse.ligne2:r.libelle.split(' · ').slice(1).join(' · ')||r.type)}${r.limite?' · la rue s\'arrête au n° '+r.limite:r.corrige?' · identifiant mis à jour':''}</small></button></li>`).join('')
      :autre&&autre!==S.ville&&aVille(autre)?`<li><button type="button" role="option" data-ville="${autre}"><b>Adresse de ${esc(VI(autre).nom)}</b><small>Ouvrir ${esc(id)} dans le plan de ${esc(VI(autre).nom)}</small></button></li>`
      :'<li class="vide">Aucun résultat. Essayez un nom de rue, un quartier ou un Plus Code.</li>';
    sugg.querySelectorAll('[data-i]').forEach(b=>b.onclick=()=>choisirRes(+b.dataset.i));
    const bv=sugg.querySelector('[data-ville]');if(bv)bv.onclick=()=>{sugg.hidden=true;$('q').value='';ouvrirVille(bv.dataset.ville,{hash:'#'+id})}};
  let qT;$('q').addEventListener('input',()=>{clearTimeout(qT);qT=setTimeout(()=>{if(refVue())montrer(refVue().chercher($('q').value,{max:7}))},160)});
  $('q').addEventListener('keydown',e=>{const it=sugg.querySelectorAll('[data-i]');if(!it.length)return;
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();sel=(sel+(e.key==='ArrowDown'?1:-1)+it.length)%it.length;it.forEach((b,i)=>b.setAttribute('aria-selected',i===sel?'true':'false'));it[sel].scrollIntoView({block:'nearest'})}
    if(e.key==='Escape')sugg.hidden=true});
  $('find').addEventListener('submit',e=>{e.preventDefault();if(!refVue())return;if(sel>=0)return choisirRes(sel);const r=refVue().chercher($('q').value,{max:7});if(r.length===1||(r[0]&&r[0].score>=1))choisirRes(0,r);else montrer(r)});
}
function choisirRes(i,l){const r=(l||dern)[i];if(!r)return;$('sugg').hidden=true;$('q').blur();
  if(r.type==='quartier'||r.type==='commune'){map.flyTo({center:[r.lng,r.lat],zoom:r.type==='commune'?13.5:15.5,padding:marge()});return}
  const a=r.adresse||refVue().adresse(r.lat,r.lng);if(a)montrerAdresse(a);else map.flyTo({center:[r.lng,r.lat],zoom:16})}
/* ville d'un identifiant, par son code postal (« GN-850… » : Labé) */
const PAR_CODE=[['810','boke'],['820','faranah'],['830','kankan'],['834','siguiri'],['840','kindia'],['850','labe'],['860','mamou'],['870','nzerekore'],['88','conakry'],['89','conakry']];
const villeDuCode=id=>{const m=String(id||'').match(/^GN-(\d{5})-/i);if(!m)return null;const p=PAR_CODE.find(([x])=>m[1].startsWith(x));return p?p[1]:null};
const idAdresse=t=>{t=String(t||'').trim().toUpperCase();return /^GN-\d{5}-[A-Z0-9]{1,40}-\d{1,5}$/.test(t)?t:null};
function ouvrirHash(h){
  h=String(h||'').replace(/^#/,'');try{h=decodeURIComponent(h)}catch(e){}h=h.slice(0,200);if(!h||!S.ref)return false;let a=null;
  if(/^GN-/i.test(h)){a=S.ref.position(h);const autre=villeDuCode(h),id=idAdresse(h);
    /* l'adresse d'une autre ville : on ouvre cette ville (jamais la rue du même nom d'ici) */
    if(!a&&id&&autre&&autre!==S.ville&&aVille(autre)){setTimeout(()=>ouvrirVille(autre,{hash:'#'+id}),0);return true}}
  else{const m=h.match(/^(-?\d+\.\d+),(-?\d+\.\d+)$/);if(m)a=S.ref.adresse(+m[1],+m[2])}
  if(a){map.jumpTo({center:[a.position.lng,a.position.lat],zoom:17.5});montrerAdresse(a,'hash');return true}return false;
}

/* clics sur la carte, selon l'onglet */
map.on('click',e=>{
  const ll=e.lngLat;
  if(S.trace){S.trace.pts.push([+ll.lng.toFixed(6),+ll.lat.toFixed(6)]);dessinerTrace();return}
  const ref=refVue();if(!ref)return;
  if(picking){picking=false;const a=ref.adresse(ll.lat,ll.lng);RT.de={lat:ll.lat,lng:ll.lng};RT.deTxt=a?a.ligne1:'Point choisi';calculer();return}
  if(S.onglet==='rues'&&!S.vueRef){const n=ref._nearest(ll.lat,ll.lng,40,v=>!v.lien);if(n)ouvrirRue(n.v.code,true);else toast('Aucune rue ici : touchez une rue.');return}
  if(S.onglet==='limites'){const z=ref.zoneDe(ll.lat,ll.lng);toast(z?'Limite de '+z.nom:'En dehors des limites connues');return}
  montrerAdresse(ref.adresse(ll.lat,ll.lng),'tap');
});

/* =====================================================================
   2. RUES : les communes valident, renomment ou refusent les noms proposés
   ===================================================================== */
const R={filtre:'avalider',commune:'',texte:'',n:60,code:null,form:null};
const ETAT={propose:'Proposé',officiel:'Officiel',usage:'Nom d\'usage',a_nommer:'À nommer',provisoire:'Provisoire',valider:'Validé',renommer:'Renommé',refuser:'Refusé'};
function badgeRues(){const n=Object.keys(S.dec).length,b=$('badgeRues');b.hidden=!n;b.textContent=n>99?'99+':String(n);$('tab-rues').setAttribute('aria-label','Rues'+(n?', '+n+' décision'+(n>1?'s':'')+' en attente':''))}
function lignes(){
  if(!S.pub)return[];
  const Q=Object.fromEntries(S.pub.index.quartiers.map(q=>[q[1],q[0]])),C=CMD(S.ville),ord=Object.fromEntries(S.pub.index.communes.map((c,i)=>[c.code,i]));
  return S.pub.voies.voies.filter(v=>!v.x).map(v=>{const d=S.dec[v.c],w=voieDecidee(v,d);
    return{v,d,w,etat:d?d.act:v.st,qn:(v.q||[]).map(cp=>cp+' '+(Q[cp]||'')).join(', '),cn:(C[v.k]||{}).nom||v.k,ord:ord[v.k]??99}})
    .sort((a,b)=>a.ord-b.ord||String((a.v.q||[])[0]||'').localeCompare(String((b.v.q||[])[0]||''))||a.w.n.localeCompare(b.w.n,'fr'));
}
const FILTRES={avalider:x=>!x.d&&x.v.st==='propose'&&x.v.k!=='KAL',decides:x=>!!x.d,gardes:x=>!x.d&&(x.v.st==='officiel'||x.v.st==='usage'),toutes:()=>true};
function filtrees(L){
  const t=norm(R.texte);
  return L.filter(x=>FILTRES[R.filtre](x)&&(!R.commune||x.v.k===R.commune)&&(!t||norm(x.w.n+' '+(x.v.a||'')+' '+x.qn+' '+x.v.c).includes(t)));
}
function rendreRues(){
  const p=$('pane-rues');
  if(!S.pub){p.innerHTML=`<h2>Noms des rues</h2><div class="vide-ville">${esc(VI(S.ville).nom)} n'a pas encore de plan publié : générez-le d'abord (onglet Générer).</div>`;return}
  if(R.code&&pubParCode()[R.code])return rendreRue();
  const L=lignes(),cnt=Object.fromEntries(Object.keys(FILTRES).map(k=>[k,L.filter(FILTRES[k]).length])),F=filtrees(L),nd=Object.keys(S.dec).length;
  const coms=S.pub.index.communes.filter(c=>L.some(x=>x.v.k===c.code));
  p.innerHTML=`<h2>Noms des rues</h2>
    <p class="lead">Les communes valident, renomment ou refusent les noms proposés. Les décisions restent sur cet appareil jusqu'à leur publication.</p>
    <div class="seg" role="group" aria-label="Rues à afficher">${[['avalider','À valider'],['decides','Décidées'],['gardes','Noms gardés'],['toutes','Toutes']].map(([k,t])=>`<button type="button" data-f="${k}" aria-pressed="${R.filtre===k}">${t}<small>${nf(cnt[k])}</small></button>`).join('')}</div>
    <div class="filtres">${coms.length>1?`<select id="rCom" aria-label="Commune"><option value="">Toutes les communes</option>${coms.map(c=>`<option value="${c.code}"${R.commune===c.code?' selected':''}>${esc(c.nom)}</option>`).join('')}</select>`:''}<input type="search" id="rTxt" placeholder="Nom, quartier, code" aria-label="Filtrer les rues" value="${esc(R.texte)}"></div>
    <ul class="liste" id="rListe">${F.slice(0,R.n).map(x=>`<li><button class="rue" type="button" data-c="${esc(x.v.c)}"><b>${esc(x.w.n)}</b><small>${esc(x.cn)}${x.qn?' · '+esc(x.qn):''}</small><span class="tag ${x.etat}">${ETAT[x.etat]||x.etat}</span></button></li>`).join('')||'<li class="st" style="padding:12px 0">Aucune rue dans cette liste.</li>'}</ul>
    ${F.length>R.n?`<button class="btn plus" type="button" id="rPlus">Afficher ${nf(Math.min(60,F.length-R.n))} rues de plus (${nf(F.length-R.n)} restantes)</button>`:''}
    <h3>Exporter</h3>
    <div class="row" style="margin-top:4px"><button class="btn" type="button" id="rCsv">Tableau pour la commune</button><button class="btn${nd?' primary':''}" type="button" id="rZip"${nd?'':' disabled'}>Référentiel avec ${nd?pl(nd,'décision','décisions'):'les décisions'} (zip)</button></div>
    <p class="hint">Le tableau s'ouvre dans Excel : toutes les rues${R.commune?' de la commune choisie':''}, leur nom proposé et les décisions. Le zip se publie comme celui de l'atelier, ou s'envoie à Claude.</p>`;
  p.querySelectorAll('[data-f]').forEach(b=>b.onclick=()=>{R.filtre=b.dataset.f;R.n=60;rendreRues()});
  if($('rCom'))$('rCom').onchange=e=>{R.commune=e.target.value;R.n=60;rendreRues()};
  let tT;$('rTxt').oninput=e=>{clearTimeout(tT);tT=setTimeout(()=>{R.texte=e.target.value;R.n=60;const pos=e.target.selectionStart;rendreRues();const i=$('rTxt');i.focus();try{i.setSelectionRange(pos,pos)}catch(x){}},220)};
  p.querySelectorAll('[data-c]').forEach(b=>b.onclick=()=>ouvrirRue(b.dataset.c));
  if($('rPlus'))$('rPlus').onclick=()=>{R.n+=60;rendreRues()};
  $('rCsv').onclick=exporterCsv;$('rZip').onclick=exporterDecisions;
}
function selection(code){
  if(!map.getSource('sel'))return;
  const v=code&&S.ref&&S.ref.voieParCode[code];
  map.getSource('sel').setData(FC(v?[{type:'Feature',properties:{},geometry:{type:'MultiLineString',coordinates:v.segs.map(g=>g.map(p=>[p.lon,p.lat]))}}]:[]));
  return v;
}
function ouvrirRue(code,depuisCarte){
  if(!S.pub||!pubParCode()[code])return;
  R.code=code;R.form=null;if(S.onglet!=='rues')onglet('rues',true);
  rendreRue();
  const v=selection(code);if(v)cadrer(bboxSegs(v.segs),17.5);
  if(!depuisCarte)$('sheet').scrollTop=0;
}
const TYPES=['Rue','Avenue','Boulevard','Impasse','Route','Allée','Chemin','Place','Corniche','Passage','Quai','Ruelle','Autoroute'];
const typeDe=n=>{const w=String(n||'').split(' ')[0];return TYPES.includes(w)?w:'Rue'};
const dedicaceDe=p=>(p.dates?p.dates+' · ':'')+p.bio;
/* rues voisines dans la liste filtrée ; une rue qui vient d'être décidée sort de « À valider » : on continue depuis sa place */
function voisins(){
  const L=lignes(),F=filtrees(L),i=F.findIndex(x=>x.v.c===R.code);
  if(i>=0)return{F,i,prec:i>0?F[i-1].v.c:null,suiv:i<F.length-1?F[i+1].v.c:null};
  const pos=new Map(L.map((x,j)=>[x.v.c,j])),me=pos.get(R.code);
  let prec=null,suiv=null;for(const x of F){const j=pos.get(x.v.c);if(j<me)prec=x.v.c;else if(j>me&&!suiv)suiv=x.v.c}
  return{F,i,prec,suiv};
}
function rendreRue(){
  const p=$('pane-rues'),v=pubParCode()[R.code],d=S.dec[R.code],w=voieDecidee(v,d),C=CMD(S.ville);
  const Q=Object.fromEntries(S.pub.index.quartiers.map(q=>[q[1],q[0]])),ref=S.ref.voie(R.code)||{};
  const kal=v.k==='KAL',P=Object.fromEntries(NM.personnalites().map(x=>[x.id,x])),pers=w.p&&P[w.p];
  const {F,i,prec,suiv}=voisins();
  const quand=d?'le '+dateFr(d.t):'';
  p.innerHTML=`<div class="eyebrow"><button class="lien" type="button" id="rRet" style="margin:0">← Toutes les rues</button><span style="margin-left:auto">${i>=0?nf(i+1)+' sur '+nf(F.length):''}</span></div>
    <h2>${esc(w.n)}</h2>
    <div class="l2">${esc((C[v.k]||{}).nom||v.k)}${(v.q||[]).length?' · '+(v.q||[]).map(cp=>esc(cp+' '+(Q[cp]||''))).join(', '):''}</div>
    <p class="st">${d?({valider:'Nom validé',renommer:'Nom choisi par la commune',refuser:'Nom refusé : un autre nom sera proposé à la prochaine génération'})[d.act]+' '+quand+' · pas encore publié':esc(STAT[v.st]||v.st)}</p>
    ${w.b?`<p class="ded"><b>${esc(pers?pers.nom:honore(w.n))}</b> · ${esc(w.b)}</p>`:''}
    <dl class="facts"><dt>Code de la voie</dt><dd><code>${esc(v.c)}</code> (les adresses gardent ce code)</dd><dt>Longueur</dt><dd>${fmtD(ref.longueur||0)} · numéros 1 à ${nf(ref.numeroMax||v.m||0)}</dd>${w.a?`<dt>Ancien nom</dt><dd>${esc(w.a)}</dd>`:''}${d&&d.act==='renommer'?`<dt>Nom proposé avant</dt><dd>${esc(v.n)}</dd>`:''}</dl>
    ${kal?'<div class="decision">Kaloum : les noms viennent du plan de Kaloum, à décider sur le site de Kaloum. Le studio ne les change pas.</div>'
      :R.form?formRenommer(w)
      :`<div class="row">${!d||d.act!=='valider'?`<button class="btn ok" type="button" id="rVal">Valider ce nom</button>`:''}<button class="btn" type="button" id="rRen">Renommer</button>${v.st==='propose'&&(!d||d.act!=='refuser')?'<button class="btn warn" type="button" id="rRef">Refuser ce nom</button>':''}</div>
        ${d?'<div class="row"><button class="btn mini" type="button" id="rAnn">Annuler la décision</button></div>':''}`}
    <div class="nav2"><button class="btn mini" type="button" id="rPrec"${prec?'':' disabled'}>‹ Rue précédente</button><button class="btn mini" type="button" id="rSuiv"${suiv?'':' disabled'}>Rue suivante ›</button></div>
    <p class="hint" style="margin-top:10px">Touchez une autre rue sur la carte pour l'ouvrir. Raccourcis : V valider, R renommer, flèches pour passer d'une rue à l'autre.</p>`;
  $('rRet').onclick=()=>{R.code=null;selection(null);rendreRues()};
  $('rPrec').onclick=()=>{if(prec)ouvrirRue(prec)};$('rSuiv').onclick=()=>{if(suiv)ouvrirRue(suiv)};
  if(kal)return;
  if(R.form){brancherForm(v,w);return}
  if($('rVal'))$('rVal').onclick=()=>decider('valider');
  $('rRen').onclick=()=>{R.form={n:w.n,p:w.p||null,q:''};rendreRue();const n=$('fNom');n.focus();n.select()};
  if($('rRef'))$('rRef').onclick=()=>decider('refuser');
  if($('rAnn'))$('rAnn').onclick=annulerDecision;
}
function formRenommer(w){
  const used=persUtilisees(),libres=NM.personnalites().filter(x=>!used.has(x.id)||x.id===w.p).length;
  return`<div class="form" id="fForm"><label for="fNom">Nouveau nom</label><input type="text" id="fNom" maxlength="120" value="${esc(R.form.n)}" autocomplete="off">
    <label for="fPers">Ou une personnalité de la liste (${pl(libres,'encore libre','encore libres')} dans la ville : chacune n'est honorée qu'une fois)</label><input type="search" id="fPers" placeholder="Nom, pays, métier" value="${esc(R.form.q)}" autocomplete="off">
    <ul class="pers" id="fListe" hidden></ul><p class="st prov" id="fAvert" hidden></p>
    <div class="row"><button class="btn primary" type="button" id="fOk">Enregistrer le nom</button><button class="btn" type="button" id="fNon">Annuler</button></div></div>`;
}
/* personnalités déjà honorées dans la ville : rue publiée (sauf nom refusé ou remplacé sur l'appareil) ou décision de l'appareil → nom de la rue */
function persUtilisees(){
  const m=new Map(),noms=[];
  for(const x of S.pub.voies.voies){const w=voieDecidee(x,S.dec[x.c]),ref=S.dec[x.c]&&S.dec[x.c].act==='refuser';if(w.p&&!ref)m.set(w.p,w.n);if(!ref&&!x.x)noms.push([norm(w.n),w.n])}
  /* une personnalité déjà honorée par le nom d'une rue (« Avenue Samory Touré »), même sans lien dans le plan */
  for(const p of NM.personnalites()){if(m.has(p.id))continue;const k=norm(p.c);if(k.length<5)continue;const t=noms.find(([n])=>n.includes(k));if(t)m.set(p.id,t[1])}
  return m;
}
function brancherForm(v,w){
  const used=persUtilisees();
  const PERS=NM.personnalites().filter(x=>!used.has(x.id)||x.id===w.p),LIB=new Set(PERS.map(x=>x.id));
  const liste=()=>{const t=norm($('fPers').value);R.form.q=$('fPers').value;const ul=$('fListe');
    if(!t){ul.hidden=true;return}
    const tous=NM.personnalites().filter(x=>norm(x.nom+' '+x.bio+' '+(x.origine||'')).includes(t)),m=tous.filter(x=>LIB.has(x.id)).slice(0,8),pris=tous.filter(x=>!LIB.has(x.id)).slice(0,4);
    ul.hidden=false;ul.innerHTML=(m.map(x=>`<li><button type="button" data-p="${esc(x.id)}">${esc(x.nom)}<small>${esc(dedicaceDe(x).slice(0,110))}</small></button></li>`).join('')
      +pris.map(x=>`<li class="st" style="padding:6px 9px;margin:0">${esc(x.nom)} : déjà honorée par « ${esc(used.get(x.id))} »</li>`).join(''))||'<li class="st" style="padding:8px;margin:0">Aucune personnalité ne correspond. Écrivez le nom voulu dans « Nouveau nom ».</li>';
    ul.querySelectorAll('[data-p]').forEach(b=>b.onclick=()=>{const x=PERS.find(y=>y.id===b.dataset.p);R.form.p=x.id;R.form.n=typeDe(w.n)+' '+x.c;$('fNom').value=R.form.n;ul.hidden=true;$('fPers').value='';R.form.q='';avert()})};
  let force=false;
  const avert=()=>{const n=$('fNom').value.replace(/\s+/g,' ').trim(),k=A.cle(n),a=$('fAvert');force=false;
    const doublon=k&&S.pub.voies.voies.find(x=>x.c!==v.c&&x.k===v.k&&!x.x&&A.cle(voieDecidee(x,S.dec[x.c]).n)===k);
    a.hidden=!doublon;if(doublon)a.textContent='Une autre rue de '+((CMD(S.ville)[v.k]||{}).nom||'la commune')+' porte déjà ce nom : « '+voieDecidee(doublon,S.dec[doublon.c]).n+' ». Enregistrez quand même si c\'est voulu.';
    $('fOk').textContent=doublon?'Enregistrer quand même':'Enregistrer le nom';return doublon};
  $('fNom').oninput=()=>{R.form.n=$('fNom').value;avert()};
  $('fPers').oninput=liste;liste();avert();
  $('fNon').onclick=()=>{R.form=null;rendreRue()};
  $('fOk').onclick=()=>{
    const n=$('fNom').value.replace(/[\u0000-\u001f\u007f<>]/g,' ').replace(/\s+/g,' ').trim();
    if(n.length<3){toast('Donnez un nom d\'au moins 3 lettres.');$('fNom').focus();return}
    if(avert()&&!force){force=true;$('fOk').textContent='Confirmer : enregistrer quand même';$('fOk').onclick=()=>enregistrer(n);return}
    enregistrer(n);
  };
  const enregistrer=n=>{let p=R.form.p&&PERS.find(x=>x.id===R.form.p);if(p&&!norm(n).includes(norm(p.c)))p=null;
    if(norm(n)===norm(v.n)&&v.st!=='officiel'&&!p)return decider('valider');
    decider('renommer',{n,p:p?p.id:null,b:p?dedicaceDe(p):null})};
  $('fNom').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$('fOk').click()}};
}
async function decider(act,x){
  const v=pubParCode()[R.code];if(!v||v.k==='KAL'||v.x)return;
  const d={act,n:act==='renommer'?x.n:v.n,t:new Date().toISOString(),avant:{n:v.n,st:v.st}};
  if(act==='renommer'&&x.p){d.p=x.p;d.b=x.b}
  if(act==='valider'&&v.p){d.p=v.p;d.b=v.b}
  if(act==='refuser'&&v.p)d.p=v.p;
  S.dec[v.c]=d;if(!(await ecrireDecisions())){delete S.dec[v.c];return}
  majVoie(v.c);R.form=null;
  toast(({valider:'Nom validé',renommer:'Nouveau nom enregistré',refuser:'Nom refusé'})[act]+' sur cet appareil.');
  /* revue rapide : dans « À valider », on passe à la rue suivante (après un nouveau nom, on reste pour le voir) */
  if(R.filtre==='avalider'&&act!=='renommer'){const {suiv}=voisins();if(suiv){ouvrirRue(suiv);return}}
  rendreRue();
}
async function annulerDecision(){const c=R.code;delete S.dec[c];await ecrireDecisions();majVoie(c);toast('Décision annulée.');rendreRue()}
/* une voie du référentiel affiché suit la décision (sans tout recharger) */
function majVoie(code){
  const v=pubParCode()[code],w=voieDecidee(v,S.dec[code]),r=S.ref.voieParCode[code];
  if(r){r.nom=w.n;r.statut=w.st;r.nomUsuel=w.a||null;r.dedicace=w.b||null;r.personnalite=w.p||null;S.ref._search=null}
  majVoies();selection(code);badgeRues();
}
document.addEventListener('keydown',e=>{
  if(S.onglet!=='rues'||!R.code||R.form||e.altKey||e.ctrlKey||e.metaKey)return;
  if(e.target.closest('input,select,textarea'))return;
  if(e.key==='ArrowRight'&&$('rSuiv')&&!$('rSuiv').disabled){e.preventDefault();$('rSuiv').click()}
  else if(e.key==='ArrowLeft'&&$('rPrec')&&!$('rPrec').disabled){e.preventDefault();$('rPrec').click()}
  else if((e.key==='v'||e.key==='V')&&$('rVal')){e.preventDefault();$('rVal').click()}
  else if((e.key==='r'||e.key==='R')&&$('rRen')){e.preventDefault();$('rRen').click()}
});
/* tableau pour la commune (Excel) */
function exporterCsv(){
  /* une cellule qui commence par = + - @ serait lue comme une formule par Excel : on la neutralise */
  const cell=x=>{x=String(x??'').replace(/\r?\n|\r/g,' ');if(/^[=+\-@\t]/.test(x))x="'"+x;return /[";]/.test(x)?'"'+x.replace(/"/g,'""')+'"':x};
  const P=Object.fromEntries(NM.personnalites().map(x=>[x.id,x]));
  const L=lignes().filter(x=>x.v.k!=='KAL'&&(!R.commune||x.v.k===R.commune));
  const DEC={valider:'Validé',renommer:'Renommé',refuser:'Refusé'};
  const rows=L.map(x=>{const r=S.ref.voie(x.v.c)||{};return[x.cn,x.qn,x.v.c,x.v.n,ETAT[x.v.st]||x.v.st,x.d?DEC[x.d.act]:'',x.d&&x.d.act==='renommer'?x.d.n:'',x.w.p&&P[x.w.p]?P[x.w.p].nom:'',x.w.b||'',x.v.a||'',Math.round(r.longueur||0),x.d?x.d.t.slice(0,10):''].map(cell).join(';')});
  const csv='﻿Commune;Quartiers;Code de la voie;Nom publié;Statut publié;Décision;Nouveau nom;Personnalité;Dédicace;Ancien nom ou numéro;Longueur (m);Date de la décision\n'+rows.join('\n');
  telecharger(new Blob([csv],{type:'text/csv;charset=utf-8'}),'rues-'+S.ville+(R.commune?'-'+R.commune.toLowerCase():'')+'-'+new Date().toISOString().slice(0,10)+'.csv');
}
/* référentiel publié + décisions de l'appareil, sans régénérer (le zip se publie comme celui de l'atelier) */
async function exporterDecisions(){
  if(!S.pub)return;
  const src=await sourcesPubliees(),dec=A.decisionsValides(S.dec);
  const voies=voiesDecidees(S.pub.voies,S.dec),now=new Date();
  const index=JSON.parse(JSON.stringify(S.pub.index));
  index.version=now.toISOString().slice(0,10).replace(/-/g,'.');index.date=now.toISOString();
  const vv=voies.voies;index.stats=Object.assign({},index.stats,{avecNom:vv.filter(v=>v.st!=='a_nommer').length,proposes:vv.filter(v=>v.st==='propose'&&!v.x).length,personnalites:vv.filter(v=>v.p).length});
  const sources=Object.assign({},src,{decisions:Object.assign({},src.decisions||{},dec)});
  telecharger(await zipReferentiel(index,voies,sources),'referentiel-'+S.ville+'-'+index.version.replace(/\./g,'')+'-decisions.zip');
  toast('Zip prêt : '+pl(Object.keys(dec).length,'décision','décisions')+'. Publiez-le comme celui de l\'atelier.');
}
async function zipReferentiel(index,voies,sources){
  const d=dossier(S.ville),villes=S.publiees.filter(v=>aVille(v.code)).slice();
  if(!villes.some(v=>v.code===S.ville)){const V=VI(S.ville);villes.push({code:V.code,nom:V.nom,dossier:d,cp:V.communes[0].cp.slice(0,2),centre:V.centre})}
  villes.sort((a,b)=>ORDRE.indexOf(a.code)-ORDRE.indexOf(b.code));
  return A.zip([{name:d+'index.json',data:JSON.stringify(index)},{name:d+'voies.json',data:JSON.stringify(voies)},{name:d+'sources.json',data:JSON.stringify(sources)},{name:'data/villes.json',data:JSON.stringify({v:1,villes})}]);
}

/* =====================================================================
   3. LIMITES : tracer la limite d'une commune (gardée dans la mémoire de l'atelier, pour la prochaine génération)
   ===================================================================== */
const SRC={osm:['OpenStreetMap','ok'],officiel:['officielle (PAM, OCHA)','ok'],manuel:['tracée à la main','ok'],auto:['cercle provisoire','mid'],plan:['plan de Kaloum','ok']};
async function manuelles(){const out={};for(const k of await ckeys())if(String(k).startsWith('manuel:'))out[k.slice(7)]=await cget(k);return out}
async function majMan(){
  if(!map.getSource('man'))return;
  const M=await manuelles(),codes=new Set(VI(S.ville).communes.map(c=>c.code));
  map.getSource('man').setData(FC(Object.entries(M).filter(([k,v])=>codes.has(k)&&Array.isArray(v)&&v.length).map(([k,v])=>({type:'Feature',properties:{c:k},geometry:{type:'Polygon',coordinates:v.map(r=>r.concat([r[0]]))}}))));
}
async function rendreLimites(){
  const p=$('pane-limites'),V=VI(S.ville),k=S.ville,M=await manuelles(),OFF=await officielles();if(k!==S.ville||S.onglet!=='limites')return;
  const Z=S.pub?S.pub.index.zones:[];
  const rows=V.communes.map(c=>{
    const own=Z.find(z=>z.communes[0]===c.code),in_=!own&&Z.find(z=>z.communes.includes(c.code)),par=c.parent&&V.communes.find(x=>x.code===c.parent);
    const s=own?SRC[own.source]||[own.source,'mid']:in_?['dans '+in_.nom+' (par les quartiers)','ok']:par?['suit '+par.nom+' (par les quartiers)','mid']:['absente','miss'];
    const m=M[c.code],att=Array.isArray(m)&&m.length?'nouvelle limite tracée ici':m===null&&own&&own.source==='manuel'?'limite tracée effacée'
      :(!own||own.source==='auto')&&!in_&&OFF[c.code]?'limite officielle (PAM, OCHA)':'';
    const osm=own&&own.source==='osm',kal=c.code==='KAL'||c.code==='KAS';
    const act=osm||kal||in_?'':`<button class="btn mini" type="button" data-t="${c.code}">${Array.isArray(m)&&m.length?'Retracer':own&&own.source==='officiel'?'Corriger':'Tracer'}</button>${Array.isArray(m)&&m.length?`<button class="btn mini" type="button" data-e="${c.code}">Effacer</button>`:''}`;
    return`<tr><td><b>${esc(c.nom)}</b><br><span class="hint">${c.cp}</span></td><td><span class="src ${s[1]}">${esc(s[0])}</span>${att?`<br><span class="src att">${att} : prochaine génération</span>`:''}</td><td class="act">${act}</td></tr>`}).join('');
  p.innerHTML=`<h2>Limites des communes</h2>
    <p class="lead">La limite décide de la commune et du code postal de chaque adresse. OpenStreetMap passe d'abord, puis une limite tracée ici, puis la limite officielle publiée par le PAM et OCHA (2023).</p>
    <table><thead><tr><th>Commune</th><th>Limite</th><th></th></tr></thead><tbody>${rows}</tbody></table>
    <p class="hint">Une limite tracée reste sur cet appareil, dans la même mémoire que l'atelier, et s'applique à la prochaine génération (onglet Générer). En orange sur la carte.</p>`;
  p.querySelectorAll('[data-t]').forEach(b=>b.onclick=()=>commencerTrace(b.dataset.t));
  p.querySelectorAll('[data-e]').forEach(b=>b.onclick=async()=>{try{await cput('manuel:'+b.dataset.e,null)}catch(e){toast('Impossible d\'enregistrer sur cet appareil.');return}majMan();rendreLimites();toast('Limite tracée effacée : la prochaine génération reprend la limite d\'avant.')});
}
function commencerTrace(code){
  const c=VI(S.ville).communes.find(x=>x.code===code);if(!c)return;
  S.trace={code,pts:[]};$('trNom').textContent=c.nom;$('trbar').hidden=false;map.getCanvas().style.cursor='crosshair';
  map.doubleClickZoom.disable();dessinerTrace();if(tel())$('sheet').classList.add('replie');
}
function dessinerTrace(){
  const p=S.trace?S.trace.pts:[],f=p.map(x=>({type:'Feature',properties:{},geometry:{type:'Point',coordinates:x}}));
  if(p.length>=2)f.push({type:'Feature',properties:{},geometry:p.length>=3?{type:'Polygon',coordinates:[p.concat([p[0]])]}:{type:'LineString',coordinates:p}});
  if(map.getSource('tr'))map.getSource('tr').setData(FC(f));
  $('trNb').textContent=p.length+' point'+(p.length>1?'s':'');$('trFin').disabled=p.length<3;
}
function arreterTrace(){if(!S.trace)return;S.trace=null;$('trbar').hidden=true;map.getCanvas().style.cursor='';map.doubleClickZoom.enable();dessinerTrace();$('sheet').classList.remove('replie')}
$('trUndo').onclick=()=>{if(S.trace){S.trace.pts.pop();dessinerTrace()}};
$('trStop').onclick=arreterTrace;
$('trFin').onclick=async()=>{
  if(!S.trace||S.trace.pts.length<3)return;const {code,pts}=S.trace;
  try{await cput('manuel:'+code,[pts.slice()])}catch(e){toast('Impossible d\'enregistrer sur cet appareil.');return}
  arreterTrace();await majMan();rendreLimites();toast('Limite enregistrée sur cet appareil : elle servira à la prochaine génération.');
};

/* =====================================================================
   4. GÉNÉRER : refaire le référentiel avec les rues d'OpenStreetMap gardées sur l'appareil (sans internet), ou les télécharger
   ===================================================================== */
const ENDPOINTS=['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter'];
const KV=(v,k)=>v.code==='conakry'?k:v.code+':'+k;
let OFFICIELLES=null;
async function officielles(){
  if(OFFICIELLES)return OFFICIELLES;const out={};
  try{const j=await fetch('sources/limites-officielles.json').then(r=>r.ok?r.json():null);const cs=j&&j.communes&&typeof j.communes==='object'?j.communes:{};
    for(const k of Object.keys(cs)){const a=cs[k]&&cs[k].anneaux;
      if(/^[A-Z]{3}$/.test(k)&&Array.isArray(a)&&a.length&&a.length<50&&a.every(r=>Array.isArray(r)&&r.length>=4&&r.length<5000&&r.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90)))out[k]=a}}catch(e){}
  return OFFICIELLES=out;
}
/* même zone que l'atelier : le carré de la ville, agrandi à toute la limite officielle (mêmes carreaux, même mémoire) */
function zoneTelechargee(V,off){
  const b=Object.assign({},V.bbox);if(V.kaloum)return b;
  const p={s:Infinity,w:Infinity,n:-Infinity,e:-Infinity};
  for(const c of V.communes)for(const r of off[c.code]||[])for(const [lng,lat] of r){p.s=Math.min(p.s,lat);p.n=Math.max(p.n,lat);p.w=Math.min(p.w,lng);p.e=Math.max(p.e,lng)}
  if(!(p.s<p.n))return b;
  const [la,lo]=V.centre,M=0.4,bas=x=>Math.floor(x*1000)/1000,haut=x=>Math.ceil(x*1000)/1000;
  if(p.s<b.s)b.s=bas(Math.max(p.s,la-M));if(p.n>b.n)b.n=haut(Math.min(p.n,la+M));
  if(p.w<b.w)b.w=bas(Math.max(p.w,lo-M));if(p.e>b.e)b.e=haut(Math.min(p.e,lo+M));
  return b;
}
async function plan(V){
  const off=await officielles(),Z=zoneTelechargee(V,off),Q=A.requetes(Z),zk=['s','w','n','e'].every(k=>Z[k]===V.bbox[k])?'':':'+[Z.s,Z.w,Z.n,Z.e].join('_');
  return{off,Z,Q,cles:[KV(V,'limites'+zk),KV(V,'lieux'+zk)].concat(Q.tuiles.map(t=>'t:'+t.id))};
}
async function etatOsm(V,keys){const P=await plan(V),K=new Set(keys||await ckeys());const have=P.cles.filter(k=>K.has(k)).length;return{P,have,total:P.cles.length,complet:have===P.cles.length}}
async function overpass(q,label,log){
  let last;
  for(let attempt=0;attempt<4;attempt++){
    for(const u of ENDPOINTS){
      const ctl=new AbortController(),tm=setTimeout(()=>ctl.abort(),200000);
      try{const r=await fetch(u,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'data='+encodeURIComponent(q),signal:ctl.signal});
        if(r.status===429||r.status===504){last=new Error('serveur occupé ('+r.status+')');continue}
        if(!r.ok)throw new Error('HTTP '+r.status);
        const j=await r.json();if(j.remark&&/runtime error|timed out|out of memory/i.test(j.remark))throw new Error(j.remark);return j}
      catch(e){last=e.name==='AbortError'?new Error('trop long'):e}finally{clearTimeout(tm)}
    }
    if(!enLigne())throw new Error('connexion perdue');
    log(label+' : '+last.message+', nouvel essai dans '+(10*(attempt+1))+' s…');await new Promise(r=>setTimeout(r,10000*(attempt+1)));
  }
  throw last;
}
async function planKaloum(){
  try{const h=await fetch('../kaloum-carte/agent/index.html',{cache:'no-cache'}).then(r=>r.ok?r.text():'');const m=h.match(/<script type="application\/json" id="plan">([\s\S]*?)<\/script>/);
    if(m){const p=JSON.parse(m[1].replace(/<\\\//g,'</'));if(p&&Array.isArray(p.rues)&&p.rues.length)return{plan:p,source:'site de Kaloum'}}}catch(e){}
  const r=await fetch('sources/kaloum-plan.json');if(!r.ok)throw new Error('plan de Kaloum introuvable');return{plan:await r.json(),source:'copie gardée par le studio'};
}
const G={en:false,log:'',bar:0,res:null,ville:null};
async function generer(rafraichir){
  if(G.en)return;const V=VI(S.ville),k=S.ville;G.en=true;G.res=null;G.ville=k;G.bar=0;
  const log=t=>{G.log=t;if(S.onglet==='generer'&&S.ville===k&&$('gLog'))$('gLog').textContent=t},bar=f=>{G.bar=f;if($('gBar'))$('gBar').style.width=Math.round(f*100)+'%'};
  rendreGenerer();
  try{
    const P=await plan(V);
    if(rafraichir){if(!enLigne())throw new Error('rafraîchir demande internet');for(const c of P.cles)await cdel(c);log('Mémoire de '+V.nom+' vidée : téléchargement des rues récentes…')}
    const K=new Set(await ckeys());
    const get=async(key,q,label)=>{const c=K.has(key)?await cget(key):null;if(c)return c;if(!enLigne())throw new Error('il manque des rues d\'OpenStreetMap sur cet appareil et la connexion est coupée');const j=await overpass(q,label,log);await cput(key,j);return j};
    const n=P.Q.tuiles.length+2;let done=0;
    log(V.nom+' : limites des communes…');const lim=await get(P.cles[0],P.Q.limites,'Limites');bar(++done/n);
    log(V.nom+' : quartiers…');const lieux=await get(P.cles[1],P.Q.lieux,'Quartiers');bar(++done/n);
    const ways=[];
    for(const t of P.Q.tuiles){log('Rues : carreau '+(done-1)+' sur '+P.Q.tuiles.length+'…');const j=await get('t:'+t.id,t.q,'Carreau '+(done-1));for(const e of j.elements)if(e.type==='way')ways.push(e);bar(++done/n)}
    let pk={plan:null,source:''};if(V.kaloum){log('Plan de Kaloum (lecture seule)…');pk=await planKaloum()}
    log('Construction du référentiel ('+nf(ways.length)+' tronçons)…');await new Promise(r=>setTimeout(r,30));
    const prev=S.pub&&S.ville===k?{index:S.pub.index,voies:S.pub.voies,sources:await sourcesPubliees()}:null;
    const t0=performance.now();
    const res=A.construire({ville:V.code,ways,relations:lim.elements.filter(e=>e.type==='relation'),places:lieux.elements.filter(e=>e.type==='node'),plan:pk.plan,planSource:pk.plan?pk.source:'',precedent:prev,
      manuelles:await manuelles(),officielles:P.off,decisions:A.decisionsValides(S.dec)});
    res.duree=(performance.now()-t0)/1000;res.ville=k;res.planSource=pk.plan?pk.source+', figé le '+(pk.plan.fige_le||'?'):'';
    if(S.ville===k){G.res=res;S.apercu=res}
    log(V.nom+' : référentiel construit en '+res.duree.toFixed(1)+' s.');bar(1);
  }catch(e){log('Arrêt : '+(e.message||e)+'.');console.error(e)}
  G.en=false;if(S.onglet==='generer'&&S.ville===k)rendreGenerer();
}
function voirApercu(){
  const r=S.apercu;if(!r||r.ville!==S.ville)return;
  S.vueRef=CA.depuis(r.index,r.voies);selection(null);epingle(null);poserCouches(S.vueRef);majMan();drawNums();
  $('apercuTxt').textContent='Aperçu de la nouvelle version de '+VI(S.ville).nom+' : '+pl(r.index.stats.voies,'rue')+', '+pl(r.index.stats.quartiers,'quartier')+' (pas encore publiée)';$('apercuBar').hidden=false;
  const b=S.vueRef.bbox;map.fitBounds([[b[0],b[1]],[b[2],b[3]]],{padding:margeCadrage(),duration:500});
  if(S.onglet!=='carte'&&S.onglet!=='generer')onglet('generer');
}
function finApercu(silence){if(!S.vueRef)return;S.vueRef=null;$('apercuBar').hidden=true;if(!silence){poserCouches(S.ref);majMan();drawNums();if(S.onglet==='carte')accueil()}}
$('apercuFin').onclick=()=>finApercu();
async function rendreGenerer(){
  const p=$('pane-generer'),V=VI(S.ville),k=S.ville,keys=await ckeys(),E=await etatOsm(V,keys),M=await manuelles();if(k!==S.ville||S.onglet!=='generer')return;
  const nd=Object.keys(S.dec).length,nl=V.communes.filter(c=>Array.isArray(M[c.code])&&M[c.code].length).length,on=enLigne();
  const r=G.res&&G.res.ville===k?G.res:null;
  const etat=E.complet?`<div class="etat ok">${ICO.ok}<span>Toutes les rues d'OpenStreetMap de ${esc(V.nom)} sont sur cet appareil (${nf(E.total-2)} carreaux) : la génération marche <b>sans internet</b>.</span></div>`
    :E.have?`<div class="etat att">${ICO.att}<span>${nf(E.have)} morceaux sur ${nf(E.total)} sont sur cet appareil. ${on?'Le reste se télécharge pendant la génération.':'Connectez-vous pour télécharger le reste.'}</span></div>`
    :`<div class="etat att">${ICO.att}<span>Les rues d'OpenStreetMap de ${esc(V.nom)} ne sont pas encore sur cet appareil. ${on?'Elles se téléchargent pendant la première génération (3 à 15 minutes), puis restent ici.':'Connectez-vous une fois pour les télécharger.'}</span></div>`;
  const peut=E.complet||on;
  p.innerHTML=`<h2>Générer ${esc(V.nom)}</h2>
    <p class="lead">Refait le plan à partir d'OpenStreetMap, en gardant les codes, les numéros et les noms publiés${nd||nl?', avec ce qui a été décidé sur cet appareil':''}.</p>
    ${etat}
    ${nd||nl?`<div class="etat">${ICO.info}<span>Sera appliqué : ${[nd?pl(nd,'décision','décisions')+' sur les noms':'',nl?pl(nl,'limite tracée','limites tracées'):''].filter(Boolean).join(' et ')}.</span></div>`:''}
    <div class="bar"><i id="gBar" style="width:${Math.round((G.ville===k?G.bar:0)*100)}%"></i></div><div class="log" id="gLog" role="status">${esc(G.ville===k?G.log:'')||'Prêt.'}</div>
    <div class="row"><button class="btn primary" type="button" id="gGo"${G.en||!peut?' disabled':''}>${G.en?'Génération en cours…':E.complet?'Générer sans internet':'Télécharger et générer'}</button>${E.have&&on?`<button class="btn" type="button" id="gFrais"${G.en?' disabled':''}>Rues récentes d'OpenStreetMap</button>`:''}</div>
    ${r?resultat(r):''}
    <h3>Sur cet appareil</h3><div id="gApp"><p class="hint">Vérification…</p></div>
    <p class="hint" style="margin-top:14px"><a href="./${k==='conakry'?'':'?ville='+k}">Carte publique</a> · <a href="atelier.html${k==='conakry'?'':'?ville='+k}">Atelier classique</a></p>`;
  $('gGo').onclick=()=>generer(false);if($('gFrais'))$('gFrais').onclick=()=>generer(true);
  if(r){$('gVoir').onclick=voirApercu;$('gZip').onclick=async()=>{telecharger(await zipReferentiel(r.index,r.voies,r.sources),'referentiel-'+k+'-'+r.index.version.replace(/\./g,'')+'.zip');toast('Zip prêt : publiez le dossier data, ou envoyez le zip à Claude.')};
    $('gGeo').onclick=()=>{const fc={type:'FeatureCollection',features:r.voies.voies.map(v=>({type:'Feature',properties:{code:v.c,nom:v.n,ancien_nom:v.a||null,statut:v.st,personnalite:v.p||null,dedicace:v.b||null,commune:v.k,codes_postaux:v.q,numero_max:v.m},geometry:{type:'MultiLineString',coordinates:v.g.map(a=>D(a).map(p=>[p.lon,p.lat]))}}))};
      telecharger(new Blob([JSON.stringify(fc)],{type:'application/geo+json'}),'voies-'+k+'.geojson')}}
  appareil(keys);
}
const ICO={ok:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  att:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--warn)" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.5"/></svg>',
  info:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>'};
function resultat(r){
  const V=VI(r.ville),N=r.rapport.noms||{},Dc=N.decisions||{},w=r.rapport.avertissements||[];
  const rows=V.communes.map(c=>{const x=r.rapport.communes[c.code]||{};return`<tr><td>${esc(c.nom)}</td><td><span class="src ${!x.limite?'miss':/OpenStreetMap|officielle|plan/.test(x.limite)?'ok':'mid'}">${esc(x.limite||'absente')}</span></td><td class="num">${nf(x.voies)}</td></tr>`}).join('');
  return`<h3>Nouvelle version</h3>
    <div class="kpis"><div class="kpi"><b>${nf(r.index.stats.voies)}</b><span>rues</span></div><div class="kpi"><b>${nf(r.index.stats.quartiers)}</b><span>quartiers</span></div><div class="kpi"><b>${nf(r.index.stats.km)}</b><span>km</span></div></div>
    ${Dc.validees||Dc.renommees||Dc.refusees?`<p class="st">Décisions appliquées : ${nf(Dc.validees)} validée(s), ${nf(Dc.renommees)} renommée(s), ${nf(Dc.refusees)} refusée(s) (un autre nom proposé).</p>`:''}
    <table><thead><tr><th>Commune</th><th>Limite</th><th style="text-align:right">Rues</th></tr></thead><tbody>${rows}</tbody></table>
    ${w.length?`<details><summary class="hint" style="cursor:pointer;font-weight:600">${pl(w.length,'remarque','remarques')}</summary><ul class="warns">${w.map(x=>'<li>'+esc(x)+'</li>').join('')}</ul></details>`:''}
    <div class="row"><button class="btn" type="button" id="gVoir">Voir sur la carte</button><button class="btn primary" type="button" id="gZip">Télécharger le zip</button><button class="btn" type="button" id="gGeo">GeoJSON (QGIS)</button></div>
    <p class="hint">Le zip contient le dossier <code>data</code> à publier sur le site, comme celui de l'atelier.</p>`;
}
/* ce que l'appareil garde : l'appli, les plans publiés, les rues d'OpenStreetMap */
async function appareil(keys){
  const box=$('gApp');if(!box)return;
  const pub=new Set(S.publiees.map(v=>v.code)),K=new Set(keys),cache=window.caches;
  const rows=[];
  for(const k of ORDRE){const V=VI(k),E=await etatOsm(V,keys);
    let garde=false;if(cache&&pub.has(k))try{garde=!!(await cache.match(dossier(k)+'voies.json'))}catch(e){}
    rows.push(`<tr><td>${esc(V.nom)}</td><td>${pub.has(k)?(garde?'<span class="src ok">gardé</span>':`<button class="btn mini" type="button" data-g="${k}"${enLigne()?'':' disabled'}>Garder</button>`):'<span class="hint">pas publié</span>'}</td><td>${E.complet?'<span class="src ok">sur l\'appareil</span>':E.have?'<span class="src mid">'+Math.round(100*E.have/E.total)+' %</span>':'<span class="hint">—</span>'}</td></tr>`)}
  if(!$('gApp'))return;
  let usage='';try{if(navigator.storage&&navigator.storage.estimate){const e=await navigator.storage.estimate();usage=Math.max(1,Math.round((e.usage||0)/1048576))+' Mo utilisés sur cet appareil'}}catch(e){}
  let persist=false;try{persist=!!(navigator.storage&&navigator.storage.persisted&&await navigator.storage.persisted())}catch(e){}
  const sw=!!(navigator.serviceWorker&&navigator.serviceWorker.controller),app=await appliGardee();
  box.innerHTML=`<div class="etat${app?' ok':' att'}">${app?ICO.ok:ICO.att}<span>${app?'Le studio s\'ouvre <b>sans internet</b> sur cet appareil.':sw?'Préparation du mode hors ligne…':'Mode hors ligne : il se prépare à la première ouverture en ligne (navigateur récent, adresse en https).'}</span></div>
    <table><thead><tr><th>Ville</th><th>Plan publié</th><th>Rues OSM</th></tr></thead><tbody>${rows.join('')}</tbody></table>
    <p class="hint">${esc(usage)}${usage?' · ':''}${persist?'Données protégées : le navigateur ne les effacera pas.':'<button class="lien" type="button" id="gPersist" style="margin:0">Protéger les données de l\'appareil</button>'}</p>`;
  box.querySelectorAll('[data-g]').forEach(b=>b.onclick=async()=>{b.disabled=true;b.textContent='…';try{await garderVille(b.dataset.g);toast('Plan de '+VI(b.dataset.g).nom+' gardé pour le hors ligne.')}catch(e){toast('Échec : '+e.message)}rendreGenerer()});
  if($('gPersist'))$('gPersist').onclick=async()=>{let ok=false;try{ok=await navigator.storage.persist()}catch(e){}toast(ok?'Données protégées.':'Le navigateur n\'a pas accepté : installez le studio sur l\'écran d\'accueil, puis réessayez.');appareil(await ckeys())};
}
async function appliGardee(){try{return!!(navigator.serviceWorker&&navigator.serviceWorker.controller)&&(await caches.keys()).some(k=>k.startsWith('itina-geo-appli-'))}catch(e){return false}}
async function garderVille(k){
  const c=await caches.open('itina-geo-donnees'),d=dossier(k);
  const idx=await fetch(d+'index.json',{cache:'no-cache'});if(!idx.ok)throw new Error('plan introuvable');const j=await idx.clone().json();await c.put(d+'index.json',idx);
  for(const f of [j.fichiers.voies,j.fichiers.sources||'sources.json']){const r=await fetch(d+f,{cache:'no-cache'});if(r.ok)await c.put(d+f,r)}
}

/* =====================================================================
   5. HORS LIGNE : sw.js garde l'appli ; nouvelle version proposée quand elle est prête
   ===================================================================== */
if('serviceWorker' in navigator&&(location.protocol==='https:'||location.hostname==='localhost'||location.hostname==='127.0.0.1')){
  navigator.serviceWorker.register('sw.js').then(reg=>{
    const proposer=()=>{if(reg.waiting&&navigator.serviceWorker.controller)$('maj').hidden=false};
    proposer();
    reg.addEventListener('updatefound',()=>{const w=reg.installing;if(w)w.addEventListener('statechange',()=>{if(w.state==='installed')proposer();if(w.state==='activated'&&S.onglet==='generer')rendreGenerer()})});
    $('majGo').onclick=()=>{if(reg.waiting)reg.waiting.postMessage('activer');else location.reload()};
    setInterval(()=>{if(enLigne())reg.update().catch(()=>{})},60*60*1000);
  }).catch(()=>{});
  let recharge=false;navigator.serviceWorker.addEventListener('controllerchange',()=>{if(recharge)return;recharge=true;if(!$('maj').hidden)location.reload()});
}

/* ---------- démarrage ---------- */
(async()=>{
  try{const j=await fetch('data/villes.json').then(r=>r.ok?r.json():null);S.publiees=j&&Array.isArray(j.villes)?j.villes.filter(v=>v&&aVille(v.code)):[]}catch(e){S.publiees=[]}
  const q=new URLSearchParams(location.search).get('ville');let memo=null;try{memo=localStorage.getItem('itina-geo-ville')}catch(e){}
  const hv=villeDuCode(location.hash.slice(1));
  const k=aVille(q)?q:aVille(hv)?hv:aVille(memo)?memo:'conakry';
  const t=new URLSearchParams(location.search).get('onglet');
  onglet(ONGLETS.includes(t)?t:'carte',true);
  await ouvrirVille(k,{hash:location.hash.length>1?location.hash:''});
})().catch(e=>{$('status').innerHTML='<div><h3>Le studio ne peut pas démarrer</h3><p class="hint">'+esc(e.message||e)+'</p></div>';console.error(e)});
})();
