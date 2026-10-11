/**
 * Icônes dessinées à la main plutôt qu'importées d'une bibliothèque : seules
 * celles réellement employées se retrouvent dans la page, ce qui compte sur
 * une connexion mobile.
 */
type Props = { taille?: number };

function T({ taille = 20, enfants }: Props & { enfants: React.ReactNode }) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"
         aria-hidden="true" focusable="false">{enfants}</svg>
  );
}

export const Effectif = (p: Props) => (
  <T {...p} enfants={<><circle cx="9" cy="8" r="3.2" /><path d="M3 19a6 6 0 0 1 12 0" /><path d="M16 5.5a3.2 3.2 0 0 1 0 6" /><path d="M17.5 15.5A6 6 0 0 1 21 19" /></>} />
);
export const Ajout = (p: Props) => (
  <T {...p} enfants={<><path d="M12 5v14" /><path d="M5 12h14" /></>} />
);
export const Recherche = (p: Props) => (
  <T {...p} enfants={<><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></>} />
);
export const Carte = (p: Props) => (
  <T {...p} enfants={<><path d="m3 7 6-3 6 3 6-3v13l-6 3-6-3-6 3V7Z" /><path d="M9 4v13M15 7v13" /></>} />
);
export const Valide = (p: Props) => (
  <T {...p} enfants={<path d="m5 13 4.5 4.5L19 7" />} />
);
export const Fleche = (p: Props) => (
  <T {...p} enfants={<><path d="M5 12h13" /><path d="m13 6 6 6-6 6" /></>} />
);
export const Trace = (p: Props) => (
  <T {...p} enfants={<><circle cx="6" cy="6" r="2.5" /><circle cx="18" cy="18" r="2.5" /><path d="M6 8.5V14a4 4 0 0 0 4 4h5.5" /></>} />
);
