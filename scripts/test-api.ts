/**
 * Tests de bout en bout de l'API.
 *
 * Le routeur est appelé directement avec de vraies requêtes HTTP et une base
 * en mémoire. Ce sont les véritables routes, validations et règles de droits
 * qui s'exécutent ; seule l'infrastructure est simulée.
 *
 * Lancement : node --experimental-strip-types scripts/test-api.ts
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import app from '../src/api/index.ts';
import { creerEnv, creerClient } from './lib/base-test.mjs';
import { hacher } from '../src/api/lib/auth.ts';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const schemaSql = readFileSync(join(racine, 'db', 'schema.sql'), 'utf8');
const seedSql = readFileSync(join(racine, 'db', 'seed.sql'), 'utf8');

let echecs = 0, total = 0;
function verifier(intitule: string, condition: boolean, detail: unknown = '') {
  total++;
  if (!condition) {
    echecs++;
    const d = typeof detail === 'string' ? detail : JSON.stringify(detail);
    console.error(`  ECHEC  ${intitule}${d ? ' — ' + d : ''}`);
  }
}

async function contexte() {
  const { env, brut } = creerEnv({ schemaSql, seedSql });

  brut.exec(`
    INSERT INTO structures (id, nom, type_id, unite_id, lat, lon, verifiee) VALUES
      ('s-rue',  'Terrain de Nkolbisson', 'informel', 'yde7', 3.868, 11.435, 0),
      ('s-acad', 'Académie Wildcats',     'academie', 'yde6', 3.862, 11.452, 1),
      ('s-lyc',  'Lycée d''Ekorezock',    'scolaire', 'yde2', 3.893, 11.488, 1),
      ('s-mar',  'Club de Maroua',        'informel', 'mar1', 10.592, 14.318, 0),
      ('s-dla',  'Académie du Littoral',  'academie', 'dla5', 4.032, 9.751, 1);

    INSERT INTO personnes (id, nom, est_sportif) VALUES ('amorce', 'Amorce', 1);
    INSERT INTO sportifs (personne_id, discipline_id) VALUES ('amorce', 'basket');
  `);

  // Comptes de test, avec un vrai mot de passe haché : les tests traversent
  // le mécanisme d'authentification réel plutôt qu'un raccourci.
  const hash = await hacher('motdepasse123', env.SEL_MOT_DE_PASSE);
  const inserer = brut.prepare(
    `INSERT INTO personnes (id, nom, email, hash_mdp, role, structure_id, unite_id,
                            est_encadrant, est_recruteur)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  inserer.run('c-acad', 'Coach académie', 'acad@test', hash, 'encadrant', 's-acad', 'yde6', 1, 0);
  inserer.run('c-autre', 'Coach autre club', 'autre@test', hash, 'encadrant', 's-lyc', 'yde2', 1, 0);
  inserer.run('r-1', 'Recruteur', 'recruteur@test', hash, 'recruteur', null, 'dla5', 0, 1);
  inserer.run('adm', 'Administrateur', 'admin@test', hash, 'admin', null, 'yde1', 0, 0);

  brut.exec(`
    INSERT INTO etapes (id, sportif_id, structure_id, discipline_id, unite_id,
                        debut, niveau, fiabilite, atteste_par, atteste_le)
    VALUES ('e-amorce','amorce','s-acad','basket','yde6','2020-01','regional',
            'attestee','c-acad','2020-01-01T00:00:00Z');
    INSERT INTO etapes (id, sportif_id, structure_id, discipline_id, unite_id,
                        debut, niveau, fiabilite, atteste_par, atteste_le)
    VALUES ('e-amorce2','amorce','s-lyc','basket','yde2','2019-01','scolaire',
            'attestee','c-autre','2019-01-01T00:00:00Z');
  `);

  const client = creerClient(app, env);

  /**
   * Ouvre une session pour un compte existant et renvoie un client qui la
   * conserve. Les tests passent ainsi par le vrai mécanisme d'authentification
   * plutôt que par un raccourci.
   */
  async function connecter(email: string, motDePasse = 'motdepasse123') {
    const c = creerClient(app, env);
    const r = await c.post('/comptes/connexion', { email, motDePasse });
    if (r.statut !== 200) throw new Error('connexion impossible : ' + JSON.stringify(r.json));
    return c;
  }

  return { env, brut, client, connecter };
}

// =====================================================================
// Référentiels
// =====================================================================
{
  const { client } = await contexte();

  const sante = await client.get('/sante');
  verifier('service en ligne', sante.statut === 200 && sante.json.ok === true);

  const ref = await client.get('/referentiels');
  verifier('unités administratives servies', ref.json.unites.length >= 18, ref.json.unites?.length);
  // Football, basketball, judo, karaté, nanbudo.
  verifier('cinq disciplines de départ', ref.json.disciplines.length === 5,
    ref.json.disciplines.map((d: any) => d.nom));
  verifier('postes de football et de basket', ref.json.postes.length === 13, ref.json.postes?.length);
  verifier('types de structure ordonnés',
    ref.json.typesStructure[0].rang === 1
    && ref.json.typesStructure.at(-1).rang === 7, JSON.stringify(ref.json.typesStructure?.[0]));
  verifier('modes de transition avec libellés lisibles',
    ref.json.modesTransition.some((m: any) => m.nom === 'Vu jouer au quartier'));
  verifier('motifs de fin exposés', ref.json.motifsFin.length === 9);
}

// =====================================================================
// Création d'un sportif et de son socle
// =====================================================================
{
  const { connecter, brut } = await contexte();
  const coach = await connecter('acad@test');

  const r = await coach.post('/sportifs', {
    nom: 'Yann Ngaha', naissance: '2009-02-13', sexe: 'M',
    disciplineId: 'basket', posteId: 'b-mn', uniteOrigineId: 'yde1',
    socle: {
      agePremierContact: 9, agePremiereStructure: 12,
      contexteInitial: 'ecole', soutienFamille: 'fort',
      encadrementInitial: 'qualifie', consentement: true,
    },
  });
  verifier('sportif créé', r.statut === 201, r.json);

  const socle = brut.prepare('SELECT * FROM socles WHERE sportif_id = ?').get(r.json.sportif.id);
  verifier('socle enregistré', socle?.age_premier_contact === 9, socle);
  verifier('consentement conservé', socle?.consentement_analyse === 1);

  const mauvaisContexte = await coach.post('/sportifs', {
    nom: 'X', disciplineId: 'basket', socle: { contexteInitial: 'stade' },
  });
  verifier('valeur hors nomenclature refusée', mauvaisContexte.statut === 400, mauvaisContexte.json);
  verifier('message cite les valeurs acceptées',
    String(mauvaisContexte.json.erreur).includes('rue_quartier'), mauvaisContexte.json.erreur);

  const dateFausse = await coach.post('/sportifs', {
    nom: 'Y', disciplineId: 'basket', naissance: '13/02/2009',
  });
  verifier('date de naissance mal formée refusée', dateFausse.statut === 400, dateFausse.json);

  const disciplineInconnue = await coach.post('/sportifs', { nom: 'Z', disciplineId: 'rugby' });
  verifier('discipline inconnue refusée', disciplineInconnue.statut === 400);
}

