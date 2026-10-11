'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, type Referentiels, type Resultat } from '../../lib/api';
import { Recherche as IconeRecherche, Valide } from '../../composants/Icones';

export default function PageRecherche() {
  const [ref, setRef] = useState<Referentiels | null>(null);
  const [resultats, setResultats] = useState<Resultat[]>([]);
  const [charge, setCharge] = useState(false);

  const [discipline, setDiscipline] = useState('');
  const [region, setRegion] = useState('');
  const [ageMax, setAgeMax] = useState('');
  const [attestes, setAttestes] = useState(false);

  useEffect(() => {
    api.get<Referentiels>('/referentiels').then((r) => { if (r.ok) setRef(r.donnees); });
  }, []);

  const chercher = useCallback(() => {
    const q = new URLSearchParams();
    if (discipline) q.set('discipline', discipline);
    if (region) q.set('region', region);
    if (ageMax) q.set('age_max', ageMax);
    if (attestes) q.set('attestes', '1');
    api.get<{ resultats: Resultat[] }>('/recherche?' + q.toString()).then((r) => {
      if (r.ok) setResultats(r.donnees.resultats);
      setCharge(true);
    });
  }, [discipline, region, ageMax, attestes]);

  useEffect(() => {
    const minuteur = setTimeout(chercher, 200);
    return () => clearTimeout(minuteur);
  }, [chercher]);

  const regions = (ref?.unites ?? []).filter((u) => u.niveau === 'region');

  return (
    <section className="section enveloppe">
      <h1>Rechercher un parcours</h1>

      <div className="carte">
        <label className="champ">
          <span>Discipline</span>
          <select value={discipline} onChange={(e) => setDiscipline(e.target.value)}>
            <option value="">Toutes</option>
            {(ref?.disciplines ?? []).map((d) => <option key={d.id} value={d.id}>{d.nom}</option>)}
          </select>
        </label>

        <label className="champ">
          <span>Région d&apos;origine</span>
          <select value={region} onChange={(e) => setRegion(e.target.value)}>
            <option value="">Toutes</option>
            {regions.map((u) => <option key={u.id} value={u.id}>{u.nom}</option>)}
          </select>
        </label>

        <label className="champ">
          <span>Âge maximum</span>
          <input type="number" inputMode="numeric" value={ageMax} min={10} max={40}
                 onChange={(e) => setAgeMax(e.target.value)} placeholder="18" />
        </label>

        {/* Ce filtre est exposé délibérément : un recruteur doit pouvoir ne
            consulter que des parcours attestés, et savoir que les autres
            relèvent de la déclaration. */}
        <button
          type="button"
          className={'bouton bouton-large ' + (attestes ? 'bouton-principal' : 'bouton-discret')}
          aria-pressed={attestes}
          onClick={() => setAttestes(!attestes)}
        >
          <Valide taille={18} />
          {attestes ? 'Parcours attestés uniquement' : 'Inclure les parcours déclarés'}
        </button>
      </div>

      {!charge && <p className="chargement">Recherche…</p>}

      {charge && (
        <p className="discret">
          {resultats.length} parcours{resultats.length > 1 ? '' : ''} trouvé{resultats.length > 1 ? 's' : ''}
        </p>
      )}

      {charge && resultats.length === 0 && (
        <div className="vide">
          <IconeRecherche taille={28} />
          <p style={{ marginTop: '0.75rem' }}>Aucun parcours ne correspond à ces critères.</p>
        </div>
      )}

      {resultats.map((s) => (
        <Link key={s.id} href={`/sportif/?id=${s.id}`} className="carte carte-lien">
          <div className="carte-entete">
            <div>
              <p className="carte-nom">{s.nom}</p>
              <p className="discret" style={{ margin: 0 }}>
                {s.discipline}{s.poste && ` · ${s.poste}`}{s.origine && ` · ${s.origine}`}
              </p>
            </div>
            {s.nbAttestees > 0 && (
              <span className="pastille pastille-attestee">
                <Valide taille={13} /> {s.nbAttestees}
              </span>
            )}
          </div>
          <p className="discret" style={{ margin: '0.5rem 0 0' }}>
            {s.nbEtapes} étape{s.nbEtapes > 1 ? 's' : ''}
            {s.structureActuelle && ` · ${s.structureActuelle}`}
          </p>
        </Link>
      ))}
    </section>
  );
}
