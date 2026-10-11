-- =====================================================================
-- Plateforme de traçabilité des parcours sportifs — schéma D1
--
-- Trois natures de trace, et c'est ce qui structure tout :
--   le SOCLE      : d'où part le sportif, état initial daté une fois ;
--   les ÉTAPES    : où il est, quand, avec qui ;
--   les TRANSITIONS : comment il est passé de l'une à l'autre.
--
-- La transition est un objet à part entière, pas un attribut de l'étape.
-- C'est elle qui porte « recommandé par un entraîneur », « vu jouer dans
-- la rue » — l'information que ni l'étape d'avant ni celle d'après ne
-- contiennent, et celle qui permet de cartographier les modes de détection.
--
-- Conventions : identifiants TEXT (UUID), dates ISO-8601 (T et Z), pas de
-- type géométrie. Voir le commentaire sur unites_admin pour la stratégie
-- spatiale.
-- =====================================================================

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------
-- Référentiel géographique
-- ---------------------------------------------------------------------
-- D1 n'a ni type géométrie, ni index spatial, ni point-dans-polygone. La
-- stratégie retenue inverse le problème : plutôt que de calculer dans quelle
-- commune tombe un point, on RATTACHE chaque objet à une unité choisie dans
-- une liste au moment de la saisie. Un entraîneur sait dans quel
-- arrondissement se trouve son club.
--
-- Conséquence : toute l'analyse territoriale — densité de talents, carence
-- de structures, flux entre régions — devient un GROUP BY ordinaire. Seules
-- les recherches « à moins de N km » utilisent les coordonnées, par
-- encadrement rectangulaire puis calcul exact côté applicatif.
CREATE TABLE unites_admin (
  id         TEXT PRIMARY KEY,
  code       TEXT NOT NULL UNIQUE,      -- code officiel, ex. CM-CE-MFO-YDE1
  nom        TEXT NOT NULL,
  niveau     TEXT NOT NULL CHECK (niveau IN ('pays','region','departement','arrondissement')),
  parent_id  TEXT REFERENCES unites_admin(id),
  -- Centroïde : sert à positionner une unité sur une carte et à mesurer des
  -- distances entre territoires. Ce n'est pas la position d'un objet réel.
  lat        REAL,
  lon        REAL,
  population INTEGER,                   -- pour rapporter les effectifs à la population
  actif      INTEGER NOT NULL DEFAULT 1 CHECK (actif IN (0,1))
);

CREATE INDEX idx_unites_parent ON unites_admin(parent_id);
CREATE INDEX idx_unites_niveau ON unites_admin(niveau);

-- ---------------------------------------------------------------------
-- Disciplines
-- ---------------------------------------------------------------------
-- Le multi-sport est une dimension, pas une abstraction. On garde le
-- vocabulaire propre à chaque discipline (postes, mesures) plutôt qu'un
-- modèle générique qui ne parlerait bien à personne.
CREATE TABLE disciplines (
  id     TEXT PRIMARY KEY,
  nom    TEXT NOT NULL UNIQUE,
  -- Le type commande ce que l'interface demande et ce que la progression
  -- signifie. Un sport collectif a des postes ; un sport de combat a des
  -- grades et des catégories de poids, et aucun poste. Traiter les deux de la
  -- même façon obligerait à demander un poste à un judoka.
  type   TEXT NOT NULL DEFAULT 'collectif'
         CHECK (type IN ('collectif','individuel','combat')),
  -- Déclarés séparément du type plutôt que déduits : l'athlétisme est
  -- individuel sans grades, le karaté en a, et les exceptions existeront.
  avec_postes     INTEGER NOT NULL DEFAULT 1 CHECK (avec_postes IN (0,1)),
  avec_grades     INTEGER NOT NULL DEFAULT 0 CHECK (avec_grades IN (0,1)),
  avec_categories INTEGER NOT NULL DEFAULT 0 CHECK (avec_categories IN (0,1)),
  actif  INTEGER NOT NULL DEFAULT 1 CHECK (actif IN (0,1))
);

-- Grades : le second axe de progression.
--
-- En sport collectif, la progression se lit dans la suite des structures, du
-- quartier au professionnel. En sport de combat, elle se lit d'abord dans le
-- grade : un ceinture noire d'un petit club a plus progressé qu'un ceinture
-- verte d'un grand club. Sans cette table, le modèle ne saurait rien dire du
-- parcours d'un judoka.
CREATE TABLE grades (
  id            TEXT PRIMARY KEY,
  discipline_id TEXT NOT NULL REFERENCES disciplines(id),
  nom           TEXT NOT NULL,
  abrege        TEXT NOT NULL DEFAULT '',
  -- L'ordre fait la progression : il permet de dire qu'un grade obtenu est
  -- supérieur au précédent sans que chaque requête ait à connaître la
  -- hiérarchie des ceintures.
  ordre         INTEGER NOT NULL,
  couleur_hex   TEXT,
  UNIQUE (discipline_id, nom)
);

