/**
 * Tests du schéma de traçabilité.
 *
 * Deux objectifs. Vérifier que le schéma tient (contraintes, triggers,
 * vues), et surtout démontrer que les analyses géomatiques annoncées se
 * calculent réellement sur D1, sans type géométrie ni index spatial.
 *
 * Le jeu d'essai reprend la structure des 7 réponses de l'enquête
 * exploratoire : majorité basket autour d'une académie de Yaoundé, un
 * joueur venu de Maroua, un footballeur.
 *
 * Lancement : node scripts/test-schema.mjs
 */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys = ON');
db.exec(readFileSync(join(racine, 'db', 'schema.sql'), 'utf8'));
db.exec(readFileSync(join(racine, 'db', 'seed.sql'), 'utf8'));

let echecs = 0, total = 0;
function verifier(intitule, condition, detail = '') {
  total++;
  if (!condition) { echecs++; console.error(`  ECHEC  ${intitule}${detail ? ' — ' + detail : ''}`); }
}
function doitEchouer(intitule, fn, fragment = '') {
  total++;
  try { fn(); echecs++; console.error(`  ECHEC  ${intitule} — accepté à tort`); }
  catch (e) {
    if (fragment && !String(e.message).includes(fragment)) {
      echecs++; console.error(`  ECHEC  ${intitule} — mauvaise raison : ${e.message}`);
    }
  }
}

// =====================================================================
// Structure
// =====================================================================
const objets = db.prepare(
  "SELECT type, name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").all();
const tables = objets.filter(o => o.type === 'table').map(o => o.name);
for (const t of ['unites_admin','disciplines','postes','types_structure','structures',
                 'personnes','sportifs','socles','etapes','transitions','evenements',
                 'participations','mesures']) {
  verifier(`table ${t}`, tables.includes(t));
}
// Cinq vues : parcours, détection par territoire, délai d'encadrement,
// réseau de recommandation, et profil d'évaluation.
verifier('5 vues créées', objets.filter(o => o.type === 'view').length === 5,
  objets.filter(o => o.type === 'view').map(o => o.name).join(', '));

// Les tables d'évaluation sont indispensables au profil par critères.
for (const t of ['criteres', 'evaluations', 'notes_evaluation', 'codes_acces', 'contestations', 'sessions']) {
  verifier(`table ${t}`, tables.includes(t));
}
verifier('2 triggers créés', objets.filter(o => o.type === 'trigger').length === 2);
verifier('10 régions', db.prepare("SELECT COUNT(*) n FROM unites_admin WHERE niveau='region'").get().n === 10);
verifier('hiérarchie administrative',
  db.prepare("SELECT parent_id p FROM unites_admin WHERE id='yde1'").get().p === 'cm-ce');

