import type { Metadata } from 'next';

/**
 * Cette section n'est pas indexable.
 *
 * L'instruction est posée dans la page elle-même, et non seulement dans le
 * fichier des directives : un moteur qui atteindrait l'adresse par un lien
 * partagé lirait la page sans avoir consulté ces directives.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
