import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env, Variables, Compte } from './types.ts';
import { ErreurRequete, lireCorps, texteObligatoire, texteFacultatif, valeurParmi, entierBorne } from './lib/corps.ts';
import { nouvelId } from './lib/ids.ts';
import { parcours } from './routes/parcours.ts';
import { analyses } from './routes/analyses.ts';
import { referentiels } from './routes/referentiels.ts';
import { comptes } from './routes/comptes.ts';
import { administration } from './routes/administration.ts';
import { accesSportif } from './routes/acces-sportif.ts';
import { evaluations } from './routes/evaluations.ts';
import { progression } from './routes/progression.ts';
import { fichiers } from './routes/fichiers.ts';
import { middlewareSession } from './lib/auth.ts';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * Origines autorisées.
 *
 * Depuis la fusion, le site appelle les services sur sa propre origine : ce
 * contrôle ne concerne plus qu'un éventuel client extérieur. Laissé vide,
 * aucune origine tierce n'est acceptée, ce qui est le bon défaut puisque les
 * requêtes portent un cookie de session.
 */
app.use('*', async (c, next) => {
  const autorisees = (c.env.ORIGINES_AUTORISEES ?? '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  return cors({
    origin: (o) => (autorisees.includes(o) ? o : null),
    credentials: true,
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
  })(c, next);
});

/**
 * Session.
 *
 * Le compte est chargé à chaque requête depuis la session en base. Un compte
 * désactivé perd donc l'accès immédiatement, ce qu'un jeton autonome ne
 * permettrait pas avant son expiration.
 */
app.use('*', middlewareSession);

app.get('/sante', (c) => c.json({ ok: true, horodatage: new Date().toISOString() }));

app.route('/comptes', comptes);
app.route('/', accesSportif);
app.route('/', evaluations);
app.route('/', progression);
app.route('/', fichiers);
app.route('/administration', administration);
app.route('/referentiels', referentiels);
app.route('/', parcours);
app.route('/analyses', analyses);

const CONTEXTES = ['rue_quartier', 'ecole', 'famille', 'club', 'centre', 'autre'] as const;
const SOUTIENS = ['fort', 'partiel', 'absent', 'oppose'] as const;
const ENCADREMENTS = ['aucun', 'benevole', 'qualifie'] as const;

/**
 * Création d'un sportif avec son socle.
 *
 * Le socle est saisi ici, à l'inscription, et non plus tard : c'est le seul
 * moment où quelqu'un prend le temps de retracer les débuts. Tous ses champs
 * restent facultatifs, car il s'agit de données sociales concernant souvent
 * des mineurs.
 */
app.post('/sportifs', async (c) => {
  const compte = c.get('compte');
  if (!compte) throw new ErreurRequete('Connexion requise.', 401);

  const corps = await lireCorps(c);
  const nom = texteObligatoire(corps, 'nom', 'Le nom', 120);
  const disciplineId = texteObligatoire(corps, 'disciplineId', 'La discipline', 40);
  const naissance = texteFacultatif(corps, 'naissance', 10) || null;

  if (naissance && !/^\d{4}-\d{2}-\d{2}$/.test(naissance)) {
    throw new ErreurRequete('La date de naissance doit être au format AAAA-MM-JJ.', 400, 'naissance');
  }

  const discipline = await c.env.DB.prepare('SELECT id FROM disciplines WHERE id = ?')
    .bind(disciplineId).first();
  if (!discipline) throw new ErreurRequete('Discipline inconnue.', 400, 'disciplineId');

  const id = nouvelId();
  const uniteOrigine = texteFacultatif(corps, 'uniteOrigineId', 40) || null;

  const operations = [
    c.env.DB.prepare(
      `INSERT INTO personnes (id, nom, naissance, sexe, nationalite, telephone, unite_id, est_sportif)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
    ).bind(id, nom, naissance,
      corps.sexe === 'F' || corps.sexe === 'M' ? corps.sexe : null,
      texteFacultatif(corps, 'nationalite', 60),
      texteFacultatif(corps, 'telephone', 20) || null,
      uniteOrigine),
    c.env.DB.prepare(
      `INSERT INTO sportifs (personne_id, discipline_id, poste_id, lateralite, unite_origine_id)
       VALUES (?, ?, ?, ?, ?)`,
    ).bind(id, disciplineId,
      texteFacultatif(corps, 'posteId', 40) || null,
      texteFacultatif(corps, 'lateralite', 20) || null,
      uniteOrigine),
  ];

  const socle = corps.socle as Record<string, unknown> | undefined;
  if (socle && typeof socle === 'object') {
    operations.push(
      c.env.DB.prepare(
        `INSERT INTO socles (sportif_id, age_premier_contact, age_premiere_structure,
                             contexte_initial, soutien_famille, encadrement_initial,
                             consentement_analyse)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(id,
        socle.agePremierContact !== undefined
          ? entierBorne(socle.agePremierContact, 'L’âge du premier contact', 3, 40) : null,
        socle.agePremiereStructure !== undefined
          ? entierBorne(socle.agePremiereStructure, 'L’âge d’entrée en structure', 3, 40) : null,
        socle.contexteInitial !== undefined
          ? valeurParmi(socle.contexteInitial, CONTEXTES, 'Le contexte initial') : null,
        socle.soutienFamille !== undefined
          ? valeurParmi(socle.soutienFamille, SOUTIENS, 'Le soutien familial') : null,
        socle.encadrementInitial !== undefined
          ? valeurParmi(socle.encadrementInitial, ENCADREMENTS, 'L’encadrement initial') : null,
        socle.consentement ? 1 : 0),
    );
  }

  await c.env.DB.batch(operations);
  return c.json({ sportif: { id, nom } }, 201);
});

