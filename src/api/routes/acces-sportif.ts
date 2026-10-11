import { Hono } from 'hono';
import type { Env, Variables } from '../types.ts';
import { lireCorps, ErreurRequete, texteObligatoire, texteFacultatif, valeurParmi } from '../lib/corps.ts';
import { nouvelId, maintenant, age } from '../lib/ids.ts';
import { hacher, ouvrirSession, exigerCompte } from '../lib/auth.ts';

export const accesSportif = new Hono<{ Bindings: Env; Variables: Variables }>();

const VALIDITE_JOURS = 14;
const AGE_CONSENTEMENT = 15;

/**
 * Code lisible et dictable.
 *
 * L'alphabet exclut les caractères ambigus : ni O ni 0, ni I ni 1. Un code
 * recopié de travers depuis un bout de papier, ou mal entendu au téléphone,
 * ne s'ouvre sur rien et fait abandonner.
 */
function engendrerCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const octets = crypto.getRandomValues(new Uint8Array(8));
  const brut = Array.from(octets, (o) => alphabet[o % alphabet.length]).join('');
  return `${brut.slice(0, 4)}-${brut.slice(4)}`;
}

/**
 * Ouverture d'un accès pour un sportif.
 *
 * Réservée à l'encadrant de la structure où se déroule son étape en cours, ou
 * à un administrateur. C'est quelqu'un qui connaît physiquement le joueur qui
 * ouvre l'accès : la vérification d'identité est ainsi faite par la seule
 * personne en position de la faire.
 */
accesSportif.post('/sportifs/:id/acces', async (c) => {
  const compte = exigerCompte(c);
  if (compte.role !== 'encadrant' && compte.role !== 'admin') {
    throw new ErreurRequete('Seul un encadrant peut ouvrir un accès.', 403);
  }

  const sportifId = c.req.param('id');
  const sportif = await c.env.DB.prepare(
    `SELECT p.id, p.nom, p.naissance, p.hash_mdp,
            (SELECT e.structure_id FROM etapes e
              WHERE e.sportif_id = p.id ORDER BY e.debut DESC LIMIT 1) AS structure_actuelle
     FROM personnes p WHERE p.id = ?`,
  ).bind(sportifId).first<any>();

  if (!sportif) throw new ErreurRequete('Sportif introuvable.', 404);
  if (sportif.hash_mdp) {
    throw new ErreurRequete('Ce sportif a déjà un accès actif.', 409);
  }

  if (compte.role === 'encadrant' && sportif.structure_actuelle !== compte.structure_id) {
    throw new ErreurRequete(
      'Vous ne pouvez ouvrir un accès que pour les sportifs de votre structure.', 403,
    );
  }

  const corps = await lireCorps(c);
  const ans = age(sportif.naissance);

  // En dessous de l'âge de consentement, le code part au tuteur, dont le
  // contact devient obligatoire : sans lui, personne ne peut consentir.
  const destinataire = ans !== null && ans < AGE_CONSENTEMENT ? 'tuteur' : 'sportif';
  if (destinataire === 'tuteur') {
    const tuteurNom = texteObligatoire(corps, 'tuteurNom', 'Le nom du tuteur', 120);
    const tuteurTel = texteObligatoire(corps, 'tuteurTelephone', 'Le téléphone du tuteur', 30);
    await c.env.DB.prepare(
      'UPDATE personnes SET tuteur_nom = ?, tuteur_telephone = ? WHERE id = ?',
    ).bind(tuteurNom, tuteurTel, sportifId).run();
  }

  const code = engendrerCode();
  const expire = new Date(Date.now() + VALIDITE_JOURS * 86_400_000)
    .toISOString().replace(/\.\d{3}Z$/, 'Z');

  await c.env.DB.batch([
    // Un seul code vivant à la fois : en ouvrir un nouveau annule le
    // précédent, sinon un code égaré resterait utilisable.
    c.env.DB.prepare('DELETE FROM codes_acces WHERE personne_id = ? AND utilise_le IS NULL')
      .bind(sportifId),
    c.env.DB.prepare(
      `INSERT INTO codes_acces (code, personne_id, cree_par, destinataire, expire_le)
       VALUES (?, ?, ?, ?, ?)`,
    ).bind(code, sportifId, compte.id, destinataire, expire),
  ]);

  return c.json({
    acces: {
      code, destinataire, expire,
      aRemettreA: destinataire === 'tuteur'
        ? `${sportif.nom} est mineur : remettez ce code à son tuteur.`
        : `Remettez ce code à ${sportif.nom}.`,
    },
  }, 201);
});

