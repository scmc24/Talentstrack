# TalentsTrack

Suivi des parcours de jeunes sportifs au Cameroun.


## Lancer en local

Un seul projet, un seul serveur. Les pages et les services sont servis par le
même Worker.

```bash
npm install
cp .dev.vars.exemple .dev.vars          # renseigner SEL_MOT_DE_PASSE
npm run db:local                        # schéma, référentiels, démonstration
npm run dev                             # http://localhost:3000
```

Pour éprouver le Worker tel qu'il sera déployé, plutôt que le serveur de
développement de Next :

```bash
npm run apercu
```

### Premier pas

Deux comptes de démonstration, créés par `db/demo.sql` :

```
Administrateur : admin@talentstrack.local / motdepasse123
Encadrant      : coach@talentstrack.local / motdepasse123
```

Avec le compte **encadrant**, enregistrez une étape. Il est rattaché à
l'académie Wildcats : ses saisies dans cette structure sont attestées
d'emblée, celles effectuées ailleurs restent reconstituées.

Avec le compte **administrateur**, l'onglet Administration donne accès aux
territoires, aux structures et aux comptes.

## Déployer

```bash
wrangler login
wrangler d1 create talentstrack        # reporter database_id dans wrangler.jsonc
wrangler r2 bucket create talentstrack-fichiers
npm run db:distant                     # schéma et référentiels
wrangler secret put SEL_MOT_DE_PASSE   # chaîne aléatoire longue
npm run deployer
```

Vérifiez tout de suite que les déclencheurs et les vues ont survécu au
découpage du fichier par Wrangler :

```bash
wrangler d1 execute talentstrack --remote \
  --command "SELECT type, name FROM sqlite_master WHERE type IN ('trigger','view')"
```

Sept lignes attendues : deux déclencheurs, cinq vues. Ce point a été vérifié
en local, où tout passe, mais la base distante reste le juge.

### Créer le premier administrateur

Sans lui, personne ne peut compléter le découpage territorial ni rattacher
d'encadrant à sa structure.

Le mot de passe ne se fabrique pas depuis un poste de travail : il faut
laisser le service le hacher lui-même, avec le sel de production. Deux étapes
suffisent.

**1. S'inscrire depuis le site**, sur la page d'inscription, en choisissant le
rôle d'encadrant. Le compte est créé et le mot de passe haché avec le bon sel.

**2. Élever ce compte :**

```bash
npm run admin:promouvoir -- votre.adresse@exemple.cm
```

Rechargez ensuite la page. Le rôle est relu à chaque requête, aucune
reconnexion n'est nécessaire, et l'onglet Administration apparaît.

Ajoutez `--local` pour agir sur la base de développement plutôt que sur celle
de production.

Ne tentez pas de calculer le hachage hors du service : cela obligerait à
recopier le sel de production sur un poste de travail, et un hachage produit
avec un sel différent est silencieusement refusé à la connexion.

## La page de présentation

L'adresse racine sert deux pages selon l'état de la session : la présentation
pour un visiteur, l'effectif pour une personne connectée.

La présentation expose le problème avant la solution. Un visiteur qui arrive
sur « plateforme de suivi des jeunes talents » sans comprendre ce qui manque
aujourd'hui range mentalement l'outil parmi les annuaires sportifs, dont il
connaît l'inefficacité. Les sections suivent donc cet ordre : le problème,
puis le concept des trois traces, puis les usages par public, puis les partis
pris.

Aucun chiffre n'y figure. Les enquêtes menées sont exploratoires, et une
statistique avancée sur une page publique se retourne au premier
interlocuteur qui en demande la source.

Le fond reprend des courbes de niveau plutôt qu'une photographie de stade :
c'est la dimension géomatique du projet, et c'est ce qui distingue cette
plateforme d'un annuaire. Il est engendré en SVG par marching squares sur un
champ lisse, avec une courbe sur deux appuyée comme sur une carte. Vingt-six
kilo-octets, net à toute taille, là où une image de banque en pèserait
plusieurs centaines — ce qui compte quand le coût des données est cité comme
un obstacle par les acteurs du milieu.

