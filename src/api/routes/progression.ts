import { Hono } from 'hono';
import type { Env, Variables } from '../types.ts';
import { lireCorps, ErreurRequete, texteObligatoire, texteFacultatif, dateSouple } from '../lib/corps.ts';
import { nouvelId, maintenant } from '../lib/ids.ts';
import { exigerCompte } from '../lib/auth.ts';

export const progression = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * Grades et catégories de poids.
 *
 * Second axe de progression, indispensable aux sports de combat. En sport
 * collectif, la progression se lit dans la suite des structures ; en judo,
 * elle se lit d'abord dans le grade, et un modèle qui l'ignore ne sait rien
 * dire du parcours d'un judoka.
 */

/** Grades d'une discipline, du plus bas au plus élevé. */
progression.get('/grades', async (c) => {
  const discipline = c.req.query('discipline') ?? '';
  const r = await c.env.DB.prepare(
    'SELECT id, nom, abrege, ordre, couleur_hex FROM grades WHERE discipline_id = ? ORDER BY ordre',
  ).bind(discipline).all();
  return c.json({ grades: r.results });
});

/**
 * Catégories de poids applicables.
 *
 * Elles dépendent du sexe et de la tranche d'âge : les catégories cadets ne
 * sont pas celles des seniors, et renvoyer les deux mélangées conduirait à
 * inscrire un jeune dans une catégorie où il n'est pas éligible.
 */
progression.get('/categories-poids', async (c) => {
  const discipline = c.req.query('discipline') ?? '';
  const sexe = c.req.query('sexe') ?? '';
  const tranche = c.req.query('tranche') ?? 'senior';

  const r = await c.env.DB.prepare(
    `SELECT id, nom, sexe, tranche_age, mini_kg, maxi_kg FROM categories_poids
     WHERE discipline_id = ?
       AND (? = '' OR sexe = ? OR sexe = 'mixte')
       AND tranche_age = ?
     ORDER BY ordre`,
  ).bind(discipline, sexe, sexe, tranche).all();

  return c.json({ categories: r.results });
});

/**
 * Enregistrement d'un grade obtenu.
 *
 * L'autorité qui l'a délivré est obligatoire : un grade sans autorité n'est
 * pas un grade, c'est une déclaration. C'est aussi ce qui rend la trace
 * vérifiable auprès d'un tiers, là où l'attestation d'une étape repose sur le
 * seul jugement d'un encadrant.
 */
