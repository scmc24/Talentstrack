-- Jeu de démonstration, appliqué uniquement à la création de la base locale.
-- Il reproduit la configuration observée lors de l'enquête préalable :
-- concentration autour d'une académie de Yaoundé, et un parcours venu d'une
-- région périphérique.

INSERT INTO structures (id, nom, type_id, unite_id, lat, lon, verifiee) VALUES
  ('s-rue',  'Terrain de Nkolbisson',     'informel', 'yde7', 3.868, 11.435, 0),
  ('s-acad', 'Académie Wildcats',         'academie', 'yde6', 3.862, 11.452, 1),
  ('s-lyc',  'Lycée d''Ekorezock',        'scolaire', 'yde2', 3.893, 11.488, 1),
  ('s-mik',  'Mikaël Sport Promotion',    'academie', 'yde7', 3.872, 11.441, 1),
  ('s-mar',  'Club de quartier de Maroua','informel', 'mar1', 10.592, 14.318, 0),
  ('s-dla',  'Académie du Littoral',      'academie', 'dla5', 4.032, 9.751, 1);

-- Comptes de démonstration. Le mot de passe est « motdepasse123 », haché
-- avec le sel « sel-de-developpement » du fichier .dev.vars.exemple. Changer
-- ce sel rend ces comptes inutilisables, ce qui est voulu : ils ne doivent
-- jamais fonctionner en production.
INSERT INTO personnes (id, nom, email, hash_mdp, role, structure_id, unite_id, est_encadrant) VALUES
  ('c-acad',  'Coach Wildcats', 'coach@talentstrack.local', 'pbkdf2.100000.BhMqpE_lMyPTTOXRihSLjw.AJDswhSc451Olh0rFyTHPEKWIvfPg5E20MJi7mH1fh4', 'encadrant', 's-acad', 'yde6', 1),
  ('c-mikael','Coach Mikaël',   'mikael@talentstrack.local', 'pbkdf2.100000.BhMqpE_lMyPTTOXRihSLjw.AJDswhSc451Olh0rFyTHPEKWIvfPg5E20MJi7mH1fh4', 'encadrant', 's-mik', 'yde7', 1);

INSERT INTO personnes (id, nom, email, hash_mdp, role, unite_id) VALUES
  ('adm', 'Administrateur', 'admin@talentstrack.local', 'pbkdf2.100000.BhMqpE_lMyPTTOXRihSLjw.AJDswhSc451Olh0rFyTHPEKWIvfPg5E20MJi7mH1fh4', 'admin', 'yde1');

-- Le rattachement d'un encadrant à sa structure se déduit de ses attestations.
-- Ces deux étapes servent d'amorçage pour que la démonstration fonctionne dès
-- le premier lancement.
INSERT INTO personnes (id, nom, naissance, sexe, unite_id, est_sportif)
VALUES ('sp-amorce', 'Parcours de démonstration', '2008-06-15', 'M', 'yde6', 1);
INSERT INTO sportifs (personne_id, discipline_id, poste_id, unite_origine_id)
VALUES ('sp-amorce', 'basket', 'b-mn', 'yde6');
INSERT INTO etapes (id, sportif_id, structure_id, discipline_id, unite_id, lat, lon,
                    debut, niveau, fiabilite, atteste_par, atteste_le)
VALUES ('et-amorce', 'sp-amorce', 's-acad', 'basket', 'yde6', 3.862, 11.452,
        '2023-09', 'regional', 'attestee', 'c-acad', '2023-09-01T08:00:00Z');
INSERT INTO transitions (id, sportif_id, etape_avant, etape_apres, mode, date_effet, fiabilite)
VALUES ('tr-amorce', 'sp-amorce', NULL, 'et-amorce', 'detection_organisee', '2023-09', 'attestee');

INSERT INTO etapes (id, sportif_id, structure_id, discipline_id, unite_id, lat, lon,
                    debut, fin, niveau, motif_fin, fiabilite, atteste_par, atteste_le)
VALUES ('et-amorce2', 'sp-amorce', 's-mik', 'basket', 'yde7', 3.872, 11.441,
        '2022-01', '2023-08', 'club_local', 'progression', 'attestee', 'c-mikael', '2022-01-10T08:00:00Z');
