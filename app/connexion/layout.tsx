import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Connexion',
  description: 'Accédez à votre espace TalentsTrack : effectif suivi, saisie des étapes, parcours de vos sportifs.',
  alternates: { canonical: '/connexion/' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