CREATE INDEX idx_grades_discipline ON grades(discipline_id, ordre);

-- Grade obtenu par un sportif.
--
-- C'est la trace la plus solide du modèle : un grade est délivré à une date
-- précise par une autorité identifiée, et il est vérifiable auprès d'elle.
-- Là où l'attestation d'une étape repose sur le jugement d'un encadrant, un
-- grade repose sur un examen.
CREATE TABLE grades_obtenus (
  id            TEXT PRIMARY KEY,
  sportif_id    TEXT NOT NULL REFERENCES sportifs(personne_id) ON DELETE CASCADE,
  grade_id      TEXT NOT NULL REFERENCES grades(id),
  date_obtention TEXT NOT NULL,
  -- Qui l'a délivré : fédération, ligue, club habilité. Un grade sans
  -- autorité n'est pas un grade, c'est une déclaration.
  autorite      TEXT NOT NULL DEFAULT '',
  unite_id      TEXT REFERENCES unites_admin(id),
  numero_diplome TEXT NOT NULL DEFAULT '',
  fiabilite     TEXT NOT NULL DEFAULT 'reconstituee'
                CHECK (fiabilite IN ('declaree','reconstituee','attestee')),
  atteste_par   TEXT REFERENCES personnes(id),
  atteste_le    TEXT,
  cree_le       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE (sportif_id, grade_id)
);

CREATE INDEX idx_grades_obtenus_sportif ON grades_obtenus(sportif_id, date_obtention);

-- Catégories de poids.
--
-- Elles dépendent de la discipline, du sexe et de la tranche d'âge : les
-- catégories cadets ne sont pas celles des seniors. Les trois sont donc
-- portées par la ligne.
CREATE TABLE categories_poids (
  id            TEXT PRIMARY KEY,
  discipline_id TEXT NOT NULL REFERENCES disciplines(id),
  sexe          TEXT NOT NULL CHECK (sexe IN ('F','M','mixte')),
  tranche_age   TEXT NOT NULL DEFAULT 'senior',
  nom           TEXT NOT NULL,
  mini_kg       REAL,
  maxi_kg       REAL,
  ordre         INTEGER NOT NULL DEFAULT 0,
  UNIQUE (discipline_id, sexe, tranche_age, nom)
);

CREATE INDEX idx_categories_discipline ON categories_poids(discipline_id, sexe, tranche_age, ordre);

