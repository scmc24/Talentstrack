import {
  compteCourant, listerEffectif, listerContestations,
  type LigneEffectif,
} from '../lib/serveur';
import { EffectifInteractif } from '../composants/EffectifInteractif';
import { Presentation } from '../composants/Presentation';

/**
 * Effectif suivi, rendu par le serveur.
 *
 * La liste et les signalements sont lus en base avant l'envoi de la page : la
 * première chose affichée est déjà le contenu, et non une coquille vide
 * attendant un appel réseau. C'est la raison d'être de la fusion, et le gain
 * se mesure sur une connexion lente.
 *
 * Aucune mise en cache : chaque ligne dépend des droits de la personne
 * connectée, et servir une page mémorisée reviendrait à montrer un effectif à
 * quelqu'un qui n'y a pas accès.
 */
export const dynamic = 'force-dynamic';

export default async function Accueil() {
  const compte = await compteCourant();

  // Visiteur : la page de présentation. Elle expose le problème avant la
  // solution, faute de quoi l'outil se range mentalement parmi les annuaires
  // sportifs, dont chacun connaît l'inefficacité.
  if (!compte) return <Presentation />;

  const [effectif, contestations] = await Promise.all([
    listerEffectif(),
    listerContestations(compte),
  ]);

  return (
    <EffectifInteractif
      compte={compte}
      effectif={effectif as LigneEffectif[]}
      contestationsInitiales={contestations}
    />
  );
}
