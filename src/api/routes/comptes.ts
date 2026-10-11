import { Hono } from 'hono';
import type { Env, Variables } from '../types.ts';
import { lireCorps, ErreurRequete, texteObligatoire, texteFacultatif, valeurParmi } from '../lib/corps.ts';
import { nouvelId } from '../lib/ids.ts';
import { hacher, verifierMotDePasse, ouvrirSession, fermerSession, exigerRole, exigerCompte } from '../lib/auth.ts';

export const comptes = new Hono<{ Bindings: Env; Variables: Variables }>();

const MDP_MINIMUM = 8;
const ROLES_OUVERTS = ['encadrant', 'recruteur'] as const;

/**
 * Inscription.
 *
 * Seuls les rôles d'encadrant et de recruteur sont ouverts à l'inscription
 * libre. Le rôle d'administrateur, qui donne accès aux référentiels
 * territoriaux, ne s'attribue que depuis un compte administrateur existant :
 * laisser quiconque se déclarer administrateur reviendrait à laisser modifier
 * le découpage sur lequel reposent toutes les analyses.
 *
 * Un compte créé reste en attente de validation tant qu'un administrateur ne
 * l'a pas rattaché à une structure. Il peut consulter, pas attester.
 */
comptes.post('/inscription', async (c) => {
  const corps = await lireCorps(c);
  const nom = texteObligatoire(corps, 'nom', 'Le nom', 120);
  const email = texteObligatoire(corps, 'email', 'L’adresse électronique', 160).toLowerCase();
  const motDePasse = texteObligatoire(corps, 'motDePasse', 'Le mot de passe', 200);
  const role = valeurParmi(corps.role, ROLES_OUVERTS, 'Le rôle', 'role');

  if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)) {
    throw new ErreurRequete('Cette adresse électronique ne semble pas valide.', 400, 'email');
  }
  if (motDePasse.length < MDP_MINIMUM) {
    throw new ErreurRequete(
      `Le mot de passe doit faire au moins ${MDP_MINIMUM} caractères.`, 400, 'motDePasse',
    );
  }

  const existe = await c.env.DB.prepare('SELECT id FROM personnes WHERE email = ?')
    .bind(email).first();
  if (existe) {
    throw new ErreurRequete('Un compte existe déjà avec cette adresse.', 409, 'email');
  }

  const id = nouvelId();
  const hash = await hacher(motDePasse, c.env.SEL_MOT_DE_PASSE);

  await c.env.DB.prepare(
    `INSERT INTO personnes (id, nom, email, telephone, unite_id, hash_mdp, role,
                            est_encadrant, est_recruteur)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, nom, email, texteFacultatif(corps, 'telephone', 20) || null,
         texteFacultatif(corps, 'uniteId', 40) || null,
         hash, role, role === 'encadrant' ? 1 : 0, role === 'recruteur' ? 1 : 0).run();

  await ouvrirSession(c, id);
  return c.json({ compte: { id, nom, role, structure_id: null } }, 201);
});

comptes.post('/connexion', async (c) => {
  const corps = await lireCorps(c);
  const email = String(corps.email ?? '').trim().toLowerCase();
  const motDePasse = String(corps.motDePasse ?? '');

  const personne = await c.env.DB.prepare(
    'SELECT id, nom, role, structure_id, hash_mdp, actif FROM personnes WHERE email = ?',
  ).bind(email).first<any>();

  const valide = personne
    ? await verifierMotDePasse(motDePasse, personne.hash_mdp, c.env.SEL_MOT_DE_PASSE)
    : false;

  // Message identique que l'adresse soit inconnue ou le mot de passe faux :
  // les distinguer permettrait de découvrir quelles adresses ont un compte.
  if (!valide || !personne || personne.actif !== 1) {
    throw new ErreurRequete('Adresse ou mot de passe incorrect.', 401);
  }

  await ouvrirSession(c, personne.id);
  return c.json({
    compte: {
      id: personne.id, nom: personne.nom,
      role: personne.role, structure_id: personne.structure_id,
    },
  });
});

comptes.post('/deconnexion', async (c) => {
  await fermerSession(c);
  return c.json({ ok: true });
});

comptes.get('/moi', async (c) => {
  const compte = c.get('compte');
  if (!compte) return c.json({ compte: null });

  const structure = compte.structure_id
    ? await c.env.DB.prepare('SELECT nom FROM structures WHERE id = ?')
        .bind(compte.structure_id).first<{ nom: string }>()
    : null;

  return c.json({
    compte: { ...compte, structure: structure?.nom ?? null },
    // Un encadrant sans structure ne peut pas attester : l'interface doit le
    // lui dire plutôt que de le laisser buter sur un refus.
    peutAttester: compte.role === 'admin'
      || (compte.role === 'encadrant' && !!compte.structure_id),
  });
});

/** Liste des comptes, réservée à l'administration. */
comptes.get('/', exigerRole('admin'), async (c) => {
  const r = await c.env.DB.prepare(
    `SELECT p.id, p.nom, p.email, p.role, p.actif, s.nom AS structure, p.cree_le
     FROM personnes p
     LEFT JOIN structures s ON s.id = p.structure_id
     WHERE p.hash_mdp IS NOT NULL
     ORDER BY p.cree_le DESC`,
  ).all();
  return c.json({ comptes: r.results });
});

/**
 * Rattachement d'un compte à une structure, et changement de rôle.
 *
 * C'est l'acte qui donne à un encadrant le droit d'attester les parcours de
 * sa structure. Il reste manuel et réservé à l'administration : c'est ce qui
 * empêche quiconque de s'auto-déclarer encadrant d'une académie et de
 * valider des parcours qui ne le concernent pas.
 */
comptes.post('/:id/rattacher', exigerRole('admin'), async (c) => {
  const corps = await lireCorps(c);
  const id = c.req.param('id');
  const structureId = texteFacultatif(corps, 'structureId', 80) || null;

  const personne = await c.env.DB.prepare('SELECT id FROM personnes WHERE id = ?')
    .bind(id).first();
  if (!personne) throw new ErreurRequete('Compte introuvable.', 404);

  if (structureId) {
    const structure = await c.env.DB.prepare('SELECT id FROM structures WHERE id = ?')
      .bind(structureId).first();
    if (!structure) throw new ErreurRequete('Structure introuvable.', 404, 'structureId');
  }

  const role = corps.role !== undefined
    ? valeurParmi(corps.role, ['sportif', 'encadrant', 'recruteur', 'admin'] as const, 'Le rôle', 'role')
    : undefined;

  await c.env.DB.prepare(
    `UPDATE personnes SET structure_id = ?, role = COALESCE(?, role) WHERE id = ?`,
  ).bind(structureId, role ?? null, id).run();

  return c.json({ ok: true });
});

comptes.post('/:id/desactiver', exigerRole('admin'), async (c) => {
  const compte = exigerCompte(c);
  const id = c.req.param('id');

  // Se désactiver soi-même fermerait la porte de l'administration sans
  // moyen de la rouvrir.
  if (id === compte.id) {
    throw new ErreurRequete('Vous ne pouvez pas désactiver votre propre compte.', 400);
  }

  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE personnes SET actif = 0 WHERE id = ?').bind(id),
    // Les sessions ouvertes sont supprimées : désactiver un compte dont la
    // session reste valide ne protège de rien.
    c.env.DB.prepare('DELETE FROM sessions WHERE personne_id = ?').bind(id),
  ]);

  return c.json({ ok: true });
});

comptes.post('/:id/reactiver', exigerRole('admin'), async (c) => {
  await c.env.DB.prepare('UPDATE personnes SET actif = 1 WHERE id = ?')
    .bind(c.req.param('id')).run();
  return c.json({ ok: true });
});
