import { Hono } from 'hono';
import type { Env, Variables } from '../types.ts';
import {
  lireCorps, ErreurRequete, texteObligatoire, texteFacultatif,
  valeurParmi, entierBorne, dateSouple,
} from '../lib/corps.ts';
import { nouvelId, maintenant, age } from '../lib/ids.ts';

export const parcours = new Hono<{ Bindings: Env; Variables: Variables }>();

const MODES = [
  'recommandation', 'reperage_tournoi', 'reperage_informel',
  'detection_organisee', 'demarche_famille', 'transfert', 'agent', 'autre',
] as const;

const NIVEAUX = [
  'loisir', 'quartier', 'scolaire', 'club_local', 'regional',
  'national_jeune', 'national', 'professionnel',
] as const;

const MOTIFS_FIN = [
  'progression', 'blessure', 'abandon', 'scolarite', 'financier',
  'demenagement', 'depart_etranger', 'exclusion', 'autre',
] as const;

/**
 * Enregistrement d'une étape et de la transition qui y mène, en un seul appel.
 *
 * C'est le point le plus sensible de toute l'application. Une étape sans sa
 * transition perd l'information centrale du modèle, à savoir comment le
 * sportif est arrivé là. Or si la saisie se fait en deux formulaires
 * successifs, l'expérience montre que le second n'est jamais rempli : un
 * encadrant qui enregistre quinze joueurs en fin d'entraînement s'arrête au
 * premier écran.
 *
 * Les deux écritures sont donc groupées dans une même transaction. Soit
 * l'étape et sa transition existent ensemble, soit rien n'est enregistré.
 */
