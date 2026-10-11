'use client';

import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

/**
 * Lecture territoriale.
 *
 * Trois questions auxquelles personne ne sait répondre aujourd'hui : d'où
 * viennent les sportifs suivis, où sont-ils repérés faute de structures, et
 * combien d'années s'écoulent avant qu'ils rencontrent un encadrement.
 */
type Region = { id: string; region: string; effectif: number; pourCentMille: number | null };
type Territoire = { id: string; territoire: string; total: number; partInformelle: number; modes: Record<string, number> };
type Delai = { region: string; effectif: number; medianeAns: number; maxiAns: number };
type Flux = { depart: string; arrivee: string; n: number };

export default function Analyses() {
  const [regions, setRegions] = useState<Region[]>([]);
  const [territoires, setTerritoires] = useState<Territoire[]>([]);
  const [delais, setDelais] = useState<{ global: number | null; parRegion: Delai[] } | null>(null);
  const [flux, setFlux] = useState<Flux[]>([]);
  const [charge, setCharge] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get<{ regions: Region[] }>('/analyses/talents-par-region'),
      api.get<{ territoires: Territoire[] }>('/analyses/detection-par-territoire'),
      api.get<{ global: number | null; parRegion: Delai[] }>('/analyses/delai-encadrement'),
      api.get<{ flux: Flux[] }>('/analyses/flux'),
    ]).then(([a, b, c, d]) => {
      if (a.ok) setRegions(a.donnees.regions);
      if (b.ok) setTerritoires(b.donnees.territoires);
      if (c.ok) setDelais(c.donnees);
      if (d.ok) setFlux(d.donnees.flux);
      setCharge(true);
    });
  }, []);

  if (!charge) return <p className="chargement">Calcul des indicateurs…</p>;

  const maxEffectif = Math.max(1, ...regions.map((r) => r.effectif));

  return (
    <section className="section enveloppe">
      <h1>Lecture territoriale</h1>
      <p className="discret" style={{ marginTop: '-0.5rem' }}>
        Indicateurs calculés sur les parcours enregistrés. Ils décrivent
        l&apos;effectif suivi, non la population sportive dans son ensemble.
      </p>

      <h2 style={{ marginTop: '2rem' }}>D&apos;où viennent les sportifs</h2>
      {regions.length === 0 ? (
        <div className="vide"><p>Aucune origine renseignée.</p></div>
      ) : (
        <div className="carte">
          {regions.map((r) => (
            <div key={r.id} style={{ marginBottom: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{r.region}</span>
                <span className="chiffre discret">
                  {r.effectif}
                  {r.pourCentMille !== null && ` · ${r.pourCentMille} pour 100 000 hab.`}
                </span>
              </div>
              <div className="jauge">
                <div className="jauge-remplie" style={{ width: `${(r.effectif / maxEffectif) * 100}%` }} />
              </div>
            </div>
          ))}
          <p className="discret" style={{ margin: 0 }}>
            Le rapport à la population évite de conclure qu&apos;une région produit
            plus de talents alors qu&apos;elle compte simplement plus d&apos;habitants.
          </p>
        </div>
      )}

      <h2 style={{ marginTop: '2rem' }}>Où les talents sont repérés sans structure</h2>
      <p className="discret" style={{ marginTop: '-0.5rem' }}>
        Part des arrivées par repérage informel ou démarche familiale. Une part
        élevée signale que les talents y sont détectés malgré l&apos;absence de
        structures, et non grâce à elles.
      </p>
      {territoires.length === 0 ? (
        <div className="vide"><p>Aucune transition enregistrée.</p></div>
      ) : (
        <div className="carte">
          {territoires.map((t) => (
            <div key={t.id} style={{ marginBottom: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{t.territoire}</span>
                <span className="chiffre discret">{t.partInformelle} % sur {t.total}</span>
              </div>
              <div className="jauge">
                <div
                  className="jauge-remplie"
                  style={{
                    width: `${t.partInformelle}%`,
                    background: t.partInformelle >= 50 ? 'var(--alerte)' : 'var(--ocre)',
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <h2 style={{ marginTop: '2rem' }}>Années avant un encadrement</h2>
      {!delais || delais.parRegion.length === 0 ? (
        <div className="vide">
          <p>Aucun parcours ne renseigne encore l&apos;âge des débuts.</p>
        </div>
      ) : (
        <div className="carte">
          <p style={{ marginBottom: '1rem' }}>
            Médiane sur l&apos;ensemble des parcours renseignés :{' '}
            <strong className="chiffre">{delais.global} ans</strong>.
          </p>
          <div className="defilant">
            <table className="tableau">
              <thead>
                <tr><th>Région d&apos;origine</th><th>Parcours</th><th>Médiane</th><th>Maximum</th></tr>
              </thead>
              <tbody>
                {delais.parRegion.map((d) => (
                  <tr key={d.region}>
                    <td>{d.region}</td>
                    <td className="chiffre">{d.effectif}</td>
                    <td className="chiffre">{d.medianeAns} ans</td>
                    <td className="chiffre">{d.maxiAns} ans</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="discret" style={{ margin: '0.75rem 0 0' }}>
            La médiane plutôt que la moyenne : sur de petits effectifs, un seul
            parcours atypique déplacerait la moyenne au point de la rendre
            trompeuse.
          </p>
        </div>
      )}

      {flux.length > 0 && (
        <>
          <h2 style={{ marginTop: '2rem' }}>Déplacements</h2>
          <div className="carte">
            {flux.map((f, i) => (
              <p key={i} style={{ margin: '0 0 0.4rem' }}>
                {f.depart} <span className="discret">vers</span> {f.arrivee}
                <span className="chiffre discret"> · {f.n} parcours</span>
              </p>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
