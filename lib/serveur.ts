import { cookies } from 'next/headers';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { D1Database } from '@cloudflare/workers-types';

/**
 * Accès aux données depuis une page rendue par le serveur.
 *
 * C'est tout l'intérêt de la fusion : la page interroge la base directement,
 * sans passer par une requête HTTP vers ses propres services. Sur une
 * connexion mobile, cela remplace trois allers-retours (coquille, script,
 * appel aux services) par un seul.
 */
export function base(): D1Database {
  return getCloudflareContext().env.DB as unknown as D1Database;
}

/**
 * Le compte renvoyé côté serveur est le même objet que celui manipulé côté
 * navigateur. Deux définitions auraient fini par diverger, et c'est
 * exactement le genre d'écart qui ne se voit qu'à l'exécution.
 */
export type CompteServeur = import('./api').Compte;

/**
 * Compte de la session en cours, lu côté serveur.
 *
 * La même règle qu'au niveau des services : un compte désactivé perd l'accès
 * immédiatement, puisque la session est relue en base à chaque requête.
 */
export async function compteCourant(): Promise<CompteServeur | null> {
  const jeton = (await cookies()).get('talentstrack_session')?.value;
  if (!jeton) return null;

  const maintenant = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const r = await base().prepare(
    `SELECT p.id, p.nom, p.role, p.structure_id, p.actif, s2.nom AS structure
     FROM sessions s
     JOIN personnes p ON p.id = s.personne_id
     LEFT JOIN structures s2 ON s2.id = p.structure_id
     WHERE s.id = ? AND s.expire_le > ?`,
  ).bind(jeton, maintenant).first<any>();

  if (!r || r.actif !== 1) return null;
  return {
    id: r.id, nom: r.nom, role: r.role,
    structure_id: r.structure_id, structure: r.structure,
  };
}

export type LigneEffectif = {
  id: string; nom: string; discipline: string; poste: string | null;
  origine: string | null; statut: string; structure_actuelle: string | null;
  nb_etapes: number; nb_attestees: number;
};

/** Effectif suivi, dans l'ordre où l'encadrant le parcourt. */
export async function listerEffectif(): Promise<LigneEffectif[]> {
  const r = await base().prepare(
    `SELECT p.id, p.nom, d.nom AS discipline, po.nom AS poste,
            uo.nom AS origine, s.statut,
            (SELECT COUNT(*) FROM etapes e WHERE e.sportif_id = s.personne_id) AS nb_etapes,
            (SELECT COUNT(*) FROM etapes e WHERE e.sportif_id = s.personne_id
               AND e.fiabilite = 'attestee') AS nb_attestees,
            (SELECT st.nom FROM etapes e LEFT JOIN structures st ON st.id = e.structure_id
               WHERE e.sportif_id = s.personne_id ORDER BY e.debut DESC LIMIT 1) AS structure_actuelle
     FROM sportifs s
     JOIN personnes p ON p.id = s.personne_id
     JOIN disciplines d ON d.id = s.discipline_id
     LEFT JOIN postes po ON po.id = s.poste_id
     LEFT JOIN unites_admin uo ON uo.id = s.unite_origine_id
     ORDER BY nb_attestees DESC, p.nom
     LIMIT 200`,
  ).all();
  return r.results as unknown as LigneEffectif[];
}

/** Signalements en attente, pour l'encadrant concerné. */
export async function listerContestations(compte: CompteServeur) {
  if (compte.role !== 'encadrant' && compte.role !== 'admin') return [];
  const condition = compte.role === 'admin' ? '' : 'AND e.structure_id = ?';
  const params = compte.role === 'admin' ? [] : [compte.structure_id];

  const r = await base().prepare(
    `SELECT ct.id, ct.motif, ct.texte, p.nom AS sportif, ct.sportif_id, st.nom AS structure
     FROM contestations ct
     JOIN etapes e ON e.id = ct.etape_id
     JOIN personnes p ON p.id = ct.sportif_id
     LEFT JOIN structures st ON st.id = e.structure_id
     WHERE ct.statut = 'ouverte' ${condition}
     ORDER BY ct.cree_le`,
  ).bind(...params).all();
  return r.results as any[];
}