// =====================================================================
// Saisie d'une étape : le geste central
// =====================================================================
{
  const { connecter, brut } = await contexte();
  const coach = await connecter('acad@test');

  const s = await coach.post('/sportifs', {
    nom: 'Keurtys Kengne', naissance: '2009-01-05', disciplineId: 'basket', uniteOrigineId: 'yde7',
  });
  const id = s.json.sportif.id;

  // Première étape : repéré au quartier.
  const e1 = await coach.post(`/sportifs/${id}/etapes`, {
    structureId: 's-rue', debut: '2022-03', niveau: 'quartier', mode: 'reperage_informel',
  });
  verifier('étape créée', e1.statut === 201, e1.json);
  verifier('aucune étape précédente à clore', e1.json.etapePrecedenteClose === null);

  const transitions = brut.prepare('SELECT * FROM transitions WHERE sportif_id = ?').all(id);
  verifier('transition créée en même temps que l’étape', transitions.length === 1, transitions);
  verifier('mode enregistré', transitions[0].mode === 'reperage_informel');
  verifier('première transition sans étape antérieure', transitions[0].etape_avant === null);

  // Deuxième étape : l'académie du coach. L'étape précédente doit se clore.
  const e2 = await coach.post(`/sportifs/${id}/etapes`, {
    structureId: 's-acad', debut: '2023-02', niveau: 'regional',
    mode: 'recommandation', agentId: 'c-autre', motifFin: 'progression',
  });
  verifier('deuxième étape créée', e2.statut === 201, e2.json);
  verifier('étape précédente close automatiquement',
    e2.json.etapePrecedenteClose !== null, e2.json);

  const premiere = brut.prepare('SELECT fin, motif_fin FROM etapes WHERE id = ?')
    .get(e2.json.etapePrecedenteClose);
  verifier('date de fin posée', premiere.fin === '2023-02', premiere);
  verifier('motif de fin enregistré', premiere.motif_fin === 'progression', premiere);

  const ouvertes = brut.prepare(
    'SELECT COUNT(*) n FROM etapes WHERE sportif_id = ? AND fin IS NULL').get(id);
  verifier('une seule étape ouverte à la fois', ouvertes.n === 1, ouvertes);

  // L'encadrant de la structure d'accueil atteste d'emblée.
  verifier('étape saisie par l’encadrant d’accueil attestée', e2.json.etape.fiabilite === 'attestee',
    e2.json.etape);

  // Une étape saisie par un encadrant extérieur reste reconstituée.
  const autre = await connecter('autre@test');
  const e3 = await autre.post(`/sportifs/${id}/etapes`, {
    structureId: 's-acad', debut: '2024-01', niveau: 'regional', mode: 'transfert',
  });
  verifier('étape saisie par un tiers reste reconstituée',
    e3.json.etape.fiabilite === 'reconstituee', e3.json.etape);

  // Validations
  const sansMode = await coach.post(`/sportifs/${id}/etapes`, {
    structureId: 's-acad', debut: '2025-01', niveau: 'regional',
  });
  verifier('mode d’arrivée obligatoire', sansMode.statut === 400, sansMode.json);

  const dateIncomplete = await coach.post(`/sportifs/${id}/etapes`, {
    structureId: 's-acad', debut: '2025', niveau: 'regional', mode: 'transfert',
  });
  verifier('date mal formée refusée', dateIncomplete.statut === 400, dateIncomplete.json);

  const moisSeul = await coach.post(`/sportifs/${id}/etapes`, {
    structureId: 's-acad', debut: '2025-06', niveau: 'regional', mode: 'transfert',
  });
  verifier('date au mois près acceptée', moisSeul.statut === 201, moisSeul.json);

  const structureInconnue = await coach.post(`/sportifs/${id}/etapes`, {
    structureId: 'inexistante', debut: '2025-01', niveau: 'regional', mode: 'transfert',
  });
  verifier('structure inconnue refusée', structureInconnue.statut === 404);

  const anonyme = await (creerClient(app, (await contexte()).env)).post(`/sportifs/${id}/etapes`, {
    structureId: 's-acad', debut: '2025-01', niveau: 'regional', mode: 'transfert',
  });
  verifier('saisie refusée sans compte', anonyme.statut === 401, anonyme.json);
}

// =====================================================================
// Attestation
// =====================================================================
{
  const { connecter, brut } = await contexte();
  const coachAcad = await connecter('acad@test');
  const coachAutre = await connecter('autre@test');

  const s = await coachAcad.post('/sportifs', { nom: 'Test', disciplineId: 'basket' });
  const id = s.json.sportif.id;

  // Étape dans l'académie, saisie par un encadrant extérieur : reconstituée.
  const e = await coachAutre.post(`/sportifs/${id}/etapes`, {
    structureId: 's-acad', debut: '2024-01', niveau: 'regional', mode: 'demarche_famille',
  });
  const etapeId = brut.prepare(
    'SELECT id FROM etapes WHERE sportif_id = ? ORDER BY rowid DESC LIMIT 1').get(id).id;
  verifier('étape initialement reconstituée', e.json.etape.fiabilite === 'reconstituee');

  const refus = await coachAutre.post(`/etapes/${etapeId}/attester`);
  verifier('un encadrant extérieur ne peut pas attester', refus.statut === 403, refus.json);

  const ok = await coachAcad.post(`/etapes/${etapeId}/attester`);
  verifier('l’encadrant de la structure atteste', ok.statut === 200, ok.json);

  const apres = brut.prepare('SELECT fiabilite, atteste_par FROM etapes WHERE id = ?').get(etapeId);
  verifier('fiabilité passée à attestée', apres.fiabilite === 'attestee', apres);
  verifier('auteur de l’attestation conservé', apres.atteste_par === 'c-acad', apres);

  const transition = brut.prepare(
    'SELECT fiabilite FROM transitions WHERE etape_apres = ?').get(etapeId);
  verifier('la transition suit l’étape', transition.fiabilite === 'attestee', transition);

  const deuxieme = await coachAcad.post(`/etapes/${etapeId}/attester`);
  verifier('attestation idempotente', deuxieme.json.deja === true, deuxieme.json);
}

// =====================================================================
// Clôture et déperdition
// =====================================================================
{
  const { connecter, brut } = await contexte();
  const coach = await connecter('acad@test');

  const s = await coach.post('/sportifs', { nom: 'Steve', disciplineId: 'basket' });
  const id = s.json.sportif.id;
  await coach.post(`/sportifs/${id}/etapes`, {
    structureId: 's-rue', debut: '2020-01', niveau: 'quartier', mode: 'reperage_informel',
  });
  const etapeId = brut.prepare(
    'SELECT id FROM etapes WHERE sportif_id = ? LIMIT 1').get(id).id;

  const avant = await coach.post(`/etapes/${etapeId}/cloturer`, {
    fin: '2019-01', motifFin: 'financier',
  });
  verifier('date de fin antérieure au début refusée', avant.statut === 400, avant.json);

  const r = await coach.post(`/etapes/${etapeId}/cloturer`, {
    fin: '2024-12', motifFin: 'financier',
  });
  verifier('clôture acceptée', r.statut === 200, r.json);

  const statut = brut.prepare('SELECT statut FROM sportifs WHERE personne_id = ?').get(id);
  verifier('parcours marqué interrompu', statut.statut === 'interrompu', statut);

  const motifLibre = await coach.post(`/etapes/${etapeId}/cloturer`, {
    fin: '2024-12', motifFin: 'pas envie',
  });
  verifier('motif hors nomenclature refusé', motifLibre.statut === 400);
}

// =====================================================================
// Mesures : unités contraintes
// =====================================================================
{
  const { connecter } = await contexte();
  const coach = await connecter('acad@test');
  const s = await coach.post('/sportifs', { nom: 'Mesuré', disciplineId: 'basket' });
  const id = s.json.sportif.id;

  const ok = await coach.post('/referentiels/mesures', {
    sportifId: id, type: 'taille_cm', valeur: 190, date: '2026-03-01',
  });
  verifier('mesure enregistrée', ok.statut === 201, ok.json);
  verifier('source déduite du rôle', ok.json.mesure.source === 'encadrant', ok.json);

  // Le piège du questionnaire : une taille saisie en mètres.
  const enMetres = await coach.post('/referentiels/mesures', {
    sportifId: id, type: 'taille_cm', valeur: 1.8, date: '2026-03-02',
  });
  verifier('taille en mètres rejetée', enMetres.statut === 400, enMetres.json);
  verifier('message indique les bornes',
    String(enMetres.json.erreur).includes('100'), enMetres.json.erreur);

  const typeLibre = await coach.post('/referentiels/mesures', {
    sportifId: id, type: 'puissance', valeur: 10,
  });
  verifier('type de mesure libre refusé', typeLibre.statut === 400);

  const doublon = await coach.post('/referentiels/mesures', {
    sportifId: id, type: 'taille_cm', valeur: 191, date: '2026-03-01',
  });
  verifier('doublon de mesure refusé', doublon.statut === 409, doublon.json);
}

// =====================================================================
// Consultation d'un parcours
// =====================================================================
{
  const { connecter, client } = await contexte();
  const coach = await connecter('acad@test');

  const s = await coach.post('/sportifs', {
    nom: 'Ralph Boloken', naissance: '2005-03-22', disciplineId: 'basket',
    uniteOrigineId: 'mar1',
    socle: { agePremierContact: 8, agePremiereStructure: 16, contexteInitial: 'rue_quartier' },
  });
  const id = s.json.sportif.id;

  await coach.post(`/sportifs/${id}/etapes`, {
    structureId: 's-mar', debut: '2019-05', niveau: 'quartier', mode: 'reperage_informel',
  });
  await coach.post(`/sportifs/${id}/etapes`, {
    structureId: 's-acad', debut: '2021-09', niveau: 'regional',
    mode: 'recommandation', agentId: 'c-autre', motifFin: 'demenagement',
  });

  const p = await client.get(`/sportifs/${id}/parcours`);
  verifier('parcours servi', p.statut === 200, p.json);
  verifier('deux étapes', p.json.etapes.length === 2, p.json.etapes?.length);
  verifier('ordre chronologique', p.json.etapes[0].debut === '2019-05');
  verifier('mode d’arrivée exposé', p.json.etapes[1].arriveePar === 'recommandation');
  verifier('agent nommé', p.json.etapes[1].agent === 'Coach d’un autre club'
    || p.json.etapes[1].agent?.includes('autre'), p.json.etapes[1].agent);

  verifier('progression détectée', p.json.etapes[1].evolution === 'progression',
    p.json.etapes[1].evolution);
  // Maroua–Yaoundé à vol d'oiseau : environ 810 km. La valeur sert de
  // contrôle du calcul de distance sur une paire connue.
  verifier('distance entre étapes calculée',
    p.json.etapes[1].distanceEtapePrecedente > 780
    && p.json.etapes[1].distanceEtapePrecedente < 840,
    p.json.etapes[1].distanceEtapePrecedente);

  verifier('migration repérée', p.json.resume.aMigre === true, p.json.resume);
  verifier('délai d’encadrement calculé', p.json.debuts.delaiEncadrement === 8, p.json.debuts);
  verifier('âge exposé sans la date de naissance',
    typeof p.json.sportif.age === 'number' && p.json.sportif.naissance === undefined,
    p.json.sportif);

  const absent = await client.get('/sportifs/inexistant/parcours');
  verifier('sportif inconnu -> 404', absent.statut === 404);
}

