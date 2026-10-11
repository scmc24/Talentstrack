'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api, type Referentiels, type Resultat } from '../../lib/api';
import { Valide, Fleche } from '../../composants/Icones';
import { useSession } from '../../composants/Session';

/**
 * Saisie d'une étape.
 *
 * C'est l'écran qui décide du sort du projet. Si enregistrer une étape prend
 * plus d'une minute, un encadrant qui a quinze joueurs à traiter en fin
 * d'entraînement ne le fera pas, et la base restera vide.
 *
 * Trois partis pris en découlent.
 *
 * Aucune liste déroulante pour les choix courts : des boutons en grille, tous
 * visibles d'un coup, chacun formant une cible pleine. Un menu déroulant sur
 * téléphone demande deux gestes et masque les options.
 *
 * Trois écrans courts plutôt qu'un formulaire long : le premier identifie le
 * sportif, le deuxième la structure et la date, le troisième le mode
 * d'arrivée. Chacun tient sans défilement, ce qui évite de perdre le fil.
 *
 * Le mode d'arrivée est demandé ici et non plus tard, car c'est l'information
 * centrale du modèle et la seule que personne ne pourra reconstituer ensuite.
 */

type Structure = { id: string; nom: string; type: string; territoire: string };

export default function Saisie() {
  const [etape, setEtape] = useState(0);
  const [ref, setRef] = useState<Referentiels | null>(null);
  const [sportifs, setSportifs] = useState<Resultat[]>([]);
  const [structures, setStructures] = useState<Structure[]>([]);

  const [sportifId, setSportifId] = useState('');
  const [structureId, setStructureId] = useState('');
  const [debut, setDebut] = useState(() => new Date().toISOString().slice(0, 7));
  const [niveau, setNiveau] = useState('');
  const [mode, setMode] = useState('');
  const [motifFin, setMotifFin] = useState('progression');
  const [note, setNote] = useState('');

  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const [resultat, setResultat] = useState<any>(null);

  const { compte, charge: sessionChargee } = useSession();

  useEffect(() => {
    api.get<Referentiels>('/referentiels').then((r) => { if (r.ok) setRef(r.donnees); });
    api.get<{ resultats: Resultat[] }>('/recherche').then((r) => {
      if (r.ok) setSportifs(r.donnees.resultats);
    });
    // Les structures voisines servent de premier choix : dans l'immense
    // majorité des cas, l'encadrant saisit une étape dans sa propre structure
    // ou dans une structure proche.
    api.get<{ structures: Structure[] }>('/analyses/structures-proches?lat=3.87&lon=11.45&rayon=300')
      .then((r) => { if (r.ok) setStructures(r.donnees.structures); });
  }, []);

  const sportif = useMemo(
    () => sportifs.find((s) => s.id === sportifId), [sportifs, sportifId],
  );

  if (sessionChargee && !compte) {
    return (
      <section className="section enveloppe">
        <h1>Nouvelle étape</h1>
        <p className="message message-info">
          Connectez-vous pour enregistrer une étape.
        </p>
        <Link href="/connexion/" className="bouton bouton-principal">Se connecter</Link>
      </section>
    );
  }

  if (resultat) {
    return (
      <section className="section enveloppe">
        <h1>Étape enregistrée</h1>
        <div className="message message-succes">
          {resultat.etape.fiabilite === 'attestee'
            ? 'Étape attestée : vous encadrez cette structure, votre saisie fait foi.'
            : 'Étape enregistrée comme reconstituée. Un encadrant de la structure concernée pourra l’attester.'}
        </div>
        {resultat.etapePrecedenteClose && (
          <p className="discret">
            L&apos;étape précédente a été clôturée automatiquement à la même date.
          </p>
        )}
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1.25rem' }}>
          <Link href={`/sportif/?id=${sportifId}`} className="bouton bouton-principal">
            Voir le parcours
          </Link>
          <button
            type="button" className="bouton bouton-discret"
            onClick={() => {
              // Retour au premier écran en conservant la structure : un
              // encadrant enchaîne les joueurs d'un même club.
              setResultat(null); setEtape(0); setSportifId('');
              setMode(''); setNote('');
            }}
          >
            Saisir pour un autre joueur
          </button>
        </div>
      </section>
    );
  }

  async function enregistrer() {
    setEnvoi(true); setErreur('');
    const r = await api.post(`/sportifs/${sportifId}/etapes`, {
      structureId, debut, niveau, mode, motifFin, note,
    });
    setEnvoi(false);
    if (r.ok) setResultat(r.donnees); else setErreur(r.erreur);
  }

  return (
    <section className="section enveloppe">
      <h1>Nouvelle étape</h1>

      <div className="etapes-saisie" aria-hidden="true">
        {[0, 1, 2].map((i) => <span key={i} className={i <= etape ? 'faite' : ''} />)}
      </div>

      {erreur && <p className="message message-erreur">{erreur}</p>}

      {etape === 0 && (
        <>
          <h3>Pour quel sportif</h3>
          {sportifs.length === 0 ? (
            <div className="vide">
              <p>Aucun sportif enregistré.</p>
              <Link href="/nouveau-sportif/" className="bouton bouton-principal">
                Créer un sportif
              </Link>
            </div>
          ) : (
            <>
              <div className="choix" style={{ marginBottom: '1.25rem' }}>
                {sportifs.map((s) => (
                  <button
                    key={s.id} type="button" aria-pressed={sportifId === s.id}
                    onClick={() => { setSportifId(s.id); setEtape(1); }}
                  >
                    {s.nom}
                    <br />
                    <span className="discret">
                      {s.discipline}{s.structureActuelle ? ` · ${s.structureActuelle}` : ''}
                    </span>
                  </button>
                ))}
              </div>
              <Link href="/nouveau-sportif/" className="bouton bouton-discret bouton-large">
                Le sportif n&apos;est pas dans la liste
              </Link>
            </>
          )}
        </>
      )}

      {etape === 1 && (
        <>
          <p className="discret">Étape pour <strong>{sportif?.nom}</strong></p>

          <h3>Dans quelle structure</h3>
          <div className="choix" style={{ marginBottom: '1.25rem' }}>
            {structures.map((s) => (
              <button
                key={s.id} type="button" aria-pressed={structureId === s.id}
                onClick={() => setStructureId(s.id)}
              >
                {s.nom}
                <br />
                <span className="discret">{s.type} · {s.territoire}</span>
              </button>
            ))}
          </div>

          <label className="champ">
            <span>À partir de quand</span>
            {/* Le mois suffit. Quelqu'un qui reconstitue un parcours ancien se
                souvient de la saison, rarement du jour ; exiger une date
                complète le pousserait à inventer un 1er janvier. */}
            <input type="month" value={debut} onChange={(e) => setDebut(e.target.value)} />
            <span className="aide">Le mois suffit.</span>
          </label>

          <h3>À quel niveau</h3>
          <div className="choix" style={{ marginBottom: '1.5rem' }}>
            {(ref?.niveaux ?? []).map((n) => (
              <button key={n.id} type="button" aria-pressed={niveau === n.id}
                      onClick={() => setNiveau(n.id)}>
                {n.nom}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button type="button" className="bouton bouton-discret" onClick={() => setEtape(0)}>
              Retour
            </button>
            <button
              type="button" className="bouton bouton-principal"
              style={{ flex: 1 }}
              disabled={!structureId || !niveau || !debut}
              onClick={() => setEtape(2)}
            >
              Continuer <Fleche taille={18} />
            </button>
          </div>
        </>
      )}

      {etape === 2 && (
        <>
          <h3>Comment est-il arrivé là</h3>
          <p className="discret" style={{ marginTop: '-0.35rem' }}>
            C&apos;est la seule information que personne ne pourra retrouver plus tard.
          </p>
          <div className="choix" style={{ marginBottom: '1.5rem' }}>
            {(ref?.modesTransition ?? []).map((m) => (
              <button key={m.id} type="button" aria-pressed={mode === m.id}
                      onClick={() => setMode(m.id)}>
                {m.nom}
              </button>
            ))}
          </div>

          {sportif && sportif.nbEtapes > 0 && (
            <>
              <h3>Pourquoi il quitte l&apos;étape précédente</h3>
              <div className="choix" style={{ marginBottom: '1.5rem' }}>
                {(ref?.motifsFin ?? []).map((m) => (
                  <button key={m.id} type="button" aria-pressed={motifFin === m.id}
                          onClick={() => setMotifFin(m.id)}>
                    {m.nom}
                  </button>
                ))}
              </div>
            </>
          )}

          <label className="champ">
            <span>Précision (facultatif)</span>
            <input value={note} onChange={(e) => setNote(e.target.value)}
                   placeholder="Repéré par le coach du lycée" />
          </label>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button type="button" className="bouton bouton-discret" onClick={() => setEtape(1)}>
              Retour
            </button>
            <button
              type="button" className="bouton bouton-principal" style={{ flex: 1 }}
              disabled={!mode || envoi} onClick={enregistrer}
            >
              {envoi ? 'Enregistrement…' : <>Enregistrer <Valide taille={18} /></>}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
