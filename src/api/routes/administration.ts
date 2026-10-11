import { Hono } from 'hono';
import type { Env, Variables } from '../types.ts';
import {
  lireCorps, ErreurRequete, texteObligatoire, texteFacultatif, valeurParmi, entierBorne,
} from '../lib/corps.ts';
import { nouvelId } from '../lib/ids.ts';
import { exigerRole } from '../lib/auth.ts';

export const administration = new Hono<{ Bindings: Env; Variables: Variables }>();

administration.use('*', exigerRole('admin'));

const NIVEAUX = ['region', 'departement', 'arrondissement'] as const;

/**
 * Référentiel territorial.
 *
 * C'est le socle de toute l'analyse : densités, carences, flux. Une unité mal
 * saisie fausse durablement les indicateurs, et comme le rattachement se fait
 * au moment de la saisie des étapes, l'erreur se propage ensuite à tous les
 * parcours enregistrés.
 */
administration.get('/unites', async (c) => {
  const r = await c.env.DB.prepare(
    `SELECT u.id, u.code, u.nom, u.niveau, u.parent_id, u.lat, u.lon, u.population, u.actif,
            p.nom AS parent,
            (SELECT COUNT(*) FROM structures s WHERE s.unite_id = u.id) AS nb_structures,
            (SELECT COUNT(*) FROM sportifs sp WHERE sp.unite_origine_id = u.id) AS nb_sportifs
     FROM unites_admin u
     LEFT JOIN unites_admin p ON p.id = u.parent_id
     ORDER BY u.niveau, u.nom`,
  ).all();
  return c.json({ unites: r.results });
});