parcours.post('/sportifs/:id/etapes', async (c) => {
  const compte = c.get('compte');
  if (!compte) throw new ErreurRequete('Connexion requise.', 401);

  // Un sportif ne saisit pas son propre parcours. L'autoriser réintroduirait
  // la donnée auto-déclarée que tout le modèle cherche à écarter : il peut
  // consulter, compléter ses débuts et contester, rien de plus.
  if (compte.role === 'sportif') {
    throw new ErreurRequete(
      'Seul un encadrant peut enregistrer une étape. Vous pouvez signaler une erreur sur une étape existante.',
      403,
    );
  }

  const sportifId = c.req.param('id');
  const corps = await lireCorps(c);

  const sportif = await c.env.DB.prepare(
    `SELECT s.personne_id, s.discipline_id, p.nom
     FROM sportifs s JOIN personnes p ON p.id = s.personne_id
     WHERE s.personne_id = ?`,
  ).bind(sportifId).first<any>();
  if (!sportif) throw new ErreurRequete('Sportif introuvable.', 404);

  const structureId = texteObligatoire(corps, 'structureId', 'La structure', 80);
  const structure = await c.env.DB.prepare(
    'SELECT id, unite_id, lat, lon FROM structures WHERE id = ?',
  ).bind(structureId).first<any>();
  if (!structure) throw new ErreurRequete('Structure introuvable.', 404, 'structureId');

  const debut = dateSouple(corps.debut, 'La date de début', 'debut');
  const niveau = valeurParmi(corps.niveau, NIVEAUX, 'Le niveau', 'niveau');
  const mode = valeurParmi(corps.mode, MODES, 'Le mode d’arrivée', 'mode');
  const disciplineId = texteFacultatif(corps, 'disciplineId', 40) || sportif.discipline_id;
  const posteId = texteFacultatif(corps, 'posteId', 40) || null;

  // L'étape précédente encore ouverte est close automatiquement. Sans cela,
  // un sportif se retrouverait rattaché à deux structures en même temps, et
  // le calcul de mobilité produirait des trajets incohérents.
  const precedente = await c.env.DB.prepare(
    `SELECT id FROM etapes WHERE sportif_id = ? AND fin IS NULL
     ORDER BY debut DESC LIMIT 1`,
  ).bind(sportifId).first<{ id: string }>();

  /**
   * Une étape saisie par l'encadrant de la structure d'accueil est attestée
   * d'emblée : il en est témoin direct. Saisie par quelqu'un d'autre, elle
   * reste reconstituée, car il s'agit alors d'un parcours rapporté.
   */
  const attestee = compte.role === 'admin'
    || (compte.role === 'encadrant' && compte.structure_id === structureId);

  const etapeId = nouvelId();
  const horodatage = maintenant();

  const operations = [
    c.env.DB.prepare(
      `INSERT INTO etapes
         (id, sportif_id, structure_id, discipline_id, poste_id, unite_id, lat, lon,
          debut, niveau, fiabilite, atteste_par, atteste_le)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      etapeId, sportifId, structureId, disciplineId, posteId,
      structure.unite_id, structure.lat, structure.lon,
      debut, niveau,
      attestee ? 'attestee' : 'reconstituee',
      attestee ? compte.id : null,
      attestee ? horodatage : null,
    ),
    c.env.DB.prepare(
      `INSERT INTO transitions
         (id, sportif_id, etape_avant, etape_apres, mode, agent_id, date_effet, fiabilite, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      nouvelId(), sportifId, precedente?.id ?? null, etapeId, mode,
      texteFacultatif(corps, 'agentId', 80) || null,
      debut,
      attestee ? 'attestee' : 'reconstituee',
      texteFacultatif(corps, 'note', 500),
    ),
  ];

  if (precedente) {
    // Le motif de clôture de l'étape précédente est demandé ici : c'est le
    // seul moment où l'encadrant s'en souvient. Réclamé plus tard, il reste
    // vide, et l'analyse de la déperdition perd sa source.
    const motif = corps.motifFin !== undefined
      ? valeurParmi(corps.motifFin, MOTIFS_FIN, 'Le motif de fin', 'motifFin')
      : 'progression';
    operations.push(
      c.env.DB.prepare('UPDATE etapes SET fin = ?, motif_fin = ? WHERE id = ?')
        .bind(debut, motif, precedente.id),
    );
  }

  await c.env.DB.batch(operations);

  return c.json({
    etape: { id: etapeId, debut, niveau, fiabilite: attestee ? 'attestee' : 'reconstituee' },
    etapePrecedenteClose: precedente?.id ?? null,
  }, 201);
});

/**
 * Attestation d'une étape enregistrée par un tiers.
 *
 * Seul un encadrant de la structure concernée peut attester : c'est ce qui
 * donne sa valeur à l'attestation. Sans cette restriction, n'importe qui
 * validerait n'importe quel parcours, et la distinction entre trace
 * reconstituée et trace attestée perdrait tout sens.
 */
parcours.post('/etapes/:id/attester', async (c) => {
  const compte = c.get('compte');
  if (!compte) throw new ErreurRequete('Connexion requise.', 401);

  const etapeId = c.req.param('id');
  const etape = await c.env.DB.prepare('SELECT * FROM etapes WHERE id = ?')
    .bind(etapeId).first<any>();
  if (!etape) throw new ErreurRequete('Étape introuvable.', 404);

  if (etape.fiabilite === 'attestee') {
    return c.json({ etape: { id: etapeId, fiabilite: 'attestee' }, deja: true });
  }

  const autorise = compte.role === 'admin'
    || (compte.role === 'encadrant' && compte.structure_id === etape.structure_id);
  if (!autorise) {
    throw new ErreurRequete(
      'Seul un encadrant de la structure concernée peut attester cette étape.', 403,
    );
  }

  const horodatage = maintenant();
  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE etapes SET fiabilite = 'attestee', atteste_par = ?, atteste_le = ? WHERE id = ?`,
    ).bind(compte.id, horodatage, etapeId),
    c.env.DB.prepare(
      `UPDATE transitions SET fiabilite = 'attestee' WHERE etape_apres = ?`,
    ).bind(etapeId),
  ]);

  return c.json({ etape: { id: etapeId, fiabilite: 'attestee', atteste_le: horodatage } });
});

/** Clôture d'une étape sans en ouvrir une nouvelle : arrêt, pause, rupture. */
parcours.post('/etapes/:id/cloturer', async (c) => {
  const compte = c.get('compte');
  if (!compte) throw new ErreurRequete('Connexion requise.', 401);

  const etapeId = c.req.param('id');
  const corps = await lireCorps(c);
  const motif = valeurParmi(corps.motifFin, MOTIFS_FIN, 'Le motif de fin', 'motifFin');
  const fin = dateSouple(corps.fin, 'La date de fin', 'fin');

  const etape = await c.env.DB.prepare('SELECT * FROM etapes WHERE id = ?')
    .bind(etapeId).first<any>();
  if (!etape) throw new ErreurRequete('Étape introuvable.', 404);
  if (fin < etape.debut) {
    throw new ErreurRequete('La date de fin précède la date de début.', 400, 'fin');
  }

  await c.env.DB.prepare('UPDATE etapes SET fin = ?, motif_fin = ? WHERE id = ?')
    .bind(fin, motif, etapeId).run();

  // Un parcours interrompu pour une raison autre qu'une progression change le
  // statut du sportif : c'est ce qui permet de mesurer la déperdition sans
  // supprimer quoi que ce soit.
  if (['abandon', 'blessure', 'financier', 'scolarite'].includes(motif)) {
    await c.env.DB.prepare(
      `UPDATE sportifs SET statut = 'interrompu' WHERE personne_id = ?`,
    ).bind(etape.sportif_id).run();
  }

  return c.json({ etape: { id: etapeId, fin, motif_fin: motif } });
});

/** Parcours complet d'un sportif, dans l'ordre chronologique. */
parcours.get('/sportifs/:id/parcours', async (c) => {
  const sportifId = c.req.param('id');

  const sportif = await c.env.DB.prepare(
    `SELECT p.id, p.nom, p.naissance, p.sexe, d.nom AS discipline, d.id AS discipline_id,
            s.statut, uo.nom AS origine, uo.id AS origine_id
     FROM sportifs s
     JOIN personnes p ON p.id = s.personne_id
     JOIN disciplines d ON d.id = s.discipline_id
     LEFT JOIN unites_admin uo ON uo.id = s.unite_origine_id
     WHERE s.personne_id = ?`,
  ).bind(sportifId).first<any>();
  if (!sportif) throw new ErreurRequete('Sportif introuvable.', 404);

  const etapes = await c.env.DB.prepare(
    `SELECT e.id, e.debut, e.fin, e.niveau, e.motif_fin, e.fiabilite, e.lat, e.lon,
            st.nom AS structure, ts.nom AS type_structure, ts.rang,
            u.nom AS territoire, u.id AS territoire_id,
            t.mode, t.note AS note_transition, pa.nom AS agent
     FROM etapes e
     LEFT JOIN structures st ON st.id = e.structure_id
     LEFT JOIN types_structure ts ON ts.id = st.type_id
     JOIN unites_admin u ON u.id = e.unite_id
     LEFT JOIN transitions t ON t.etape_apres = e.id
     LEFT JOIN personnes pa ON pa.id = t.agent_id
     WHERE e.sportif_id = ?
     ORDER BY e.debut`,
  ).bind(sportifId).all();

  const lignes = etapes.results as any[];

  // Le parcours est renvoyé enrichi de ce que l'affichage aurait dû
  // recalculer : progression ou recul d'une étape à l'autre, et distance
  // parcourue. Le faire ici garantit que tous les écrans disent la même chose.
  const detail = lignes.map((e, i) => {
    const precedent = i > 0 ? lignes[i - 1] : null;
    let evolution: string | null = null;
    if (precedent && precedent.rang != null && e.rang != null) {
      evolution = e.rang > precedent.rang ? 'progression'
        : e.rang < precedent.rang ? 'recul' : 'palier';
    }
    return {
      id: e.id,
      structure: e.structure,
      typeStructure: e.type_structure,
      territoire: e.territoire,
      territoireId: e.territoire_id,
      debut: e.debut,
      fin: e.fin,
      enCours: e.fin === null,
      niveau: e.niveau,
      motifFin: e.motif_fin,
      fiabilite: e.fiabilite,
      arriveePar: e.mode,
      agent: e.agent,
      note: e.note_transition,
      evolution,
      distanceEtapePrecedente: precedent && precedent.lat != null && e.lat != null
        ? Math.round(distanceKm(precedent.lat, precedent.lon, e.lat, e.lon))
        : null,
    };
  });

  const socle = await c.env.DB.prepare('SELECT * FROM socles WHERE sportif_id = ?')
    .bind(sportifId).first<any>();

  return c.json({
    sportif: {
      id: sportif.id,
      nom: sportif.nom,
      age: age(sportif.naissance),
      // La date de naissance complète n'est pas exposée : l'âge suffit à
      // toutes les décisions, et il s'agit d'un mineur dans bien des cas.
      discipline: sportif.discipline,
      // L'identifiant est exposé en plus du libellé : le deviner depuis le nom
      // affiché casserait à la première discipline ajoutée.
      disciplineId: sportif.discipline_id,
      statut: sportif.statut,
      origine: sportif.origine,
    },
    debuts: socle ? {
      agePremierContact: socle.age_premier_contact,
      agePremiereStructure: socle.age_premiere_structure,
      contexteInitial: socle.contexte_initial,
      delaiEncadrement: socle.age_premiere_structure != null && socle.age_premier_contact != null
        ? socle.age_premiere_structure - socle.age_premier_contact
        : null,
    } : null,
    etapes: detail,
    resume: {
      nbEtapes: detail.length,
      attestees: detail.filter((e) => e.fiabilite === 'attestee').length,
      aMigre: detail.length > 1
        && detail[0].territoireId !== detail[detail.length - 1].territoireId,
    },
  });
});

/** Distance orthodromique en kilomètres. */
export function distanceKm(a: number, b: number, c: number, d: number): number {
  const R = 6371, r = Math.PI / 180;
  return 2 * R * Math.asin(Math.sqrt(
    Math.sin((c - a) * r / 2) ** 2 +
    Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2));
}
