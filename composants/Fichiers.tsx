'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { envoyer, lister, formaterPoids, type Fichier, type Usage } from '../lib/fichiers';

/**
 * Envoi d'une image unique : logo d'une structure, photo d'une personne.
 *
 * L'aperçu remplace le bouton dès qu'une image existe : afficher les deux
 * laisserait croire qu'un second envoi s'ajoute au premier, alors qu'il le
 * remplace.
 */
export function ImageUnique({
  usage, typeCible, cibleId, initiale, rond = false, libelle,
}: {
  usage: Extract<Usage, 'logo' | 'photo'>;
  typeCible: string; cibleId: string;
  initiale?: string | null;
  rond?: boolean;
  libelle: string;
}) {
  const [url, setUrl] = useState<string | null>(initiale ?? null);
  const [etat, setEtat] = useState('');
  const [erreur, setErreur] = useState('');

  useEffect(() => {
    if (initiale !== undefined) return;
    lister(typeCible, cibleId).then((f) => {
      const trouve = f.find((x) => x.usage === usage);
      if (trouve) setUrl(trouve.url);
    });
  }, [typeCible, cibleId, usage, initiale]);

  async function traiter(fichiers: FileList | null) {
    const fichier = fichiers?.[0];
    if (!fichier) return;
    setErreur(''); setEtat('Préparation…');

    const r = await envoyer(fichier, { usage, typeCible, cibleId });
    if (!r.ok) { setErreur(r.erreur); setEtat(''); return; }

    setUrl(r.fichier.url + '?t=' + Date.now());
    setEtat(`${formaterPoids(r.poidsOrigine)} réduits à ${formaterPoids(r.poidsFinal)}`);
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        {url ? (
          <img
            src={url} alt=""
            className={rond ? 'photo-profil' : 'logo-structure'}
          />
        ) : (
          <div className={rond ? 'photo-profil-vide' : 'piece-type'}>
            {rond ? '?' : 'aucun'}
          </div>
        )}

        <label className="bouton bouton-discret bouton-fichier">
          {url ? 'Remplacer' : libelle}
          <input
            type="file"
            accept={usage === 'logo' ? 'image/png,image/jpeg,image/webp,image/svg+xml' : 'image/*'}
            onChange={(e) => { traiter(e.target.files); e.target.value = ''; }}
          />
        </label>
      </div>

      {etat && <p className="discret" style={{ margin: '0.4rem 0 0' }}>{etat}</p>}
      {erreur && <p className="message message-erreur" style={{ marginTop: '0.5rem' }}>{erreur}</p>}
    </div>
  );
}

/**
 * Pièces jointes à une étape : attestations, diplômes, photos, vidéos.
 *
 * Présentées en liste et non en galerie : une attestation se consulte, elle
 * ne se regarde pas comme une photographie. L'émetteur figure à côté du nom,
 * car c'est lui qui fait d'un document une pièce justificative.
 */
export function PiecesJointes({
  etapeId, modifiable,
}: {
  etapeId: string;
  modifiable: boolean;
}) {
  const [pieces, setPieces] = useState<Fichier[]>([]);
  const [legende, setLegende] = useState('');
  const [emetteur, setEmetteur] = useState('');
  const [etat, setEtat] = useState('');
  const [erreur, setErreur] = useState('');
  const [ouvert, setOuvert] = useState(false);

  const recharger = useCallback(() => {
    lister('etape', etapeId).then(setPieces);
  }, [etapeId]);

  useEffect(recharger, [recharger]);

  async function traiter(fichiers: FileList | null) {
    const fichier = fichiers?.[0];
    if (!fichier) return;
    setErreur(''); setEtat('Envoi…');

    const usage: Usage = fichier.type.startsWith('video/') ? 'video' : 'piece';
    const r = await envoyer(fichier, {
      usage, typeCible: 'etape', cibleId: etapeId, legende, emetteur,
    });
    setEtat('');
    if (!r.ok) { setErreur(r.erreur); return; }

    setLegende(''); setEmetteur(''); setOuvert(false);
    recharger();
  }

  return (
    <div style={{ marginTop: '0.75rem' }}>
      {pieces.length > 0 && (
        <div className="pieces" style={{ marginBottom: '0.5rem' }}>
          {pieces.map((f) => (
            <a key={f.id} href={f.url} target="_blank" rel="noopener noreferrer" className="piece">
              {f.mime.startsWith('image/')
                ? <img src={f.url} alt="" className="piece-vignette" loading="lazy" />
                : <span className="piece-type">{f.mime.startsWith('video/') ? 'VIDÉO' : 'PDF'}</span>}
              <span style={{ flex: 1, minWidth: 0 }}>
                <p className="piece-nom">{f.legende || f.nom_origine}</p>
                <p className="piece-detail">
                  {f.emetteur && `${f.emetteur} · `}
                  {formaterPoids(f.taille)} · ajouté par {f.envoye_par}
                </p>
              </span>
              {modifiable && (
                <button
                  type="button" className="lien-danger" style={{ minHeight: 'auto' }}
                  onClick={async (e) => {
                    e.preventDefault();
                    await api.supprimer(`/fichiers/${f.id}`);
                    recharger();
                  }}
                >
                  Retirer
                </button>
              )}
            </a>
          ))}
        </div>
      )}

      {modifiable && !ouvert && (
        <button type="button" className="bouton bouton-discret" style={{ minHeight: 'var(--cible)' }}
                onClick={() => setOuvert(true)}>
          Joindre une pièce
        </button>
      )}

      {modifiable && ouvert && (
        <div className="carte" style={{ marginBottom: 0 }}>
          <label className="champ">
            <span>De quoi s&apos;agit-il</span>
            <input value={legende} onChange={(e) => setLegende(e.target.value)}
                   placeholder="Attestation de participation au tournoi" />
          </label>
          <label className="champ">
            <span>Qui l&apos;a délivrée</span>
            <input value={emetteur} onChange={(e) => setEmetteur(e.target.value)}
                   placeholder="Ligue régionale" />
            <span className="aide">
              C&apos;est l&apos;émetteur qui fait d&apos;un document une pièce
              justificative plutôt qu&apos;une image parmi d&apos;autres.
            </span>
          </label>

          {erreur && <p className="message message-erreur">{erreur}</p>}
          {etat && <p className="discret">{etat}</p>}

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <label className="bouton bouton-principal bouton-fichier" style={{ flex: 1 }}>
              Choisir le fichier
              <input type="file" accept="image/*,application/pdf,video/mp4,video/webm"
                     onChange={(e) => { traiter(e.target.files); e.target.value = ''; }} />
            </label>
            <button type="button" className="bouton bouton-discret" onClick={() => setOuvert(false)}>
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
