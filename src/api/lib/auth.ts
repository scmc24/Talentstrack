import type { Context, Next } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { Env, Variables, Compte, Role } from '../types.ts';
import { nouvelId, maintenant } from './ids.ts';
import { ErreurRequete } from './corps.ts';

const NOM_COOKIE = 'talentstrack_session';
const DUREE_JOURS = 30;
const ITERATIONS = 100_000;

/**
 * Hachage des mots de passe.
 *
 * Le séparateur est un point et l'encodage évite « + » et « / » : un hachage
 * contenant des caractères spéciaux est détruit dès qu'il transite par une
 * ligne de commande ou une URL, et la panne est alors silencieuse.
 */
export async function hacher(motDePasse: string, selGlobal: string): Promise<string> {
  const sel = crypto.getRandomValues(new Uint8Array(16));
  const brut = await derive(motDePasse, sel, selGlobal);
  return `pbkdf2.${ITERATIONS}.${versBase64Url(sel)}.${versBase64Url(brut)}`;
}

export async function verifierMotDePasse(
  motDePasse: string, stocke: string | null, selGlobal: string,
): Promise<boolean> {
  if (!stocke) return false;
  const parts = stocke.split('.');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 1000) return false;
  const obtenu = await derive(motDePasse, depuisBase64Url(parts[2]), selGlobal, iterations);
  return comparaisonConstante(obtenu, depuisBase64Url(parts[3]));
}

async function derive(
  motDePasse: string, sel: Uint8Array, selGlobal: string, iterations = ITERATIONS,
): Promise<Uint8Array> {
  // Sans ce contrôle, un secret non configuré donne la chaîne « undefined » :
  // le hachage fonctionne, aucune erreur n'apparaît, mais les mots de passe
  // créés deviennent incompatibles avec ceux de la production.
  if (!selGlobal) {
    throw new Error('SEL_MOT_DE_PASSE non configuré.');
  }
  const cle = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(motDePasse + selGlobal), 'PBKDF2', false, ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: sel as unknown as ArrayBuffer, iterations, hash: 'SHA-256' }, cle, 256,
  );
  return new Uint8Array(bits);
}

/** Comparaison à temps constant : une comparaison ordinaire s'arrête au
 *  premier octet différent, ce qui laisse mesurer la progression. */
function comparaisonConstante(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function versBase64Url(o: Uint8Array): string {
  let s = '';
  for (const x of o) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function depuisBase64Url(t: string): Uint8Array {
  const n = t.replace(/-/g, '+').replace(/_/g, '/');
  const brut = atob(n + '='.repeat((4 - (n.length % 4)) % 4));
  const out = new Uint8Array(brut.length);
  for (let i = 0; i < brut.length; i++) out[i] = brut.charCodeAt(i);
  return out;
}

// ---------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------

export async function ouvrirSession(c: Context<{ Bindings: Env; Variables: Variables }>, personneId: string) {
  const id = nouvelId();
  const expire = new Date(Date.now() + DUREE_JOURS * 86_400_000)
    .toISOString().replace(/\.\d{3}Z$/, 'Z');

  await c.env.DB.prepare('INSERT INTO sessions (id, personne_id, expire_le) VALUES (?, ?, ?)')
    .bind(id, personneId, expire).run();

  setCookie(c, NOM_COOKIE, id, {
    httpOnly: true,   // inaccessible au script : limite le vol par injection
    secure: true,
    // Le site et les services partagent une même origine depuis la fusion en
    // un seul Worker. « Lax » protège contre des attaques inter-sites
    // auxquelles « None » expose, ce qui compte sur une base contenant des
    // données de mineurs.
    sameSite: 'Lax',
    path: '/',
    maxAge: DUREE_JOURS * 86_400,
  });
  return id;
}

export async function fermerSession(c: Context<{ Bindings: Env; Variables: Variables }>) {
  const id = getCookie(c, NOM_COOKIE);
  if (id) await c.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(id).run();
  deleteCookie(c, NOM_COOKIE, { path: '/' });
}

/**
 * Charge le compte si une session valide existe. Ne bloque jamais : les
 * routes publiques doivent fonctionner sans compte.
 */
export async function middlewareSession(
  c: Context<{ Bindings: Env; Variables: Variables }>, next: Next,
) {
  const id = getCookie(c, NOM_COOKIE);
  if (id) {
    const compte = await c.env.DB.prepare(
      `SELECT p.id, p.nom, p.role, p.structure_id, p.actif
       FROM sessions s JOIN personnes p ON p.id = s.personne_id
       WHERE s.id = ? AND s.expire_le > ?`,
    ).bind(id, maintenant()).first<Compte & { actif: number }>();

    // Un compte désactivé perd l'accès immédiatement : c'est l'intérêt d'une
    // session en base plutôt que d'un jeton autonome, qui resterait valide
    // jusqu'à son expiration.
    if (compte && compte.actif === 1) c.set('compte', compte);
  }
  await next();
}

const RANG: Record<Role, number> = { sportif: 0, encadrant: 1, recruteur: 1, admin: 2 };

export function exigerRole(minimum: Role) {
  return async (c: Context<{ Bindings: Env; Variables: Variables }>, next: Next) => {
    const compte = c.get('compte');
    if (!compte) throw new ErreurRequete('Connexion requise.', 401);
    if (RANG[compte.role] < RANG[minimum]) {
      throw new ErreurRequete('Vous n’avez pas les droits nécessaires.', 403);
    }
    await next();
  };
}

export function exigerCompte(c: Context<{ Bindings: Env; Variables: Variables }>): Compte {
  const compte = c.get('compte');
  if (!compte) throw new ErreurRequete('Connexion requise.', 401);
  return compte;
}
