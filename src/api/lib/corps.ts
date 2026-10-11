import type { Context } from 'hono';

/**
 * Lecture tolérante du corps de requête.
 *
 * L'analyse JSON native échoue quand l'en-tête de type de contenu est absent
 * ou mal formé, ce qui arrive avec certains clients mobiles. Le message
 * d'erreur remonté désigne alors un champ au hasard, et l'on cherche le
 * défaut dans la validation pendant une heure alors qu'il est dans l'en-tête.
 */
export async function lireCorps(c: Context): Promise<Record<string, unknown>> {
  let texte: string;
  try {
    texte = await c.req.text();
  } catch {
    return {};
  }
  if (!texte || texte.trim() === '') return {};
  try {
    const valeur = JSON.parse(texte);
    if (valeur === null || typeof valeur !== 'object' || Array.isArray(valeur)) return {};
    return valeur as Record<string, unknown>;
  } catch {
    return {};
  }
}

export class ErreurRequete extends Error {
  statut: number;
  champ: string | undefined;
  constructor(message: string, statut = 400, champ?: string) {
    super(message);
    this.statut = statut;
    this.champ = champ;
  }
}

export function texteObligatoire(
  corps: Record<string, unknown>, champ: string, libelle: string, maxi = 300,
): string {
  const brut = corps[champ];
  if (typeof brut !== 'string' || brut.trim() === '') {
    throw new ErreurRequete(`${libelle} est obligatoire.`, 400, champ);
  }
  const valeur = brut.trim();
  if (valeur.length > maxi) {
    throw new ErreurRequete(`${libelle} dépasse ${maxi} caractères.`, 400, champ);
  }
  return valeur;
}

export function texteFacultatif(
  corps: Record<string, unknown>, champ: string, maxi = 300,
): string {
  const brut = corps[champ];
  return typeof brut === 'string' ? brut.trim().slice(0, maxi) : '';
}

/**
 * Valeur appartenant à une liste fermée.
 *
 * Toutes les nomenclatures du modèle passent par cette fonction. L'enquête
 * exploratoire a montré qu'un champ libre produit des données inexploitables :
 * quatre formats différents pour une même taille, des réponses hors sujet à
 * une question fermée. Le message cite les valeurs acceptées, afin que
 * l'erreur soit corrigeable sans consulter la documentation.
 */
export function valeurParmi<T extends string>(
  valeur: unknown, permises: readonly T[], libelle: string, champ?: string,
): T {
  if (typeof valeur === 'string' && (permises as readonly string[]).includes(valeur)) {
    return valeur as T;
  }
  throw new ErreurRequete(
    `${libelle} doit être l'une des valeurs suivantes : ${permises.join(', ')}.`,
    400, champ,
  );
}

export function entierBorne(
  valeur: unknown, libelle: string, mini: number, maxi: number, champ?: string,
): number {
  const n = typeof valeur === 'string' ? Number(valeur) : valeur;
  if (typeof n !== 'number' || !Number.isFinite(n)) {
    throw new ErreurRequete(`${libelle} doit être un nombre.`, 400, champ);
  }
  if (n < mini || n > maxi) {
    throw new ErreurRequete(`${libelle} doit être compris entre ${mini} et ${maxi}.`, 400, champ);
  }
  return n;
}

/**
 * Date au format AAAA-MM ou AAAA-MM-JJ.
 *
 * Le mois seul est accepté volontairement : un encadrant qui reconstitue un
 * parcours ancien se souvient de l'année et de la saison, rarement du jour.
 * Exiger une date complète le pousserait à inventer un 1er janvier, ce qui
 * introduirait une fausse précision dans toutes les analyses temporelles.
 */
export function dateSouple(valeur: unknown, libelle: string, champ?: string): string {
  if (typeof valeur !== 'string' || !/^\d{4}-\d{2}(-\d{2})?$/.test(valeur.trim())) {
    throw new ErreurRequete(
      `${libelle} doit être au format AAAA-MM ou AAAA-MM-JJ.`, 400, champ,
    );
  }
  const v = valeur.trim();
  const annee = Number(v.slice(0, 4));
  const anneeCourante = new Date().getFullYear();
  if (annee < 1950 || annee > anneeCourante + 1) {
    throw new ErreurRequete(`${libelle} indique une année invraisemblable.`, 400, champ);
  }
  return v;
}
