import type { MetadataRoute } from 'next';
import { SITE, PAGES_PUBLIQUES } from '../lib/site';

/**
 * Plan du site.
 *
 * Il ne liste que les pages publiques. Y faire figurer une page de parcours
 * reviendrait à communiquer aux moteurs une adresse qu'ils n'auraient jamais
 * découverte autrement, puisque aucun lien public n'y mène.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const maintenant = new Date();
  return PAGES_PUBLIQUES.map((chemin) => ({
    url: `${SITE}${chemin}`,
    lastModified: maintenant,
    changeFrequency: chemin === '/' ? 'monthly' : 'yearly',
    priority: chemin === '/' ? 1 : 0.5,
  }));
}