progression.post('/sportifs/:id/grades', async (c) => {
  const compte = exigerCompte(c);
  if (compte.role === 'sportif') {
    throw new ErreurRequete(
      'Seul un encadrant peut enregistrer un grade. Vous pouvez signaler une erreur sur un grade existant.',
      403,
    );
  }

  const sportifId = c.req.param('id');
  const corps = await lireCorps(c);

  const sportif = await c.env.DB.prepare(
    `SELECT s.personne_id, s.discipline_id, d.avec_grades
     FROM sportifs s JOIN disciplines d ON d.id = s.discipline_id
     WHERE s.personne_id = ?`,
  ).bind(sportifId).first<any>();
  if (!sportif) throw new ErreurRequete('Sportif introuvable.', 404);
  if (sportif.avec_grades !== 1) {
    throw new ErreurRequete(
      'Cette discipline ne comporte pas de grades.', 400, 'gradeId',
    );
  }

  const gradeId = texteObligatoire(corps, 'gradeId', 'Le grade', 60);
  const grade = await c.env.DB.prepare(
    'SELECT id, nom, ordre, discipline_id FROM grades WHERE id = ?',
  ).bind(gradeId).first<any>();
  if (!grade) throw new ErreurRequete('Grade inconnu.', 404, 'gradeId');

  // Un grade de karaté sur un judoka rendrait la progression incomparable.
  if (grade.discipline_id !== sportif.discipline_id) {
    throw new ErreurRequete(
      'Ce grade appartient à une autre discipline.', 400, 'gradeId',
    );
  }

  const date = dateSouple(corps.date, 'La date d’obtention', 'date');
  const autorite = texteObligatoire(corps, 'autorite', 'L’autorité qui a délivré le grade', 160);

  // Un grade déjà obtenu ne se repasse pas. Le signaler évite les doublons de
  // saisie, fréquents quand deux encadrants suivent le même sportif.
  const deja = await c.env.DB.prepare(
    'SELECT id FROM grades_obtenus WHERE sportif_id = ? AND grade_id = ?',
  ).bind(sportifId, gradeId).first();
  if (deja) throw new ErreurRequete('Ce grade est déjà enregistré pour ce sportif.', 409, 'gradeId');

  // Un grade antérieur au dernier obtenu est accepté — on reconstitue souvent
  // un parcours à l'envers — mais une régression de grade à une date
  // postérieure signale une erreur de saisie.
  const dernier = await c.env.DB.prepare(
    `SELECT g.ordre, go.date_obtention FROM grades_obtenus go
     JOIN grades g ON g.id = go.grade_id
     WHERE go.sportif_id = ? ORDER BY go.date_obtention DESC LIMIT 1`,
  ).bind(sportifId).first<any>();

  if (dernier && date > dernier.date_obtention && grade.ordre < dernier.ordre) {
    throw new ErreurRequete(
      'Ce grade est inférieur à celui déjà obtenu à une date antérieure. Vérifiez la date ou le grade.',
      400, 'gradeId',
    );
  }

  const attestee = compte.role === 'admin' || compte.role === 'encadrant';
  const id = nouvelId();
  const horodatage = maintenant();

  await c.env.DB.prepare(
    `INSERT INTO grades_obtenus
       (id, sportif_id, grade_id, date_obtention, autorite, unite_id, numero_diplome,
        fiabilite, atteste_par, atteste_le)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, sportifId, gradeId, date, autorite,
         texteFacultatif(corps, 'uniteId', 40) || null,
         texteFacultatif(corps, 'numeroDiplome', 60),
         attestee ? 'attestee' : 'reconstituee',
         attestee ? compte.id : null,
         attestee ? horodatage : null).run();

  return c.json({ grade: { id, nom: grade.nom, date } }, 201);
});

/** Historique des grades, du plus ancien au plus récent. */
progression.get('/sportifs/:id/grades', async (c) => {
  const r = await c.env.DB.prepare(
    `SELECT go.id, go.date_obtention, go.autorite, go.numero_diplome, go.fiabilite,
            g.nom, g.abrege, g.ordre, g.couleur_hex, u.nom AS territoire
     FROM grades_obtenus go
     JOIN grades g ON g.id = go.grade_id
     LEFT JOIN unites_admin u ON u.id = go.unite_id
     WHERE go.sportif_id = ?
     ORDER BY go.date_obtention`,
  ).bind(c.req.param('id')).all();

  const lignes = r.results as any[];
  const actuel = lignes.length
    ? lignes.reduce((a, b) => (b.ordre > a.ordre ? b : a))
    : null;

  return c.json({
    grades: lignes,
    // Le grade actuel est le plus élevé obtenu, pas le dernier saisi : un
    // parcours reconstitué à l'envers donnerait sinon un grade actuel faux.
    actuel: actuel ? { nom: actuel.nom, abrege: actuel.abrege, couleur: actuel.couleur_hex } : null,
  });
});

/**
 * Appartenance à une catégorie de poids, datée.
 *
 * Un combattant change de catégorie en cours de saison. La stocker comme un
 * attribut du sportif effacerait cette histoire, alors qu'elle renseigne sur
 * sa trajectoire physique autant que sur son éligibilité passée.
 */
progression.post('/sportifs/:id/categorie-poids', async (c) => {
  const compte = exigerCompte(c);
  if (compte.role === 'sportif') {
    throw new ErreurRequete('Seul un encadrant peut enregistrer une catégorie.', 403);
  }

  const sportifId = c.req.param('id');
  const corps = await lireCorps(c);
  const categorieId = texteObligatoire(corps, 'categorieId', 'La catégorie', 60);
  const debut = dateSouple(corps.debut, 'La date de début', 'debut');

  const sportif = await c.env.DB.prepare(
    `SELECT s.discipline_id, d.avec_categories FROM sportifs s
     JOIN disciplines d ON d.id = s.discipline_id WHERE s.personne_id = ?`,
  ).bind(sportifId).first<any>();
  if (!sportif) throw new ErreurRequete('Sportif introuvable.', 404);
  if (sportif.avec_categories !== 1) {
    throw new ErreurRequete('Cette discipline ne comporte pas de catégories de poids.', 400);
  }

  const categorie = await c.env.DB.prepare(
    'SELECT id, nom, discipline_id FROM categories_poids WHERE id = ?',
  ).bind(categorieId).first<any>();
  if (!categorie) throw new ErreurRequete('Catégorie inconnue.', 404, 'categorieId');
  if (categorie.discipline_id !== sportif.discipline_id) {
    throw new ErreurRequete('Cette catégorie appartient à une autre discipline.', 400, 'categorieId');
  }

  // L'appartenance en cours est close à la date de la nouvelle : sans cela,
  // un sportif appartiendrait à deux catégories en même temps, ce qui n'a pas
  // de sens en compétition.
  const operations = [
    c.env.DB.prepare(
      'UPDATE appartenances_poids SET fin = ? WHERE sportif_id = ? AND fin IS NULL',
    ).bind(debut, sportifId),
    c.env.DB.prepare(
      'INSERT INTO appartenances_poids (id, sportif_id, categorie_id, debut) VALUES (?, ?, ?, ?)',
    ).bind(nouvelId(), sportifId, categorieId, debut),
  ];
  await c.env.DB.batch(operations);

  return c.json({ categorie: { id: categorieId, nom: categorie.nom, debut } }, 201);
});

progression.get('/sportifs/:id/categories-poids', async (c) => {
  const r = await c.env.DB.prepare(
    `SELECT ap.id, ap.debut, ap.fin, cp.nom, cp.mini_kg, cp.maxi_kg, cp.tranche_age
     FROM appartenances_poids ap
     JOIN categories_poids cp ON cp.id = ap.categorie_id
     WHERE ap.sportif_id = ?
     ORDER BY ap.debut DESC`,
  ).bind(c.req.param('id')).all();

  const lignes = r.results as any[];
  return c.json({
    historique: lignes,
    actuelle: lignes.find((l) => l.fin === null) ?? null,
  });
});
