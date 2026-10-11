'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api, type Parcours as DonneesParcours } from '../../lib/api';
import { Valide } from '../../composants/Icones';
import { useSession } from '../../composants/Session';
import { ImageUnique, PiecesJointes } from '../../composants/Fichiers';

/** Libellés lisibles des nomenclatures, côté affichage uniquement. */
const MODES: Record<string, string> = {
  recommandation: 'recommandé par un encadrant',
  reperage_tournoi: 'repéré lors d’un tournoi',
  reperage_informel: 'vu jouer au quartier',
  detection_organisee: 'journée de détection',
  demarche_famille: 'démarche de la famille',
  transfert: 'transfert entre clubs',
  agent: 'par un intermédiaire',
  autre: 'autre',
};

const MOTIFS: Record<string, string> = {
  progression: 'passage à une autre structure',
  blessure: 'blessure',
  abandon: 'abandon',
  scolarite: 'priorité aux études',
  financier: 'raisons financières',
  demenagement: 'déménagement',
  depart_etranger: 'départ à l’étranger',
  exclusion: 'exclusion',
  autre: 'autre',
};

function moisLisible(v: string | null): string {
  if (!v) return '';
  const [a, m] = v.split('-');
  const mois = ['janv.', 'févr.', 'mars', 'avril', 'mai', 'juin',
    'juill.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  return m ? `${mois[Number(m) - 1]} ${a}` : a;
}

/**
 * Le parcours, présenté comme une frise verticale.
 *
 * Une simple liste de cartes montrerait des étapes juxtaposées. Ce qui fait
 * la valeur du modèle, c'est ce qui se passe ENTRE deux étapes : comment le
 * sportif est arrivé là, quelle distance il a franchie, pourquoi il a quitté
 * la précédente. Ces informations sont donc portées par le trait qui relie
 * les étapes, et non reléguées dans un détail.
 */
function Parcours() {
  const parametres = useSearchParams();
  const id = parametres.get('id') ?? '';

  const { compte } = useSession();
  const [donnees, setDonnees] = useState<DonneesParcours | null>(null);
  const [erreur, setErreur] = useState('');
  const [message, setMessage] = useState('');
  const [acces, setAcces] = useState<any>(null);
  const [conteste, setConteste] = useState<string | null>(null);
  const [motif, setMotif] = useState('dates_fausses');
  const [texteContestation, setTexte] = useState('');
  const [profil, setProfil] = useState<any>(null);
  const [grades, setGrades] = useState<any>(null);
  const [poids, setPoids] = useState<any>(null);

  const charger = () => {
    if (!id) return;
    api.get<DonneesParcours>(`/sportifs/${id}/parcours`).then((r) => {
      if (r.ok) setDonnees(r.donnees); else setErreur(r.erreur);
    });
  };

  useEffect(charger, [id]);

  useEffect(() => {
    if (!id) return;
    api.get<any>(`/sportifs/${id}/evaluations`).then((r) => { if (r.ok) setProfil(r.donnees); });
    // Grades et catégories ne concernent que certaines disciplines : on les
    // demande quand même, et on n'affiche que ce qui revient garni.
    api.get<any>(`/sportifs/${id}/grades`).then((r) => { if (r.ok) setGrades(r.donnees); });
    api.get<any>(`/sportifs/${id}/categories-poids`).then((r) => { if (r.ok) setPoids(r.donnees); });
  }, [id]);

  if (!id) return <section className="section enveloppe"><p>Aucun sportif indiqué.</p></section>;
  if (erreur) {
    return (
      <section className="section enveloppe">
        <div className="vide">
          <p>{erreur}</p>
          <Link href="/" className="bouton bouton-second">Retour à l&apos;effectif</Link>
        </div>
      </section>
    );
  }
  if (!donnees) return <p className="chargement">Chargement du parcours…</p>;

  const { sportif, debuts, etapes, resume } = donnees;

  const estLeSien = compte?.role === 'sportif' && compte.id === id;
  const estEncadrant = compte?.role === 'encadrant' || compte?.role === 'admin';

  const MOTIFS_CONTESTATION = [
    ['dates_fausses', 'Les dates sont fausses'],
    ['structure_fausse', 'Ce n’est pas la bonne structure'],
    ['jamais_passe', 'Je ne suis jamais passé là'],
    ['mode_faux', 'Ce n’est pas ainsi que je suis arrivé'],
    ['niveau_faux', 'Le niveau est faux'],
    ['autre', 'Autre'],
  ] as const;

  async function contester(etapeId: string) {
    const r = await api.post(`/etapes/${etapeId}/contester`, { motif, texte: texteContestation });
    setMessage(r.ok ? 'Signalement envoyé. Votre encadrant va l’examiner.' : r.erreur);
    setConteste(null); setTexte('');
    charger();
  }

  async function ouvrirAcces() {
    const r = await api.post<{ acces: any }>(`/sportifs/${id}/acces`, {});
    if (r.ok) setAcces(r.donnees.acces); else setMessage(r.erreur);
  }

  async function attester(etapeId: string) {
    const r = await api.post(`/etapes/${etapeId}/attester`);
    setMessage(r.ok ? 'Étape attestée.' : r.erreur);
    charger();
  }

  return (
    <section className="section enveloppe">
      <p className="discret"><Link href="/">Effectif</Link></p>

      <div className="entete-sportif">
        {/* La photo aide l'encadrant à relier un nom à un visage quand il
            suit trente joueurs. Elle n'est jamais publique : rien sur cette
            plateforme ne l'est. */}
        <ImageUnique
          usage="photo" typeCible="personne" cibleId={id} rond
          libelle="Ajouter une photo"
        />
        <div>
          <h1 style={{ marginBottom: '0.25rem' }}>{sportif.nom}</h1>
        </div>
      </div>

      <p className="discret" style={{ marginTop: '-0.5rem' }}>
        {sportif.discipline}
        {sportif.age !== null && ` · ${sportif.age} ans`}
        {sportif.origine && ` · originaire de ${sportif.origine}`}
        {sportif.statut === 'interrompu' && ' · parcours interrompu'}
      </p>

      {message && <p className="message message-succes">{message}</p>}

      <div className="indicateurs" style={{ marginBottom: '1.5rem' }}>
        <div className="indicateur">
          <div className="indicateur-valeur">{resume.nbEtapes}</div>
          <div className="indicateur-libelle">étapes</div>
        </div>
        <div className="indicateur">
          <div className="indicateur-valeur" style={{ color: 'var(--terrain)' }}>{resume.attestees}</div>
          <div className="indicateur-libelle">attestées</div>
        </div>
        <div className="indicateur">
          <div className="indicateur-valeur">
            {debuts?.delaiEncadrement ?? '—'}
          </div>
          <div className="indicateur-libelle">
            {debuts?.delaiEncadrement != null ? 'ans avant un encadrement' : 'délai inconnu'}
          </div>
        </div>
        <div className="indicateur">
          <div className="indicateur-valeur">{resume.aMigre ? 'Oui' : 'Non'}</div>
          <div className="indicateur-libelle">changement de territoire</div>
        </div>
      </div>

      {estEncadrant && (
        <div className="carte">
          <h3>Accès du sportif</h3>
          {acces ? (
            <>
              <p style={{ marginBottom: '0.5rem' }}>
                Code&nbsp;:{' '}
                <strong className="chiffre" style={{ fontSize: 'var(--t-m)', letterSpacing: '0.12em' }}>
                  {acces.code}
                </strong>
              </p>
              <p className="discret" style={{ margin: 0 }}>{acces.aRemettreA}</p>
              <p className="discret" style={{ margin: '0.5rem 0 0' }}>
                Il permet d&apos;activer un compte sur la page « Activer mon accès ».
                Valable 14 jours, utilisable une seule fois.
              </p>
            </>
          ) : (
            <>
              <p className="discret" style={{ marginBottom: '0.75rem' }}>
                Lui ouvrir un accès pour qu&apos;il consulte son parcours et
                signale les erreurs. Il ne pourra rien modifier.
              </p>
              <button type="button" className="bouton bouton-second" onClick={ouvrirAcces}>
                Ouvrir un accès
              </button>
            </>
          )}
        </div>
      )}

      {debuts && debuts.agePremierContact != null && (
        <div className="carte">
          <h3>Ses débuts</h3>
          <p style={{ margin: 0 }}>
            Premier contact avec le sport à <strong className="chiffre">{debuts.agePremierContact} ans</strong>
            {debuts.contexteInitial && `, dans un contexte de type « ${debuts.contexteInitial.replace('_', ' ')} »`}
            {debuts.agePremiereStructure != null && (
              <>, première structure d&apos;encadrement à <strong className="chiffre">{debuts.agePremiereStructure} ans</strong></>
            )}.
          </p>
          {debuts.delaiEncadrement != null && debuts.delaiEncadrement >= 5 && (
            <p className="discret" style={{ margin: '0.5rem 0 0' }}>
              Soit {debuts.delaiEncadrement} années de pratique sans encadrement structuré.
            </p>
          )}
        </div>
      )}

      {grades && grades.grades.length > 0 && (
        <>
          <h2 style={{ marginTop: '2rem' }}>Grades</h2>
          <div className="carte">
            {grades.actuel && (
              <p style={{ marginTop: 0 }}>
                Grade actuel :{' '}
                <span className="pastille" style={{
                  background: grades.actuel.couleur ?? 'var(--fond)',
                  color: ['#F5F5F5', '#F2C200'].includes(grades.actuel.couleur ?? '')
                    ? 'var(--encre)' : 'var(--papier)',
                  border: '1px solid var(--trait)',
                }}>
                  {grades.actuel.nom}
                </span>
              </p>
            )}

            {grades.grades.map((g: any) => (
              <div key={g.id} style={{
                display: 'flex', justifyContent: 'space-between', gap: '0.75rem',
                padding: '0.5rem 0', borderTop: '1px solid var(--trait)',
              }}>
                <span>
                  {g.nom}
                  <br />
                  <span className="discret">
                    {g.autorite}{g.territoire && ` · ${g.territoire}`}
                    {g.numero_diplome && ` · n° ${g.numero_diplome}`}
                  </span>
                </span>
                <span className="chiffre discret" style={{ whiteSpace: 'nowrap' }}>
                  {g.date_obtention}
                </span>
              </div>
            ))}

            <p className="discret" style={{ margin: '0.75rem 0 0' }}>
              Un grade est délivré à une date précise par une autorité
              identifiée : c&apos;est la trace la plus vérifiable du parcours.
            </p>
          </div>
        </>
      )}

      {poids && poids.actuelle && (
        <div className="carte">
          <h3>Catégorie de poids</h3>
          <p style={{ margin: 0 }}>
            <strong>{poids.actuelle.nom}</strong>
            <span className="discret"> · {poids.actuelle.tranche_age}, depuis {poids.actuelle.debut}</span>
          </p>
          {poids.historique.length > 1 && (
            <p className="discret" style={{ margin: '0.4rem 0 0' }}>
              Précédemment : {poids.historique.filter((h: any) => h.fin).map((h: any) => h.nom).join(', ')}
            </p>
          )}
        </div>
      )}

      {profil && profil.nbEvaluations > 0 && (
        <>
          <h2 style={{ marginTop: '2rem' }}>Profil</h2>
          <div className="carte">
            <p className="discret" style={{ marginTop: 0 }}>
              Dernière évaluation du {profil.derniere.date} en{' '}
              {profil.derniere.contexte}
              {profil.derniere.evaluateur && `, par ${profil.derniere.evaluateur}`}.
              {profil.nbEvaluations > 1 && ` ${profil.nbEvaluations} évaluations au total.`}
            </p>

            <div className="profil">
              {profil.profil.map((f: any) => (
                <div key={f.famille} className="profil-famille">
                  <span className="profil-nom">{f.famille}</span>
                  {/* Cinq segments et non une barre continue : l'échelle ne
                      compte que cinq valeurs, et une barre lisse laisserait
                      croire à une mesure. */}
                  <div className="echelle" role="img"
                       aria-label={`${f.moyenne} sur 5 en ${f.famille}`}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <span key={n} className={
                        n <= Math.round(f.moyenne)
                          ? (f.moyenne >= 4 ? 'pleine pleine-haute' : 'pleine')
                          : ''
                      } />
                    ))}
                  </div>
                  <span className="profil-note">{f.moyenne}</span>
                </div>
              ))}
            </div>

            {profil.derniere.commentaire && (
              <p style={{ margin: '1rem 0 0' }}>« {profil.derniere.commentaire} »</p>
            )}

            <details style={{ marginTop: '1rem' }}>
              <summary style={{ minHeight: 'var(--cible)', cursor: 'pointer' }}>
                Voir le détail par critère
              </summary>
              <div style={{ marginTop: '0.5rem' }}>
                {profil.derniere.notes.map((n: any) => (
                  <div key={n.critere_id} style={{
                    display: 'flex', justifyContent: 'space-between',
                    padding: '0.35rem 0', borderBottom: '1px solid var(--trait)',
                  }}>
                    <span>
                      {n.nom}
                      <span className="discret"> · {n.famille}</span>
                      {n.commentaire && <><br /><span className="discret">{n.commentaire}</span></>}
                    </span>
                    <strong className="chiffre">{n.note}</strong>
                  </div>
                ))}
              </div>
            </details>
          </div>
        </>
      )}

      {estEncadrant && (
        <div style={{ marginBottom: '1.5rem' }}>
          <Link
            href={`/evaluer/?id=${id}&discipline=${encodeURIComponent(sportif.disciplineId)}`}
            className="bouton bouton-second"
          >
            {profil?.nbEvaluations ? 'Nouvelle évaluation' : 'Évaluer ce sportif'}
          </Link>
        </div>
      )}

      <h2 style={{ marginTop: '2rem' }}>Parcours</h2>

      {etapes.length === 0 ? (
        <div className="vide">
          <p>Aucune étape enregistrée.</p>
          <Link href="/saisie/" className="bouton bouton-principal">Enregistrer la première</Link>
        </div>
      ) : (
        <div className="parcours">
          {etapes.map((e, i) => (
            <div key={e.id}>
              {/* Le passage est affiché AVANT l'étape qu'il introduit :
                  c'est l'ordre dans lequel les choses se sont produites. */}
              {i > 0 && (
                <div className="passage">
                  <span>
                    <strong>{MODES[e.arriveePar ?? ''] ?? 'arrivée non précisée'}</strong>
                    {e.agent && ` par ${e.agent}`}
                  </span>
                  {e.distanceEtapePrecedente != null && e.distanceEtapePrecedente > 0 && (
                    <span className="chiffre">{e.distanceEtapePrecedente} km parcourus</span>
                  )}
                  {etapes[i - 1].motifFin && (
                    <span>départ : {MOTIFS[etapes[i - 1].motifFin!] ?? etapes[i - 1].motifFin}</span>
                  )}
                  {e.evolution && <span>{e.evolution}</span>}
                </div>
              )}

              <div className={
                'etape'
                + (e.fiabilite === 'attestee' ? ' etape-attestee' : '')
                + (e.enCours ? ' etape-encours' : '')
              }>
                <div className="etape-bloc">
                  <div className="carte-entete">
                    <div>
                      <p className="etape-titre">{e.structure ?? 'Structure non précisée'}</p>
                      <p className="etape-meta">
                        {e.typeStructure} · {e.territoire}
                      </p>
                    </div>
                    <span className={
                      'pastille ' + (e.fiabilite === 'attestee'
                        ? 'pastille-attestee' : 'pastille-reconstituee')
                    }>
                      {e.fiabilite === 'attestee'
                        ? <><Valide taille={13} /> attestée</>
                        : 'reconstituée'}
                    </span>
                  </div>

                  <p className="etape-meta" style={{ marginTop: '0.4rem' }}>
                    {moisLisible(e.debut)}
                    {e.enCours ? ' — en cours' : e.fin ? ` — ${moisLisible(e.fin)}` : ''}
                    {' · niveau '}{e.niveau.replace('_', ' ')}
                  </p>

                  {e.note && <p className="discret" style={{ margin: '0.4rem 0 0' }}>{e.note}</p>}

                  {/* Attestations, diplômes, photos de l'étape. L'encadrant
                      les ajoute, et le sportif concerné aussi : une
                      attestation de tournoi est souvent entre ses mains
                      plutôt qu'entre celles de son club. */}
                  <PiecesJointes etapeId={e.id} modifiable={estEncadrant || estLeSien} />

                  {estEncadrant && e.fiabilite !== 'attestee' && (
                    <button
                      type="button" className="bouton bouton-discret"
                      style={{ marginTop: '0.75rem', minHeight: 'var(--cible)' }}
                      onClick={() => attester(e.id)}
                    >
                      Attester cette étape
                    </button>
                  )}

                  {/* Le sportif ne corrige pas lui-même : il signale, et
                      l'encadrant tranche. Corriger directement réintroduirait
                      la donnée auto-déclarée. */}
                  {estLeSien && conteste !== e.id && (
                    <button
                      type="button" className="bouton bouton-discret"
                      style={{ marginTop: '0.75rem', minHeight: 'var(--cible)' }}
                      onClick={() => setConteste(e.id)}
                    >
                      Signaler une erreur
                    </button>
                  )}

                  {estLeSien && conteste === e.id && (
                    <div style={{ marginTop: '0.75rem' }}>
                      <h3>Qu&apos;est-ce qui est faux</h3>
                      <div className="choix" style={{ marginBottom: '0.75rem' }}>
                        {MOTIFS_CONTESTATION.map(([v, l]) => (
                          <button key={v} type="button" aria-pressed={motif === v}
                                  onClick={() => setMotif(v)}>{l}</button>
                        ))}
                      </div>
                      <label className="champ">
                        <span>Précision</span>
                        <input value={texteContestation} onChange={(ev) => setTexte(ev.target.value)}
                               placeholder="Je suis arrivé en mars, pas en janvier" />
                      </label>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button type="button" className="bouton bouton-principal"
                                style={{ flex: 1 }} onClick={() => contester(e.id)}>
                          Envoyer le signalement
                        </button>
                        <button type="button" className="bouton bouton-discret"
                                onClick={() => setConteste(null)}>
                          Annuler
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {estEncadrant && (
        <div style={{ marginTop: '1.5rem' }}>
          <Link href="/saisie/" className="bouton bouton-principal">
            Ajouter une étape
          </Link>
        </div>
      )}
    </section>
  );
}

export default function PageSportif() {
  // Les paramètres d'URL ne sont connus qu'au chargement dans le navigateur :
  // une frontière de suspension est requise en rendu statique.
  return (
    <Suspense fallback={<p className="chargement">Chargement…</p>}>
      <Parcours />
    </Suspense>
  );
}
