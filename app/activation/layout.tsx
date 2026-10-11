import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Activer mon accès sportif',
  description: 'Votre encadrant vous a remis un code : activez votre accès pour consulter votre parcours sportif.',
  alternates: { canonical: '/activation/' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
