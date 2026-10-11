import { Hono } from 'hono';
import type { Env, Variables } from '../types.ts';
import { lireCorps, ErreurRequete, texteFacultatif, valeurParmi } from '../lib/corps.ts';
import { nouvelId } from '../lib/ids.ts';
import { exigerCompte } from '../lib/auth.ts';

export const fichiers = new Hono<{ Bindings: Env; Variables: Variables }>();

const USAGES = ['logo', 'photo', 'piece', 'video'] as const;
const CIBLES = ['structure', 'personne', 'etape'] as const;

/**
 * Types acceptés et tailles maximales, par usage.
 *
 * Les images sont réduites par le navigateur avant l'envoi : au-delà de la
 * limite, c'est que le traitement a été contourné ou a échoué, et laisser
 * passer une photo de téléphone de quatre mégaoctets la rendrait
 * inchargeable sur une connexion mobile.
 *
 * Les documents, eux, ne se redimensionnent pas : une attestation scannée
 * doit rester lisible, d'où une limite plus haute.
 */
const REGLES: Record<string, { types: string[]; maxi: number; libelle: string }> = {
  logo:  { types: ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'], maxi: 400_000, libelle: 'un logo' },
  photo: { types: ['image/jpeg', 'image/png', 'image/webp'], maxi: 800_000, libelle: 'une photo' },
  piece: {
    types: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
    maxi: 5_000_000, libelle: 'une pièce justificative',
  },
  video: { types: ['video/mp4', 'video/webm'], maxi: 25_000_000, libelle: 'une vidéo' },
};

import type { Context } from 'hono';

type Contexte = Context<{ Bindings: Env; Variables: Variables }>;

/** Qui a le droit d'attacher un fichier à quoi. */
async function verifierDroit(
  c: Contexte, typeCible: string, cibleId: string,
): Promise<void> {
  const compte = exigerCompte(c);
  if (compte.role === 'admin') return;

  if (typeCible === 'structure') {
    // Un encadrant gère le logo de sa structure, pas celui d'une autre.
    if (compte.role === 'encadrant' && compte.structure_id === cibleId) return;
    throw new ErreurRequete('Vous ne gérez pas cette structure.', 403);
  }

  if (typeCible === 'personne') {
    // Chacun sa propre photo ; un encadrant peut aussi poser celle d'un
    // sportif qu'il suit, car beaucoup de jeunes n'ouvriront jamais de compte.
    if (compte.id === cibleId) return;
    if (compte.role === 'encadrant') {
      const lien = await c.env.DB.prepare(
        'SELECT 1 AS x FROM etapes WHERE sportif_id = ? AND structure_id = ? LIMIT 1',
      ).bind(cibleId, compte.structure_id).first<{ x: number }>();
      if (lien) return;
    }
    throw new ErreurRequete('Vous ne suivez pas cette personne.', 403);
  }

  if (typeCible === 'etape') {
    const etape = await c.env.DB.prepare(
      'SELECT sportif_id, structure_id FROM etapes WHERE id = ?',
    ).bind(cibleId).first<{ sportif_id: string; structure_id: string | null }>();
    if (!etape) throw new ErreurRequete('Étape introuvable.', 404);

    if (compte.role === 'encadrant' && etape.structure_id === compte.structure_id) return;
    // Le sportif peut joindre une pièce à son propre parcours : une
    // attestation de tournoi est souvent entre ses mains, pas entre celles de
    // son club. Il ne modifie pour autant aucune étape.
    if (compte.role === 'sportif' && etape.sportif_id === compte.id) return;
    throw new ErreurRequete('Cette étape ne relève pas de vous.', 403);
  }

  throw new ErreurRequete('Cible inconnue.', 400);
}

fichiers.post('/fichiers', async (c) => {
  const compte = exigerCompte(c);

  let formulaire: FormData;
  try {
    formulaire = await c.req.formData();
  } catch {
    throw new ErreurRequete('L’envoi a échoué. Réessayez.', 400);
  }

  const fichier = formulaire.get('fichier');
  if (!(fichier instanceof File)) {
    throw new ErreurRequete('Aucun fichier reçu.', 400, 'fichier');
  }

  const usage = valeurParmi(String(formulaire.get('usage') ?? ''), USAGES, 'L’usage', 'usage');
  const typeCible = valeurParmi(String(formulaire.get('typeCible') ?? ''), CIBLES, 'La cible', 'typeCible');
  const cibleId = String(formulaire.get('cibleId') ?? '');
  if (!cibleId) throw new ErreurRequete('Cible manquante.', 400, 'cibleId');

  // Un logo ne se pose que sur une structure, une photo que sur une personne :
  // sans ce contrôle, l'index d'unicité se tairait et l'affichage irait
  // chercher au mauvais endroit.
  if (usage === 'logo' && typeCible !== 'structure') {
    throw new ErreurRequete('Un logo ne s’attache qu’à une structure.', 400, 'usage');
  }
  if (usage === 'photo' && typeCible !== 'personne') {
    throw new ErreurRequete('Une photo de profil ne s’attache qu’à une personne.', 400, 'usage');
  }
  if ((usage === 'piece' || usage === 'video') && typeCible !== 'etape') {
    throw new ErreurRequete('Une pièce ou une vidéo s’attache à une étape du parcours.', 400, 'usage');
  }

  const regle = REGLES[usage];
  if (!regle.types.includes(fichier.type)) {
    throw new ErreurRequete(
      `Format non accepté pour ${regle.libelle}. Attendu : ${regle.types.join(', ')}.`,
      400, 'fichier',
    );
  }
  if (fichier.size > regle.maxi) {
    throw new ErreurRequete(
      `Ce fichier dépasse ${Math.round(regle.maxi / 1_000_000 * 10) / 10} Mo.`
      + (usage === 'piece' || usage === 'video'
        ? ''
        : ' Il aurait dû être réduit automatiquement : réessayez.'),
      400, 'fichier',
    );
  }

  await verifierDroit(c, typeCible, cibleId);

  // La clé porte un identifiant unique : un fichier ne change jamais de
  // contenu sous la même clé, ce qui autorise un cache définitif.
  const id = nouvelId();
  const extension = (fichier.name.match(/\.[a-z0-9]{1,5}$/i)?.[0] ?? '').toLowerCase();
  const cle = `${typeCible}/${cibleId}/${id}${extension}`;

  await c.env.FICHIERS.put(cle, await fichier.arrayBuffer(), {
    httpMetadata: { contentType: fichier.type },
  });

  try {
    // Logo et photo sont uniques : le précédent est retiré avant d'écrire le
    // nouveau, sinon l'index d'unicité ferait échouer le remplacement.
    const operations = [];
    if (usage === 'logo' || usage === 'photo') {
      const ancien = await c.env.DB.prepare(
        'SELECT id, cle FROM fichiers WHERE type_cible = ? AND cible_id = ? AND usage = ?',
      ).bind(typeCible, cibleId, usage).first<any>();
      if (ancien) {
        operations.push(c.env.DB.prepare('DELETE FROM fichiers WHERE id = ?').bind(ancien.id));
        await c.env.FICHIERS.delete(ancien.cle);
      }
    }

    const rang = await c.env.DB.prepare(
      'SELECT COALESCE(MAX(ordre), -1) + 1 AS suivant FROM fichiers WHERE type_cible = ? AND cible_id = ?',
    ).bind(typeCible, cibleId).first<{ suivant: number }>();

    operations.push(c.env.DB.prepare(
      `INSERT INTO fichiers (id, cle, type_cible, cible_id, usage, mime, taille,
                             nom_origine, legende, emetteur, ordre, envoye_par)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, cle, typeCible, cibleId, usage, fichier.type, fichier.size,
           String(formulaire.get('nom') ?? fichier.name).slice(0, 160),
           String(formulaire.get('legende') ?? '').slice(0, 300),
           String(formulaire.get('emetteur') ?? '').slice(0, 160),
           rang?.suivant ?? 0, compte.id));

    await c.env.DB.batch(operations);
  } catch (e) {
    // L'objet est retiré si l'enregistrement échoue : un fichier orphelin
    // dans le stockage est invisible, introuvable, et facturé indéfiniment.
    await c.env.FICHIERS.delete(cle);
    throw e;
  }

  return c.json({ fichier: { id, url: `/api/fichiers/${id}`, usage, mime: fichier.type } }, 201);
});

/**
 * Lecture d'un fichier.
 *
 * Une session est exigée pour tout, sauf les logos de structures vérifiées :
 * ceux-ci figurent sur la page de présentation, qui s'adresse à des visiteurs
 * non connectés. Photographies de personnes et pièces justificatives
 * nominatives restent fermées, sans exception.
 */
fichiers.get('/fichiers/:id', async (c) => {
  const ligne = await c.env.DB.prepare(
    `SELECT f.cle, f.mime, f.usage, f.type_cible, s.verifiee
     FROM fichiers f
     LEFT JOIN structures s ON s.id = f.cible_id AND f.type_cible = 'structure'
     WHERE f.id = ?`,
  ).bind(c.req.param('id')).first<any>();
  if (!ligne) throw new ErreurRequete('Fichier introuvable.', 404);

  const logoPublic = ligne.usage === 'logo' && ligne.type_cible === 'structure' && ligne.verifiee === 1;
  if (!logoPublic) exigerCompte(c);

  const objet = await c.env.FICHIERS.get(ligne.cle);
  if (!objet) throw new ErreurRequete('Fichier introuvable dans le stockage.', 404);

  return new Response(objet.body as any, {
    headers: {
      'content-type': ligne.mime,
      // Privé : la mise en cache reste locale au navigateur de la personne
      // autorisée, jamais partagée par un intermédiaire.
      'cache-control': 'private, max-age=86400',
    },
  });
});

fichiers.get('/fichiers', async (c) => {
  exigerCompte(c);
  const typeCible = c.req.query('typeCible') ?? '';
  const cibleId = c.req.query('cibleId') ?? '';

  const r = await c.env.DB.prepare(
    `SELECT f.id, f.usage, f.mime, f.taille, f.nom_origine, f.legende, f.emetteur,
            f.ordre, f.cree_le, p.nom AS envoye_par
     FROM fichiers f JOIN personnes p ON p.id = f.envoye_par
     WHERE f.type_cible = ? AND f.cible_id = ?
     ORDER BY f.ordre`,
  ).bind(typeCible, cibleId).all();

  return c.json({
    fichiers: (r.results as any[]).map((f) => ({ ...f, url: `/api/fichiers/${f.id}` })),
  });
});

fichiers.delete('/fichiers/:id', async (c) => {
  const ligne = await c.env.DB.prepare(
    'SELECT id, cle, type_cible, cible_id FROM fichiers WHERE id = ?',
  ).bind(c.req.param('id')).first<any>();
  if (!ligne) throw new ErreurRequete('Fichier introuvable.', 404);

  await verifierDroit(c, ligne.type_cible, ligne.cible_id);

  // La ligne part avant l'objet : dans l'autre sens, un échec laisserait une
  // référence pointant vers un fichier disparu, donc une image cassée à
  // l'écran. Ici le pire est un objet orphelin, que personne ne voit.
  await c.env.DB.prepare('DELETE FROM fichiers WHERE id = ?').bind(ligne.id).run();
  await c.env.FICHIERS.delete(ligne.cle);

  return c.json({ ok: true });
});

/**
 * Structures partenaires, pour la page de présentation.
 *
 * Seules les structures vérifiées et dotées d'un logo y figurent : une
 * rubrique « partenaires » remplie de noms saisis à la volée perdrait toute
 * valeur, et afficherait des établissements qui n'ont jamais donné leur
 * accord.
 */
fichiers.get('/partenaires', async (c) => {
  const r = await c.env.DB.prepare(
    `SELECT s.id, s.nom, f.id AS logo_id, ts.nom AS type, u.nom AS territoire
     FROM structures s
     JOIN fichiers f ON f.type_cible = 'structure' AND f.cible_id = s.id AND f.usage = 'logo'
     JOIN types_structure ts ON ts.id = s.type_id
     JOIN unites_admin u ON u.id = s.unite_id
     WHERE s.verifiee = 1
     ORDER BY s.nom
     LIMIT 24`,
  ).all();

  return c.json({
    partenaires: (r.results as any[]).map((s) => ({
      id: s.id, nom: s.nom, type: s.type, territoire: s.territoire,
      logo: `/api/fichiers/${s.logo_id}`,
    })),
  });
});
