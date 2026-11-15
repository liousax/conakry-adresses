# Conakry Adresses · Guinée Maps

Plan d'adressage **provisoire** de la Guinée, pour les applis de livraison et de VTC, en attendant les plans officiels : la zone spéciale de Conakry (13 communes) et les 33 préfectures entières (commune urbaine, sous-préfectures et villages), rangées par région naturelle (Guinée maritime, Moyenne-Guinée, Haute-Guinée, Guinée forestière).

- **Mêmes règles que le plan de Kaloum** : un numéro tous les 10 m le long de la rue, impair à gauche et pair à droite, un code postal par quartier.
- **Kaloum à l'identique** : le plan figé de Kaloum est repris en lecture seule (`sources/kaloum-plan.json`). Les adresses de Kaloum sont les mêmes que dans l'appli agent et sur la carte de Kaloum.
- **Ailleurs** : chaque rue garde son nom d'usage (OpenStreetMap). Une rue sans nom, ou qui n'a qu'un numéro (« Rue DI 501 », « 5e Avenue »), reçoit un **nom proposé**, comme à Kaloum. Ces noms restent des propositions : nommer les rues revient aux communes et à l'État.
- **Projet séparé** : ce dépôt ne modifie rien sur le site de Kaloum (`liousax/kaloum-carte`).

## Les pages

| Page | Pour qui | Rôle |
|---|---|---|
| `guinee-maps.html` | tout le monde | **Guinée Maps** : l'adressage de tout le pays. Carte par région naturelle, plans en ligne, recherche d'une adresse (identifiant, Plus Code, coordonnées, « rue …, ville », sous-préfecture), fiche d'adresse à copier ou partager. Pas d'itinéraire : c'est le rôle d'Itina Geo |
| `index.html` | tout le monde | **Itina Geo**, la carte façon Waze (jour et nuit) : adresse d'une porte au toucher, recherche plein écran (et à la voix), domicile, travail, enregistrés et récents, itinéraire et bis avec l'heure d'arrivée, signalements de la route (embouteillage, accident, police, travaux, route inondée ou coupée, danger) gardés sur l'appareil et pris en compte par les trajets, guidage pas à pas avec la voix, appli installable qui marche sans internet |
| `choisir.html` | vos applis | Le client place un repère, l'appli reçoit l'adresse (iframe ou WebView) |
| `developpeurs.html` | développeurs | Mode d'emploi de la bibliothèque, avec démonstration |
| `atelier.html` | responsable du projet | Fabrique le référentiel de toute la ville depuis OpenStreetMap |
| `gestion-lieux.html` | équipe Itina Geo | **Lieux** : vérifier les établissements enregistrés depuis la carte (publier, refuser, appliquer une modification, signalements), charger les lieux d'OpenStreetMap et fabriquer `data/<ville>/lieux.json` |
| `studio.html` | responsable du projet, communes | **Itina Geo · Studio** : carte, adresses, guidage, noms des rues, limites des communes et génération, sur un seul écran, même sans internet |

## Noms des rues

