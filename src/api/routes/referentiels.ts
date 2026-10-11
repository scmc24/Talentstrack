import { Hono } from 'hono';
import type { Env, Variables } from '../types.ts';
import { lireCorps, ErreurRequete, texteObligatoire, texteFacultatif, valeurParmi, entierBorne } from '../lib/corps.ts';
import { nouvelId } from '../lib/ids.ts';

export const referentiels = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * Référentiels servant à alimenter les listes déroulantes de saisie.
 *
 * Ces listes sont le moyen concret d'empêcher les champs libres, principale
 * cause de données inexploitables relevée lors de l'enquête préalable.
 */
referentiels.get('/', async (c) => {
  const [unites, disciplines, postes, types] = await Promise.all([
    c.env.DB.prepare(
      `SELECT id, code, nom, niveau, parent_id, lat, lon FROM unites_admin
       WHERE actif = 1 ORDER BY niveau, nom`).all(),
    c.env.DB.prepare(
      `SELECT id, nom, type, avec_postes, avec_grades, avec_categories
       FROM disciplines WHERE actif = 1 ORDER BY nom`).all(),
    c.env.DB.prepare('SELECT id, discipline_id, nom FROM postes ORDER BY discipline_id, ordre').all(),
    c.env.DB.prepare('SELECT id, nom, rang, formel FROM types_structure ORDER BY rang').all(),
  ]);

  return c.json({
    unites: unites.results,
    disciplines: disciplines.results,
    postes: postes.results,
    typesStructure: types.results,
    // Les nomenclatures sont exposées avec un libellé lisible : l'interface
    // ne doit pas avoir à les traduire elle-même, sous peine de voir deux
    // écrans nommer différemment la même valeur.
    modesTransition: [
      { id: 'recommandation', nom: 'Recommandé par un encadrant' },
      { id: 'reperage_tournoi', nom: 'Repéré lors d’un tournoi' },
      { id: 'reperage_informel', nom: 'Vu jouer au quartier' },
      { id: 'detection_organisee', nom: 'Journée de détection' },
      { id: 'demarche_famille', nom: 'Démarche de la famille' },
      { id: 'transfert', nom: 'Transfert entre clubs' },
      { id: 'agent', nom: 'Par un intermédiaire' },
      { id: 'autre', nom: 'Autre' },
    ],
    motifsFin: [
      { id: 'progression', nom: 'Passage à une autre structure' },
      { id: 'blessure', nom: 'Blessure' },
      { id: 'abandon', nom: 'Abandon' },
      { id: 'scolarite', nom: 'Priorité aux études' },
      { id: 'financier', nom: 'Raisons financières' },
      { id: 'demenagement', nom: 'Déménagement' },
      { id: 'depart_etranger', nom: 'Départ à l’étranger' },
      { id: 'exclusion', nom: 'Exclusion' },
      { id: 'autre', nom: 'Autre' },
    ],
    niveaux: [
      { id: 'loisir', nom: 'Loisir' },
      { id: 'quartier', nom: 'Quartier' },
      { id: 'scolaire', nom: 'Scolaire' },
      { id: 'club_local', nom: 'Club local' },
      { id: 'regional', nom: 'Régional' },
      { id: 'national_jeune', nom: 'National jeune' },
      { id: 'national', nom: 'National' },
      { id: 'professionnel', nom: 'Professionnel' },
    ],
  });
});

const TYPES_MESURE = [
  'taille_cm', 'poids_kg', 'sprint_10m_s', 'sprint_30m_s',
  'detente_cm', 'cooper_m', 'vma_kmh', 'envergure_cm',
] as const;

// Bornes de vraisemblance. Elles n'attrapent pas les valeurs fausses, mais
// elles attrapent les erreurs de saisie et d'unité, qui sont bien plus
// fréquentes : une taille notée 1,80 au lieu de 180 est rejetée ici.
const BORNES: Record<string, [number, number]> = {
  taille_cm: [100, 240],
  poids_kg: [25, 200],
  sprint_10m_s: [1, 4],
  sprint_30m_s: [3, 10],
  detente_cm: [10, 130],
  cooper_m: [800, 4000],
  vma_kmh: [8, 26],
  envergure_cm: [100, 260],
};

referentiels.post('/mesures', async (c) => {
  const compte = c.get('compte');
  if (!compte) throw new ErreurRequete('Connexion requise.', 401);

  const corps = await lireCorps(c);
  const sportifId = texteObligatoire(corps, 'sportifId', 'Le sportif', 80);
  const type = valeurParmi(corps.type, TYPES_MESURE, 'Le type de mesure', 'type');
  const [mini, maxi] = BORNES[type];
  const valeur = entierBorne(corps.valeur, 'La valeur', mini, maxi, 'valeur');
  const date = texteFacultatif(corps, 'date', 20) || new Date().toISOString().slice(0, 10);

  const source = compte.role === 'encadrant' || compte.role === 'admin'
    ? 'encadrant' : 'declaree';

  try {
    await c.env.DB.prepare(
      `INSERT INTO mesures (id, sportif_id, type, valeur, date_mesure, source, mesure_par)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(nouvelId(), sportifId, type, valeur, date, source, compte.id).run();
  } catch (e) {
    if (String((e as Error).message).includes('UNIQUE')) {
      throw new ErreurRequete('Cette mesure existe déjà pour cette date.', 409);
    }
    throw e;
  }

  return c.json({ mesure: { type, valeur, date, source } }, 201);
});