// =====================================================================
// Analyses territoriales
// =====================================================================
{
  const { connecter, client } = await contexte();
  const coach = await connecter('acad@test');

  async function creer(nom: string, origine: string, socle: any, etapes: any[]) {
    const s = await coach.post('/sportifs', {
      nom, disciplineId: 'basket', uniteOrigineId: origine, socle,
    });
    for (const e of etapes) await coach.post(`/sportifs/${s.json.sportif.id}/etapes`, e);
    return s.json.sportif.id;
  }

  await creer('Urbain 1', 'yde1', { agePremierContact: 9, agePremiereStructure: 12 }, [
    { structureId: 's-lyc', debut: '2021-01', niveau: 'scolaire', mode: 'demarche_famille' },
    { structureId: 's-acad', debut: '2022-09', niveau: 'regional', mode: 'reperage_tournoi',
      agentId: 'c-acad', motifFin: 'progression' },
  ]);
  await creer('Urbain 2', 'yde7', { agePremierContact: 10, agePremiereStructure: 13 }, [
    { structureId: 's-rue', debut: '2022-03', niveau: 'quartier', mode: 'reperage_informel' },
    { structureId: 's-acad', debut: '2023-02', niveau: 'regional', mode: 'recommandation',
      agentId: 'c-acad', motifFin: 'progression' },
  ]);
  await creer('Périphérie', 'mar1', { agePremierContact: 8, agePremiereStructure: 16 }, [
    { structureId: 's-mar', debut: '2019-05', niveau: 'quartier', mode: 'reperage_informel' },
    { structureId: 's-acad', debut: '2021-09', niveau: 'regional', mode: 'recommandation',
      agentId: 'c-autre', motifFin: 'demenagement' },
  ]);

  const regions = await client.get('/analyses/talents-par-region');
  verifier('effectifs par région', regions.json.regions.length >= 2, regions.json.regions);
  verifier('effectif rapporté à la population',
    regions.json.regions.every((r: any) => r.pourCentMille !== null), regions.json.regions[0]);

  const detection = await client.get('/analyses/detection-par-territoire');
  verifier('part informelle calculée',
    detection.json.territoires.every((t: any) => typeof t.partInformelle === 'number'),
    detection.json.territoires[0]);
  verifier('territoires triés par carence décroissante',
    detection.json.territoires[0].partInformelle
      >= detection.json.territoires.at(-1).partInformelle);

  const delais = await client.get('/analyses/delai-encadrement');
  verifier('délai global en médiane', typeof delais.json.global === 'number', delais.json);
  const periph = delais.json.parRegion.find((r: any) => r.region === 'Extrême-Nord');
  verifier('la périphérie ressort avec le délai le plus long',
    delais.json.parRegion[0].region === 'Extrême-Nord' && periph.maxiAns === 8,
    JSON.stringify(delais.json.parRegion));

  const flux = await client.get('/analyses/flux');
  verifier('flux migratoire repéré', flux.json.flux.length >= 1, flux.json.flux);

  const reseau = await client.get('/analyses/reseau');
  verifier('réseau de recommandation reconstitué', reseau.json.liens.length >= 1, reseau.json.liens);

  const deperdition = await client.get('/analyses/deperdition');
  verifier('statuts comptés', deperdition.json.statuts.length >= 1, deperdition.json.statuts);

  const proches = await client.get('/analyses/structures-proches?lat=3.868&lon=11.435&rayon=5');
  verifier('structures proches trouvées', proches.json.structures.length >= 2,
    proches.json.structures?.length);
  verifier('Maroua exclue du rayon',
    !proches.json.structures.some((s: any) => s.nom.includes('Maroua')));
  verifier('Douala exclue du rayon',
    !proches.json.structures.some((s: any) => s.nom.includes('Littoral')));
  verifier('résultats triés par distance',
    proches.json.structures[0].km <= proches.json.structures.at(-1).km,
    JSON.stringify(proches.json.structures.map((s: any) => s.km)));

  const positionInvalide = await client.get('/analyses/structures-proches?lat=abc&lon=11');
  verifier('position invalide refusée', positionInvalide.statut === 400);
}

// =====================================================================
// Recherche
// =====================================================================
{
  const { connecter, client } = await contexte();
  const coach = await connecter('acad@test');

  const a = await coach.post('/sportifs', {
    nom: 'Meneur basket', naissance: '2009-02-13', disciplineId: 'basket',
    posteId: 'b-mn', uniteOrigineId: 'yde1',
  });
  await coach.post('/sportifs', {
    nom: 'Défenseur foot', naissance: '2011-02-23', disciplineId: 'foot',
    posteId: 'f-dc', uniteOrigineId: 'yde7',
  });
  await coach.post('/sportifs', {
    nom: 'Ancien', naissance: '2000-01-01', disciplineId: 'basket', uniteOrigineId: 'mar1',
  });

  await coach.post(`/sportifs/${a.json.sportif.id}/etapes`, {
    structureId: 's-acad', debut: '2024-01', niveau: 'regional', mode: 'reperage_tournoi',
  });

  // Le jeu d'essai contient un sportif d'amorçage, d'où quatre résultats.
  const tout = await client.get('/recherche');
  verifier('recherche sans filtre', tout.json.resultats.length === 4, tout.json.resultats?.length);

  const parDiscipline = await client.get('/recherche?discipline=foot');
  verifier('filtre par discipline', parDiscipline.json.resultats.length === 1);

  const parPoste = await client.get('/recherche?poste=b-mn');
  verifier('filtre par poste', parPoste.json.resultats.length === 1);

  const parRegion = await client.get('/recherche?region=cm-en');
  verifier('filtre par région', parRegion.json.resultats.length === 1, parRegion.json.resultats);
  verifier('le bon sportif ressort du filtre régional',
    parRegion.json.resultats[0].nom === 'Ancien', parRegion.json.resultats);

  const jeunes = await client.get('/recherche?age_max=18');
  verifier('filtre par âge maximum', jeunes.json.resultats.length === 2, jeunes.json.resultats);

  const attestes = await client.get('/recherche?attestes=1');
  verifier('filtre sur parcours attestés', attestes.json.resultats.length === 2,
    attestes.json.resultats?.length);
  verifier('les parcours sans attestation sont écartés',
    !attestes.json.resultats.some((r: any) => r.nom === 'Défenseur foot'),
    attestes.json.resultats);
  // Le tri place en tête les parcours les mieux attestés : c'est ce qu'un
  // recruteur cherche en premier.
  verifier('tri par nombre d’attestations',
    attestes.json.resultats[0].nbAttestees >= attestes.json.resultats[1].nbAttestees,
    attestes.json.resultats);
}

// =====================================================================
// Robustesse
// =====================================================================
{
  const { connecter, client } = await contexte();
  const coach = await connecter('acad@test');

  const s = await coach.post('/sportifs', { nom: 'Robuste', disciplineId: 'basket' });

  // Corps envoyé sans en-tête de type de contenu : le piège qui fait
  // échouer l'analyse JSON native et accuser le mauvais champ.
  const sansEntete = await coach.postSansEntete('/sportifs',
    { nom: 'Sans en-tête', disciplineId: 'basket' });
  verifier('corps lu sans en-tête de type', sansEntete.statut === 201, sansEntete.json);

  const corpsVide = await coach.post('/sportifs', {});
  verifier('corps vide -> champ désigné', corpsVide.json.champ === 'nom', corpsVide.json);

  const inconnue = await client.get('/chemin-inexistant');
  verifier('route inconnue -> 404', inconnue.statut === 404);

  // Régression : l'application ajoute une barre finale à toutes ses adresses,
  // y compris celles des services. Le module métier déclare ses routes sans
  // barre, et répondait 404 à chaque appel — symptôme trompeur, puisque les
  // pages s'affichaient normalement. Le point de montage normalise désormais
  // l'adresse ; ce test garde la trace de l'erreur.
  const normaliser = (chemin: string) =>
    chemin.length > 1 && chemin.endsWith('/') ? chemin.slice(0, -1) : chemin;
  verifier('barre finale retirée', normaliser('/referentiels/') === '/referentiels');
  verifier('racine préservée', normaliser('/') === '/');
  verifier('adresse sans barre inchangée', normaliser('/sante') === '/sante');
}


