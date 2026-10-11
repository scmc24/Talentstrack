/** Identifiant unique, engendré côté application avant tout appel réseau. */
export function nouvelId(): string {
  return crypto.randomUUID();
}

/**
 * Horodatage ISO-8601 avec T et Z.
 *
 * Ne jamais employer la fonction de date de la base à la place : elle produit
 * un format sans T ni Z, et comme les comparaisons de dates sont textuelles,
 * mélanger les deux formats donne des résultats faux sans lever d'erreur.
 */
export function maintenant(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** Âge en années révolues à partir d'une date de naissance. */
export function age(naissance: string | null): number | null {
  if (!naissance) return null;
  const n = new Date(naissance);
  if (Number.isNaN(n.getTime())) return null;
  const a = new Date();
  let ans = a.getFullYear() - n.getFullYear();
  const m = a.getMonth() - n.getMonth();
  if (m < 0 || (m === 0 && a.getDate() < n.getDate())) ans--;
  return ans;
}
