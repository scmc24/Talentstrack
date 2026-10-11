import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Créer un compte encadrant ou recruteur',
  description: 'Inscrivez votre club ou votre académie sur TalentsTrack et commencez à enregistrer les parcours de vos sportifs.',
  alternates: { canonical: '/inscription/' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
