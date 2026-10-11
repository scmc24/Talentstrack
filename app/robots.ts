import type { MetadataRoute } from 'next';
import { SITE } from '../lib/site';

/**
 * Directives aux moteurs de recherche.
 *
 * Seule la page de présentation est ouverte. Les parcours, la saisie,
 * l'administration et les services sont fermés : ils portent des données
 * nominatives concernant en grande partie des mineurs.
 *
 * Ces directives ne protègent rien par elles-mêmes, un moteur pouvant les
 * ignorer. La protection réelle vient de l'authentification : sans session,
 * ces pages ne renvoient aucun contenu. Elles évitent simplement qu'une
 * adresse apparaisse dans des résultats de recherche.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/connexion/', '/inscription/', '/activation/'],
        disallow: [
          '/api/',
          '/sportif/',
          '/mon-parcours/',
          '/saisie/',
          '/nouveau-sportif/',
          '/evaluer/',
          '/recherche/',
          '/administration/',
          '/analyses/',
        ],
      },
    ],
    sitemap: `${SITE}/sitemap.xml`,
  };
}