// =====================================================================
// Comptes : inscription, connexion, droits
// =====================================================================
{
  const { client, brut } = await contexte();

  const inscription = await client.post('/comptes/inscription', {
    nom: 'Nouvel encadrant', email: 'Nouveau@Test.CM',
    motDePasse: 'motdepasse123', role: 'encadrant',
  });
  verifier('inscription acceptée', inscription.statut === 201, inscription.json);
  verifier('rôle conservé', inscription.json.compte.role === 'encadrant');
  verifier('compte créé sans structure', inscription.json.compte.structure_id === null);

  // L'adresse est normalisée en minuscules : sans cela, « Nouveau@Test.CM »
  // et « nouveau@test.cm » créeraient deux comptes distincts.
  const enBase = brut.prepare("SELECT email FROM personnes WHERE nom = 'Nouvel encadrant'").get();
  verifier('adresse normalisée', enBase.email === 'nouveau@test.cm', enBase);

  const moi = await client.get('/comptes/moi');
  verifier('session ouverte à l’inscription', moi.json.compte?.nom === 'Nouvel encadrant', moi.json);
  verifier('encadrant sans structure ne peut pas attester', moi.json.peutAttester === false, moi.json);

  const doublon = await client.post('/comptes/inscription', {
    nom: 'Doublon', email: 'nouveau@test.cm', motDePasse: 'motdepasse123', role: 'encadrant',
  });
  verifier('adresse déjà utilisée refusée', doublon.statut === 409, doublon.json);

  const mdpCourt = await client.post('/comptes/inscription', {
    nom: 'X', email: 'x@test.cm', motDePasse: 'court', role: 'encadrant',
  });
  verifier('mot de passe trop court refusé', mdpCourt.statut === 400, mdpCourt.json);

  const emailInvalide = await client.post('/comptes/inscription', {
    nom: 'X', email: 'pas-une-adresse', motDePasse: 'motdepasse123', role: 'encadrant',
  });
  verifier('adresse invalide refusée', emailInvalide.statut === 400, emailInvalide.json);

  // Le rôle d'administrateur n'est pas ouvert à l'inscription libre : il donne
  // accès au référentiel territorial dont dépendent toutes les analyses.
  const autoAdmin = await client.post('/comptes/inscription', {
    nom: 'Malin', email: 'malin@test.cm', motDePasse: 'motdepasse123', role: 'admin',
  });
  verifier('inscription en administrateur refusée', autoAdmin.statut === 400, autoAdmin.json);
}

{
  const { client } = await contexte();

  const mauvais = await client.post('/comptes/connexion', {
    email: 'acad@test', motDePasse: 'faux',
  });
  verifier('mot de passe faux refusé', mauvais.statut === 401, mauvais.statut);

  const inconnu = await client.post('/comptes/connexion', {
    email: 'personne@test', motDePasse: 'motdepasse123',
  });
  verifier('adresse inconnue refusée', inconnu.statut === 401);
  // Les deux messages doivent être identiques : les distinguer permettrait de
  // découvrir quelles adresses ont un compte.
  verifier('message indiscernable entre les deux cas',
    mauvais.json.erreur === inconnu.json.erreur, [mauvais.json.erreur, inconnu.json.erreur]);

  const ok = await client.post('/comptes/connexion', {
    email: 'acad@test', motDePasse: 'motdepasse123',
  });
  verifier('connexion réussie', ok.statut === 200, ok.json);
  verifier('structure rattachée exposée', ok.json.compte.structure_id === 's-acad', ok.json);

  await client.post('/comptes/deconnexion');
  const apres = await client.get('/comptes/moi');
  verifier('déconnexion effective', apres.json.compte === null, apres.json);
}

{
  // Désactivation : l'accès doit tomber immédiatement, sessions comprises.
  const { connecter, brut } = await contexte();
  const admin = await connecter('admin@test');
  const coach = await connecter('acad@test');

  const avant = await coach.get('/comptes/moi');
  verifier('session valide avant désactivation', avant.json.compte !== null);

  const r = await admin.post('/comptes/c-acad/desactiver');
  verifier('désactivation acceptée', r.statut === 200, r.json);

  const apres = await coach.get('/comptes/moi');
  verifier('session coupée immédiatement', apres.json.compte === null, apres.json);

  const sessions = brut.prepare("SELECT COUNT(*) n FROM sessions WHERE personne_id = 'c-acad'").get();
  verifier('sessions supprimées', sessions.n === 0, sessions);

  const suicide = await admin.post('/comptes/adm/desactiver');
  verifier('désactivation de son propre compte refusée', suicide.statut === 400, suicide.json);
}

{
  // Un encadrant ne peut pas accéder à l'administration des référentiels.
  const { connecter } = await contexte();
  const coach = await connecter('acad@test');
  const admin = await connecter('admin@test');

  const refuse = await coach.get('/administration/unites');
  verifier('administration fermée aux encadrants', refuse.statut === 403, refuse.statut);

  const ouvert = await admin.get('/administration/unites');
  verifier('administration ouverte à l’administrateur', ouvert.statut === 200);

  const comptes = await coach.get('/comptes');
  verifier('liste des comptes réservée', comptes.statut === 403);
}

// =====================================================================
// Administration des référentiels
// =====================================================================
{
  const { connecter } = await contexte();
  const admin = await connecter('admin@test');

  const unites = await admin.get('/administration/unites');
  verifier('unités listées avec leur usage',
    unites.json.unites.every((u: any) => 'nb_structures' in u), unites.json.unites?.[0]);

  const nouvelle = await admin.post('/administration/unites', {
    nom: 'Bafoussam IIe', code: 'CM-OU-BFSM2', niveau: 'arrondissement', parentId: 'cm-ou',
    lat: 5.47, lon: 10.41, population: 180000,
  });
  verifier('arrondissement créé', nouvelle.statut === 201, nouvelle.json);

  const sansParent = await admin.post('/administration/unites', {
    nom: 'Orphelin', code: 'CM-XX-ORPH', niveau: 'arrondissement',
  });
  verifier('arrondissement sans parent refusé', sansParent.statut === 400, sansParent.json);

  // La hiérarchie ne doit pas pouvoir s'inverser : un arrondissement ne peut
  // pas contenir une région, sinon les agrégations cessent de remonter.
  const inversion = await admin.post('/administration/unites', {
    nom: 'Région bancale', code: 'CM-XX-REG', niveau: 'region', parentId: 'yde1',
  });
  verifier('hiérarchie inversée refusée', inversion.statut === 400, inversion.json);

  const codeDouble = await admin.post('/administration/unites', {
    nom: 'Autre', code: 'CM-OU-BFSM2', niveau: 'arrondissement', parentId: 'cm-ou',
  });
  verifier('code déjà utilisé refusé', codeDouble.statut === 409, codeDouble.json);

  const latFausse = await admin.post('/administration/unites', {
    nom: 'Hors monde', code: 'CM-XX-HM', niveau: 'arrondissement', parentId: 'cm-ou', lat: 200,
  });
  verifier('latitude hors bornes refusée', latFausse.statut === 400, latFausse.json);

  // Structures
  const structure = await admin.post('/administration/structures', {
    nom: 'Nouvelle académie', typeId: 'academie', uniteId: 'dla5', lat: 4.03, lon: 9.75,
  });
  verifier('structure créée', structure.statut === 201, structure.json);
  verifier('pas d’avertissement quand la position est fournie',
    structure.json.avertissement === null, structure.json);

  const sansPosition = await admin.post('/administration/structures', {
    nom: 'Club sans adresse', typeId: 'club_loc', uniteId: 'yde1',
  });
  verifier('structure sans position acceptée', sansPosition.statut === 201);
  verifier('mais signalée',
    String(sansPosition.json.avertissement).includes('carte'), sansPosition.json);

  const typeInconnu = await admin.post('/administration/structures', {
    nom: 'X', typeId: 'inexistant', uniteId: 'yde1',
  });
  verifier('type de structure inconnu refusé', typeInconnu.statut === 400);

  // Discipline avec ses postes
  const discipline = await admin.post('/administration/disciplines', {
    nom: 'Athlétisme', postes: ['Sprint', 'Demi-fond', 'Saut en hauteur'],
  });
  verifier('discipline créée avec ses postes',
    discipline.statut === 201 && discipline.json.discipline.postes === 3, discipline.json);

  const ref = await admin.get('/referentiels');
  verifier('nouvelle discipline dans les référentiels',
    ref.json.disciplines.some((d: any) => d.nom === 'Athlétisme'), ref.json.disciplines);

  // Rattachement d'un compte
  const rattache = await admin.post('/comptes/r-1/rattacher', {
    structureId: 's-acad', role: 'encadrant',
  });
  verifier('compte rattaché à une structure', rattache.statut === 200, rattache.json);

  const structureInconnue = await admin.post('/comptes/r-1/rattacher', {
    structureId: 'inexistante',
  });
  verifier('rattachement à une structure inconnue refusé', structureInconnue.statut === 404);

  // État de la plateforme
  const etat = await admin.get('/administration/etat');
  verifier('état de la plateforme servi', etat.statut === 200 && etat.json.etat.regions === 10,
    etat.json.etat);
  verifier('manques signalés nommément', Array.isArray(etat.json.alertes), etat.json.alertes);
  verifier('structures sans position remontées',
    etat.json.alertes.some((a: string) => a.includes('position')), etat.json.alertes);
}


