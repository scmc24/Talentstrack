/**
 * Adresse publique du site.
 *
 * Elle sert à construire les adresses absolues exigées par les moteurs et
 * par les aperçus de partage. Renseignée par variable d'environnement, car
 * elle diffère entre le développement et la production.
 */
export const SITE = process.env.NEXT_PUBLIC_SITE ?? 'https://talentstrack.org';

/**
 * Pages ouvertes à l'indexation.
 *
 * Tout le reste est fermé. Ce n'est pas une précaution excessive : les pages
 * de parcours, de saisie et d'administration contiennent des informations
 * nominatives sur des mineurs, et aucune ne présente d'intérêt pour une
 * personne qui ne serait pas déjà utilisatrice.
 */
export const PAGES_PUBLIQUES = ['/', '/connexion/', '/inscription/', '/activation/'];
