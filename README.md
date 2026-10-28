# Conakry Adresses

Plan d'adressage **provisoire** de la zone spéciale de Conakry (13 communes), pour les applis de livraison et de VTC, en attendant les plans officiels.

- **Mêmes règles que le plan de Kaloum** : un numéro tous les 10 m le long de la rue, impair à gauche et pair à droite, un code postal par quartier.
- **Kaloum à l'identique** : le plan figé de Kaloum est repris en lecture seule (`sources/kaloum-plan.json`). Les adresses de Kaloum sont les mêmes que dans l'appli agent et sur la carte de Kaloum.
- **Ailleurs** : chaque rue garde son nom d'usage (OpenStreetMap). Une rue sans nom, ou qui n'a qu'un numéro (« Rue DI 501 », « 5e Avenue »), reçoit un **nom proposé**, comme à Kaloum. Ces noms restent des propositions : nommer les rues revient aux communes et à l'État.
- **Projet séparé** : ce dépôt ne modifie rien sur le site de Kaloum (`liousax/kaloum-carte`).

## Les pages

| Page | Pour qui | Rôle |
|---|---|---|
| `index.html` | tout le monde | Carte de Conakry : adresse d'une porte au toucher, recherche, itinéraire |
| `choisir.html` | vos applis | Le client place un repère, l'appli reçoit l'adresse (iframe ou WebView) |
| `developpeurs.html` | développeurs | Mode d'emploi de la bibliothèque, avec démonstration |
| `atelier.html` | responsable du projet | Fabrique le référentiel de toute la ville depuis OpenStreetMap |

## Noms des rues

Même démarche que le plan de Kaloum :

1. **Grandes rues** : le nom d'une personnalité, guinéenne d'abord, puis africaine, puis du reste du monde. Une personnalité n'est honorée qu'une fois dans toute la ville. Celles qui ont déjà une rue (à Kaloum ou ailleurs) sont écartées : Samory Touré, M'Balia Camara, Diallo Telly…
2. **Autres rues** : un nom pris dans des séries. Villes et villages de Guinée, fleuves et monts, arbres et fleurs, oiseaux, métiers, savoirs, villes d'Afrique et du monde… Un nom ne revient jamais deux fois dans la même commune, et deux noms qui se ressemblent (« des Saules », « des Sauges ») ne s'y côtoient pas non plus. Les rues d'un même quartier prennent le plus souvent leurs noms dans une même série.
3. **Type de voie** : Avenue pour les grands axes (comme à Kaloum), Impasse pour un cul-de-sac, Chemin pour une piste, Rue ailleurs. Une bretelle prend le nom de la route qu'elle dessert.
4. **Stabilité** : un nom publié est gardé d'une version à l'autre. L'ancien numéro reste reconnu par la recherche. Un nom abandonné (rue disparue d'OpenStreetMap) n'est jamais redonné dans la commune.

La liste des noms est dans `lib/noms.js` : 500 personnalités, dont les 121 de la carte de Kaloum, et plus de 2 000 noms de séries. Pour retirer ou ajouter un nom, modifiez ce fichier puis relancez l'atelier : les noms déjà publiés ne changent pas. L'atelier fournit aussi le tableau des noms proposés (CSV pour Excel), à soumettre aux communes.

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

Identifiant d'une porte : `GN-<code postal du quartier>-<code de la voie>-<numéro>`, par exemple `GN-88001-3AVRIL1984-98`. Le code de la voie vient de son nom (`MANGUIERS`, `CAMARALAYE`). Si le même nom existe dans une autre commune, le code de la commune s'y ajoute (`MANGUIERSRAT`).

`index.json` (et la bibliothèque) contient les communes, les quartiers et les limites. `voies.json` contient chaque voie : code `c`, nom `n`, ancien nom ou numéro `a`, statut `st` (`officiel`, `usage`, `propose`, `a_nommer`), personnalité et dédicace `p` et `b`, commune `k`, codes postaux `q`, départ de la numérotation `d`, tracé `g`.

## Mettre à jour le référentiel

1. Ouvrir `atelier.html` sur un ordinateur connecté, cliquer sur « Télécharger depuis OpenStreetMap ».
2. Vérifier le tableau : limites trouvées, quartiers, nombre de voies par commune.
3. Télécharger le zip et publier le dossier `data` dans ce dépôt.

Les noms, codes de voie, codes postaux et points de départ de la numérotation déjà publiés sont conservés d'une version à l'autre (`data/sources.json`).

## Licence

Rues © contributeurs OpenStreetMap, licence ODbL : citer « © OpenStreetMap » dans les applis. Bibliothèques incluses : voir `lib/LICENCES.txt`.
