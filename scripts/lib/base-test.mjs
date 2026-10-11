/**
 * Adaptateur de base de données pour les tests.
 *
 * L'API s'exécute en production sur une base relationnelle distante, dont
 * l'interface diffère légèrement de celle de node:sqlite. Cet adaptateur
 * reproduit cette interface, ce qui permet d'appeler directement le routeur
 * avec de vraies requêtes HTTP, sans lancer de serveur ni dépendre du réseau.
 *
 * Ce qui n'est PAS reproduit ici, et qu'il faudra vérifier en conditions
 * réelles : la latence, les limites de taille, et le comportement exact des
 * transactions groupées.
 */
import { DatabaseSync } from 'node:sqlite';

class Requete {
  constructor(db, sql, params = []) {
    this.db = db;
    this.sql = sql;
    this.params = params;
  }

  bind(...params) {
    // Une nouvelle requête liée est renvoyée plutôt que de modifier
    // l'existante, conformément au comportement attendu en production.
    return new Requete(this.db, this.sql, params.map(normaliser));
  }

  async first(colonne) {
    const ligne = this.db.prepare(this.sql).get(...this.params);
    if (ligne === undefined) return null;
    return colonne ? (ligne[colonne] ?? null) : ligne;
  }

  async all() {
    const results = this.db.prepare(this.sql).all(...this.params);
    return { results, success: true, meta: { rows_read: results.length } };
  }

  async run() {
    const r = this.db.prepare(this.sql).run(...this.params);
    return { success: true, meta: { changes: Number(r.changes ?? 0) } };
  }
}

/**
 * Les booléens et les valeurs indéfinies sont refusés par node:sqlite alors
 * qu'ils sont tolérés en production. On aligne ici plutôt que dans chaque
 * route : c'est exactement le genre d'écart qui ne se voit qu'une fois en
 * ligne.
 */
function normaliser(v) {
  if (v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  return v;
}

class BaseTest {
  constructor(db) {
    this.db = db;
  }
  prepare(sql) {
    return new Requete(this.db, sql);
  }
  async batch(requetes) {
    // Un lot s'exécute en transaction : sans cela, une erreur au milieu
    // laisserait la base à moitié écrite, et les tests passeraient là où la
    // production échouerait.
    this.db.exec('BEGIN');
    try {
      const sorties = [];
      for (const r of requetes) sorties.push(await r.run());
      this.db.exec('COMMIT');
      return sorties;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
  async exec(sql) {
    this.db.exec(sql);
    return { count: 0 };
  }
}

/**
 * Stockage d'objets en mémoire.
 *
 * Suffisant pour éprouver les règles d'envoi, de droits et de suppression.
 * Ce qu'il ne reproduit pas, et qu'il faudra vérifier en conditions réelles :
 * les limites de taille du service, et le comportement en cas d'écriture
 * concurrente sur une même clé.
 */
class StockageMemoire {
  constructor() { this.objets = new Map(); }
  async put(cle, valeur, options) {
    this.objets.set(cle, { valeur, options });
    return { key: cle };
  }
  async get(cle) {
    if (!this.objets.has(cle)) return null;
    const { valeur } = this.objets.get(cle);
    return { body: valeur, httpEtag: '"test"', writeHttpMetadata() {} };
  }
  async delete(cle) { this.objets.delete(cle); }
  get taille() { return this.objets.size; }
}

export function creerEnv({ schemaSql, seedSql = '' } = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  if (schemaSql) db.exec(schemaSql);
  if (seedSql) db.exec(seedSql);

  return {
    env: {
      DB: new BaseTest(db),
      FICHIERS: new StockageMemoire(),
      ORIGINES_AUTORISEES: 'https://test.exemple',
      SEL_MOT_DE_PASSE: 'sel-de-test',
    },
    brut: db,
  };
}

/** Client HTTP minimal conservant les cookies, comme le ferait un navigateur. */
export function creerClient(app, env, base = 'https://test.exemple') {
  let cookies = '';

  async function appeler(methode, chemin, corps, options = {}) {
    const entetes = new Headers(options.entetes ?? {});
    if (corps !== undefined && !options.sansContentType) {
      entetes.set('content-type', 'application/json');
    }
    if (cookies) entetes.set('cookie', cookies);
    entetes.set('origin', base);

    const reponse = await app.fetch(
      new Request(base + chemin, {
        method: methode,
        headers: entetes,
        body: corps === undefined ? undefined : JSON.stringify(corps),
      }),
      env,
    );

    const setCookie = reponse.headers.get('set-cookie');
    if (setCookie) cookies = setCookie.split(';')[0];

    const texte = await reponse.text();
    let json = null;
    try { json = texte ? JSON.parse(texte) : null; } catch { json = { brut: texte }; }
    return { statut: reponse.status, json };
  }

  /** Envoi multipart : le navigateur pose lui-même le type de contenu. */
  async function envoyerFichiers(chemin, formulaire) {
    const entetes = new Headers();
    if (cookies) entetes.set('cookie', cookies);
    entetes.set('origin', base);
    const reponse = await app.fetch(
      new Request(base + chemin, { method: 'POST', headers: entetes, body: formulaire }),
      env,
    );
    const texte = await reponse.text();
    let json = null;
    try { json = texte ? JSON.parse(texte) : null; } catch { json = { brut: texte }; }
    return { statut: reponse.status, json };
  }

  return {
    get: (c) => appeler('GET', c),
    supprimer: (c) => appeler('DELETE', c),
    envoyerFichiers,
    post: (c, corps, o) => appeler('POST', c, corps, o),
    patch: (c, corps) => appeler('PATCH', c, corps),
    postSansEntete: (c, corps) => appeler('POST', c, corps, { sansContentType: true }),
    oublierCookies: () => { cookies = ''; },
  };
}
