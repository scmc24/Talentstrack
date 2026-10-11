'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, type Referentiels } from '../../lib/api';

/**
 * Création d'un sportif.
 *
 * Le socle est demandé ici, à l'inscription, et non plus tard : c'est le seul
 * moment où quelqu'un prend le temps de retracer les débuts. Tous ses champs
 * restent facultatifs, car il s'agit de données sociales portant souvent sur
 * des mineurs, et le consentement est demandé explicitement.
 */
export default function NouveauSportif() {
  const routeur = useRouter();
  const [ref, setRef] = useState<Referentiels | null>(null);

  const [nom, setNom] = useState('');
  const [naissance, setNaissance] = useState('');
  const [sexe, setSexe] = useState('');
  const [disciplineId, setDiscipline] = useState('');
  const [posteId, setPoste] = useState('');
  const [uniteOrigineId, setOrigine] = useState('');

  const [agePremierContact, setContact] = useState('');
  const [agePremiereStructure, setStructure] = useState('');
  const [contexteInitial, setContexte] = useState('');
  const [consentement, setConsentement] = useState(false);

  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    api.get<Referentiels>('/referentiels').then((r) => { if (r.ok) setRef(r.donnees); });
  }, []);

  const discipline = (ref?.disciplines ?? []).find((d: any) => d.id === disciplineId);
  // Un judoka n'a pas de poste. Le demander quand même produirait un champ
  // vide sur tous les sports de combat, et laisserait croire à un oubli.
  const postes = (discipline as any)?.avec_postes === 0
    ? []
    : (ref?.postes ?? []).filter((p) => p.discipline_id === disciplineId);
  const unites = (ref?.unites ?? []).filter((u) => u.niveau === 'arrondissement' || u.niveau === 'region');

  const CONTEXTES = [
    { id: 'rue_quartier', nom: 'Dans la rue, au quartier' },
    { id: 'ecole', nom: 'À l’école' },
    { id: 'famille', nom: 'Par la famille' },
    { id: 'club', nom: 'Dans un club' },
    { id: 'centre', nom: 'Dans un centre' },
    { id: 'autre', nom: 'Autre' },
  ];

  async function enregistrer() {
    setEnvoi(true); setErreur('');
    const socle: Record<string, unknown> = { consentement };
    if (agePremierContact) socle.agePremierContact = Number(agePremierContact);
    if (agePremiereStructure) socle.agePremiereStructure = Number(agePremiereStructure);
    if (contexteInitial) socle.contexteInitial = contexteInitial;

    const r = await api.post<{ sportif: { id: string } }>('/sportifs', {
      nom, naissance: naissance || undefined, sexe: sexe || undefined,
      disciplineId, posteId: posteId || undefined,
      uniteOrigineId: uniteOrigineId || undefined,
      socle,
    });
    setEnvoi(false);
    if (r.ok) routeur.push(`/sportif/?id=${r.donnees.sportif.id}`);
    else setErreur(r.erreur);
  }

  return (
    <section className="section enveloppe">
      <h1>Nouveau sportif</h1>
      {erreur && <p className="message message-erreur">{erreur}</p>}

      <div className="carte">
        <label className="champ">
          <span>Nom et prénoms</span>
          <input value={nom} onChange={(e) => setNom(e.target.value)} autoComplete="name" />
        </label>

        <label className="champ">
          <span>Date de naissance</span>
          <input type="date" value={naissance} onChange={(e) => setNaissance(e.target.value)} />
          <span className="aide">Seul l&apos;âge sera affiché sur la fiche.</span>
        </label>

        <h3>Sexe</h3>
        <div className="choix" style={{ marginBottom: '1.125rem' }}>
          {[['M', 'Masculin'], ['F', 'Féminin']].map(([v, l]) => (
            <button key={v} type="button" aria-pressed={sexe === v} onClick={() => setSexe(v)}>{l}</button>
          ))}
        </div>

        <h3>Discipline</h3>
        <div className="choix" style={{ marginBottom: '1.125rem' }}>
          {(ref?.disciplines ?? []).map((d) => (
            <button key={d.id} type="button" aria-pressed={disciplineId === d.id}
                    onClick={() => { setDiscipline(d.id); setPoste(''); }}>
              {d.nom}
            </button>
          ))}
        </div>

        {postes.length > 0 && (
          <>
            <h3>Poste</h3>
            <div className="choix" style={{ marginBottom: '1.125rem' }}>
              {postes.map((p) => (
                <button key={p.id} type="button" aria-pressed={posteId === p.id}
                        onClick={() => setPoste(p.id)}>{p.nom}</button>
              ))}
            </div>
          </>
        )}

        <label className="champ">
          <span>Territoire d&apos;origine</span>
          <select value={uniteOrigineId} onChange={(e) => setOrigine(e.target.value)}>
            <option value="">À préciser</option>
            {unites.map((u) => <option key={u.id} value={u.id}>{u.nom}</option>)}
          </select>
          <span className="aide">Là où il a grandi, pas son adresse.</span>
        </label>
      </div>

      <div className="carte">
        <h3>Ses débuts (facultatif)</h3>
        <p className="discret" style={{ marginBottom: '1rem' }}>
          Ces informations servent aux constats d&apos;ensemble, jamais à trier
          des sportifs. Elles n&apos;apparaissent sur aucune fiche consultée par
          un recruteur.
        </p>

        <label className="champ">
          <span>Âge au premier contact avec le sport</span>
          <input type="number" inputMode="numeric" min={3} max={40}
                 value={agePremierContact} onChange={(e) => setContact(e.target.value)} />
        </label>

        <label className="champ">
          <span>Âge à l&apos;entrée dans une première structure</span>
          <input type="number" inputMode="numeric" min={3} max={40}
                 value={agePremiereStructure} onChange={(e) => setStructure(e.target.value)} />
          <span className="aide">L&apos;écart entre les deux mesure le délai d&apos;encadrement.</span>
        </label>

        <h3>Où le sport est entré dans sa vie</h3>
        <div className="choix" style={{ marginBottom: '1.125rem' }}>
          {CONTEXTES.map((c) => (
            <button key={c.id} type="button" aria-pressed={contexteInitial === c.id}
                    onClick={() => setContexte(c.id)}>{c.nom}</button>
          ))}
        </div>

        <button
          type="button"
          className={'bouton bouton-large ' + (consentement ? 'bouton-second' : 'bouton-discret')}
          aria-pressed={consentement}
          onClick={() => setConsentement(!consentement)}
        >
          {consentement
            ? 'Consentement donné pour les analyses d’ensemble'
            : 'Autoriser l’usage de ces données dans les analyses d’ensemble'}
        </button>
      </div>

      <button
        type="button" className="bouton bouton-principal bouton-large"
        disabled={!nom || !disciplineId || envoi}
        onClick={enregistrer}
      >
        {envoi ? 'Enregistrement…' : 'Créer le sportif'}
      </button>
    </section>
  );
}
