/**
 * Agent de service.
 *
 * Son rôle est volontairement limité. Les pages dépendent de la session et
 * des droits de la personne connectée : les mettre en cache reviendrait à
 * servir l'effectif d'une structure à quelqu'un d'autre, ou à afficher des
 * données retirées depuis.
 *
 * Il ne conserve donc que la charte visuelle et les icônes, et sert une page
 * d'excuse lorsque le réseau est absent. C'est aussi ce qui rend
 * l'application installable, les navigateurs exigeant un agent de service
 * doté d'un gestionnaire de requêtes.
 */
const VERSION = 'talentstrack-v1';
// L'application ajoute une barre finale à ses adresses, ce qui redirige
// « /hors-ligne.html » vers « /hors-ligne ». Mettre en cache l'adresse de
// départ y stockerait une redirection, et la page de secours ne s'afficherait
// jamais.
const PAGE_HORS_LIGNE = '/hors-ligne';
const RESSOURCES = [
  PAGE_HORS_LIGNE,
  '/icone-192.png',
  '/logo-entete.png',
];

self.addEventListener('install', (evenement) => {
  evenement.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(RESSOURCES)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (evenement) => {
  // Les versions précédentes sont supprimées : sans cela, une mise à jour de
  // la charte laisserait d'anciens fichiers coexister avec les nouveaux.
  evenement.waitUntil(
    caches.keys()
      .then((cles) => Promise.all(cles.filter((c) => c !== VERSION).map((c) => caches.delete(c))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (evenement) => {
  const requete = evenement.request;

  // Seules les navigations sont interceptées. Les appels aux services ne le
  // sont jamais : une réponse servie depuis un cache pourrait contredire
  // l'état réel de la base.
  if (requete.mode !== 'navigate') return;

  evenement.respondWith(
    fetch(requete).catch(() => caches.match(PAGE_HORS_LIGNE)),
  );
});