// =====================================================================
// Jeu d'essai
// =====================================================================
db.exec(`
  INSERT INTO structures (id, nom, type_id, unite_id, lat, lon, verifiee) VALUES
    ('str-rue-yde', 'Terrain de Nkolbisson', 'informel', 'yde7', 3.868, 11.435, 0),
    ('str-wildcats','Wildcats Basketball Academy','academie','yde6', 3.862, 11.452, 1),
    ('str-lycee',   'Lycée bilingue d''Ekorezock','scolaire','yde2', 3.893, 11.488, 1),
    ('str-mikael',  'Mikaël Sport Promotion','academie','yde7', 3.872, 11.441, 1),
    ('str-mar',     'Club de quartier Maroua','informel','mar1', 10.592, 14.318, 0),
    ('str-dla',     'Académie littoral','academie','dla5', 4.032, 9.751, 1);

  INSERT INTO personnes (id, nom, naissance, sexe, unite_id, est_sportif) VALUES
    ('p-yann',   'NGAHA Yann',      '2009-02-13','M','yde1',1),
    ('p-kengne', 'KENGNE Keurtys',  '2009-01-05','M','yde7',1),
    ('p-ralph',  'BOLOKEN Ralph',   '2005-03-22','M','mar1',1),
    ('p-ulrich', 'AYANGMA Ulrich',  '2011-02-23','M','yde7',1),
    ('p-steve',  'KAMADE Steve',    '2008-01-18','M','yde1',1);

  INSERT INTO personnes (id, nom, unite_id, est_encadrant) VALUES
    ('p-coach1','Coach Wildcats','yde6',1),
    ('p-coach2','Coach Mikaël','yde7',1);

  INSERT INTO sportifs (personne_id, discipline_id, poste_id, unite_origine_id, statut) VALUES
    ('p-yann','basket','b-mn','yde1','actif'),
    ('p-kengne','basket','b-ai','yde7','actif'),
    ('p-ralph','basket','b-mn','mar1','actif'),
    ('p-ulrich','foot','f-dc','yde7','actif'),
    ('p-steve','basket','b-mn','yde1','interrompu');

  INSERT INTO socles (sportif_id, age_premier_contact, age_premiere_structure,
                      contexte_initial, soutien_famille, encadrement_initial, consentement_analyse) VALUES
    ('p-yann',    9, 12,'ecole','fort','qualifie',1),
    ('p-kengne', 10, 13,'rue_quartier','fort','benevole',1),
    ('p-ralph',   8, 16,'rue_quartier','partiel','aucun',1),
    ('p-ulrich', 10, 12,'ecole','fort','benevole',1),
    ('p-steve',  12, 17,'rue_quartier','partiel','aucun',1);
`);

// Parcours : chaque étape, puis la transition qui y mène.
const etapes = [
  ['e-yann1','p-yann','str-lycee','basket','yde2','2021-01',  '2022-06','scolaire','progression','reconstituee',null],
  ['e-yann2','p-yann','str-wildcats','basket','yde6','2022-09',null,     'regional',null,        'attestee','p-coach1'],
  ['e-keng1','p-kengne','str-rue-yde','basket','yde7','2022-03','2023-01','quartier','progression','reconstituee',null],
  ['e-keng2','p-kengne','str-wildcats','basket','yde6','2023-02',null,   'regional',null,        'attestee','p-coach1'],
  ['e-ralph1','p-ralph','str-mar','basket','mar1','2019-05',  '2021-08','quartier','demenagement','reconstituee',null],
  ['e-ralph2','p-ralph','str-wildcats','basket','yde6','2021-09',null,   'regional',null,        'attestee','p-coach1'],
  ['e-ulr1','p-ulrich','str-lycee','foot','yde2','2021-09',   '2023-06','scolaire','progression','reconstituee',null],
  ['e-ulr2','p-ulrich','str-mikael','foot','yde7','2023-09',  null,      'club_local',null,      'attestee','p-coach2'],
  ['e-stev1','p-steve','str-rue-yde','basket','yde7','2020-01','2024-12','quartier','financier','reconstituee',null],
];
const insEtape = db.prepare(`INSERT INTO etapes
  (id,sportif_id,structure_id,discipline_id,unite_id,debut,fin,niveau,motif_fin,fiabilite,atteste_par,lat,lon)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,
    (SELECT lat FROM structures WHERE id=?),(SELECT lon FROM structures WHERE id=?))`);
for (const e of etapes) insEtape.run(...e, e[2], e[2]);

const insTrans = db.prepare(`INSERT INTO transitions
  (id,sportif_id,etape_avant,etape_apres,mode,agent_id,date_effet,fiabilite)
  VALUES (?,?,?,?,?,?,?,?)`);
