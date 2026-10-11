-- =====================================================================
-- Données de référence.
--
-- ATTENTION sur le référentiel administratif : les dix régions du Cameroun
-- sont exactes, mais les centroïdes et les populations ci-dessous sont
-- APPROXIMATIFS et posés pour permettre le développement. Ils doivent être
-- remplacés par une source officielle (INS, BUCREP, ou un fond de carte
-- administratif) avant toute exploitation analytique : une carte de densité
-- construite sur des chiffres inventés est pire qu'une absence de carte.
-- =====================================================================

INSERT OR IGNORE INTO unites_admin (id, code, nom, niveau, parent_id, lat, lon, population) VALUES
  ('cm',        'CM',      'Cameroun',      'pays',   NULL, 5.69, 12.74, 27900000);

INSERT OR IGNORE INTO unites_admin (id, code, nom, niveau, parent_id, lat, lon, population) VALUES
  ('cm-ad', 'CM-AD', 'Adamaoua',      'region', 'cm', 6.50, 13.00,  1300000),
  ('cm-ce', 'CM-CE', 'Centre',        'region', 'cm', 4.00, 11.90,  4800000),
  ('cm-es', 'CM-ES', 'Est',           'region', 'cm', 4.00, 14.00,  1000000),
  ('cm-en', 'CM-EN', 'Extrême-Nord',  'region', 'cm', 10.80, 14.40, 4500000),
  ('cm-lt', 'CM-LT', 'Littoral',      'region', 'cm', 4.30,  9.90,  3800000),
  ('cm-no', 'CM-NO', 'Nord',          'region', 'cm', 9.00, 13.70,  2800000),
  ('cm-nw', 'CM-NW', 'Nord-Ouest',    'region', 'cm', 6.20, 10.30,  2100000),
  ('cm-ou', 'CM-OU', 'Ouest',         'region', 'cm', 5.50, 10.40,  2100000),
  ('cm-su', 'CM-SU', 'Sud',           'region', 'cm', 2.90, 11.50,   800000),
  ('cm-sw', 'CM-SW', 'Sud-Ouest',     'region', 'cm', 4.90,  9.30,  1700000);

-- Quelques arrondissements urbains, là où se concentrent les structures.
-- La liste complète des 360 arrondissements reste à intégrer.
INSERT OR IGNORE INTO unites_admin (id, code, nom, niveau, parent_id, lat, lon, population) VALUES
  ('yde1', 'CM-CE-YDE1', 'Yaoundé Ier',  'arrondissement', 'cm-ce', 3.90, 11.52, 400000),
  ('yde2', 'CM-CE-YDE2', 'Yaoundé IIe',  'arrondissement', 'cm-ce', 3.89, 11.49, 350000),
  ('yde6', 'CM-CE-YDE6', 'Yaoundé VIe',  'arrondissement', 'cm-ce', 3.86, 11.45, 380000),
  ('yde7', 'CM-CE-YDE7', 'Yaoundé VIIe', 'arrondissement', 'cm-ce', 3.87, 11.43, 300000),
  ('dla1', 'CM-LT-DLA1', 'Douala Ier',   'arrondissement', 'cm-lt', 4.06,  9.75, 450000),
  ('dla5', 'CM-LT-DLA5', 'Douala Ve',    'arrondissement', 'cm-lt', 4.03,  9.75, 500000),
  ('mar1', 'CM-EN-MAR1', 'Maroua Ier',   'arrondissement', 'cm-en', 10.59, 14.32, 250000),
  ('bfsm', 'CM-OU-BFSM', 'Bafoussam Ier','arrondissement', 'cm-ou', 5.48, 10.42, 300000);

-- ---------------------------------------------------------------------
-- Disciplines
-- ---------------------------------------------------------------------
-- Football et basketball d'abord : ce sont les deux disciplines présentes
-- dans l'enquête exploratoire. Les autres s'ajouteront sans toucher au
-- modèle, puisque la discipline est une dimension et non une abstraction.
INSERT OR IGNORE INTO disciplines (id, nom) VALUES
  ('foot',   'Football'),
  ('basket', 'Basketball');