// =====================================================================
// Accès sportif : ouverture par l'encadrant, activation, contestation
// =====================================================================
{
  const { connecter, client, brut } = await contexte();
  const coach = await connecter('acad@test');

  // Un sportif majeur, avec une étape dans la structure du coach.
  const s = await coach.post('/sportifs', {
    nom: 'Majeur Test', naissance: '2004-05-10', disciplineId: 'basket',
  });
  const id = s.json.sportif.id;
  await coach.post(`/sportifs/${id}/etapes`, {
    structureId: 's-acad', debut: '2023-01', niveau: 'regional', mode: 'reperage_tournoi',
  });

  const acces = await coach.post(`/sportifs/${id}/acces`);
  verifier('accès ouvert par l’encadrant', acces.statut === 201, acces.json);
  verifier('code lisible et sans caractère ambigu',
    /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(acces.json.acces.code), acces.json.acces.code);
  verifier('code destiné au sportif majeur', acces.json.acces.destinataire === 'sportif');

  // Un encadrant d'une autre structure ne peut pas ouvrir cet accès.
  const autre = await connecter('autre@test');
  const refus = await autre.post(`/sportifs/${id}/acces`);
  verifier('encadrant d’une autre structure refusé', refus.statut === 403, refus.json);

  // Relecture du code, pour le redonner à qui l'a perdu.
  const relu = await coach.get(`/sportifs/${id}/acces`);
  verifier('code relisible', relu.json.acces.code === acces.json.acces.code, relu.json);

  // Activation
  const activation = await client.post('/comptes/activation', {
    code: acces.json.acces.code, email: 'majeur@test.cm', motDePasse: 'motdepasse123',
  });
  verifier('compte activé', activation.statut === 201, activation.json);
  verifier('rôle sportif attribué', activation.json.compte.role === 'sportif');

  const moi = await client.get('/comptes/moi');
  verifier('session ouverte à l’activation', moi.json.compte?.id === id, moi.json);

  // Le code est à usage unique.
  const rejoue = await client.post('/comptes/activation', {
    code: acces.json.acces.code, motDePasse: 'autremotdepasse',
  });
  verifier('code déjà utilisé refusé', rejoue.statut === 400, rejoue.json);

  const inconnu = await client.post('/comptes/activation', {
    code: 'ZZZZ-ZZZZ', motDePasse: 'motdepasse123',
  });
  verifier('code inconnu refusé', inconnu.statut === 400);
  verifier('message indiscernable entre code inconnu et code usé',
    inconnu.json.erreur === rejoue.json.erreur, [inconnu.json.erreur, rejoue.json.erreur]);

  // Le code ne peut plus être relu une fois consommé.
  const apresUsage = await coach.get(`/sportifs/${id}/acces`);
  verifier('code masqué après usage',
    apresUsage.json.acces.code === null && apresUsage.json.acces.utilise === true,
    apresUsage.json.acces);

  const deuxieme = await coach.post(`/sportifs/${id}/acces`);
  verifier('pas de second accès pour un compte déjà actif', deuxieme.statut === 409, deuxieme.json);
}

{
  // Mineur : le code part au tuteur, dont le contact devient obligatoire.
  const { connecter, brut } = await contexte();
  const coach = await connecter('acad@test');

  const s = await coach.post('/sportifs', {
    nom: 'Jeune Test', naissance: '2013-04-02', disciplineId: 'basket',
  });
  const id = s.json.sportif.id;
  await coach.post(`/sportifs/${id}/etapes`, {
    structureId: 's-acad', debut: '2024-01', niveau: 'quartier', mode: 'reperage_informel',
  });

  const sansTuteur = await coach.post(`/sportifs/${id}/acces`);
  verifier('contact du tuteur exigé pour un mineur', sansTuteur.statut === 400, sansTuteur.json);

  const avecTuteur = await coach.post(`/sportifs/${id}/acces`, {
    tuteurNom: 'Mme Ngo', tuteurTelephone: '699887766',
  });
  verifier('accès ouvert au nom du tuteur', avecTuteur.statut === 201, avecTuteur.json);
  verifier('destinataire tuteur', avecTuteur.json.acces.destinataire === 'tuteur');
  verifier('consigne explicite',
    String(avecTuteur.json.acces.aRemettreA).includes('tuteur'), avecTuteur.json.acces);

  const enBase = brut.prepare('SELECT tuteur_nom FROM personnes WHERE id = ?').get(id);
  verifier('contact du tuteur conservé', enBase.tuteur_nom === 'Mme Ngo', enBase);

  // Ouvrir un nouveau code annule le précédent.
  const premier = avecTuteur.json.acces.code;
  const second = await coach.post(`/sportifs/${id}/acces`, {
    tuteurNom: 'Mme Ngo', tuteurTelephone: '699887766',
  });
  const restants = brut.prepare(
    'SELECT COUNT(*) n FROM codes_acces WHERE personne_id = ? AND utilise_le IS NULL').get(id);
  verifier('un seul code vivant à la fois', restants.n === 1, restants);
  verifier('le nouveau code diffère', second.json.acces.code !== premier);
}

{
  // Ce qu'un sportif peut et ne peut pas faire.
  const { connecter, client } = await contexte();
  const coach = await connecter('acad@test');

  const s = await coach.post('/sportifs', {
    nom: 'Contestataire', naissance: '2004-01-01', disciplineId: 'basket',
  });
  const id = s.json.sportif.id;
  const e = await coach.post(`/sportifs/${id}/etapes`, {
    structureId: 's-acad', debut: '2023-01', niveau: 'regional', mode: 'reperage_tournoi',
  });
  const acces = await coach.post(`/sportifs/${id}/acces`);
  await client.post('/comptes/activation', {
    code: acces.json.acces.code, motDePasse: 'motdepasse123',
  });

  // Il ne saisit pas d'étape.
  const saisie = await client.post(`/sportifs/${id}/etapes`, {
    structureId: 's-acad', debut: '2025-01', niveau: 'national', mode: 'transfert',
  });
  verifier('un sportif ne saisit pas d’étape', saisie.statut === 403, saisie.json);
  verifier('mais le message oriente vers le signalement',
    String(saisie.json.erreur).includes('signaler'), saisie.json.erreur);

  // Il consulte son parcours.
  const mien = await client.get('/mon-parcours');
  verifier('raccourci vers son propre parcours', mien.json.sportifId === id, mien.json);

  const parcours = await client.get(`/sportifs/${id}/parcours`);
  const etapeId = parcours.json.etapes[0].id;

  // Il conteste.
  const contestation = await client.post(`/etapes/${etapeId}/contester`, {
    motif: 'dates_fausses', texte: 'Je suis arrivé en mars, pas en janvier.',
  });
  verifier('contestation enregistrée', contestation.statut === 201, contestation.json);

  const doublon = await client.post(`/etapes/${etapeId}/contester`, { motif: 'autre' });
  verifier('une seule contestation ouverte par étape', doublon.statut === 409, doublon.json);

  const motifLibre = await client.post(`/etapes/${etapeId}/contester`, { motif: 'pas content' });
  verifier('motif hors nomenclature refusé', motifLibre.statut === 400);

  // L'encadrant la voit et la traite.
  const aTraiter = await coach.get('/contestations');
  verifier('contestation visible par l’encadrant', aTraiter.json.contestations.length === 1,
    aTraiter.json.contestations);
  verifier('sportif nommé', aTraiter.json.contestations[0].sportif === 'Contestataire');

  const contestationId = aTraiter.json.contestations[0].id;

  // Un encadrant d'une autre structure ne traite pas cette contestation.
  const autre = await connecter('autre@test');
  const pasLui = await autre.post(`/contestations/${contestationId}/traiter`, { decision: 'refusee' });
  verifier('contestation d’une autre structure refusée', pasLui.statut === 403, pasLui.json);

  const traitee = await coach.post(`/contestations/${contestationId}/traiter`, {
    decision: 'acceptee', reponse: 'Vous avez raison, je corrige.',
  });
  verifier('contestation traitée', traitee.statut === 200, traitee.json);

  // Une contestation acceptée retire l'attestation : laisser « attestée » une
  // étape dont l'intéressé a démontré l'erreur viderait le mot de son sens.
  const apres = await client.get(`/sportifs/${id}/parcours`);
  verifier('attestation retirée après acceptation',
    apres.json.etapes[0].fiabilite === 'reconstituee', apres.json.etapes[0]);

  const videe = await coach.get('/contestations');
  verifier('file des contestations vidée', videe.json.contestations.length === 0);

  const rejouee = await coach.post(`/contestations/${contestationId}/traiter`, { decision: 'refusee' });
  verifier('contestation déjà traitée refusée', rejouee.statut === 409);
}

