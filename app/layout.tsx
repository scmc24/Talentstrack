import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Entete, NavBasse, PiedPage } from '../composants/Ossature';
import { FournisseurSession } from '../composants/Session';
import { Installation, AgentService } from '../composants/Installation';
import { compteCourant } from '../lib/serveur';
import { SITE } from '../lib/site';

export const metadata: Metadata = {
  // Nécessaire pour que les adresses relatives des aperçus de partage et des
  // adresses canoniques soient transformées en adresses absolues.
  metadataBase: new URL(SITE),
  title: { default: 'TalentsTrack — suivi des parcours de jeunes sportifs', template: '%s — TalentsTrack' },
  description:
    'Repérer, suivre, révéler. Enregistrement des parcours de jeunes sportifs : étapes, modes de détection, grades et territoires.',
  applicationName: 'TalentsTrack',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [{ url: '/favicon.ico' }, { url: '/icone-192.png', sizes: '192x192', type: 'image/png' }],
    apple: '/apple-touch-icon.png',
  },
  // Permet l'ouverture en plein écran sur iOS, qui ignore le manifeste.
  appleWebApp: { capable: true, title: 'TalentsTrack', statusBarStyle: 'black-translucent' },
  alternates: { canonical: '/' },
  keywords: [
    'détection de talents sportifs', 'suivi des jeunes sportifs', 'football Cameroun',
    'basketball Cameroun', 'académie sportive', 'parcours sportif', 'centre de formation',
  ],
  openGraph: {
    siteName: 'TalentsTrack',
    url: SITE,
    title: 'TalentsTrack — repérer, suivre, révéler',
    description: 'Repérer, suivre, révéler les parcours de jeunes sportifs.',
    images: [{ url: '/partage.png', width: 1200, height: 630, alt: 'TalentsTrack' }],
    locale: 'fr_FR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'TalentsTrack — repérer, suivre, révéler',
    description: 'Enregistrement des parcours de jeunes sportifs : étapes, modes de détection, grades et territoires.',
    images: ['/partage.png'],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Le zoom reste autorisé : quelqu'un qui a besoin d'agrandir le texte doit
  // pouvoir le faire. Le problème d'agrandissement automatique se règle par
  // des champs à 16 px, pas en bridant le pincement.
  maximumScale: 5,
  themeColor: '#101720',
};

/**
 * La session est lue côté serveur et transmise aux composants : l'en-tête
 * affiche d'emblée le bon état, sans appel réseau ni clignotement entre
 * « Se connecter » et le nom de la personne.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const compte = await compteCourant();
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Barlow:wght@400;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <FournisseurSession compteInitial={compte}>
          <Entete />
          <main className="corps">{children}</main>
          <PiedPage />
          <NavBasse />
          <Installation />
          <AgentService />
        </FournisseurSession>
      </body>
    </html>
  );
}