INSERT OR IGNORE INTO postes (id, discipline_id, nom, ordre) VALUES
  ('f-gb',  'foot', 'Gardien de but', 1),
  ('f-dc',  'foot', 'Défenseur central', 2),
  ('f-dl',  'foot', 'Défenseur latéral', 3),
  ('f-md',  'foot', 'Milieu défensif', 4),
  ('f-mc',  'foot', 'Milieu central', 5),
  ('f-mo',  'foot', 'Milieu offensif', 6),
  ('f-ail', 'foot', 'Ailier', 7),
  ('f-att', 'foot', 'Attaquant', 8),
  ('b-mn',  'basket', 'Meneur', 1),
  ('b-ar',  'basket', 'Arrière', 2),
  ('b-ai',  'basket', 'Ailier', 3),
  ('b-af',  'basket', 'Ailier fort', 4),
  ('b-pi',  'basket', 'Pivot', 5);

-- ---------------------------------------------------------------------
-- Types de structure
-- ---------------------------------------------------------------------
-- Le rang ordonne la progression : c'est lui qui permet de dire si une
-- transition est une montée, un palier ou une rupture, sans que chaque
-- requête ait à réinventer cette hiérarchie.
INSERT OR IGNORE INTO types_structure (id, nom, rang, formel) VALUES
  ('informel',  'Terrain de quartier / informel', 1, 0),
  ('scolaire',  'École ou établissement',         2, 1),
  ('club_loc',  'Club amateur local',             3, 1),
  ('club_reg',  'Club régional',                  4, 1),
  ('academie',  'Académie / centre de formation', 5, 1),
  ('selection', 'Sélection régionale ou nationale', 6, 1),
  ('pro',       'Club professionnel',             7, 1);

-- ---------------------------------------------------------------------
-- Critères d'évaluation
-- ---------------------------------------------------------------------
-- Grille issue de l'entretien mené auprès d'un expert du football : critères
-- physiques, techniques, tactiques, auxquels s'ajoutent le comportement et le
-- mental, qu'il cite comme déterminants au même titre que le jeu lui-même.
--
-- Les familles physique, tactique, psychologique et mentale sont communes à
-- toutes les disciplines. Seule la technique est propre à chacune.

INSERT OR IGNORE INTO criteres (id, discipline_id, famille, nom, description, ordre) VALUES
  ('phy-vit', NULL, 'physique', 'Vitesse', 'Vitesse de course sur courte distance', 1),
  ('phy-exp', NULL, 'physique', 'Explosivité', 'Capacité à produire un effort bref et intense', 2),
  ('phy-pui', NULL, 'physique', 'Puissance dans les duels', 'Tenue de l''opposition au contact', 3),
  ('phy-end', NULL, 'physique', 'Endurance', 'Maintien de l''intensité sur la durée', 4),
  ('phy-coo', NULL, 'physique', 'Coordination', 'Aisance et équilibre dans le geste', 5),

  ('tac-pos', NULL, 'tactique', 'Positionnement', 'Placement juste selon la phase de jeu', 1),
  ('tac-lec', NULL, 'tactique', 'Lecture du jeu', 'Anticipation des situations', 2),
  ('tac-esp', NULL, 'tactique', 'Compréhension des espaces', 'Occupation et exploitation des zones libres', 3),
  ('tac-inf', NULL, 'tactique', 'Prise d''information', 'Observation avant de recevoir', 4),

  ('psy-dis', NULL, 'psychologique', 'Discipline', 'Respect du cadre et des consignes', 1),
  ('psy-com', NULL, 'psychologique', 'Comportement', 'Attitude envers l''encadrement et les coéquipiers', 2),
  ('psy-hyg', NULL, 'psychologique', 'Hygiène de vie', 'Sommeil, alimentation, assiduité', 3),
  ('psy-exp', NULL, 'psychologique', 'Expression', 'Capacité à s''exprimer et à représenter', 4),

  ('men-com', NULL, 'mental', 'Combativité', 'Engagement dans l''effort et les duels', 1),
  ('men-pre', NULL, 'mental', 'Gestion de la pression', 'Tenue dans les moments décisifs', 2),
  ('men-con', NULL, 'mental', 'Concentration', 'Attention maintenue sur la durée', 3),
  ('men-pro', NULL, 'mental', 'Progression', 'Capacité à corriger et à apprendre', 4);