{
  // Un sportif ne conteste pas l'étape d'un autre.
  const { connecter, client } = await contexte();
  const coach = await connecter('acad@test');

  const a = await coach.post('/sportifs', { nom: 'A', naissance: '2004-01-01', disciplineId: 'basket' });
  const b = await coach.post('/sportifs', { nom: 'B', naissance: '2004-01-01', disciplineId: 'basket' });
  await coach.post(`/sportifs/${a.json.sportif.id}/etapes`, {
    structureId: 's-acad', debut: '2023-01', niveau: 'regional', mode: 'transfert',
  });
  await coach.post(`/sportifs/${b.json.sportif.id}/etapes`, {
    structureId: 's-acad', debut: '2023-01', niveau: 'regional', mode: 'transfert',
  });

  const accesB = await coach.post(`/sportifs/${b.json.sportif.id}/acces`);
  await client.post('/comptes/activation', {
    code: accesB.json.acces.code, motDePasse: 'motdepasse123',
  });

  const parcoursA = await client.get(`/sportifs/${a.json.sportif.id}/parcours`);
  const etapeA = parcoursA.json.etapes[0].id;

  const intrusion = await client.post(`/etapes/${etapeA}/contester`, { motif: 'autre' });
  verifier('contestation de l’étape d’un autre refusée', intrusion.statut === 403, intrusion.json);
}


// =====================================================================
// Évaluations par critères
// =====================================================================
{
  const { connecter, client } = await contexte();
  const coach = await connecter('acad@test');

  const grille = await client.get('/criteres?discipline=basket');
  verifier('grille servie par famille', grille.json.familles.length === 5, grille.json.familles?.length);
  verifier('échelle fournie avec ses libellés',
    grille.json.echelle.length === 5 && grille.json.echelle[4].libelle === 'Remarquable',
    grille.json.echelle);

  const technique = grille.json.familles.find((f: any) => f.famille === 'technique');
  verifier('critères techniques propres au basket',
    technique.criteres.some((c: any) => c.nom === 'Rebond')
    && !technique.criteres.some((c: any) => c.nom === 'Jeu de tête'),
    technique.criteres.map((c: any) => c.nom));

  const grilleFoot = await client.get('/criteres?discipline=foot');
  const techFoot = grilleFoot.json.familles.find((f: any) => f.famille === 'technique');
  verifier('critères techniques propres au football',
    techFoot.criteres.some((c: any) => c.nom === 'Jeu de tête'), techFoot.criteres.map((c: any) => c.nom));

  const physique = grille.json.familles.find((f: any) => f.famille === 'physique');
  verifier('critères physiques communs aux disciplines',
    physique.criteres.some((c: any) => c.nom === 'Vitesse'));

  // Un sportif à évaluer
  const s = await coach.post('/sportifs', {
    nom: 'Évalué', naissance: '2008-01-01', disciplineId: 'basket',
  });
  const id = s.json.sportif.id;
  await coach.post(`/sportifs/${id}/etapes`, {
    structureId: 's-acad', debut: '2024-01', niveau: 'regional', mode: 'reperage_tournoi',
  });

  const vide = await client.get(`/sportifs/${id}/evaluations`);
  verifier('profil vide avant toute évaluation',
    vide.json.nbEvaluations === 0 && vide.json.derniere === null, vide.json);

  const evaluation = await coach.post(`/sportifs/${id}/evaluations`, {
    contexte: 'entrainement', date: '2026-03-10',
    commentaire: 'Bonne séance.',
    notes: [
      { critereId: 'phy-vit', note: 4 },
      { critereId: 'phy-end', note: 3 },
      { critereId: 'b-tir', note: 5, commentaire: 'Très adroit à mi-distance' },
      { critereId: 'b-def', note: 2 },
      { critereId: 'tac-lec', note: 4 },
      { critereId: 'psy-dis', note: 5 },
      { critereId: 'men-com', note: 4 },
    ],
  });
  verifier('évaluation enregistrée', evaluation.statut === 201, evaluation.json);
  verifier('toutes les notes écrites', evaluation.json.evaluation.nbNotes === 7);

  const profil = await client.get(`/sportifs/${id}/evaluations`);
  verifier('profil par famille restitué', profil.json.profil.length === 5, profil.json.profil);

  const phy = profil.json.profil.find((p: any) => p.famille === 'physique');
  verifier('moyenne physique calculée', phy.moyenne === 3.5, phy);

  const tech = profil.json.profil.find((p: any) => p.famille === 'technique');
  verifier('moyenne technique calculée', tech.moyenne === 3.5, tech);

  verifier('évaluateur nommé', profil.json.derniere.evaluateur === 'Coach académie',
    profil.json.derniere.evaluateur);
  verifier('commentaire par critère conservé',
    profil.json.derniere.notes.some((n: any) => n.commentaire.includes('mi-distance')),
    profil.json.derniere.notes);
  verifier('rattachement à l’étape en cours', profil.json.derniere.id === evaluation.json.evaluation.id);

  // Validations
  const noteHorsBornes = await coach.post(`/sportifs/${id}/evaluations`, {
    contexte: 'match', notes: [{ critereId: 'phy-vit', note: 8 }],
  });
  verifier('note hors de l’échelle refusée', noteHorsBornes.statut === 400, noteHorsBornes.json);

  // Un critère de football sur un basketteur rendrait les moyennes
  // incomparables d'une discipline à l'autre.
  const critereEtranger = await coach.post(`/sportifs/${id}/evaluations`, {
    contexte: 'match', notes: [{ critereId: 'f-jeu', note: 4 }],
  });
  verifier('critère d’une autre discipline refusé', critereEtranger.statut === 400,
    critereEtranger.json);
  verifier('message nomme le critère fautif',
    String(critereEtranger.json.erreur).includes('f-jeu'), critereEtranger.json.erreur);

  const sansNotes = await coach.post(`/sportifs/${id}/evaluations`, { contexte: 'match', notes: [] });
  verifier('évaluation sans note refusée', sansNotes.statut === 400);

  const contexteLibre = await coach.post(`/sportifs/${id}/evaluations`, {
    contexte: 'au stade', notes: [{ critereId: 'phy-vit', note: 3 }],
  });
  verifier('contexte hors nomenclature refusé', contexteLibre.statut === 400);

  // Rien n'est écrit quand une note est invalide : une évaluation à moitié
  // enregistrée produirait un profil faux.
  const apresEchecs = await client.get(`/sportifs/${id}/evaluations`);
  verifier('aucune évaluation partielle enregistrée', apresEchecs.json.nbEvaluations === 1,
    apresEchecs.json.nbEvaluations);

  // Progression : une seconde évaluation
  await coach.post(`/sportifs/${id}/evaluations`, {
    contexte: 'match', date: '2026-06-15',
    notes: [
      { critereId: 'phy-vit', note: 5 },
      { critereId: 'phy-end', note: 4 },
      { critereId: 'b-tir', note: 5 },
      { critereId: 'b-def', note: 4 },
    ],
  });

  const apres = await client.get(`/sportifs/${id}/evaluations`);
  verifier('deux évaluations', apres.json.nbEvaluations === 2);
  verifier('le profil reflète la plus récente',
    apres.json.profil.find((p: any) => p.famille === 'physique').moyenne === 4.5,
    apres.json.profil);
  verifier('historique renvoyé', apres.json.historique.length >= 2, apres.json.historique?.length);
  verifier('historique du plus récent au plus ancien',
    apres.json.historique[0].date_evaluation >= apres.json.historique.at(-1).date_evaluation,
    apres.json.historique.map((h: any) => h.date_evaluation));
}