-- Appartenance à une catégorie, datée.
--
-- Un judoka change de catégorie en cours de saison, parfois d'une compétition
-- à l'autre. Stocker la catégorie comme un attribut du sportif effacerait
-- cette histoire, alors qu'elle renseigne sur sa trajectoire physique autant
-- que sur son éligibilité passée.
CREATE TABLE appartenances_poids (
  id          TEXT PRIMARY KEY,
  sportif_id  TEXT NOT NULL REFERENCES sportifs(personne_id) ON DELETE CASCADE,
  categorie_id TEXT NOT NULL REFERENCES categories_poids(id),
  debut       TEXT NOT NULL,
  fin         TEXT,
  cree_le     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE INDEX idx_appartenances_sportif ON appartenances_poids(sportif_id, debut DESC);

CREATE TABLE postes (
  id            TEXT PRIMARY KEY,
  discipline_id TEXT NOT NULL REFERENCES disciplines(id),
  nom           TEXT NOT NULL,
  ordre         INTEGER NOT NULL DEFAULT 0,
  UNIQUE (discipline_id, nom)
);

-- ---------------------------------------------------------------------
-- Structures
-- ---------------------------------------------------------------------
-- Le « type » est ordonné volontairement : c'est lui qui définit ce qu'est
-- une progression. Passer d'un terrain de quartier à une académie est une
-- montée ; l'inverse est une rupture. Le champ « rang » matérialise cet
-- ordre pour que l'analyse n'ait pas à le réinventer.
CREATE TABLE types_structure (
  id    TEXT PRIMARY KEY,
  nom   TEXT NOT NULL UNIQUE,
  rang  INTEGER NOT NULL,               -- 1 = informel … 7 = professionnel
  formel INTEGER NOT NULL DEFAULT 1 CHECK (formel IN (0,1))
);

CREATE TABLE structures (
  id         TEXT PRIMARY KEY,
  nom        TEXT NOT NULL,
  type_id    TEXT NOT NULL REFERENCES types_structure(id),
  unite_id   TEXT NOT NULL REFERENCES unites_admin(id),
  lat        REAL,
  lon        REAL,
  adresse    TEXT NOT NULL DEFAULT '',
  contact    TEXT NOT NULL DEFAULT '',
  -- Une structure déclarée par un joueur n'a pas le même statut qu'une
  -- structure qui s'est inscrite et que l'on peut joindre.
  verifiee   INTEGER NOT NULL DEFAULT 0 CHECK (verifiee IN (0,1)),
  cree_le    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE INDEX idx_structures_unite ON structures(unite_id);
-- Index de l'encadrement rectangulaire : la présélection « à moins de N km »
-- se fait sur ces deux colonnes, le calcul exact se fait ensuite sur la
-- courte liste retournée.
CREATE INDEX idx_structures_position ON structures(lat, lon);

-- ---------------------------------------------------------------------
-- Personnes
-- ---------------------------------------------------------------------
-- Une seule table pour les sportifs, les encadrants et les recruteurs : un
-- entraîneur a été joueur, un joueur devient entraîneur. Les séparer
-- obligerait à dupliquer la personne et casserait la chaîne de
-- recommandation, qui relie des personnes entre elles.
CREATE TABLE personnes (
  id            TEXT PRIMARY KEY,
  nom           TEXT NOT NULL,
  naissance     TEXT,                   -- AAAA-MM-JJ
  sexe          TEXT CHECK (sexe IN ('F','M','autre')),
  nationalite   TEXT NOT NULL DEFAULT '',
  telephone     TEXT,                   -- normalisé E.164
  email         TEXT,
  -- Unité de résidence, pas l'adresse : on n'a pas besoin de savoir où dort
  -- un mineur, seulement de quel territoire il vient.
  unite_id      TEXT REFERENCES unites_admin(id),
  est_sportif   INTEGER NOT NULL DEFAULT 0 CHECK (est_sportif IN (0,1)),
  est_encadrant INTEGER NOT NULL DEFAULT 0 CHECK (est_encadrant IN (0,1)),
  est_recruteur INTEGER NOT NULL DEFAULT 0 CHECK (est_recruteur IN (0,1)),

  -- Compte d'accès. Le mot de passe reste NULL pour les sportifs enregistrés
  -- par un encadrant : la grande majorité n'ouvrira jamais la plateforme, et
  -- leur imposer un compte compliquerait la saisie sans rien apporter.
  hash_mdp      TEXT,
  -- Contact du tuteur. Pour un mineur, c'est par lui que passe l'ouverture du
  -- compte, et c'est à lui qu'on s'adresse.
  tuteur_nom       TEXT NOT NULL DEFAULT '',
  tuteur_telephone TEXT NOT NULL DEFAULT '',
  role          TEXT NOT NULL DEFAULT 'sportif'
                CHECK (role IN ('sportif','encadrant','recruteur','admin')),

  -- Rattachement explicite de l'encadrant à sa structure. Le déduire de ses
  -- attestations passées laissait sans structure quiconque n'avait encore
  -- rien attesté, et rendait le droit d'attester circulaire.
  structure_id  TEXT REFERENCES structures(id),
  actif         INTEGER NOT NULL DEFAULT 1 CHECK (actif IN (0,1)),
  cree_le       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE INDEX idx_personnes_unite ON personnes(unite_id);
CREATE INDEX idx_personnes_structure ON personnes(structure_id);
CREATE INDEX idx_personnes_role ON personnes(role);
CREATE UNIQUE INDEX idx_personnes_tel ON personnes(telephone) WHERE telephone IS NOT NULL;

-- Le sportif : ce qui ne vaut que pour lui.
CREATE TABLE sportifs (
  personne_id      TEXT PRIMARY KEY REFERENCES personnes(id) ON DELETE CASCADE,
  discipline_id    TEXT NOT NULL REFERENCES disciplines(id),
  poste_id         TEXT REFERENCES postes(id),
  lateralite       TEXT CHECK (lateralite IN ('droite','gauche','ambidextre')),
  -- Unité où il a grandi, distincte de sa résidence actuelle : c'est l'écart
  -- entre les deux qui raconte la migration du talent.
  unite_origine_id TEXT REFERENCES unites_admin(id),
  -- Un parcours arrêté n'est pas un parcours en échec : il faut pouvoir le
  -- dire sans le supprimer.
  statut           TEXT NOT NULL DEFAULT 'actif'
                   CHECK (statut IN ('actif','interrompu','professionnel','retire'))
);

-- Sessions d'accès. Conservées en base plutôt que dans un jeton autonome :
-- désactiver un compte coupe alors l'accès immédiatement, ce qu'un jeton ne
-- permet pas avant son expiration.
CREATE TABLE sessions (
  id          TEXT PRIMARY KEY,
  personne_id TEXT NOT NULL REFERENCES personnes(id) ON DELETE CASCADE,
  expire_le   TEXT NOT NULL,
  cree_le     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE INDEX idx_sessions_personne ON sessions(personne_id);
CREATE INDEX idx_sessions_expire ON sessions(expire_le);

-- Codes d'accès remis aux sportifs.
--
-- Un sportif ne s'inscrit pas librement : son compte est ouvert par
-- l'encadrant qui le connaît, lequel lui remet un code. Deux raisons. La
-- plupart sont mineurs et ne peuvent pas consentir seuls au traitement de
-- leurs données. Et une inscription libre permettrait à quiconque de créer un
-- compte au nom d'un joueur pour revendiquer son parcours.
--
-- Le code est conservé en clair, contrairement à un mot de passe. C'est un
-- choix assumé : l'encadrant doit pouvoir le relire pour le redonner au
-- joueur qui l'a perdu. Le risque est borné par une validité courte, un usage
-- unique, et le fait qu'il n'ouvre qu'un seul compte précis.
CREATE TABLE codes_acces (
  code         TEXT PRIMARY KEY,
  personne_id  TEXT NOT NULL REFERENCES personnes(id) ON DELETE CASCADE,
  cree_par     TEXT NOT NULL REFERENCES personnes(id),
  -- En dessous de 15 ans, le code est destiné au tuteur et non au joueur :
  -- c'est lui qui consent au traitement des données.
  destinataire TEXT NOT NULL DEFAULT 'sportif'
               CHECK (destinataire IN ('sportif','tuteur')),
  expire_le    TEXT NOT NULL,
  utilise_le   TEXT,
  cree_le      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE INDEX idx_codes_personne ON codes_acces(personne_id);

-- Contestations d'une étape par le sportif concerné.
--
-- Une trace que son sujet ne peut pas contester n'est pas une traçabilité,
-- c'est un fichier. Le sportif ne modifie rien lui-même — sans quoi on
-- réintroduirait la donnée auto-déclarée que tout le modèle cherche à
-- éviter — mais il signale, et l'encadrant tranche.
CREATE TABLE contestations (
  id          TEXT PRIMARY KEY,
  etape_id    TEXT NOT NULL REFERENCES etapes(id) ON DELETE CASCADE,
  sportif_id  TEXT NOT NULL REFERENCES sportifs(personne_id) ON DELETE CASCADE,
  motif       TEXT NOT NULL CHECK (motif IN
              ('dates_fausses','structure_fausse','jamais_passe','mode_faux',
               'niveau_faux','etape_manquante','autre')),
  texte       TEXT NOT NULL DEFAULT '',
  statut      TEXT NOT NULL DEFAULT 'ouverte'
              CHECK (statut IN ('ouverte','acceptee','refusee')),
  reponse     TEXT NOT NULL DEFAULT '',
  traite_par  TEXT REFERENCES personnes(id),
  traite_le   TEXT,
  cree_le     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE INDEX idx_contestations_etape ON contestations(etape_id);
CREATE INDEX idx_contestations_statut ON contestations(statut, cree_le DESC);

-- ---------------------------------------------------------------------
-- Socle : d'où il part
-- ---------------------------------------------------------------------
-- Table séparée, et ce n'est pas un détail d'organisation. Ces données
-- portent sur le milieu social de mineurs. Elles servent à l'analyse
-- agrégée — « les parcours issus de tel contexte s'arrêtent plus tôt » — et
-- ne doivent jamais apparaître sur une fiche consultée par un recruteur :
-- « famille peu impliquée » sur un profil se retournerait contre le joueur.
--
-- Tout y est facultatif et en classes plutôt qu'en valeurs précises.
CREATE TABLE socles (
  sportif_id            TEXT PRIMARY KEY REFERENCES sportifs(personne_id) ON DELETE CASCADE,
  age_premier_contact   INTEGER CHECK (age_premier_contact BETWEEN 3 AND 40),
  age_premiere_structure INTEGER CHECK (age_premiere_structure BETWEEN 3 AND 40),
  -- Contexte de découverte : où le sport est entré dans sa vie.
  contexte_initial      TEXT CHECK (contexte_initial IN
                        ('rue_quartier','ecole','famille','club','centre','autre')),
  soutien_famille       TEXT CHECK (soutien_famille IN ('fort','partiel','absent','oppose')),
  encadrement_initial   TEXT CHECK (encadrement_initial IN ('aucun','benevole','qualifie')),
  -- Classes, jamais de revenu déclaré : la précision serait fausse et
  -- l'information brute dangereuse.
  conditions_materielles TEXT CHECK (conditions_materielles IN ('difficiles','modestes','stables')),
  scolarise             INTEGER CHECK (scolarise IN (0,1)),
  consentement_analyse  INTEGER NOT NULL DEFAULT 0 CHECK (consentement_analyse IN (0,1)),
  note                  TEXT NOT NULL DEFAULT '',
  maj_le                TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

-- ---------------------------------------------------------------------
-- Étapes : où il est passé
-- ---------------------------------------------------------------------
CREATE TABLE etapes (
  id            TEXT PRIMARY KEY,
  sportif_id    TEXT NOT NULL REFERENCES sportifs(personne_id) ON DELETE CASCADE,
  structure_id  TEXT REFERENCES structures(id),
  discipline_id TEXT NOT NULL REFERENCES disciplines(id),
  poste_id      TEXT REFERENCES postes(id),

  -- Le territoire est recopié sur l'étape et non lu à travers la structure :
  -- une structure peut déménager, l'étape doit rester là où elle s'est
  -- réellement déroulée. Sans cette copie, toute l'analyse historique se
  -- déforme au premier changement d'adresse.
  unite_id      TEXT NOT NULL REFERENCES unites_admin(id),
  lat           REAL,
  lon           REAL,

  debut         TEXT NOT NULL,          -- AAAA-MM ou AAAA-MM-JJ
  fin           TEXT,                   -- NULL = en cours
  niveau        TEXT CHECK (niveau IN
                ('loisir','quartier','scolaire','club_local','regional',
                 'national_jeune','national','professionnel')),

  motif_fin     TEXT CHECK (motif_fin IN
                ('progression','blessure','abandon','scolarite','financier',
                 'demenagement','depart_etranger','exclusion','autre')),

  -- Deux régimes de fiabilité, et c'est ce qui rend la base crédible.
  -- « reconstituee » : parcours passé, déclaré de mémoire, invérifiable —
  -- un joueur de 17 ans a commencé à 8, personne n'a rien documenté.
  -- « attestee » : saisie au moment où elle se produit, validée par la
  -- structure. Mélanger les deux reviendrait à présenter du souvenir comme
  -- du fait.
  fiabilite     TEXT NOT NULL DEFAULT 'reconstituee'
                CHECK (fiabilite IN ('declaree','reconstituee','attestee')),
  atteste_par   TEXT REFERENCES personnes(id),
  atteste_le    TEXT,

  cree_le       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE INDEX idx_etapes_sportif ON etapes(sportif_id, debut);
CREATE INDEX idx_etapes_unite ON etapes(unite_id);
CREATE INDEX idx_etapes_structure ON etapes(structure_id);

-- ---------------------------------------------------------------------
-- Transitions : comment il est passé de l'une à l'autre
-- ---------------------------------------------------------------------
-- L'objet central du travail. Le mode de passage est ce que ni l'étape
-- d'avant ni celle d'après ne contiennent, et c'est lui qui permet de dire
-- « dans cette région, les talents sont repérés dans la rue faute de
-- structures » — un indicateur de carence, pas une anecdote.
CREATE TABLE transitions (
  id           TEXT PRIMARY KEY,
  sportif_id   TEXT NOT NULL REFERENCES sportifs(personne_id) ON DELETE CASCADE,
  -- NULL sur la première transition : l'entrée dans le sport n'a pas
  -- d'étape antérieure.
  etape_avant  TEXT REFERENCES etapes(id),
  etape_apres  TEXT NOT NULL REFERENCES etapes(id),

  mode         TEXT NOT NULL CHECK (mode IN (
                 'recommandation',      -- un encadrant vers un autre
                 'reperage_tournoi',    -- vu lors d'une compétition
                 'reperage_informel',   -- vu jouer dans la rue, au quartier
                 'detection_organisee', -- journée de détection, essai collectif
                 'demarche_famille',    -- initiative des parents ou du joueur
                 'transfert',           -- mouvement administratif entre clubs
                 'agent',               -- intermédiaire, licencié ou non
                 'autre')),

  -- Qui a provoqué le passage. Accumulés, ces liens forment le réseau
  -- informel de détection : qui alimente qui, quels entraîneurs sont des
  -- passeurs, quelles académies ne reçoivent de personne.
  agent_id     TEXT REFERENCES personnes(id),
  evenement_id TEXT,                    -- renseigné si le passage a eu lieu lors d'un événement

  date_effet   TEXT NOT NULL,
  fiabilite    TEXT NOT NULL DEFAULT 'reconstituee'
               CHECK (fiabilite IN ('declaree','reconstituee','attestee')),
  note         TEXT NOT NULL DEFAULT '',
  cree_le      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE INDEX idx_transitions_sportif ON transitions(sportif_id, date_effet);
CREATE INDEX idx_transitions_mode ON transitions(mode);
CREATE INDEX idx_transitions_agent ON transitions(agent_id);

-- ---------------------------------------------------------------------
-- Événements : les lieux datés où les parcours se croisent
-- ---------------------------------------------------------------------
CREATE TABLE evenements (
  id          TEXT PRIMARY KEY,
  nom         TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN
              ('tournoi','detection','championnat','stage','test_physique','scolaire','autre')),
  discipline_id TEXT REFERENCES disciplines(id),
  unite_id    TEXT NOT NULL REFERENCES unites_admin(id),
  lat         REAL,
  lon         REAL,
  date_debut  TEXT NOT NULL,
  date_fin    TEXT,
  organisateur_id TEXT REFERENCES structures(id),
  cree_le     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE INDEX idx_evenements_unite ON evenements(unite_id, date_debut);

CREATE TABLE participations (
  id           TEXT PRIMARY KEY,
  evenement_id TEXT NOT NULL REFERENCES evenements(id) ON DELETE CASCADE,
  sportif_id   TEXT NOT NULL REFERENCES sportifs(personne_id) ON DELETE CASCADE,
  resultat     TEXT NOT NULL DEFAULT '',
  distinction  TEXT NOT NULL DEFAULT '',
  UNIQUE (evenement_id, sportif_id)
);

-- ---------------------------------------------------------------------
-- Mesures
-- ---------------------------------------------------------------------
-- Une valeur mesurée, jamais auto-déclarée. Les 7 réponses du questionnaire
-- exploratoire ont montré que la taille saisie librement arrive en « 1,75 »,
-- « 191 », « 1m80 » : quatre formats, aucun tri possible. Ici l'unité est
-- contrainte et la source enregistrée.
CREATE TABLE mesures (
  id          TEXT PRIMARY KEY,
  sportif_id  TEXT NOT NULL REFERENCES sportifs(personne_id) ON DELETE CASCADE,
  etape_id    TEXT REFERENCES etapes(id),
  evenement_id TEXT REFERENCES evenements(id),
  type        TEXT NOT NULL CHECK (type IN
              ('taille_cm','poids_kg','sprint_10m_s','sprint_30m_s','detente_cm',
               'cooper_m','vma_kmh','envergure_cm','autre')),
  valeur      REAL NOT NULL,
  date_mesure TEXT NOT NULL,
  source      TEXT NOT NULL DEFAULT 'declaree'
              CHECK (source IN ('declaree','encadrant','test_officiel')),
  mesure_par  TEXT REFERENCES personnes(id),
  UNIQUE (sportif_id, type, date_mesure)
);

CREATE INDEX idx_mesures_sportif ON mesures(sportif_id, type, date_mesure);

-- ---------------------------------------------------------------------
-- Fichiers
-- ---------------------------------------------------------------------
-- Logos de structures, photos de personnes, pièces jointes aux étapes.
--
-- Le contenu vit dans le stockage d'objets, la base ne garde que la
-- référence : une image dans une colonne alourdirait chaque lecture de la
-- ligne qui la contient, y compris quand on ne veut que le nom.
--
-- Le rattachement est générique (type de cible plus identifiant) plutôt que
-- trois tables séparées : les règles d'envoi, de taille et de suppression
-- sont les mêmes pour tous, et les dupliquer trois fois garantirait qu'elles
-- divergent.
CREATE TABLE fichiers (
  id          TEXT PRIMARY KEY,
  cle         TEXT NOT NULL UNIQUE,     -- emplacement dans le stockage d'objets
  type_cible  TEXT NOT NULL CHECK (type_cible IN ('structure','personne','etape')),
  cible_id    TEXT NOT NULL,
  -- L'usage distingue ce qui s'affiche d'office de ce qui ne s'ouvre qu'à la
  -- demande. Un logo et une attestation ne se présentent pas de la même façon.
  usage       TEXT NOT NULL CHECK (usage IN ('logo','photo','piece','video')),
  mime        TEXT NOT NULL,
  taille      INTEGER NOT NULL,
  nom_origine TEXT NOT NULL DEFAULT '',
  legende     TEXT NOT NULL DEFAULT '',
  -- Pour une attestation, l'autorité qui l'a émise : c'est ce qui en fait une
  -- pièce justificative plutôt qu'une image parmi d'autres.
  emetteur    TEXT NOT NULL DEFAULT '',
  ordre       INTEGER NOT NULL DEFAULT 0,
  envoye_par  TEXT NOT NULL REFERENCES personnes(id),
  cree_le     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE INDEX idx_fichiers_cible ON fichiers(type_cible, cible_id, ordre);

-- Un seul logo par structure et une seule photo par personne : le second
-- remplacerait le premier sans qu'on sache lequel afficher.
CREATE UNIQUE INDEX uniq_logo_structure ON fichiers(cible_id)
  WHERE type_cible = 'structure' AND usage = 'logo';
CREATE UNIQUE INDEX uniq_photo_personne ON fichiers(cible_id)
  WHERE type_cible = 'personne' AND usage = 'photo';

-- ---------------------------------------------------------------------
-- Évaluations par critères
-- ---------------------------------------------------------------------
-- Une mesure et une note ne sont pas la même chose. Une taille est un fait,
-- vérifiable par quiconque reprend le mètre. Une note sur la lecture du jeu
-- est un jugement d'expert : elle n'a de sens qu'accompagnée de qui l'a
-- portée, quand, et dans quel contexte. Les mélanger dans une même table
-- reviendrait à présenter une appréciation comme une mesure.
CREATE TABLE criteres (
  id            TEXT PRIMARY KEY,
  -- NULL = critère commun à toutes les disciplines. Le positionnement et la
  -- combativité s'évaluent partout ; la conduite de balle non.
  discipline_id TEXT REFERENCES disciplines(id),
  famille       TEXT NOT NULL CHECK (famille IN
                ('physique','technique','tactique','psychologique','mental')),
  nom           TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  ordre         INTEGER NOT NULL DEFAULT 0,
  actif         INTEGER NOT NULL DEFAULT 1 CHECK (actif IN (0,1))
);

CREATE INDEX idx_criteres_discipline ON criteres(discipline_id, famille, ordre);

-- En-tête d'évaluation : qui juge, quand, dans quelles conditions.
CREATE TABLE evaluations (
  id            TEXT PRIMARY KEY,
  sportif_id    TEXT NOT NULL REFERENCES sportifs(personne_id) ON DELETE CASCADE,
  -- Rattachement à l'étape en cours : une note prise en académie ne se
  -- compare pas à une note prise au quartier, et sans ce lien on perdrait le
  -- contexte de progression.
  etape_id      TEXT REFERENCES etapes(id),
  evaluateur_id TEXT NOT NULL REFERENCES personnes(id),
  contexte      TEXT NOT NULL CHECK (contexte IN
                ('entrainement','match','detection','test','autre')),
  date_evaluation TEXT NOT NULL,
  commentaire   TEXT NOT NULL DEFAULT '',
  cree_le       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE INDEX idx_evaluations_sportif ON evaluations(sportif_id, date_evaluation DESC);

-- Notes détaillées.
--
-- L'échelle va de 1 à 5, délibérément courte. Au-delà, deux évaluateurs
-- cessent de s'accorder : l'écart entre un 13 et un 14 sur 20 ne veut rien
-- dire d'un entraîneur à l'autre, alors que la différence entre « au-dessus
-- de la moyenne » et « remarquable » se discute. Cinq boutons tiennent en
-- outre sur la largeur d'un téléphone.
CREATE TABLE notes_evaluation (
  evaluation_id TEXT NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
  critere_id    TEXT NOT NULL REFERENCES criteres(id),
  note          INTEGER NOT NULL CHECK (note BETWEEN 1 AND 5),
  commentaire   TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (evaluation_id, critere_id)
);

-- ---------------------------------------------------------------------
-- Vues d'analyse
-- ---------------------------------------------------------------------
-- Définies une fois ici plutôt que réécrites dans chaque écran : trois
-- tableaux de bord qui recalculent chacun « le nombre de talents par
-- région » finiront par afficher trois chiffres différents.

-- Parcours résumé : première et dernière étape, nombre d'étapes, mobilité.
CREATE VIEW v_parcours AS
SELECT
  s.personne_id AS sportif_id,
  p.nom,
  p.naissance,
  d.nom AS discipline,
  s.statut,
  (SELECT COUNT(*) FROM etapes e WHERE e.sportif_id = s.personne_id) AS nb_etapes,
  (SELECT MIN(e.debut) FROM etapes e WHERE e.sportif_id = s.personne_id) AS debut_parcours,
  (SELECT e.unite_id FROM etapes e WHERE e.sportif_id = s.personne_id
     ORDER BY e.debut LIMIT 1) AS unite_depart,
  (SELECT e.unite_id FROM etapes e WHERE e.sportif_id = s.personne_id
     ORDER BY e.debut DESC LIMIT 1) AS unite_actuelle,
  -- Un parcours est « mobile » si le territoire de la dernière étape diffère
  -- de celui de la première : c'est la définition la plus simple de la
  -- migration du talent, et elle se calcule sans géométrie.
  CASE WHEN (SELECT e.unite_id FROM etapes e WHERE e.sportif_id = s.personne_id ORDER BY e.debut LIMIT 1)
          <> (SELECT e.unite_id FROM etapes e WHERE e.sportif_id = s.personne_id ORDER BY e.debut DESC LIMIT 1)
       THEN 1 ELSE 0 END AS a_migre
FROM sportifs s
JOIN personnes p ON p.id = s.personne_id
JOIN disciplines d ON d.id = s.discipline_id;

-- Modes de détection par territoire : l'indicateur de carence.
CREATE VIEW v_detection_par_unite AS
SELECT
  e.unite_id,
  t.mode,
  COUNT(*) AS n
FROM transitions t
JOIN etapes e ON e.id = t.etape_apres
GROUP BY e.unite_id, t.mode;

-- Délai d'encadrement : années écoulées entre le premier contact avec le
-- sport et l'entrée dans une structure formelle.
CREATE VIEW v_delai_encadrement AS
SELECT
  s.personne_id AS sportif_id,
  so.age_premier_contact,
  so.age_premiere_structure,
  so.age_premiere_structure - so.age_premier_contact AS delai_ans,
  (SELECT e.unite_id FROM etapes e WHERE e.sportif_id = s.personne_id
     ORDER BY e.debut LIMIT 1) AS unite_depart
FROM sportifs s
JOIN socles so ON so.sportif_id = s.personne_id
WHERE so.age_premier_contact IS NOT NULL
  AND so.age_premiere_structure IS NOT NULL;

-- Profil d'un sportif par famille de critères, sur sa dernière évaluation.
-- C'est la lecture que réclament les entraîneurs : non pas une note globale,
-- qui écrase tout, mais un relief par famille.
CREATE VIEW v_profil_sportif AS
SELECT
  e.sportif_id,
  c.famille,
  ROUND(AVG(n.note), 2) AS moyenne,
  COUNT(n.note) AS nb_criteres,
  MAX(e.date_evaluation) AS derniere_evaluation
FROM evaluations e
JOIN notes_evaluation n ON n.evaluation_id = e.id
JOIN criteres c ON c.id = n.critere_id
GROUP BY e.sportif_id, c.famille;

-- Réseau de recommandation : qui adresse des joueurs à qui.
CREATE VIEW v_reseau_recommandation AS
SELECT
  t.agent_id AS recommandant,
  st.id AS structure_destination,
  st.unite_id AS unite_destination,
  COUNT(*) AS n
FROM transitions t
JOIN etapes e ON e.id = t.etape_apres
LEFT JOIN structures st ON st.id = e.structure_id
WHERE t.mode = 'recommandation' AND t.agent_id IS NOT NULL
GROUP BY t.agent_id, st.id;

-- ---------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------
-- Une transition relie deux étapes du MÊME sportif. Sans ce contrôle, une
-- erreur de saisie créerait un parcours chimérique reliant deux personnes,
-- et l'analyse de mobilité afficherait des trajets qui n'ont jamais eu lieu.
CREATE TRIGGER trg_transition_meme_sportif
BEFORE INSERT ON transitions
FOR EACH ROW WHEN
  (SELECT sportif_id FROM etapes WHERE id = NEW.etape_apres) <> NEW.sportif_id
  OR (NEW.etape_avant IS NOT NULL
      AND (SELECT sportif_id FROM etapes WHERE id = NEW.etape_avant) <> NEW.sportif_id)
BEGIN
  SELECT RAISE(ABORT, 'transition_sportif_incoherent');
END;

-- Une étape attestée doit dire par qui. « Attestée par personne » est une
-- contradiction, et c'est exactement le genre de trou par lequel une base
-- perd sa crédibilité.
CREATE TRIGGER trg_attestation_exige_auteur
BEFORE INSERT ON etapes
FOR EACH ROW WHEN NEW.fiabilite = 'attestee' AND NEW.atteste_par IS NULL
BEGIN
  SELECT RAISE(ABORT, 'attestation_sans_auteur');
END;