INSERT OR IGNORE INTO criteres (id, discipline_id, famille, nom, description, ordre) VALUES
  ('f-ctl', 'foot', 'technique', 'Contrôle', 'Première touche et maîtrise du ballon', 1),
  ('f-pas', 'foot', 'technique', 'Qualité de passe', 'Précision et dosage', 2),
  ('f-cdb', 'foot', 'technique', 'Conduite de balle', 'Déplacement balle au pied', 3),
  ('f-tir', 'foot', 'technique', 'Frappe', 'Puissance et précision devant le but', 4),
  ('f-jeu', 'foot', 'technique', 'Jeu de tête', 'Impact aérien', 5),

  ('b-tir', 'basket', 'technique', 'Tir', 'Adresse à mi-distance et à trois points', 1),
  ('b-dri', 'basket', 'technique', 'Dribble', 'Maîtrise de la balle en mouvement', 2),
  ('b-pas', 'basket', 'technique', 'Passe', 'Vision et précision des transmissions', 3),
  ('b-reb', 'basket', 'technique', 'Rebond', 'Prise de position et captation', 4),
  ('b-def', 'basket', 'technique', 'Défense', 'Opposition individuelle et collective', 5);

-- ---------------------------------------------------------------------
-- Disciplines : type, postes, grades, catégories
-- ---------------------------------------------------------------------
UPDATE disciplines SET type = 'collectif', avec_postes = 1, avec_grades = 0, avec_categories = 0
WHERE id IN ('foot','basket');

-- Sports de combat. Les grades et catégories ci-dessous sont des valeurs de
-- départ : ils DOIVENT être validés auprès de la fédération concernée avant
-- toute exploitation. Une grille approximative produit des données que
-- personne n'utilise, et pire, des comparaisons que l'on croira fondées.
INSERT OR IGNORE INTO disciplines (id, nom, type, avec_postes, avec_grades, avec_categories) VALUES
  ('judo',    'Judo',    'combat', 0, 1, 1),
  ('karate',  'Karaté',  'combat', 0, 1, 1),
  ('nanbudo', 'Nanbudo', 'combat', 0, 1, 0);

-- Ceintures. Les grades intermédiaires réservés aux enfants (blanche-jaune,
-- jaune-orange) ne figurent pas ici : ils varient d'une fédération à l'autre
-- et doivent être ajoutés selon la nomenclature locale.
INSERT OR IGNORE INTO grades (id, discipline_id, nom, abrege, ordre, couleur_hex) VALUES
  ('j-blanche', 'judo', 'Ceinture blanche', 'blanche', 1, '#F5F5F5'),
  ('j-jaune',   'judo', 'Ceinture jaune',   'jaune',   2, '#F2C200'),
  ('j-orange',  'judo', 'Ceinture orange',  'orange',  3, '#E08A1E'),
  ('j-verte',   'judo', 'Ceinture verte',   'verte',   4, '#2E7D32'),
  ('j-bleue',   'judo', 'Ceinture bleue',   'bleue',   5, '#1565C0'),
  ('j-marron',  'judo', 'Ceinture marron',  'marron',  6, '#6D4C41'),
  ('j-noire1',  'judo', 'Ceinture noire 1er dan', '1er dan', 7, '#111111'),
  ('j-noire2',  'judo', 'Ceinture noire 2e dan',  '2e dan',  8, '#111111'),
  ('j-noire3',  'judo', 'Ceinture noire 3e dan',  '3e dan',  9, '#111111'),
  ('j-noire4',  'judo', 'Ceinture noire 4e dan',  '4e dan', 10, '#111111');

INSERT OR IGNORE INTO grades (id, discipline_id, nom, abrege, ordre, couleur_hex) VALUES
  ('k-blanche', 'karate', 'Ceinture blanche', 'blanche', 1, '#F5F5F5'),
  ('k-jaune',   'karate', 'Ceinture jaune',   'jaune',   2, '#F2C200'),
  ('k-orange',  'karate', 'Ceinture orange',  'orange',  3, '#E08A1E'),
  ('k-verte',   'karate', 'Ceinture verte',   'verte',   4, '#2E7D32'),
  ('k-bleue',   'karate', 'Ceinture bleue',   'bleue',   5, '#1565C0'),
  ('k-marron',  'karate', 'Ceinture marron',  'marron',  6, '#6D4C41'),
  ('k-noire1',  'karate', 'Ceinture noire 1er dan', '1er dan', 7, '#111111'),
  ('k-noire2',  'karate', 'Ceinture noire 2e dan',  '2e dan',  8, '#111111');