{
  // Un sportif ne s'évalue pas lui-même : une note qu'on se donne n'a aucune
  // valeur pour un tiers.
  const { connecter, client } = await contexte();
  const coach = await connecter('acad@test');

  const s = await coach.post('/sportifs', {
    nom: 'Auto-évaluateur', naissance: '2004-01-01', disciplineId: 'basket',
  });
  const id = s.json.sportif.id;
  await coach.post(`/sportifs/${id}/etapes`, {
    structureId: 's-acad', debut: '2024-01', niveau: 'regional', mode: 'transfert',
  });
  const acces = await coach.post(`/sportifs/${id}/acces`);
  await client.post('/comptes/activation', {
    code: acces.json.acces.code, motDePasse: 'motdepasse123',
  });

  const tentative = await client.post(`/sportifs/${id}/evaluations`, {
    contexte: 'entrainement', notes: [{ critereId: 'phy-vit', note: 5 }],
  });
  verifier('auto-évaluation refusée', tentative.statut === 403, tentative.json);

  // Mais il consulte son profil.
  const consultation = await client.get(`/sportifs/${id}/evaluations`);
  verifier('le sportif consulte son propre profil', consultation.statut === 200);
}


// =====================================================================
// Sports individuels et de combat : grades, catégories de poids
// =====================================================================
{
  const { connecter, client } = await contexte();
  const coach = await connecter('acad@test');

  const ref = await client.get('/referentiels');
  const judo = ref.json.disciplines.find((d: any) => d.id === 'judo');
  verifier('judo présent et typé combat', judo?.type === 'combat', judo);
  verifier('judo sans postes mais avec grades et catégories',
    judo.avec_postes === 0 && judo.avec_grades === 1 && judo.avec_categories === 1, judo);

  const foot = ref.json.disciplines.find((d: any) => d.id === 'foot');
  verifier('football avec postes, sans grades',
    foot.avec_postes === 1 && foot.avec_grades === 0, foot);

  const grades = await client.get('/grades?discipline=judo');
  verifier('ceintures de judo ordonnées',
    grades.json.grades[0].abrege === 'blanche'
    && grades.json.grades.at(-1).abrege === '4e dan',
    grades.json.grades.map((g: any) => g.abrege));

  // La technique change, le reste est commun.
  const criteres = await client.get('/criteres?discipline=judo');
  const tech = criteres.json.familles.find((f: any) => f.famille === 'technique');
  verifier('critères techniques propres au judo',
    tech.criteres.some((c: any) => c.nom === 'Kumi-kata'), tech.criteres.map((c: any) => c.nom));
  const phy = criteres.json.familles.find((f: any) => f.famille === 'physique');
  verifier('critères physiques communs conservés',
    phy.criteres.some((c: any) => c.nom === 'Vitesse'));

  // Un judoka
  const s = await coach.post('/sportifs', {
    nom: 'Judoka Test', naissance: '2006-04-10', sexe: 'M', disciplineId: 'judo',
  });
  const id = s.json.sportif.id;

  const g1 = await coach.post(`/sportifs/${id}/grades`, {
    gradeId: 'j-jaune', date: '2019-06', autorite: 'Fédération camerounaise de judo',
  });
  verifier('grade enregistré', g1.statut === 201, g1.json);

  const sansAutorite = await coach.post(`/sportifs/${id}/grades`, {
    gradeId: 'j-orange', date: '2020-06',
  });
  verifier('grade sans autorité refusé', sansAutorite.statut === 400, sansAutorite.json);

  await coach.post(`/sportifs/${id}/grades`, {
    gradeId: 'j-orange', date: '2020-06', autorite: 'Ligue du Littoral',
  });
  await coach.post(`/sportifs/${id}/grades`, {
    gradeId: 'j-verte', date: '2022-03', autorite: 'Ligue du Littoral',
  });

  const doublon = await coach.post(`/sportifs/${id}/grades`, {
    gradeId: 'j-verte', date: '2023-01', autorite: 'Ligue du Littoral',
  });
  verifier('grade déjà obtenu refusé', doublon.statut === 409, doublon.json);

  // Une régression de grade à une date postérieure signale une erreur.
  const regression = await coach.post(`/sportifs/${id}/grades`, {
    gradeId: 'j-blanche', date: '2024-01', autorite: 'Ligue du Littoral',
  });
  verifier('régression de grade refusée', regression.statut === 400, regression.json);

  // Mais reconstituer un grade antérieur oublié reste possible.
  const anterieur = await coach.post(`/sportifs/${id}/grades`, {
    gradeId: 'j-blanche', date: '2018-01', autorite: 'Club local',
  });
  verifier('grade antérieur reconstituable', anterieur.statut === 201, anterieur.json);

  const etranger = await coach.post(`/sportifs/${id}/grades`, {
    gradeId: 'k-noire1', date: '2024-01', autorite: 'X',
  });
  verifier('grade d’une autre discipline refusé', etranger.statut === 400, etranger.json);

  const historique = await client.get(`/sportifs/${id}/grades`);
  verifier('historique des grades complet', historique.json.grades.length === 4,
    historique.json.grades?.length);
  verifier('ordre chronologique',
    historique.json.grades[0].date_obtention === '2018-01', historique.json.grades[0]);
  // Le grade actuel est le plus élevé, pas le dernier saisi : un parcours
  // reconstitué à l'envers donnerait sinon un grade actuel faux.
  verifier('grade actuel = le plus élevé obtenu',
    historique.json.actuel.abrege === 'verte', historique.json.actuel);

  // Catégories de poids
  const categories = await client.get('/categories-poids?discipline=judo&sexe=M');
  verifier('catégories masculines servies', categories.json.categories.length === 7,
    categories.json.categories?.length);
  verifier('catégories féminines écartées',
    categories.json.categories.every((c: any) => c.sexe === 'M'));

  const cat = await coach.post(`/sportifs/${id}/categorie-poids`, {
    categorieId: 'j-h-66', debut: '2024-09',
  });
  verifier('catégorie enregistrée', cat.statut === 201, cat.json);

  // Un changement de catégorie clôt la précédente : appartenir à deux
  // catégories en même temps n'a pas de sens en compétition.
  await coach.post(`/sportifs/${id}/categorie-poids`, {
    categorieId: 'j-h-73', debut: '2025-09',
  });

  const parcoursPoids = await client.get(`/sportifs/${id}/categories-poids`);
  verifier('historique des catégories', parcoursPoids.json.historique.length === 2,
    parcoursPoids.json.historique?.length);
  verifier('une seule catégorie en cours',
    parcoursPoids.json.historique.filter((h: any) => h.fin === null).length === 1,
    parcoursPoids.json.historique);
  verifier('catégorie actuelle exacte', parcoursPoids.json.actuelle.nom === '-73 kg',
    parcoursPoids.json.actuelle);
  verifier('précédente close à la bonne date',
    parcoursPoids.json.historique.find((h: any) => h.nom === '-66 kg').fin === '2025-09',
    parcoursPoids.json.historique);

  const categorieEtrangere = await coach.post(`/sportifs/${id}/categorie-poids`, {
    categorieId: 'j-f-57', debut: '2026-01',
  });
  verifier('catégorie du mauvais sexe acceptée mais de la bonne discipline',
    categorieEtrangere.statut === 201, categorieEtrangere.json);
}

{
  // Un sport collectif n'a ni grades ni catégories.
  const { connecter } = await contexte();
  const coach = await connecter('acad@test');

  const s = await coach.post('/sportifs', {
    nom: 'Basketteur', naissance: '2008-01-01', disciplineId: 'basket',
  });
  const id = s.json.sportif.id;

  const grade = await coach.post(`/sportifs/${id}/grades`, {
    gradeId: 'j-jaune', date: '2024-01', autorite: 'X',
  });
  verifier('grade refusé en sport collectif', grade.statut === 400, grade.json);

  const cat = await coach.post(`/sportifs/${id}/categorie-poids`, {
    categorieId: 'j-h-66', debut: '2024-01',
  });
  verifier('catégorie de poids refusée en sport collectif', cat.statut === 400, cat.json);
}

{
  // Un sportif ne s'attribue pas un grade.
  const { connecter, client } = await contexte();
  const coach = await connecter('acad@test');

  const s = await coach.post('/sportifs', {
    nom: 'Judoka autonome', naissance: '2004-01-01', disciplineId: 'judo',
  });
  const id = s.json.sportif.id;
  await coach.post(`/sportifs/${id}/etapes`, {
    structureId: 's-acad', debut: '2024-01', niveau: 'regional', mode: 'transfert',
  });
  const acces = await coach.post(`/sportifs/${id}/acces`);
  await client.post('/comptes/activation', {
    code: acces.json.acces.code, motDePasse: 'motdepasse123',
  });

  const tentative = await client.post(`/sportifs/${id}/grades`, {
    gradeId: 'j-noire1', date: '2026-01', autorite: 'Moi-même',
  });
  verifier('auto-attribution de grade refusée', tentative.statut === 403, tentative.json);
  verifier('message oriente vers le signalement',
    String(tentative.json.erreur).includes('signaler'), tentative.json.erreur);

  const consultation = await client.get(`/sportifs/${id}/grades`);
  verifier('le sportif consulte ses grades', consultation.statut === 200);
}


