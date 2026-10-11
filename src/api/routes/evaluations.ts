import { Hono } from 'hono';
import type { Env, Variables } from '../types.ts';
import { lireCorps, ErreurRequete, texteFacultatif, valeurParmi, entierBorne } from '../lib/corps.ts';
import { nouvelId } from '../lib/ids.ts';
import { exigerCompte } from '../lib/auth.ts';

export const evaluations = new Hono<{ Bindings: Env; Variables: Variables }>();

const CONTEXTES = ['entrainement', 'match', 'detection', 'test', 'autre'] as const;
const FAMILLES = ['physique', 'technique', 'tactique', 'psychologique', 'mental'] as const;

/**
 * Grille d'évaluation d'une discipline.
 *
 * Les critères communs et ceux propres à la discipline sont renvoyés
 * ensemble, groupés par famille : c'est l'ordre dans lequel l'entraîneur les
 * parcourt sur le terrain, et l'interface n'a pas à reconstruire ce
 * regroupement.
 */
evaluations.get('/criteres', async (c) => {
  const discipline = c.req.query('discipline') ?? '';

  const r = await c.env.DB.prepare(
    `SELECT id, famille, nom, description, discipline_id
     FROM criteres
     WHERE actif = 1 AND (discipline_id IS NULL OR discipline_id = ?)
     ORDER BY famille, ordre`,
  ).bind(discipline).all();

  const parFamille = FAMILLES.map((famille) => ({
    famille,
    criteres: (r.results as any[]).filter((x) => x.famille === famille),
  })).filter((f) => f.criteres.length > 0);

  return c.json({
    familles: parFamille,
    // L'échelle est renvoyée avec ses libellés : laisser l'interface inventer
    // ce que vaut un 3 garantirait que deux écrans ne disent pas la même chose.
    echelle: [
      { note: 1, libelle: 'Insuffisant' },
      { note: 2, libelle: 'En progrès' },
      { note: 3, libelle: 'Conforme au niveau' },
      { note: 4, libelle: 'Au-dessus' },
      { note: 5, libelle: 'Remarquable' },
    ],
  });
});

/**
 * Enregistrement d'une évaluation.
 *
 * Réservée aux encadrants : une note est un jugement d'expert, et une note
 * que le sportif se donnerait à lui-même n'aurait aucune valeur pour un tiers.
 *
 * Toutes les notes d'une séance sont écrites ensemble, en une transaction :
 * une évaluation à moitié enregistrée produirait un profil faux, avec des
 * familles entières manquantes sans qu'on sache si c'est un oubli ou un refus
 * de juger.
 */
evaluations.post('/sportifs/:id/evaluations', async (c) => {
  const compte = exigerCompte(c);
  if (compte.role !== 'encadrant' && compte.role !== 'admin') {
    throw new ErreurRequete('Seul un encadrant peut évaluer un sportif.', 403);
  }

  const sportifId = c.req.param('id');
  const corps = await lireCorps(c);

  const sportif = await c.env.DB.prepare(
    `SELECT s.personne_id, s.discipline_id,
            (SELECT e.id FROM etapes e WHERE e.sportif_id = s.personne_id
              AND e.fin IS NULL ORDER BY e.debut DESC LIMIT 1) AS etape_en_cours
     FROM sportifs s WHERE s.personne_id = ?`,
  ).bind(sportifId).first<any>();
  if (!sportif) throw new ErreurRequete('Sportif introuvable.', 404);

  const notes = Array.isArray(corps.notes) ? corps.notes : [];
  if (notes.length === 0) {
    throw new ErreurRequete('Aucune note fournie.', 400, 'notes');
  }
  if (notes.length > 40) {
    throw new ErreurRequete('Trop de notes pour une seule évaluation.', 400, 'notes');
  }

  // Les critères sont vérifiés avant toute écriture : une note portant sur un
  // critère d'une autre discipline rendrait les moyennes incomparables.
  const valides = await c.env.DB.prepare(
    `SELECT id FROM criteres WHERE actif = 1 AND (discipline_id IS NULL OR discipline_id = ?)`,
  ).bind(sportif.discipline_id).all();
  const permis = new Set((valides.results as any[]).map((x) => x.id));

  const preparees = notes.map((n: any) => {
    const critereId = String(n?.critereId ?? '');
    if (!permis.has(critereId)) {
      throw new ErreurRequete(
        `Le critère « ${critereId} » n’existe pas pour cette discipline.`, 400, 'notes',
      );
    }
    return {
      critereId,
      note: entierBorne(n?.note, 'La note', 1, 5, 'notes'),
      commentaire: typeof n?.commentaire === 'string' ? n.commentaire.slice(0, 300) : '',
    };
  });

  const id = nouvelId();
  const date = texteFacultatif(corps, 'date', 10) || new Date().toISOString().slice(0, 10);

  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO evaluations (id, sportif_id, etape_id, evaluateur_id, contexte,
                                date_evaluation, commentaire)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, sportifId, sportif.etape_en_cours, compte.id,
           valeurParmi(corps.contexte, CONTEXTES, 'Le contexte', 'contexte'),
           date, texteFacultatif(corps, 'commentaire', 1000)),
    ...preparees.map((n) =>
      c.env.DB.prepare(
        `INSERT INTO notes_evaluation (evaluation_id, critere_id, note, commentaire)
         VALUES (?, ?, ?, ?)`,
      ).bind(id, n.critereId, n.note, n.commentaire)),
  ]);

  return c.json({ evaluation: { id, date, nbNotes: preparees.length } }, 201);
});