INSERT OR IGNORE INTO grades (id, discipline_id, nom, abrege, ordre, couleur_hex) VALUES
  ('n-blanche', 'nanbudo', 'Ceinture blanche', 'blanche', 1, '#F5F5F5'),
  ('n-jaune',   'nanbudo', 'Ceinture jaune',   'jaune',   2, '#F2C200'),
  ('n-orange',  'nanbudo', 'Ceinture orange',  'orange',  3, '#E08A1E'),
  ('n-verte',   'nanbudo', 'Ceinture verte',   'verte',   4, '#2E7D32'),
  ('n-bleue',   'nanbudo', 'Ceinture bleue',   'bleue',   5, '#1565C0'),
  ('n-marron',  'nanbudo', 'Ceinture marron',  'marron',  6, '#6D4C41'),
  ('n-noire1',  'nanbudo', 'Ceinture noire 1er dan', '1er dan', 7, '#111111');

-- Catégories de poids seniors. Celles des cadets et juniors diffèrent et
-- restent à saisir selon la nomenclature de la fédération.
INSERT OR IGNORE INTO categories_poids (id, discipline_id, sexe, tranche_age, nom, mini_kg, maxi_kg, ordre) VALUES
  ('j-h-60',  'judo', 'M', 'senior', '-60 kg',  NULL, 60,  1),
  ('j-h-66',  'judo', 'M', 'senior', '-66 kg',  60,   66,  2),
  ('j-h-73',  'judo', 'M', 'senior', '-73 kg',  66,   73,  3),
  ('j-h-81',  'judo', 'M', 'senior', '-81 kg',  73,   81,  4),
  ('j-h-90',  'judo', 'M', 'senior', '-90 kg',  81,   90,  5),
  ('j-h-100', 'judo', 'M', 'senior', '-100 kg', 90,   100, 6),
  ('j-h-p100','judo', 'M', 'senior', '+100 kg', 100,  NULL, 7),
  ('j-f-48',  'judo', 'F', 'senior', '-48 kg',  NULL, 48,  1),
  ('j-f-52',  'judo', 'F', 'senior', '-52 kg',  48,   52,  2),
  ('j-f-57',  'judo', 'F', 'senior', '-57 kg',  52,   57,  3),
  ('j-f-63',  'judo', 'F', 'senior', '-63 kg',  57,   63,  4),
  ('j-f-70',  'judo', 'F', 'senior', '-70 kg',  63,   70,  5),
  ('j-f-78',  'judo', 'F', 'senior', '-78 kg',  70,   78,  6),
  ('j-f-p78', 'judo', 'F', 'senior', '+78 kg',  78,   NULL, 7);

-- Critères techniques des sports de combat. Le physique, le psychologique et
-- le mental restent communs : seule la technique change.
INSERT OR IGNORE INTO criteres (id, discipline_id, famille, nom, description, ordre) VALUES
  ('j-deb', 'judo', 'technique', 'Technique debout', 'Projections et déséquilibres', 1),
  ('j-sol', 'judo', 'technique', 'Technique au sol', 'Immobilisations, contrôles, soumissions', 2),
  ('j-kum', 'judo', 'technique', 'Kumi-kata', 'Prise de garde et contrôle des saisies', 3),
  ('j-dep', 'judo', 'technique', 'Déplacements', 'Appuis et mobilité', 4),
  ('j-enc', 'judo', 'technique', 'Enchaînements', 'Liaison des attaques', 5),

  ('k-kih', 'karate', 'technique', 'Kihon', 'Techniques de base', 1),
  ('k-kat', 'karate', 'technique', 'Kata', 'Exécution des formes', 2),
  ('k-kum', 'karate', 'technique', 'Kumite', 'Combat', 3),
  ('k-dis', 'karate', 'technique', 'Distance', 'Gestion de la distance et du timing', 4),

  ('n-tec', 'nanbudo', 'technique', 'Technique de base', 'Exécution des mouvements fondamentaux', 1),
  ('n-for', 'nanbudo', 'technique', 'Formes', 'Enchaînements codifiés', 2),
  ('n-com', 'nanbudo', 'technique', 'Combat', 'Application en opposition', 3);