Enfin, la navigation applicative n'apparaît qu'une fois connecté, et elle
s'adapte au rôle. Proposer « Nouvelle étape » à un visiteur l'envoie vers un
écran qui le rejette, ce qui donne l'impression d'un site cassé plutôt que
protégé.

## Fichiers : logos, photos, pièces jointes

Le contenu vit dans le stockage d'objets, la base ne garde que la référence.
Une image dans une colonne alourdirait chaque lecture de la ligne qui la
contient, y compris quand on ne veut que le nom.

Quatre usages : le **logo** d'une structure, la **photo** d'une personne, les
**pièces** jointes à une étape (attestations, diplômes, images) et les
**vidéos**. Le rattachement est générique plutôt que réparti sur trois
tables : les règles d'envoi, de taille et de suppression sont les mêmes pour
tous, et les dupliquer garantirait qu'elles divergent.

Les images sont réduites par le navigateur avant l'envoi. Les documents ne le
sont pas : une attestation scannée doit rester lisible, et la réduire la
rendrait inexploitable comme pièce justificative.

**Qui peut attacher quoi.** Un encadrant gère le logo de sa structure, pas
celui d'une autre, et la photo des sportifs qu'il suit effectivement. Le
sportif peut joindre une pièce à son propre parcours, car une attestation de
tournoi est souvent entre ses mains plutôt qu'entre celles de son club. Il ne
modifie pour autant aucune étape.

**Aucun fichier n'est public, sauf les logos des structures vérifiées.** Ceux-ci
figurent sur la page de présentation, qui s'adresse à des visiteurs non
connectés. Photographies de personnes et pièces nominatives restent fermées,
sans exception : il s'agit en grande partie de mineurs.

La rubrique des partenaires ne liste que les structures vérifiées et dotées
d'un logo, et disparaît entièrement s'il n'y en a aucune. Une rubrique
« partenaires » vide fait plus de tort que son absence, et une rubrique
remplie de noms saisis à la volée afficherait des établissements qui n'ont
jamais donné leur accord.

## Installation sur téléphone

L'application s'installe depuis le navigateur, sans passer par une boutique
d'applications. Le navigateur lit le manifeste, propose l'ajout à l'écran
d'accueil, et l'application s'ouvre ensuite sans barre d'adresse.

Trois conditions sont remplies pour cela : le manifeste déclare un nom, des
icônes et un mode d'affichage ; un agent de service est enregistré et traite
les requêtes ; et le service est servi en connexion sécurisée, ce qui est le
cas une fois déployé.

L'agent de service ne met rien en cache des pages ni des services. Elles
dépendent de la session et des droits de la personne connectée : les
conserver reviendrait à servir l'effectif d'une structure à quelqu'un
d'autre, ou à afficher des données retirées depuis. Il ne garde que les
icônes et une page d'excuse affichée en l'absence de réseau.

La proposition d'installation n'apparaît pas d'emblée, mais après quelques
secondes d'usage. Proposer d'installer un outil avant de l'avoir montré
obtient un refus, et ce refus empêche le navigateur de reproposer avant
plusieurs mois.

## Charte visuelle

Les fichiers de marque sont dans `public/` :

| Fichier | Usage |
| --- | --- |
| `logo-entete.png` | En-tête et pied de page, 76 px de haut |
| `logo-accueil.png` | Page de présentation, 880 px de large |
| `logo-horizontal.png` | Pleine résolution, pour l'impression et les documents |
| `embleme.png` | Symbole seul, détouré |
| `icone-192.png`, `icone-512.png` | Icônes d'application |
| `icone-512-masquable.png` | Icône avec marge, pour les systèmes qui rognent |
| `apple-touch-icon.png` | Icône iOS |
| `favicon.ico` | Onglet du navigateur |
| `partage.png` | Aperçu lors d'un partage de lien |

Les fichiers d'origine étaient sur fond noir opaque. Ils ont été détourés en
défaisant la composition sur noir, ce qui préserve le dégradé cuivré là où un
simple seuillage l'aurait entamé.

## Référencement