insTrans.run('t1','p-yann',null,'e-yann1','demarche_famille',null,'2021-01','reconstituee');
insTrans.run('t2','p-yann','e-yann1','e-yann2','reperage_tournoi','p-coach1','2022-09','attestee');
insTrans.run('t3','p-kengne',null,'e-keng1','reperage_informel',null,'2022-03','reconstituee');
insTrans.run('t4','p-kengne','e-keng1','e-keng2','recommandation','p-coach2','2023-02','attestee');
insTrans.run('t5','p-ralph',null,'e-ralph1','reperage_informel',null,'2019-05','reconstituee');
insTrans.run('t6','p-ralph','e-ralph1','e-ralph2','recommandation','p-coach1','2021-09','attestee');
insTrans.run('t7','p-ulrich',null,'e-ulr1','demarche_famille',null,'2021-09','reconstituee');
insTrans.run('t8','p-ulrich','e-ulr1','e-ulr2','reperage_tournoi','p-coach2','2023-09','attestee');
insTrans.run('t9','p-steve',null,'e-stev1','reperage_informel',null,'2020-01','reconstituee');

// =====================================================================
// Contraintes et triggers
// =====================================================================
doitEchouer('transition entre sportifs différents refusée', () =>
  insTrans.run('tx','p-yann','e-keng1','e-yann2','recommandation',null,'2024-01','declaree'),
  'transition_sportif_incoherent');

doitEchouer('étape attestée sans auteur refusée', () =>
  insEtape.run('ex','p-yann','str-wildcats','basket','yde6','2024-01',null,'regional',null,
               'attestee',null,'str-wildcats','str-wildcats'),
  'attestation_sans_auteur');

doitEchouer('mode de transition inconnu refusé', () =>
  insTrans.run('ty','p-yann','e-yann1','e-yann2','piston',null,'2024-01','declaree'), 'CHECK');

doitEchouer('mesure au type libre refusée', () =>
  db.prepare(`INSERT INTO mesures (id,sportif_id,type,valeur,date_mesure)
              VALUES ('m0','p-yann','1m80',180,'2026-01-01')`).run(), 'CHECK');

// Les mesures sont contraintes en unité : plus de « 1,75 » contre « 191 ».
db.exec(`INSERT INTO mesures (id,sportif_id,etape_id,type,valeur,date_mesure,source,mesure_par) VALUES
  ('m1','p-yann','e-yann2','taille_cm',190,'2026-03-01','encadrant','p-coach1'),
  ('m2','p-ralph','e-ralph2','taille_cm',180,'2026-03-01','encadrant','p-coach1'),
  ('m3','p-yann','e-yann2','detente_cm',62,'2026-03-01','test_officiel','p-coach1')`);
verifier('mesures triables numériquement',
  db.prepare("SELECT MAX(valeur) v FROM mesures WHERE type='taille_cm'").get().v === 190);

// =====================================================================
// Analyses territoriales — le cœur de la démonstration
// =====================================================================
console.log('\n── Analyses calculées sur D1, sans type géométrie ──\n');

console.log('Talents par région (rattachement, pas point-dans-polygone) :');
const parRegion = db.prepare(`
  SELECT r.nom AS region, COUNT(DISTINCT s.personne_id) AS n
  FROM sportifs s
  JOIN unites_admin u ON u.id = s.unite_origine_id
  JOIN unites_admin r ON r.id = COALESCE(u.parent_id, u.id)
  GROUP BY r.nom ORDER BY n DESC`).all();
for (const l of parRegion) console.log(`   ${l.n}  ${l.region}`);
verifier('agrégation par région', parRegion.length === 2, JSON.stringify(parRegion));

console.log('\nModes d’entrée dans le sport (première transition) :');
const modes = db.prepare(`
  SELECT t.mode, COUNT(*) n FROM transitions t
  WHERE t.etape_avant IS NULL GROUP BY t.mode ORDER BY n DESC`).all();
for (const m of modes) console.log(`   ${m.n}  ${m.mode}`);
verifier('détection informelle majoritaire à l’entrée',
  modes[0].mode === 'reperage_informel' && modes[0].n === 3, JSON.stringify(modes));

console.log('\nDélai d’encadrement (premier contact → première structure) :');
const delais = db.prepare(`
  SELECT v.sportif_id, v.delai_ans, u.nom AS territoire
  FROM v_delai_encadrement v
  JOIN unites_admin u ON u.id = v.unite_depart
  ORDER BY v.delai_ans DESC`).all();