/** Relecture du code en cours, pour le redonner à qui l'a perdu. */
accesSportif.get('/sportifs/:id/acces', async (c) => {
  const compte = exigerCompte(c);
  if (compte.role !== 'encadrant' && compte.role !== 'admin') {
    throw new ErreurRequete('Réservé aux encadrants.', 403);
  }

  const r = await c.env.DB.prepare(
    `SELECT code, destinataire, expire_le, utilise_le FROM codes_acces
     WHERE personne_id = ? ORDER BY cree_le DESC LIMIT 1`,
  ).bind(c.req.param('id')).first<any>();

  if (!r) return c.json({ acces: null });
  return c.json({
    acces: {
      code: r.utilise_le ? null : r.code,
      destinataire: r.destinataire,
      expire: r.expire_le,
      utilise: !!r.utilise_le,
      expire_depasse: r.expire_le < maintenant(),
    },
  });
});

/**
 * Activation du compte par le sportif ou son tuteur.
 *
 * Le code identifie la personne : il n'y a donc rien à revendiquer, et aucune
 * possibilité de se rattacher au parcours d'un autre.
 */
accesSportif.post('/comptes/activation', async (c) => {
  const corps = await lireCorps(c);
  const code = texteObligatoire(corps, 'code', 'Le code d’accès', 20)
    .toUpperCase().replace(/\s/g, '');
  const motDePasse = texteObligatoire(corps, 'motDePasse', 'Le mot de passe', 200);
  const email = texteFacultatif(corps, 'email', 160).toLowerCase();

  if (motDePasse.length < 8) {
    throw new ErreurRequete('Le mot de passe doit faire au moins 8 caractères.', 400, 'motDePasse');
  }

  const acces = await c.env.DB.prepare(
    `SELECT c.code, c.personne_id, c.expire_le, c.utilise_le, p.nom, p.hash_mdp
     FROM codes_acces c JOIN personnes p ON p.id = c.personne_id
     WHERE c.code = ?`,
  ).bind(code).first<any>();

  // Message unique pour un code inconnu, déjà utilisé ou périmé : les
  // distinguer permettrait d'éprouver des codes au hasard et d'apprendre
  // lesquels ont existé.
  if (!acces || acces.utilise_le || acces.expire_le < maintenant() || acces.hash_mdp) {
    throw new ErreurRequete(
      'Ce code n’est pas valide. Demandez-en un nouveau à votre encadrant.', 400, 'code',
    );
  }

  if (email) {
    const pris = await c.env.DB.prepare('SELECT id FROM personnes WHERE email = ?')
      .bind(email).first();
    if (pris) throw new ErreurRequete('Cette adresse est déjà utilisée.', 409, 'email');
  }

  const hash = await hacher(motDePasse, c.env.SEL_MOT_DE_PASSE);
  const horodatage = maintenant();

  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE personnes SET hash_mdp = ?, email = COALESCE(?, email), role = 'sportif'
       WHERE id = ?`,
    ).bind(hash, email || null, acces.personne_id),
    c.env.DB.prepare('UPDATE codes_acces SET utilise_le = ? WHERE code = ?')
      .bind(horodatage, code),
  ]);

  await ouvrirSession(c, acces.personne_id);
  return c.json({ compte: { id: acces.personne_id, nom: acces.nom, role: 'sportif' } }, 201);
});

/** Parcours du sportif connecté. Raccourci vers sa propre fiche. */
accesSportif.get('/mon-parcours', async (c) => {
  const compte = exigerCompte(c);
  if (compte.role !== 'sportif') {
    throw new ErreurRequete('Cet accès est réservé aux sportifs.', 403);
  }
  return c.json({ sportifId: compte.id });
});

const MOTIFS = [
  'dates_fausses', 'structure_fausse', 'jamais_passe',
  'mode_faux', 'niveau_faux', 'etape_manquante', 'autre',
] as const;

/**
 * Contestation d'une étape par le sportif concerné.
 *
 * Il ne modifie rien : il signale, et l'encadrant tranche. Permettre la
 * correction directe réintroduirait la donnée auto-déclarée que tout le
 * modèle cherche à écarter.
 */
accesSportif.post('/etapes/:id/contester', async (c) => {
  const compte = exigerCompte(c);
  const etapeId = c.req.param('id');
  const corps = await lireCorps(c);

  const etape = await c.env.DB.prepare('SELECT id, sportif_id FROM etapes WHERE id = ?')
    .bind(etapeId).first<any>();
  if (!etape) throw new ErreurRequete('Étape introuvable.', 404);

  if (compte.role !== 'sportif' || etape.sportif_id !== compte.id) {
    throw new ErreurRequete('Seul le sportif concerné peut contester son étape.', 403);
  }

  // La saisie est validée avant l'état : un motif invalide doit être signalé
  // comme tel, même si une contestation est déjà en cours. Répondre « déjà en
  // cours » à quelqu'un dont le formulaire est fautif l'envoie chercher au
  // mauvais endroit.
  const motif = valeurParmi(corps.motif, MOTIFS, 'Le motif', 'motif');
  const texte = texteFacultatif(corps, 'texte', 1000);

  const ouverte = await c.env.DB.prepare(
    `SELECT id FROM contestations WHERE etape_id = ? AND statut = 'ouverte'`,
  ).bind(etapeId).first();
  if (ouverte) {
    throw new ErreurRequete('Une contestation est déjà en cours sur cette étape.', 409);
  }

  const id = nouvelId();
  await c.env.DB.prepare(
    `INSERT INTO contestations (id, etape_id, sportif_id, motif, texte)
     VALUES (?, ?, ?, ?, ?)`,
  ).bind(id, etapeId, compte.id, motif, texte).run();

  return c.json({
    contestation: { id, statut: 'ouverte' },
    message: 'Signalement enregistré. Votre encadrant va l’examiner.',
  }, 201);
});

/** Contestations à traiter, pour l'encadrant de la structure concernée. */
accesSportif.get('/contestations', async (c) => {
  const compte = exigerCompte(c);
  if (compte.role !== 'encadrant' && compte.role !== 'admin') {
    throw new ErreurRequete('Réservé aux encadrants.', 403);
  }

  const conditions = compte.role === 'admin' ? '' : 'AND e.structure_id = ?';
  const params = compte.role === 'admin' ? [] : [compte.structure_id];

  const r = await c.env.DB.prepare(
    `SELECT ct.id, ct.motif, ct.texte, ct.statut, ct.cree_le,
            p.nom AS sportif, ct.sportif_id,
            e.id AS etape_id, e.debut, e.fin, st.nom AS structure
     FROM contestations ct
     JOIN etapes e ON e.id = ct.etape_id
     JOIN personnes p ON p.id = ct.sportif_id
     LEFT JOIN structures st ON st.id = e.structure_id
     WHERE ct.statut = 'ouverte' ${conditions}
     ORDER BY ct.cree_le`,
  ).bind(...params).all();

  return c.json({ contestations: r.results });
});

accesSportif.post('/contestations/:id/traiter', async (c) => {
  const compte = exigerCompte(c);
  if (compte.role !== 'encadrant' && compte.role !== 'admin') {
    throw new ErreurRequete('Réservé aux encadrants.', 403);
  }

  const corps = await lireCorps(c);
  const id = c.req.param('id');
  const decision = valeurParmi(corps.decision, ['acceptee', 'refusee'] as const,
    'La décision', 'decision');

  const ct = await c.env.DB.prepare(
    `SELECT ct.*, e.structure_id FROM contestations ct
     JOIN etapes e ON e.id = ct.etape_id WHERE ct.id = ?`,
  ).bind(id).first<any>();
  if (!ct) throw new ErreurRequete('Contestation introuvable.', 404);
  if (ct.statut !== 'ouverte') throw new ErreurRequete('Cette contestation est déjà traitée.', 409);

  if (compte.role === 'encadrant' && ct.structure_id !== compte.structure_id) {
    throw new ErreurRequete('Cette contestation ne concerne pas votre structure.', 403);
  }

  const operations = [
    c.env.DB.prepare(
      `UPDATE contestations SET statut = ?, reponse = ?, traite_par = ?, traite_le = ?
       WHERE id = ?`,
    ).bind(decision, texteFacultatif(corps, 'reponse', 1000), compte.id, maintenant(), id),
  ];

  // Une contestation acceptée retire l'attestation de l'étape : elle redevient
  // reconstituée en attendant correction. Laisser « attestée » une étape dont
  // l'intéressé a démontré l'erreur viderait l'attestation de son sens.
  if (decision === 'acceptee') {
    operations.push(
      c.env.DB.prepare(
        `UPDATE etapes SET fiabilite = 'reconstituee', atteste_par = NULL, atteste_le = NULL
         WHERE id = ?`,
      ).bind(ct.etape_id),
    );
  }

  await c.env.DB.batch(operations);
  return c.json({ contestation: { id, statut: decision } });
});
