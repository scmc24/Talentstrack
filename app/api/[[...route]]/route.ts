import { getCloudflareContext } from '@opennextjs/cloudflare';
import app from '../../../src/api/index.ts';

/**
 * Point d'entrée unique des services.
 *
 * Tout le code métier reste dans `src/api`, écrit sur l'objet Request
 * standard. Il est monté ici, dans le Worker qui sert aussi les pages : une
 * seule origine, un seul déploiement, aucune configuration CORS, et un cookie
 * de session en SameSite=Lax plutôt que None.
 */
const PREFIXE = '/api';

async function traiter(requete: Request): Promise<Response> {
  const { env } = getCloudflareContext();

  // Le préfixe de montage est retiré avant de passer la requête au module
  // métier. Celui-ci déclare ses routes telles qu'elles sont (« /sante »,
  // « /sportifs »), sans rien savoir de l'endroit où il est branché : c'est
  // ce qui permet aux 215 assertions de s'exécuter contre lui sans Worker,
  // et ce qui permettrait de le déplacer sans réécrire une route.
  const url = new URL(requete.url);
  if (url.pathname.startsWith(PREFIXE)) {
    url.pathname = url.pathname.slice(PREFIXE.length) || '/';
  }

  // La barre finale est retirée. L'application ajoute une barre à toutes ses
  // adresses, y compris celles des services : « /api/referentiels » devient
  // « /api/referentiels/ », et le module métier, qui déclare « /referentiels »,
  // répondait 404 à chaque appel. Le symptôme était trompeur, puisque les
  // pages s'affichaient normalement.
  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.slice(0, -1);
  }

  const reponse = await app.fetch(new Request(url, requete), env as any);

  // Les services ne sont jamais indexables. L'en-tête vaut pour les réponses
  // qu'un fichier de directives ne couvre pas, par exemple un fichier joint
  // dont l'adresse aurait été partagée.
  const entetes = new Headers(reponse.headers);
  entetes.set('x-robots-tag', 'noindex, nofollow');
  return new Response(reponse.body, {
    status: reponse.status,
    statusText: reponse.statusText,
    headers: entetes,
  });
}

export const GET = traiter;
export const POST = traiter;
export const PATCH = traiter;
export const PUT = traiter;
export const DELETE = traiter;
export const OPTIONS = traiter;
