'use client';

import { api } from './api';

/**
 * Préparation et envoi des fichiers.
 *
 * Les images sont réduites dans le navigateur avant l'envoi. Une photo prise
 * au téléphone fait couramment quatre mégaoctets : envoyée telle quelle, elle
 * coûte plusieurs minutes sur une connexion mobile, puis elle est rechargée
 * intégralement par chaque personne qui ouvre la fiche.
 *
 * Les documents ne sont pas touchés : une attestation scannée doit rester
 * lisible, et la réduire la rendrait inexploitable comme pièce justificative.
 */

const LARGEURS: Record<string, number> = { logo: 480, photo: 900, piece: 1800 };
const QUALITE = 0.85;

export type Usage = 'logo' | 'photo' | 'piece' | 'video';

export async function preparer(fichier: File, usage: Usage): Promise<File> {
  if (!fichier.type.startsWith('image/')) return fichier;
  // Un logo vectoriel ne se redimensionne pas : il est déjà net à toute
  // taille, et le passer par un canevas le transformerait en image fixe.
  if (fichier.type === 'image/svg+xml') return fichier;

  const image = await charger(fichier);
  const largeurCible = LARGEURS[usage] ?? 1200;
  // On n'agrandit jamais : cela n'ajoute aucun détail et alourdit le fichier.
  const echelle = Math.min(1, largeurCible / image.width);
  if (echelle === 1 && fichier.size < 400_000) return fichier;

  const largeur = Math.round(image.width * echelle);
  const hauteur = Math.round(image.height * echelle);

  const canevas = document.createElement('canvas');
  canevas.width = largeur;
  canevas.height = hauteur;
  const contexte = canevas.getContext('2d');
  if (!contexte) return fichier;

  // Fond blanc : une image transparente convertie en JPEG donnerait un fond
  // noir.
  contexte.fillStyle = '#FFFFFF';
  contexte.fillRect(0, 0, largeur, hauteur);
  contexte.imageSmoothingQuality = 'high';
  contexte.drawImage(image as CanvasImageSource, 0, 0, largeur, hauteur);

  const blob = await new Promise<Blob | null>((r) => canevas.toBlob(r, 'image/jpeg', QUALITE));
  if ('close' in image && typeof image.close === 'function') image.close();
  if (!blob) return fichier;

  return new File([blob], fichier.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
}

async function charger(fichier: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      // L'orientation est reprise des métadonnées : sans cela, une photo
      // prise en portrait arrive couchée.
      return await createImageBitmap(fichier, { imageOrientation: 'from-image' });
    } catch { /* repli ci-dessous */ }
  }
  return new Promise((resoudre, rejeter) => {
    const url = URL.createObjectURL(fichier);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resoudre(img); };
    img.onerror = () => { URL.revokeObjectURL(url); rejeter(new Error('Image illisible.')); };
    img.src = url;
  });
}

export type Fichier = {
  id: string; url: string; usage: Usage; mime: string;
  nom_origine: string; legende: string; emetteur: string;
  taille: number; envoye_par: string; cree_le: string;
};

export async function envoyer(
  fichier: File,
  champs: { usage: Usage; typeCible: string; cibleId: string; legende?: string; emetteur?: string },
) {
  const prepare = await preparer(fichier, champs.usage);
  const formulaire = new FormData();
  formulaire.append('fichier', prepare);
  formulaire.append('usage', champs.usage);
  formulaire.append('typeCible', champs.typeCible);
  formulaire.append('cibleId', champs.cibleId);
  formulaire.append('nom', fichier.name);
  if (champs.legende) formulaire.append('legende', champs.legende);
  if (champs.emetteur) formulaire.append('emetteur', champs.emetteur);

  // Le type de contenu n'est pas posé à la main : le navigateur doit le
  // générer lui-même pour y inclure la frontière du multipart.
  const reponse = await fetch('/api/fichiers', {
    method: 'POST', body: formulaire, credentials: 'same-origin',
  });
  const texte = await reponse.text();
  const donnees = texte ? JSON.parse(texte) : {};
  if (!reponse.ok) return { ok: false as const, erreur: donnees.erreur ?? 'Envoi impossible.' };
  return { ok: true as const, fichier: donnees.fichier as Fichier, poidsOrigine: fichier.size, poidsFinal: prepare.size };
}

export async function lister(typeCible: string, cibleId: string): Promise<Fichier[]> {
  const r = await api.get<{ fichiers: Fichier[] }>(
    `/fichiers?typeCible=${typeCible}&cibleId=${encodeURIComponent(cibleId)}`,
  );
  return r.ok ? r.donnees.fichiers : [];
}

export function formaterPoids(octets: number): string {
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} Ko`;
  return `${(octets / (1024 * 1024)).toFixed(1)} Mo`;
}