1. **Kaloum** garde les noms de son plan figé, à l'identique.
2. **Les vrais noms** (OpenStreetMap, ou décidés par une commune) sont gardés.
3. **Toute autre rue reçoit une figure**, dans cet ordre : les fêtes et jours fériés guinéens (« Rue du 2 Octobre 1958 », « Avenue du 1er Mai »…), les figures historiques guinéennes (celles de la région naturelle du plan d'abord, en alternance avec les figures nationales), puis les figures historiques de l'Afrique de l'Ouest. Seulement des personnes disparues ; ni personne vivante, ni figure d'ailleurs.
4. **Répartition** : les grandes rues (avenues et voies principales d'au moins 100 m) portent une figure unique dans la ville. Les autres prennent une figure pas encore portée dans leur commune ; dans une grande commune, une figure peut revenir dans un autre quartier, jamais deux fois dans le même. Une figure déjà honorée par un vrai nom de rue n'est pas proposée.
5. **Type de voie** : Avenue pour les grands axes (comme à Kaloum), Impasse pour un cul-de-sac, Chemin pour une piste, Rue ailleurs. Une bretelle prend le nom de la route qu'elle dessert.
6. **Stabilité** : un nom publié est gardé d'une version à l'autre. Une rue renommée reçoit un nouveau code, mais son **ancien code reste reconnu** (`ac` dans `voies.json`) : un ancien identifiant (`GN-85011-SAULES-58`) ouvre la même porte, sous le nouveau nom, et l'adresse rendue porte `ancienId`.

La liste des noms est dans `lib/noms.js` : 11 fêtes, 82 figures guinéennes (avec leur région naturelle), 94 figures de l'Afrique de l'Ouest, et les 54 dédicaces du plan de Kaloum. Pour retirer ou ajouter un nom, modifiez ce fichier puis relancez le studio : les noms déjà publiés ne changent pas. `tools/renommer.js <data publié> <data de sortie>` renomme les plans publiés avec la liste actuelle (vrais noms, noms officiels et Kaloum gardés). Le studio fournit aussi le tableau des noms proposés (CSV pour Excel), à soumettre aux communes.

Une rue sans nom qui traverse plusieurs carrefours tout droit reste une seule rue, avec un seul nom et une seule numérotation.

## Codes postaux

| Commune | Code | Commune | Code |
|---|---|---|---|
| Kaloum | 88000 | Lambanyi | 88600 |
| Dixinn | 88100 | Sonfonia | 88700 |
| Matam | 88200 | Gbessia | 88800 |
| Ratoma | 88300 | Tombolia | 88900 |
| Matoto | 88400 | Kagbélen | 89000 |
| Kassa | 88500 | Manéah | 89100 |
| | | Sanoyah | 89200 |

Chaque quartier prend le code de sa commune plus son numéro, d'ouest en est (88101, 88102…). Kaloum garde ses codes : 88001 Almamiya, 88002 Manquepas, 88003 Cité Petit Bateau.

**Préfectures** (cadre national, `tools/guinee.py`) : deux chiffres pour la région (81 Boké, 82 Faranah, 83 Kankan, 84 Kindia, 85 Labé, 86 Mamou, 87 N'Zérékoré), un pour la préfecture (0 pour le chef-lieu de région, puis par ordre alphabétique : 850 Labé, 851 Koubia, 852 Lélouma, 853 Mali, 854 Tougué), puis deux :

| Fin du code | Lieu | Exemple (Labé) |
|---|---|---|
| 00 | commune urbaine | 85000 Labé |
| 01 à 79 | un quartier de la commune urbaine | 85011 Mairie |
| 80 à 99 | une sous-préfecture, un code partagé par tous ses villages | 85080 Dalein, 85091 Tountouroun |

Les communes de Coyah et de Dubréka rattachées à la zone spéciale (Manéah, Kagbélen, Sanoyah) restent dans le plan de Conakry (89…). Chaque commune a un code de trois lettres unique dans tout le pays (LAB, DLN…).

Identifiant d'une porte : `GN-<code postal du quartier>-<code de la voie>-<numéro>`, par exemple `GN-88001-3AVRIL1984-98`. Le code de la voie vient de son nom (`MANGUIERS`, `CAMARALAYE`). Si le même nom existe dans une autre commune, le code de la commune s'y ajoute (`MANGUIERSRAT`).

Les numéros sont calculés d'après le plan (environ un numéro tous les 10 m) : la carte les indique comme estimés, à confirmer sur place. Le statut « officiel » d'une voie concerne son nom, pas ses numéros.

Lien d'une adresse : `?ville=<ville>#<identifiant>@<lat>,<lng>`, par exemple `?ville=conakry#GN-88001-3AVRIL1984-98@9.512345,-13.712345` : la ville, l'identifiant et la position exacte de l'épingle. Celui qui ouvre le lien voit le point choisi, pas le point recalculé pour le numéro, et le même nom de rue et numéro tant que l'identifiant désigne cet endroit. Les liens `#GN-…` seuls (applis, anciens liens) et `#<lat>,<lng>` restent acceptés. Un identifiant ouvre toujours le plan de sa préfecture (`GN-850…` : Labé, `GN-862…` : Pita), même si le lien dit une autre ville ; une position, celui de la préfecture qui la contient.

`index.json` (et la bibliothèque) contient les communes, les quartiers et les limites. `voies.json` contient chaque voie : code `c`, nom `n`, ancien nom ou numéro `a`, statut `st` (`officiel`, `usage`, `propose`, `a_nommer`), personnalité et dédicace `p` et `b`, commune `k`, codes postaux `q`, départ de la numérotation `d`, tracé `g`, anciens codes `ac`.

`data/villes.json` liste les plans publiés : `code`, `nom`, `dossier`, préfixe des codes postaux `cp` (88 pour Conakry, 3 chiffres pour une préfecture), `region`, `naturelle`, `centre`, carré `bbox` [sud, ouest, nord, est], chiffres `stats` (rues, quartiers, km), `version`, et `prefecture: true` quand le plan couvre la préfecture entière. `data/guinee.json` est le cadre national : régions naturelles, régions, préfectures et sous-préfectures avec leurs codes postaux et leurs limites officielles (geoBoundaries, PAM, OCHA ; liste des sous-préfectures de l'INS, RGPH 2014). `lib/guinee.js` en est la version sans les limites, pour les pages.

## Guinée Maps (`guinee-maps.html`)

La carte d'adressage de tout le pays. Elle montre les 34 plans par région naturelle (plus foncés quand ils sont en ligne), cherche une adresse dans toute la Guinée et en donne la fiche : identifiant, Plus Code, coordonnées, nom de la rue et sa dédicace, avec « Copier l'adresse » et « Partager ». Toucher la carte donne l'adresse du lieu, ou son Plus Code là où le plan n'est pas encore en ligne. Boutons + et − pour zoomer. Elle ne propose pas d'itinéraire.

Guinée Maps, Itina Geo, le studio et Itina Geo Connect lisent le même dossier `data` : publier un plan le met à jour partout. Itina Geo vérifie régulièrement la version du plan affiché et propose « Mettre à jour » quand une nouvelle version est publiée.

## Studio Itina Geo (`studio.html`)

Le studio réunit la carte, l'atelier et la revue des noms, pour les 34 plans (menu par région naturelle). Il s'installe comme une appli (« Ajouter à l'écran d'accueil ») et marche sans internet après la première ouverture : `sw.js` garde le studio et les plans en ligne (tous tant qu'ils tiennent en 15 Mo, sinon Conakry et ceux déjà ouverts) ; les rues d'OpenStreetMap déjà téléchargées, les limites tracées et les décisions restent dans la mémoire de l'appareil, la même que celle de l'atelier.

- **Carte** : adresse d'une porte au toucher, « Où suis-je ? », recherche, itinéraire et guidage.
- **Rues** : les communes valident, renomment (nom libre, ou figure de la liste : libre dans la commune, ou déjà portée ailleurs mais pas dans ce quartier) ou refusent les noms proposés. Le code de la voie ne change pas, donc les identifiants d'adresse non plus. Exports : tableau pour la commune (CSV), référentiel avec les décisions (zip).
- **Limites** : tracer ou corriger la limite d'une commune ou d'une sous-préfecture ; elle sert à la prochaine génération.
- **Générer** : refait le plan affiché, sans internet si les rues sont déjà sur l'appareil ; aperçu sur la carte, zip, GeoJSON.
- **Tout le pays** : fabrique à la suite Conakry et les 33 préfectures entières, puis un seul zip (`data` complet et `villes.json`). Chaque plan fini reste sur l'appareil : après une coupure, « Continuer » reprend au plan suivant. Les carreaux d'OpenStreetMap suivent une grille fixe : un carreau partagé par deux préfectures n'est téléchargé qu'une fois (482 pour tout le pays).

Les décisions publiées sont gardées dans `sources.json` (`decisions`) : un nom validé ou choisi par la commune devient officiel et passe avant OpenStreetMap ; un nom refusé est retiré pour de bon et la rue reçoit un autre nom proposé.

## Mettre à jour le référentiel

1. Ouvrir le studio (`studio.html`, onglet Générer) sur un ordinateur connecté : « Télécharger et générer » pour un plan, ou « Fabriquer tout le pays » pour les 34. L'atelier classique (`atelier.html`) fait la même chose plan par plan.
2. Vérifier le tableau : limites trouvées, quartiers, nombre de voies par commune.
3. Télécharger le zip et publier le dossier `data` dans ce dépôt.

Les noms, codes de voie, codes postaux et points de départ de la numérotation déjà publiés sont conservés d'une version à l'autre (`data/sources.json`). `node tools/villes.js data` refait `data/villes.json` à partir des plans présents ; `python3 -I tools/guinee.py <gin_adm3.geojson> .` refait le cadre national (`data/guinee.json`, `src/guinee.js`) à partir des limites de geoBoundaries.

## Licence

Rues © contributeurs OpenStreetMap, licence ODbL : citer « © OpenStreetMap » dans les applis.

Limites des communes absentes d'OpenStreetMap (`sources/limites-officielles.json`) : [geoBoundaries](https://www.geoboundaries.org), d'après le Programme alimentaire mondial et OCHA (2023), licence CC BY 3.0 IGO. Elles ne servent que si OpenStreetMap n'a pas la limite et qu'aucune limite n'a été tracée dans l'atelier ; la carte les cite alors dans ses sources.

Bibliothèques incluses : voir `lib/LICENCES.txt`.

## Lieux (établissements)

Les boutiques, entreprises, écoles, hôpitaux, institutions, stations-service… s'enregistrent eux-mêmes sur la carte (« Ajouter un lieu ») ; l'équipe vérifie chaque fiche avant qu'elle soit visible par tous, avec son icône, ses horaires, son téléphone, WhatsApp et l'itinéraire, comme sur Google Maps.

- `sdk/lieux.js` (`GeoLieux`) : catégories, vérification des fiches, horaires (« Ouvert · ferme à 20:00 », heure de Conakry), recherche par nom ou par catégorie (« pharmacie »), import OpenStreetMap. Le même module vérifie les fiches dans Itina Geo Connect.
- `data/<ville>/lieux.json` (Conakry : `data/lieux.json`) : les lieux publiés, fabriqués par `gestion-lieux.html` (lieux d'OpenStreetMap + fiches vérifiées). La carte les montre même sans internet.
- Photos : le propriétaire en ajoute jusqu'à 8 (devanture, intérieur, produits). Le téléphone les réduit et les réenregistre (la position GPS et le modèle du téléphone disparaissent) ; elles attendent sur le téléphone sans réseau. L'équipe vérifie chaque photo avant qu'elle soit visible ; les photos vérifiées sont dans l'espace de stockage public du service (`photos` dans `lieux.json`).
- `data/connect.json` : l'adresse du service des lieux d'Itina Geo Connect et la clé **publique** du projet Supabase (jamais la clé d'administration) ; sans ce fichier, les fiches restent sur le téléphone qui les a envoyées.
