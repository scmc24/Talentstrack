import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';

// Rend les liaisons Cloudflare (base, variables) accessibles pendant
// « next dev ». Sans cet appel, les pages rendues côté serveur n'auraient
// aucune base en développement, et il faudrait déployer pour tester.
initOpenNextCloudflareForDev();

/** @type {import('next').NextConfig} */
export default {
  // Plus d'export statique : les pages sont rendues par le Worker, qui
  // interroge la base directement. Sur une connexion mobile, cela remplace
  // trois allers-retours (coquille, script, appel à l'API) par un seul.
  images: { unoptimized: true },
  // Tous les liens internes se terminent par une barre. Sans cette option,
  // chaque navigation déclenche une redirection : un aller-retour réseau
  // supplémentaire sur chaque clic, précisément ce que la fusion visait à
  // supprimer.
  trailingSlash: true,
  // Le site et les services partagent désormais une même origine : plus de
  // CORS à régler, et le cookie de session repasse en SameSite=Lax, qui
  // protège contre des attaques auxquelles SameSite=None expose.
  eslint: { ignoreDuringBuilds: true },
};
