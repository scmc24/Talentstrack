import type { MetadataRoute } from 'next';

/**
 * Manifeste d'installation.
 *
 * C'est ce fichier qui rend l'application installable : le navigateur y lit
 * le nom, les icônes et le mode d'affichage, puis propose l'ajout à l'écran
 * d'accueil. Une fois installée, elle s'ouvre sans barre d'adresse et se
 * comporte comme une application du téléphone.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'TalentsTrack — suivi des parcours de jeunes sportifs',
    short_name: 'TalentsTrack',
    description:
      'Repérer, suivre, révéler. Enregistrement des parcours de jeunes sportifs : étapes, modes de détection, grades et territoires.',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#101720',
    theme_color: '#101720',
    lang: 'fr',
    categories: ['sports', 'education', 'productivity'],
    icons: [
      { src: '/icone-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icone-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // L'icône masquable réserve une marge : le système peut en rogner les
      // bords pour l'inscrire dans sa propre forme, ronde ou en goutte.
      { src: '/icone-512-masquable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    // Raccourcis proposés par un appui long sur l'icône installée.
    shortcuts: [
      { name: 'Enregistrer une étape', url: '/saisie/' },
      { name: 'Mon parcours', url: '/mon-parcours/' },
      { name: 'Territoires', url: '/analyses/' },
    ],
  };
}