// =====================================================================
// Fichiers : logos, photos, pièces jointes
// =====================================================================
{
  const { connecter, client, env, brut } = await contexte();
  const coach = await connecter('acad@test');
  const admin = await connecter('admin@test');

  const faux = (nom: string, type: string, octets = 2000) =>
    new File([new Uint8Array(octets)], nom, { type });

  const envoi = (fichier: File, champs: Record<string, string>) => {
    const f = new FormData();
    f.append('fichier', fichier);
    for (const [k, v] of Object.entries(champs)) f.append(k, v);
    return f;
  };

  // Logo de structure
  const logo = await coach.envoyerFichiers('/fichiers',
    envoi(faux('logo.png', 'image/png'), { usage: 'logo', typeCible: 'structure', cibleId: 's-acad' }));
  verifier('logo de structure envoyé', logo.statut === 201, logo.json);
  verifier('objet stocké', (env.FICHIERS as any).taille === 1, (env.FICHIERS as any).taille);

  // Un encadrant ne pose pas le logo d'une autre structure.
  const autre = await connecter('autre@test');
  const intrusion = await autre.envoyerFichiers('/fichiers',
    envoi(faux('x.png', 'image/png'), { usage: 'logo', typeCible: 'structure', cibleId: 's-acad' }));
  verifier('logo d’une autre structure refusé', intrusion.statut === 403, intrusion.json);

  // Remplacer le logo retire le précédent : deux logos sur une structure et
  // l'affichage ne saurait lequel choisir.
  const remplacement = await coach.envoyerFichiers('/fichiers',
    envoi(faux('logo2.png', 'image/png'), { usage: 'logo', typeCible: 'structure', cibleId: 's-acad' }));
  verifier('logo remplacé', remplacement.statut === 201, remplacement.json);
  const logos = brut.prepare(
    "SELECT COUNT(*) n FROM fichiers WHERE type_cible='structure' AND usage='logo'").get();
  verifier('un seul logo conservé', logos.n === 1, logos);
  verifier('ancien objet supprimé du stockage', (env.FICHIERS as any).taille === 1,
    (env.FICHIERS as any).taille);

  // Usage et cible doivent concorder.
  const logoSurPersonne = await coach.envoyerFichiers('/fichiers',
    envoi(faux('l.png', 'image/png'), { usage: 'logo', typeCible: 'personne', cibleId: 'c-acad' }));
  verifier('logo sur une personne refusé', logoSurPersonne.statut === 400, logoSurPersonne.json);

  // Format et taille
  const mauvaisFormat = await coach.envoyerFichiers('/fichiers',
    envoi(faux('doc.pdf', 'application/pdf'), { usage: 'logo', typeCible: 'structure', cibleId: 's-acad' }));
  verifier('format refusé pour un logo', mauvaisFormat.statut === 400, mauvaisFormat.json);

  const tropLourd = await coach.envoyerFichiers('/fichiers',
    envoi(faux('gros.jpg', 'image/jpeg', 1_000_000), { usage: 'photo', typeCible: 'personne', cibleId: 'c-acad' }));
  verifier('photo trop lourde refusée', tropLourd.statut === 400, tropLourd.json);
  verifier('message rappelle la réduction automatique',
    String(tropLourd.json.erreur).includes('réduit'), tropLourd.json.erreur);

  // Photo d'un sportif suivi par l'encadrant
  const s = await coach.post('/sportifs', { nom: 'Photographié', disciplineId: 'basket' });
  const id = s.json.sportif.id;
  const avantEtape = await coach.envoyerFichiers('/fichiers',
    envoi(faux('p.jpg', 'image/jpeg'), { usage: 'photo', typeCible: 'personne', cibleId: id }));
  verifier('photo refusée tant que le sportif n’est pas suivi', avantEtape.statut === 403,
    avantEtape.json);

  await coach.post(`/sportifs/${id}/etapes`, {
    structureId: 's-acad', debut: '2024-01', niveau: 'regional', mode: 'reperage_tournoi',
  });
  const photo = await coach.envoyerFichiers('/fichiers',
    envoi(faux('p.jpg', 'image/jpeg'), { usage: 'photo', typeCible: 'personne', cibleId: id }));
  verifier('photo acceptée une fois le sportif suivi', photo.statut === 201, photo.json);

  // Pièce jointe à une étape
  const etapeId = brut.prepare(
    'SELECT id FROM etapes WHERE sportif_id = ? LIMIT 1').get(id).id;
  const piece = await coach.envoyerFichiers('/fichiers',
    envoi(faux('attestation.pdf', 'application/pdf', 50_000), {
      usage: 'piece', typeCible: 'etape', cibleId: etapeId,
      legende: 'Attestation de participation', emetteur: 'Ligue du Centre',
    }));
  verifier('attestation jointe à l’étape', piece.statut === 201, piece.json);

  const liste = await coach.get(`/fichiers?typeCible=etape&cibleId=${etapeId}`);
  verifier('pièce listée avec son émetteur',
    liste.json.fichiers[0].emetteur === 'Ligue du Centre', liste.json.fichiers[0]);
  verifier('auteur de l’envoi conservé',
    liste.json.fichiers[0].envoye_par === 'Coach académie', liste.json.fichiers[0]);

  // Le sportif concerné peut joindre une pièce à son propre parcours.
  const acces = await coach.post(`/sportifs/${id}/acces`);
  const joueur = creerClient(app, env);
  await joueur.post('/comptes/activation', {
    code: acces.json.acces.code, motDePasse: 'motdepasse123',
  });
  const sienne = await joueur.envoyerFichiers('/fichiers',
    envoi(faux('diplome.pdf', 'application/pdf', 30_000), {
      usage: 'piece', typeCible: 'etape', cibleId: etapeId,
    }));
  verifier('le sportif joint une pièce à son parcours', sienne.statut === 201, sienne.json);

  // Mais pas à l'étape d'un autre.
  const b = await coach.post('/sportifs', { nom: 'Autre joueur', disciplineId: 'basket' });
  await coach.post(`/sportifs/${b.json.sportif.id}/etapes`, {
    structureId: 's-acad', debut: '2024-01', niveau: 'regional', mode: 'transfert',
  });
  const etapeB = brut.prepare(
    'SELECT id FROM etapes WHERE sportif_id = ? LIMIT 1').get(b.json.sportif.id).id;
  const chezAutrui = await joueur.envoyerFichiers('/fichiers',
    envoi(faux('x.pdf', 'application/pdf'), { usage: 'piece', typeCible: 'etape', cibleId: etapeB }));
  verifier('pièce sur l’étape d’un autre refusée', chezAutrui.statut === 403, chezAutrui.json);

  // Lecture : fermée, sauf les logos de structures vérifiées, qui figurent
  // sur la page de présentation destinée aux visiteurs.
  const anonyme = creerClient(app, env);
  const sansSession = await anonyme.get(`/fichiers/${piece.json.fichier.id}`);
  verifier('pièce justificative inaccessible sans session', sansSession.statut === 401,
    sansSession.statut);

  const photoSansSession = await anonyme.get(`/fichiers/${photo.json.fichier.id}`);
  verifier('photo de personne inaccessible sans session', photoSansSession.statut === 401,
    photoSansSession.statut);

  const logoPublic = await anonyme.get(`/fichiers/${remplacement.json.fichier.id}`);
  verifier('logo de structure vérifiée lisible sans session', logoPublic.statut === 200,
    logoPublic.statut);

  // Suppression : la ligne et l'objet partent ensemble.
  const avant = (env.FICHIERS as any).taille;
  const suppression = await coach.supprimer(`/fichiers/${piece.json.fichier.id}`);
  verifier('pièce supprimée', suppression.statut === 200, suppression.json);
  verifier('objet retiré du stockage', (env.FICHIERS as any).taille === avant - 1,
    `${avant} -> ${(env.FICHIERS as any).taille}`);

  // Partenaires : structures vérifiées et dotées d'un logo.
  const partenaires = await client.get('/partenaires');
  verifier('partenaire listé', partenaires.json.partenaires.length === 1,
    partenaires.json.partenaires);
  verifier('logo exposé',
    String(partenaires.json.partenaires[0].logo).startsWith('/api/fichiers/'),
    partenaires.json.partenaires[0]);

  // Une structure non vérifiée n'apparaît pas, même avec un logo.
  await admin.envoyerFichiers('/fichiers',
    envoi(faux('l.png', 'image/png'), { usage: 'logo', typeCible: 'structure', cibleId: 's-mar' }));
  const apres = await client.get('/partenaires');
  verifier('structure non vérifiée écartée des partenaires',
    apres.json.partenaires.length === 1, apres.json.partenaires);
}

console.log(`api : ${total - echecs}/${total} assertions passées`);
if (echecs > 0) process.exit(1);
