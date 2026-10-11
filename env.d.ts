/**
 * Liaisons Cloudflare propres à cette application.
 *
 * L'interface globale est complétée plutôt que redéclarée : l'adaptateur en
 * définit déjà une, et une seconde déclaration locale ne s'y fondrait pas.
 *
 * Écrite à la main plutôt qu'engendrée : la commande de génération exige un
 * compte Cloudflare, alors que ce fichier doit rester versionné pour que la
 * vérification de types fonctionne sans accès au compte.
 */
declare global {
  interface CloudflareEnv {
    DB: import('@cloudflare/workers-types').D1Database;
    FICHIERS: import('@cloudflare/workers-types').R2Bucket;
    ORIGINES_AUTORISEES: string;
    SEL_MOT_DE_PASSE: string;
  }
}

export {};