/**
 * Profil et historique d'un sportif.
 *
 * Le profil restitue un relief par famille plutôt qu'une note globale : une
 * moyenne unique écraserait la différence entre un joueur rapide mais
 * indiscipliné et son inverse, alors que c'est précisément cette différence
 * qui intéresse un recruteur.
 */
evaluations.get('/sportifs/:id/evaluations', async (c) => {
  const sportifId = c.req.param('id');

  const derniere = await c.env.DB.prepare(
    `SELECT id, date_evaluation, contexte, commentaire, evaluateur_id
     FROM evaluations WHERE sportif_id = ?
     ORDER BY date_evaluation DESC, cree_le DESC LIMIT 1`,
  ).bind(sportifId).first<any>();

  if (!derniere) {
    return c.json({ profil: [], derniere: null, historique: [], nbEvaluations: 0 });
  }

  const notes = await c.env.DB.prepare(
    `SELECT n.note, n.commentaire, c.id AS critere_id, c.nom, c.famille
     FROM notes_evaluation n
     JOIN criteres c ON c.id = n.critere_id
     WHERE n.evaluation_id = ?
     ORDER BY c.famille, c.ordre`,
  ).bind(derniere.id).all();

  const parFamille = new Map<string, number[]>();
  for (const n of notes.results as any[]) {
    if (!parFamille.has(n.famille)) parFamille.set(n.famille, []);
    parFamille.get(n.famille)!.push(n.note);
  }

  const profil = [...parFamille.entries()].map(([famille, valeurs]) => ({
    famille,
    moyenne: Math.round((valeurs.reduce((a, b) => a + b, 0) / valeurs.length) * 10) / 10,
    nbCriteres: valeurs.length,
  }));

  // Historique des moyennes par famille, pour lire une progression. Le
  // détail complet de chaque séance passée n'est pas renvoyé : il alourdirait
  // la réponse sans qu'aucun écran ne l'affiche.
  const historique = await c.env.DB.prepare(
    `SELECT e.id, e.date_evaluation, e.contexte, c.famille,
            ROUND(AVG(n.note), 1) AS moyenne
     FROM evaluations e
     JOIN notes_evaluation n ON n.evaluation_id = e.id
     JOIN criteres c ON c.id = n.critere_id
     WHERE e.sportif_id = ?
     GROUP BY e.id, c.famille
     ORDER BY e.date_evaluation DESC
     LIMIT 60`,
  ).bind(sportifId).all();

  const total = await c.env.DB.prepare(
    'SELECT COUNT(*) AS n FROM evaluations WHERE sportif_id = ?',
  ).bind(sportifId).first<{ n: number }>();

  const evaluateur = await c.env.DB.prepare('SELECT nom FROM personnes WHERE id = ?')
    .bind(derniere.evaluateur_id).first<{ nom: string }>();

  return c.json({
    profil,
    derniere: {
      id: derniere.id,
      date: derniere.date_evaluation,
      contexte: derniere.contexte,
      commentaire: derniere.commentaire,
      evaluateur: evaluateur?.nom ?? null,
      notes: notes.results,
    },
    historique: historique.results,
    nbEvaluations: total?.n ?? 0,
  });
});