administration.post('/unites', async (c) => {
  const corps = await lireCorps(c);
  const nom = texteObligatoire(corps, 'nom', 'Le nom', 120);
  const niveau = valeurParmi(corps.niveau, NIVEAUX, 'Le niveau', 'niveau');
  const code = texteObligatoire(corps, 'code', 'Le code', 40).toUpperCase();
  const parentId = texteFacultatif(corps, 'parentId', 40) || null;

  // Une région se rattache au pays, un arrondissement à un département ou à
  // une région. Sans ce contrôle, la hiérarchie se disloque et les
  // agrégations par région cessent de remonter les bons effectifs.
  if (niveau !== 'region' && !parentId) {
    throw new ErreurRequete(
      'Un département ou un arrondissement doit être rattaché à une unité supérieure.',
      400, 'parentId',
    );
  }
  if (parentId) {
    const parent = await c.env.DB.prepare('SELECT niveau FROM unites_admin WHERE id = ?')
      .bind(parentId).first<{ niveau: string }>();
    if (!parent) throw new ErreurRequete('Unité parente introuvable.', 404, 'parentId');
    const ordre = ['pays', 'region', 'departement', 'arrondissement'];
    if (ordre.indexOf(parent.niveau) >= ordre.indexOf(niveau)) {
      throw new ErreurRequete(
        `Une unité de niveau « ${niveau} » ne peut pas être rattachée à une unité de niveau « ${parent.niveau} ».`,
        400, 'parentId',
      );
    }
  }

  const lat = corps.lat !== undefined && corps.lat !== ''
    ? entierBorne(corps.lat, 'La latitude', -90, 90, 'lat') : null;
  const lon = corps.lon !== undefined && corps.lon !== ''
    ? entierBorne(corps.lon, 'La longitude', -180, 180, 'lon') : null;

  const id = nouvelId();
  try {
    await c.env.DB.prepare(
      `INSERT INTO unites_admin (id, code, nom, niveau, parent_id, lat, lon, population)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, code, nom, niveau, parentId ?? (niveau === 'region' ? 'cm' : null), lat, lon,
           corps.population ? entierBorne(corps.population, 'La population', 0, 100_000_000) : null).run();
  } catch (e) {
    if (String((e as Error).message).includes('UNIQUE')) {
      throw new ErreurRequete('Ce code est déjà utilisé par une autre unité.', 409, 'code');
    }
    throw e;
  }

  return c.json({ unite: { id, code, nom, niveau } }, 201);
});

administration.post('/unites/:id/modifier', async (c) => {
  const corps = await lireCorps(c);
  const id = c.req.param('id');

  const unite = await c.env.DB.prepare('SELECT * FROM unites_admin WHERE id = ?')
    .bind(id).first<any>();
  if (!unite) throw new ErreurRequete('Unité introuvable.', 404);

  const nom = corps.nom !== undefined ? texteObligatoire(corps, 'nom', 'Le nom', 120) : unite.nom;
  const lat = corps.lat !== undefined && corps.lat !== ''
    ? entierBorne(corps.lat, 'La latitude', -90, 90, 'lat') : unite.lat;
  const lon = corps.lon !== undefined && corps.lon !== ''
    ? entierBorne(corps.lon, 'La longitude', -180, 180, 'lon') : unite.lon;
  const population = corps.population !== undefined && corps.population !== ''
    ? entierBorne(corps.population, 'La population', 0, 100_000_000) : unite.population;

  await c.env.DB.prepare(
    'UPDATE unites_admin SET nom = ?, lat = ?, lon = ?, population = ? WHERE id = ?',
  ).bind(nom, lat, lon, population, id).run();

  return c.json({ ok: true });
});

/**
 * Désactivation plutôt que suppression.
 *
 * Des étapes de parcours peuvent déjà pointer vers cette unité. Les
 * supprimer effacerait l'historique ; les laisser orphelines casserait les
 * agrégations. La désactivation retire l'unité des listes de saisie sans
 * toucher au passé.
 */
administration.post('/unites/:id/desactiver', async (c) => {
  const id = c.req.param('id');
  const usage = await c.env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM etapes WHERE unite_id = ?) AS etapes,
            (SELECT COUNT(*) FROM structures WHERE unite_id = ?) AS structures`,
  ).bind(id, id).first<any>();

  await c.env.DB.prepare('UPDATE unites_admin SET actif = 0 WHERE id = ?').bind(id).run();
  return c.json({ ok: true, usage });
});

// ---------------------------------------------------------------------
// Structures
// ---------------------------------------------------------------------
administration.get('/structures', async (c) => {
  const r = await c.env.DB.prepare(
    `SELECT s.id, s.nom, s.lat, s.lon, s.adresse, s.contact, s.verifiee,
            ts.nom AS type, ts.rang, u.nom AS territoire, u.id AS unite_id,
            (SELECT COUNT(*) FROM etapes e WHERE e.structure_id = s.id) AS nb_etapes,
            (SELECT COUNT(*) FROM personnes p WHERE p.structure_id = s.id) AS nb_encadrants
     FROM structures s
     JOIN types_structure ts ON ts.id = s.type_id
     JOIN unites_admin u ON u.id = s.unite_id
     ORDER BY s.nom`,
  ).all();
  return c.json({ structures: r.results });
});

administration.post('/structures', async (c) => {
  const corps = await lireCorps(c);
  const nom = texteObligatoire(corps, 'nom', 'Le nom', 160);
  const typeId = texteObligatoire(corps, 'typeId', 'Le type', 40);
  const uniteId = texteObligatoire(corps, 'uniteId', 'Le territoire', 40);

  const [type, unite] = await Promise.all([
    c.env.DB.prepare('SELECT id FROM types_structure WHERE id = ?').bind(typeId).first(),
    c.env.DB.prepare('SELECT id FROM unites_admin WHERE id = ?').bind(uniteId).first(),
  ]);
  if (!type) throw new ErreurRequete('Type de structure inconnu.', 400, 'typeId');
  if (!unite) throw new ErreurRequete('Territoire inconnu.', 400, 'uniteId');

  const lat = corps.lat !== undefined && corps.lat !== ''
    ? entierBorne(corps.lat, 'La latitude', -90, 90, 'lat') : null;
  const lon = corps.lon !== undefined && corps.lon !== ''
    ? entierBorne(corps.lon, 'La longitude', -180, 180, 'lon') : null;

  // La position conditionne la recherche par proximité et l'affichage
  // cartographique. On l'accepte vide, mais on le signale, car une structure
  // sans coordonnées disparaît de toutes les cartes.
  const id = nouvelId();
  await c.env.DB.prepare(
    `INSERT INTO structures (id, nom, type_id, unite_id, lat, lon, adresse, contact, verifiee)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, nom, typeId, uniteId, lat, lon,
         texteFacultatif(corps, 'adresse', 200),
         texteFacultatif(corps, 'contact', 80),
         corps.verifiee ? 1 : 0).run();

  return c.json({
    structure: { id, nom },
    avertissement: lat === null || lon === null
      ? 'Structure enregistrée sans position : elle n’apparaîtra sur aucune carte et ne sortira pas des recherches par proximité.'
      : null,
  }, 201);
});

administration.post('/structures/:id/modifier', async (c) => {
  const corps = await lireCorps(c);
  const id = c.req.param('id');

  const s = await c.env.DB.prepare('SELECT * FROM structures WHERE id = ?').bind(id).first<any>();
  if (!s) throw new ErreurRequete('Structure introuvable.', 404);

  await c.env.DB.prepare(
    `UPDATE structures SET nom = ?, lat = ?, lon = ?, adresse = ?, contact = ?, verifiee = ?
     WHERE id = ?`,
  ).bind(
    corps.nom !== undefined ? texteObligatoire(corps, 'nom', 'Le nom', 160) : s.nom,
    corps.lat !== undefined && corps.lat !== '' ? entierBorne(corps.lat, 'La latitude', -90, 90) : s.lat,
    corps.lon !== undefined && corps.lon !== '' ? entierBorne(corps.lon, 'La longitude', -180, 180) : s.lon,
    corps.adresse !== undefined ? texteFacultatif(corps, 'adresse', 200) : s.adresse,
    corps.contact !== undefined ? texteFacultatif(corps, 'contact', 80) : s.contact,
    corps.verifiee !== undefined ? (corps.verifiee ? 1 : 0) : s.verifiee,
    id,
  ).run();

  return c.json({ ok: true });
});

// ---------------------------------------------------------------------
// Disciplines
// ---------------------------------------------------------------------
administration.post('/disciplines', async (c) => {
  const corps = await lireCorps(c);
  const nom = texteObligatoire(corps, 'nom', 'Le nom', 60);
  const id = nom.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').slice(0, 30);

  try {
    await c.env.DB.prepare('INSERT INTO disciplines (id, nom) VALUES (?, ?)').bind(id, nom).run();
  } catch (e) {
    if (String((e as Error).message).includes('UNIQUE')) {
      throw new ErreurRequete('Cette discipline existe déjà.', 409, 'nom');
    }
    throw e;
  }

  // Les postes sont créés dans la foulée : une discipline sans poste oblige à
  // revenir sur l'écran, et le modèle resterait inutilisable pour la saisie.
  const postes = Array.isArray(corps.postes) ? corps.postes.slice(0, 30) : [];
  if (postes.length) {
    await c.env.DB.batch(postes.map((p, i) =>
      c.env.DB.prepare('INSERT INTO postes (id, discipline_id, nom, ordre) VALUES (?, ?, ?, ?)')
        .bind(nouvelId(), id, String(p).slice(0, 60), i + 1)));
  }

  return c.json({ discipline: { id, nom, postes: postes.length } }, 201);
});

/** Tableau de bord : ce qui manque pour que la plateforme soit exploitable. */
administration.get('/etat', async (c) => {
  const r = await c.env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM unites_admin WHERE niveau = 'region') AS regions,
       (SELECT COUNT(*) FROM unites_admin WHERE niveau = 'arrondissement') AS arrondissements,
       (SELECT COUNT(*) FROM structures) AS structures,
       (SELECT COUNT(*) FROM structures WHERE lat IS NULL) AS structures_sans_position,
       (SELECT COUNT(*) FROM disciplines) AS disciplines,
       (SELECT COUNT(*) FROM personnes WHERE hash_mdp IS NOT NULL) AS comptes,
       (SELECT COUNT(*) FROM personnes WHERE role = 'encadrant' AND structure_id IS NULL) AS encadrants_sans_structure,
       (SELECT COUNT(*) FROM sportifs) AS sportifs,
       (SELECT COUNT(*) FROM etapes) AS etapes,
       (SELECT COUNT(*) FROM sportifs WHERE unite_origine_id IS NULL) AS sportifs_sans_origine`,
  ).first<any>();

  // Les manques sont remontés nommément : un tableau de bord qui affiche des
  // compteurs sans dire ce qui bloque laisse chercher.
  const alertes: string[] = [];
  if (r.encadrants_sans_structure > 0) {
    alertes.push(`${r.encadrants_sans_structure} encadrant(s) sans structure : ils ne peuvent rien attester.`);
  }
  if (r.structures_sans_position > 0) {
    alertes.push(`${r.structures_sans_position} structure(s) sans position : absentes des cartes et des recherches par proximité.`);
  }
  if (r.sportifs_sans_origine > 0) {
    alertes.push(`${r.sportifs_sans_origine} sportif(s) sans territoire d’origine : exclus des analyses territoriales.`);
  }
  if (r.arrondissements < 20) {
    alertes.push('Le découpage administratif est encore partiel : les analyses resteront grossières.');
  }

  return c.json({ etat: r, alertes });
});