/**
 * Recherche de parcours.
 *
 * Le filtre sur la fiabilité est exposé délibérément : un recruteur doit
 * pouvoir ne consulter que des parcours attestés, et savoir que les autres
 * relèvent de la déclaration.
 */
app.get('/recherche', async (c) => {
  const conditions: string[] = [];
  const params: unknown[] = [];

  const discipline = c.req.query('discipline');
  if (discipline) { conditions.push('s.discipline_id = ?'); params.push(discipline); }

  const poste = c.req.query('poste');
  if (poste) { conditions.push('s.poste_id = ?'); params.push(poste); }

  const region = c.req.query('region');
  if (region) {
    conditions.push('COALESCE(uo.parent_id, uo.id) = ?');
    params.push(region);
  }

  const ageMin = Number(c.req.query('age_min'));
  const ageMax = Number(c.req.query('age_max'));
  const aujourdhui = new Date();
  if (Number.isFinite(ageMax)) {
    const limite = new Date(aujourdhui.getFullYear() - ageMax - 1, aujourdhui.getMonth(), aujourdhui.getDate());
    conditions.push('p.naissance >= ?');
    params.push(limite.toISOString().slice(0, 10));
  }
  if (Number.isFinite(ageMin)) {
    const limite = new Date(aujourdhui.getFullYear() - ageMin, aujourdhui.getMonth(), aujourdhui.getDate());
    conditions.push('p.naissance <= ?');
    params.push(limite.toISOString().slice(0, 10));
  }

  if (c.req.query('attestes') === '1') {
    conditions.push(`EXISTS (SELECT 1 FROM etapes e
                     WHERE e.sportif_id = s.personne_id AND e.fiabilite = 'attestee')`);
  }

  const sql = `
    SELECT p.id, p.nom, p.naissance, d.nom AS discipline, po.nom AS poste,
           s.statut, uo.nom AS origine,
           (SELECT COUNT(*) FROM etapes e WHERE e.sportif_id = s.personne_id) AS nb_etapes,
           (SELECT COUNT(*) FROM etapes e WHERE e.sportif_id = s.personne_id
              AND e.fiabilite = 'attestee') AS nb_attestees,
           (SELECT st.nom FROM etapes e LEFT JOIN structures st ON st.id = e.structure_id
              WHERE e.sportif_id = s.personne_id ORDER BY e.debut DESC LIMIT 1) AS structure_actuelle
    FROM sportifs s
    JOIN personnes p ON p.id = s.personne_id
    JOIN disciplines d ON d.id = s.discipline_id
    LEFT JOIN postes po ON po.id = s.poste_id
    LEFT JOIN unites_admin uo ON uo.id = s.unite_origine_id
    ${conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''}
    ORDER BY nb_attestees DESC, p.nom
    LIMIT 100`;

  const r = await c.env.DB.prepare(sql).bind(...params).all();

  return c.json({
    resultats: (r.results as any[]).map((x) => ({
      id: x.id,
      nom: x.nom,
      discipline: x.discipline,
      poste: x.poste,
      origine: x.origine,
      statut: x.statut,
      structureActuelle: x.structure_actuelle,
      nbEtapes: x.nb_etapes,
      nbAttestees: x.nb_attestees,
    })),
  });
});

app.onError((err, c) => {
  if (err instanceof ErreurRequete) {
    return c.json({ erreur: err.message, champ: err.champ ?? null }, err.statut as any);
  }
  console.error('Erreur non gérée :', err);
  return c.json({ erreur: 'Une erreur est survenue. Réessayez.' }, 500);
});

app.notFound((c) => c.json({ erreur: 'Ressource introuvable.' }, 404));

export default app;
