'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '../../lib/api';
import { useSession } from '../../composants/Session';

type Critere = { id: string; nom: string; description: string; famille: string };
type Famille = { famille: string; criteres: Critere[] };
type Echelle = { note: number; libelle: string };

/**
 * Évaluation d'un sportif.
 *
 * Les critères défilent famille par famille, une page à la fois. Présenter
 * vingt-cinq critères d'un bloc conduirait l'entraîneur à noter vite et mal
 * la seconde moitié, et c'est précisément la régularité du jugement qui donne
 * sa valeur à la grille.
 *
 * Aucune note n'est présélectionnée : une valeur par défaut serait reprise
 * telle quelle sur les critères où l'avis est incertain, ce qui ferait passer
 * une absence d'opinion pour un jugement.
 */
function Evaluer() {
  const parametres = useSearchParams();
  const routeur = useRouter();
  const id = parametres.get('id') ?? '';
  const discipline = parametres.get('discipline') ?? '';
  const { compte } = useSession();

  const [familles, setFamilles] = useState<Famille[]>([]);
  const [echelle, setEchelle] = useState<Echelle[]>([]);
  const [index, setIndex] = useState(0);
  const [notes, setNotes] = useState<Record<string, number>>({});
  const [contexte, setContexte] = useState('entrainement');
  const [commentaire, setCommentaire] = useState('');
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    api.get<{ familles: Famille[]; echelle: Echelle[] }>(`/criteres?discipline=${discipline}`)
      .then((r) => { if (r.ok) { setFamilles(r.donnees.familles); setEchelle(r.donnees.echelle); } });
  }, [discipline]);

  if (compte && compte.role === 'sportif') {
    return (
      <section className="section enveloppe">
        <p className="message message-info">
          L&apos;évaluation est réservée aux encadrants.
        </p>
      </section>
    );
  }

  if (familles.length === 0) return <p className="chargement">Chargement de la grille…</p>;

  const derniere = index >= familles.length;
  const famille = familles[index];
  const notees = Object.keys(notes).length;

  async function enregistrer() {
    setEnvoi(true); setErreur('');
    const r = await api.post(`/sportifs/${id}/evaluations`, {
      contexte, commentaire,
      notes: Object.entries(notes).map(([critereId, note]) => ({ critereId, note })),
    });
    setEnvoi(false);
    if (r.ok) routeur.push(`/sportif/?id=${id}`); else setErreur(r.erreur);
  }

  return (
    <section className="section enveloppe">
      <h1>Évaluation</h1>

      <div className="etapes-saisie" aria-hidden="true">
        {familles.map((f, i) => <span key={f.famille} className={i <= index ? 'faite' : ''} />)}
        <span className={derniere ? 'faite' : ''} />
      </div>

      {erreur && <p className="message message-erreur">{erreur}</p>}

      {!derniere ? (
        <>
          <h2 style={{ textTransform: 'capitalize' }}>{famille.famille}</h2>
          <p className="discret" style={{ marginTop: '-0.5rem' }}>
            Laissez vide un critère sur lequel vous n&apos;avez pas d&apos;avis.
            Une note posée au hasard fausse le profil davantage qu&apos;une
            absence de note.
          </p>

          <div className="carte">
            {famille.criteres.map((cr) => (
              <div key={cr.id} className="critere-ligne">
                <p className="critere-nom">{cr.nom}</p>
                {cr.description && <p className="critere-aide">{cr.description}</p>}
                <div className="note-boutons">
                  {echelle.map((e) => (
                    <button
                      key={e.note} type="button"
                      aria-pressed={notes[cr.id] === e.note}
                      title={e.libelle}
                      onClick={() => setNotes((n) => {
                        const copie = { ...n };
                        // Recliquer sur la note posée l'efface : c'est le seul
                        // moyen de revenir sur un jugement sans recharger.
                        if (copie[cr.id] === e.note) delete copie[cr.id];
                        else copie[cr.id] = e.note;
                        return copie;
                      })}
                    >
                      {e.note}
                    </button>
                  ))}
                </div>
                {notes[cr.id] && (
                  <p className="critere-aide" style={{ margin: '0.35rem 0 0' }}>
                    {echelle.find((e) => e.note === notes[cr.id])?.libelle}
                  </p>
                )}
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            {index > 0 && (
              <button type="button" className="bouton bouton-discret" onClick={() => setIndex(index - 1)}>
                Retour
              </button>
            )}
            <button type="button" className="bouton bouton-principal" style={{ flex: 1 }}
                    onClick={() => setIndex(index + 1)}>
              {index === familles.length - 1 ? 'Terminer' : 'Famille suivante'}
            </button>
          </div>
        </>
      ) : (
        <>
          <h2>Contexte</h2>
          <div className="choix" style={{ marginBottom: '1.25rem' }}>
            {[['entrainement', 'Entraînement'], ['match', 'Match'],
              ['detection', 'Détection'], ['test', 'Test physique']].map(([v, l]) => (
              <button key={v} type="button" aria-pressed={contexte === v}
                      onClick={() => setContexte(v)}>{l}</button>
            ))}
          </div>

          <label className="champ">
            <span>Commentaire général</span>
            <textarea value={commentaire} onChange={(e) => setCommentaire(e.target.value)}
                      placeholder="Ce qui a motivé ces notes" />
          </label>

          <p className="discret">{notees} critère{notees > 1 ? 's' : ''} noté{notees > 1 ? 's' : ''}.</p>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button type="button" className="bouton bouton-discret" onClick={() => setIndex(index - 1)}>
              Retour
            </button>
            <button type="button" className="bouton bouton-principal" style={{ flex: 1 }}
                    disabled={notees === 0 || envoi} onClick={enregistrer}>
              {envoi ? 'Enregistrement…' : 'Enregistrer l’évaluation'}
            </button>
          </div>
        </>
      )}

      <p className="discret" style={{ marginTop: '1.5rem' }}>
        <Link href={`/sportif/?id=${id}`}>Revenir au parcours</Link>
      </p>
    </section>
  );
}

export default function PageEvaluer() {
  return (
    <Suspense fallback={<p className="chargement">Chargement…</p>}>
      <Evaluer />
    </Suspense>
  );
}