Une seule page est ouverte aux moteurs : la présentation. Les pages de
parcours, de saisie, d'évaluation et d'administration sont fermées, car elles
portent des informations nominatives concernant en grande partie des mineurs.

La fermeture repose sur trois niveaux, car le premier seul ne suffirait pas.

Le fichier `robots.txt` indique aux moteurs ce qu'ils ne doivent pas
parcourir. Un moteur peut l'ignorer, et une adresse partagée dans une
conversation échappe de toute façon à cette liste.

Chaque page privée porte donc elle-même une balise interdisant son
indexation, lue par un moteur qui atteindrait l'adresse par un lien.

Les services ajoutent enfin un en-tête équivalent à toutes leurs réponses, y
compris les fichiers joints, qu'aucune balise ne pourrait porter.

La protection réelle reste l'authentification : sans session, ces pages ne
renvoient aucun contenu. Ces trois niveaux évitent qu'une adresse figure dans
des résultats de recherche, ils ne remplacent pas le contrôle des droits.

Le plan du site ne liste que les pages publiques. Y faire figurer une page de
parcours reviendrait à communiquer aux moteurs une adresse qu'ils n'auraient
jamais découverte, puisque aucun lien public n'y mène.

La page de présentation porte des données structurées décrivant la plateforme,
un titre et une description propres, une adresse canonique, et un aperçu de
partage de 1200 par 630 pixels.

Avant le déploiement, renseignez `NEXT_PUBLIC_SITE` dans `wrangler.jsonc` avec
le domaine réel : il construit les adresses canoniques et celles du plan du
site.

## Architecture

Un seul Worker sert les pages et les services.

Cette fusion n'est pas une commodité de déploiement. Elle supprime trois
choses : le partage d'origine entre deux domaines, un cookie de session en
`SameSite=None` — qui expose à des attaques inter-sites dont `Lax` protège,
ce qui compte sur une base contenant des données de mineurs — et un saut
réseau entre le site et les services.

Elle apporte surtout le rendu des pages avec leurs données. En site statique,
l'enchaînement était : charger la coquille, charger le script, appeler les
services, afficher. Trois allers-retours avant le premier contenu utile. La
page d'accueil interroge désormais la base directement et arrive remplie.

Le code métier reste dans `src/api`, écrit sur l'objet `Request` standard et
monté sous `/api` par `app/api/[[...route]]/route.ts`, qui retire le préfixe
avant de le lui passer. Le module ne sait donc rien de l'endroit où il est
branché : c'est ce qui permet aux 215 assertions de s'exécuter contre lui sans
Worker ni réseau, et ce qui permettrait de le déplacer sans réécrire une
route.

## Organisation

```
db/schema.sql      structure de la base, source de vérité
db/seed.sql        référentiels : territoires, disciplines, postes
db/demo.sql        jeu de démonstration
src/api/           services : parcours, évaluations, grades, analyses, comptes
app/               pages, et montage des services sous /api
lib/               client des services, et accès base pour le rendu serveur
composants/        éléments partagés entre les pages
scripts/           contrôles et tests
tsconfig.json      vérification de types du code applicatif
```

## Ce qui reste à faire avant une mise en service

**L'authentification.** L'identification passe aujourd'hui par un en-tête
portant l'identifiant du compte. Les règles de droits, elles, sont
définitives : seul un encadrant de la structure concernée peut attester une
étape.

**Le rattachement des encadrants.** Il se déduit pour l'instant de la dernière
attestation, ce qui laisse sans structure un encadrant qui n'a rien attesté.
Une table d'appartenance explicite serait plus solide.

**Le référentiel territorial.** Dix régions et quelques arrondissements
urbains, avec des centres approximatifs. À remplacer par une source officielle
avant toute exploitation analytique : une carte de densité bâtie sur des
valeurs approximatives est plus trompeuse qu'une absence de carte.

**Les nomenclatures.** Types de structure, modes de transition, motifs
d'arrêt : construits à partir de l'enquête préalable, ils décident de ce que
l'analyse pourra dire. Ils gagneraient à passer sous les yeux d'un entraîneur.