for (const d of delais) console.log(`   ${d.delai_ans} ans   ${d.sportif_id.padEnd(9)} départ : ${d.territoire}`);
verifier('délai le plus long hors des grandes villes',
  delais[0].delai_ans === 8, JSON.stringify(delais[0]));

console.log('\nMigration : parcours dont le territoire d’arrivée diffère du départ :');
const migrations = db.prepare(`
  SELECT p.nom, ud.nom AS depart, ua.nom AS arrivee
  FROM v_parcours p
  JOIN unites_admin ud ON ud.id = p.unite_depart
  JOIN unites_admin ua ON ua.id = p.unite_actuelle
  WHERE p.a_migre = 1`).all();
for (const m of migrations) console.log(`   ${m.nom} : ${m.depart} → ${m.arrivee}`);
verifier('migration détectée', migrations.length >= 1, JSON.stringify(migrations));

console.log('\nRéseau de recommandation (qui adresse des joueurs, et où) :');
const reseau = db.prepare(`
  SELECT pe.nom AS recommandant, st.nom AS destination, r.n
  FROM v_reseau_recommandation r
  JOIN personnes pe ON pe.id = r.recommandant
  JOIN structures st ON st.id = r.structure_destination`).all();
for (const r of reseau) console.log(`   ${r.recommandant} → ${r.destination} (${r.n})`);
verifier('réseau de recommandation reconstitué', reseau.length === 2, JSON.stringify(reseau));

// --- Recherche par distance : encadrement rectangulaire puis calcul exact
console.log('\nStructures à moins de 5 km de Nkolbisson (3.868, 11.435) :');
const [lat0, lon0, rayonKm] = [3.868, 11.435, 5];
// Un degré de latitude fait ~111 km ; en longitude, ce chiffre se resserre
// vers les pôles, d'où la division par le cosinus de la latitude.
const dLat = rayonKm / 111;
const dLon = rayonKm / (111 * Math.cos(lat0 * Math.PI / 180));
const candidats = db.prepare(`
  SELECT id, nom, lat, lon FROM structures
  WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?`)
  .all(lat0 - dLat, lat0 + dLat, lon0 - dLon, lon0 + dLon);

function distanceKm(a, b, c, d) {
  const R = 6371, r = Math.PI / 180;
  return 2 * R * Math.asin(Math.sqrt(
    Math.sin((c - a) * r / 2) ** 2 +
    Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2));
}
const proches = candidats
  .map(s => ({ ...s, km: distanceKm(lat0, lon0, s.lat, s.lon) }))
  .filter(s => s.km <= rayonKm)
  .sort((x, y) => x.km - y.km);
for (const s of proches) console.log(`   ${s.km.toFixed(1)} km   ${s.nom}`);

verifier('présélection rectangulaire efficace', candidats.length < 6, String(candidats.length));
verifier('Maroua exclue du rayon', !proches.some(s => s.nom.includes('Maroua')));
verifier('Douala exclue du rayon', !proches.some(s => s.nom.includes('littoral')));
verifier('structures de Yaoundé trouvées', proches.length >= 3, String(proches.length));

// Contrôle du calcul sur une distance connue : Yaoundé–Douala ≈ 200 km.
const controle = distanceKm(3.87, 11.52, 4.05, 9.70);
verifier('distance Yaoundé–Douala plausible', controle > 190 && controle < 215, `${controle.toFixed(0)} km`);

console.log('\nFiabilité des traces :');
const fiab = db.prepare('SELECT fiabilite, COUNT(*) n FROM etapes GROUP BY fiabilite').all();
for (const f of fiab) console.log(`   ${f.n}  ${f.fiabilite}`);
verifier('deux régimes de fiabilité coexistent', fiab.length === 2, JSON.stringify(fiab));

console.log(`\nschema : ${total - echecs}/${total} assertions passées`);
if (echecs > 0) process.exit(1);
