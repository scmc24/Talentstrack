import { defineCloudflareConfig } from '@opennextjs/cloudflare';

/**
 * Configuration de l'adaptateur Cloudflare.
 *
 * Volontairement minimale : aucun cache incrémental n'est déclaré, parce que
 * toutes les pages de cette plateforme dépendent de la session et des droits
 * de la personne connectée. Mettre en cache une fiche de sportif reviendrait
 * à la servir à quelqu'un qui n'y a pas accès.
 */
export default defineCloudflareConfig();
