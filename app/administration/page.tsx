'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, type Referentiels, type EtatPlateforme } from '../../lib/api';
import { useSession } from '../../composants/Session';
import { ImageUnique } from '../../composants/Fichiers';

/**
 * Administration des référentiels.
 *
 * Ces écrans ne servent pas tous les jours, mais ils conditionnent tout le
 * reste : sans territoires ni structures, la saisie d'une étape est
 * impossible, et sans découpage complet les analyses restent grossières.
 *
 * Le tableau de bord commence donc par ce qui manque, et non par ce qui
 * existe : un écran de compteurs laisse chercher, une liste de manques dit
 * quoi faire.
 */

type Unite = {
  id: string; code: string; nom: string; niveau: string; parent: string | null;
  lat: number | null; lon: number | null; population: number | null;
  nb_structures: number; nb_sportifs: number; actif: number;
};
type Structure = {
  id: string; nom: string; type: string; territoire: string; unite_id: string;
  lat: number | null; lon: number | null; verifiee: number;
  nb_etapes: number; nb_encadrants: number;
};
type CompteListe = {
  id: string; nom: string; email: string; role: string;
  actif: number; structure: string | null;
};

export default function Administration() {
  const { compte, charge } = useSession();
  const [onglet, setOnglet] = useState<'etat' | 'territoires' | 'structures' | 'comptes'>('etat');

  if (!charge) return <p className="chargement">Chargement…</p>;

  if (!compte || compte.role !== 'admin') {
    return (
      <section className="section enveloppe">
        <h1>Administration</h1>
        <p className="message message-info">
          Cet espace est réservé aux administrateurs.{' '}
          {!compte && <Link href="/connexion/">Se connecter</Link>}
        </p>
      </section>
    );
  }

  return (
    <section className="section enveloppe">
      <h1>Administration</h1>

      <div className="filtres" style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', marginBottom: '1.25rem' }}>
        {([
          ['etat', 'État'], ['territoires', 'Territoires'],
          ['structures', 'Structures'], ['comptes', 'Comptes'],
        ] as const).map(([cle, libelle]) => (
          <button
            key={cle} type="button"
            className={'bouton ' + (onglet === cle ? 'bouton-principal' : 'bouton-discret')}
            onClick={() => setOnglet(cle)}
          >
            {libelle}
          </button>
        ))}
      </div>

      {onglet === 'etat' && <Etat />}
      {onglet === 'territoires' && <Territoires />}
      {onglet === 'structures' && <Structures />}
      {onglet === 'comptes' && <Comptes />}
    </section>
  );
}

function Etat() {
  const [donnees, setDonnees] = useState<EtatPlateforme | null>(null);

  useEffect(() => {
    api.get<EtatPlateforme>('/administration/etat').then((r) => { if (r.ok) setDonnees(r.donnees); });
  }, []);

  if (!donnees) return <p className="chargement">Chargement…</p>;

  const e = donnees.etat;
  const compteurs: [string, number][] = [
    ['régions', e.regions], ['arrondissements', e.arrondissements],
    ['structures', e.structures], ['disciplines', e.disciplines],
    ['comptes', e.comptes], ['sportifs', e.sportifs],
    ['étapes enregistrées', e.etapes],
    ['encadrants sans structure', e.encadrants_sans_structure],
  ];

  return (
    <>
      {donnees.alertes.length > 0 && (
        <div className="carte">
          <h3>À traiter</h3>
          {donnees.alertes.map((a, i) => (
            <p key={i} className="message message-info" style={{ marginBottom: '0.5rem' }}>{a}</p>
          ))}
        </div>
      )}

      <div className="indicateurs">
        {compteurs.map(([libelle, valeur]) => (
          <div key={libelle} className="indicateur">
            <div className="indicateur-valeur">{valeur ?? 0}</div>
            <div className="indicateur-libelle">{libelle}</div>
          </div>
        ))}
      </div>
    </>
  );
}

function Territoires() {
  const [unites, setUnites] = useState<Unite[]>([]);
  const [ref, setRef] = useState<Referentiels | null>(null);
  const [message, setMessage] = useState('');
  const [erreur, setErreur] = useState('');
  const [ouvert, setOuvert] = useState(false);

  const [nom, setNom] = useState('');
  const [code, setCode] = useState('');
  const [niveau, setNiveau] = useState('arrondissement');
  const [parentId, setParent] = useState('');
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [population, setPopulation] = useState('');

  const recharger = useCallback(() => {
    api.get<{ unites: Unite[] }>('/administration/unites').then((r) => {
      if (r.ok) setUnites(r.donnees.unites);
    });
    api.get<Referentiels>('/referentiels').then((r) => { if (r.ok) setRef(r.donnees); });
  }, []);

  useEffect(recharger, [recharger]);

  const parents = unites.filter((u) =>
    niveau === 'region' ? u.niveau === 'pays'
      : niveau === 'departement' ? u.niveau === 'region'
      : u.niveau === 'region' || u.niveau === 'departement');

  return (
    <>
      {message && <p className="message message-succes">{message}</p>}
      {erreur && <p className="message message-erreur">{erreur}</p>}

      <p className="discret">
        Le découpage administratif est le socle de toutes les analyses. Une
        unité mal saisie fausse durablement les indicateurs, car les étapes
        s&apos;y rattachent au moment de leur enregistrement.
      </p>

      {!ouvert ? (
        <button type="button" className="bouton bouton-principal bouton-large"
                onClick={() => setOuvert(true)} style={{ marginBottom: '1.25rem' }}>
          Ajouter un territoire
        </button>
      ) : (
        <div className="carte">
          <h3>Nouveau territoire</h3>

          <div className="choix" style={{ marginBottom: '1.125rem' }}>
            {[['region', 'Région'], ['departement', 'Département'], ['arrondissement', 'Arrondissement']].map(([v, l]) => (
              <button key={v} type="button" aria-pressed={niveau === v}
                      onClick={() => { setNiveau(v); setParent(''); }}>{l}</button>
            ))}
          </div>

          <label className="champ">
            <span>Nom</span>
            <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Yaoundé IIIe" />
          </label>

          <label className="champ">
            <span>Code officiel</span>
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
                   placeholder="CM-CE-YDE3" />
            <span className="aide">Doit être unique. Reprenez la codification officielle.</span>
          </label>

          {niveau !== 'region' && (
            <label className="champ">
              <span>Rattaché à</span>
              <select value={parentId} onChange={(e) => setParent(e.target.value)}>
                <option value="">Choisir…</option>
                {parents.map((u) => <option key={u.id} value={u.id}>{u.nom}</option>)}
              </select>
            </label>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <label className="champ">
              <span>Latitude</span>
              <input type="number" step="0.0001" value={lat} onChange={(e) => setLat(e.target.value)}
                     placeholder="3.87" />
            </label>
            <label className="champ">
              <span>Longitude</span>
              <input type="number" step="0.0001" value={lon} onChange={(e) => setLon(e.target.value)}
                     placeholder="11.52" />
            </label>
          </div>

          <label className="champ">
            <span>Population</span>
            <input type="number" value={population} onChange={(e) => setPopulation(e.target.value)} />
            <span className="aide">
              Permet de rapporter les effectifs à la population, et d&apos;éviter
              de conclure qu&apos;un territoire produit plus de talents alors
              qu&apos;il compte simplement plus d&apos;habitants.
            </span>
          </label>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              type="button" className="bouton bouton-principal" style={{ flex: 1 }}
              onClick={async () => {
                setErreur(''); setMessage('');
                const r = await api.post('/administration/unites', {
                  nom, code, niveau, parentId: parentId || undefined,
                  lat: lat || undefined, lon: lon || undefined,
                  population: population || undefined,
                });
                if (r.ok) {
                  setMessage('Territoire ajouté.');
                  setNom(''); setCode(''); setLat(''); setLon(''); setPopulation('');
                  setOuvert(false); recharger();
                } else setErreur(r.erreur);
              }}
            >
              Ajouter
            </button>
            <button type="button" className="bouton bouton-discret" onClick={() => setOuvert(false)}>
              Annuler
            </button>
          </div>
        </div>
      )}

      <div className="carte defilant">
        <table className="tableau">
          <thead>
            <tr><th>Territoire</th><th>Niveau</th><th>Position</th><th>Structures</th><th>Sportifs</th></tr>
          </thead>
          <tbody>
            {unites.filter((u) => u.niveau !== 'pays').map((u) => (
              <tr key={u.id}>
                <td>
                  {u.nom}
                  {u.parent && <><br /><span className="discret">{u.parent}</span></>}
                </td>
                <td className="discret">{u.niveau}</td>
                <td className="chiffre discret">
                  {u.lat != null ? `${u.lat.toFixed(2)}, ${u.lon?.toFixed(2)}` : 'absente'}
                </td>
                <td className="chiffre">{u.nb_structures}</td>
                <td className="chiffre">{u.nb_sportifs}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Structures() {
  const [structures, setStructures] = useState<Structure[]>([]);
  const [unites, setUnites] = useState<Unite[]>([]);
  const [ref, setRef] = useState<Referentiels | null>(null);
  const [message, setMessage] = useState('');
  const [erreur, setErreur] = useState('');
  const [ouvert, setOuvert] = useState(false);

  const [nom, setNom] = useState('');
  const [typeId, setType] = useState('');
  const [uniteId, setUnite] = useState('');
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [contact, setContact] = useState('');

  const recharger = useCallback(() => {
    api.get<{ structures: Structure[] }>('/administration/structures').then((r) => {
      if (r.ok) setStructures(r.donnees.structures);
    });
    api.get<{ unites: Unite[] }>('/administration/unites').then((r) => {
      if (r.ok) setUnites(r.donnees.unites.filter((u) => u.niveau !== 'pays'));
    });
    api.get<Referentiels>('/referentiels').then((r) => { if (r.ok) setRef(r.donnees); });
  }, []);

  useEffect(recharger, [recharger]);

  return (
    <>
      {message && <p className="message message-succes">{message}</p>}
      {erreur && <p className="message message-erreur">{erreur}</p>}

      {!ouvert ? (
        <button type="button" className="bouton bouton-principal bouton-large"
                onClick={() => setOuvert(true)} style={{ marginBottom: '1.25rem' }}>
          Ajouter une structure
        </button>
      ) : (
        <div className="carte">
          <h3>Nouvelle structure</h3>

          <label className="champ">
            <span>Nom</span>
            <input value={nom} onChange={(e) => setNom(e.target.value)}
                   placeholder="Académie Wildcats" />
          </label>

          <h3>Type</h3>
          <div className="choix" style={{ marginBottom: '1.125rem' }}>
            {(ref?.typesStructure ?? []).map((t) => (
              <button key={t.id} type="button" aria-pressed={typeId === t.id}
                      onClick={() => setType(t.id)}>{t.nom}</button>
            ))}
          </div>

          <label className="champ">
            <span>Territoire</span>
            <select value={uniteId} onChange={(e) => setUnite(e.target.value)}>
              <option value="">Choisir…</option>
              {unites.map((u) => <option key={u.id} value={u.id}>{u.nom}</option>)}
            </select>
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <label className="champ">
              <span>Latitude</span>
              <input type="number" step="0.0001" value={lat} onChange={(e) => setLat(e.target.value)} />
            </label>
            <label className="champ">
              <span>Longitude</span>
              <input type="number" step="0.0001" value={lon} onChange={(e) => setLon(e.target.value)} />
            </label>
          </div>
          <p className="discret" style={{ marginTop: '-0.5rem' }}>
            Sans position, la structure n&apos;apparaîtra sur aucune carte et ne
            sortira pas des recherches par proximité.
          </p>

          <label className="champ">
            <span>Contact</span>
            <input value={contact} onChange={(e) => setContact(e.target.value)} />
          </label>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              type="button" className="bouton bouton-principal" style={{ flex: 1 }}
              onClick={async () => {
                setErreur(''); setMessage('');
                const r = await api.post<{ avertissement: string | null }>('/administration/structures', {
                  nom, typeId, uniteId, lat: lat || undefined, lon: lon || undefined, contact,
                });
                if (r.ok) {
                  setMessage(r.donnees.avertissement ?? 'Structure ajoutée.');
                  setNom(''); setLat(''); setLon(''); setContact('');
                  setOuvert(false); recharger();
                } else setErreur(r.erreur);
              }}
            >
              Ajouter
            </button>
            <button type="button" className="bouton bouton-discret" onClick={() => setOuvert(false)}>
              Annuler
            </button>
          </div>
        </div>
      )}

      {structures.map((s) => (
        <div key={s.id} className="carte">
          <div className="carte-entete">
            <div>
              <p className="carte-nom">{s.nom}</p>
              <p className="discret" style={{ margin: 0 }}>{s.type} · {s.territoire}</p>
            </div>
            {s.lat == null && <span className="pastille pastille-interrompu">sans position</span>}
          </div>
          <p className="discret" style={{ margin: '0.5rem 0' }}>
            {s.nb_etapes} étape{s.nb_etapes > 1 ? 's' : ''} · {s.nb_encadrants} encadrant{s.nb_encadrants > 1 ? 's' : ''}
          </p>

          {/* Le logo sert la fiche de la structure et, si elle est vérifiée,
              la rubrique des partenaires sur la page de présentation. */}
          <ImageUnique
            usage="logo" typeCible="structure" cibleId={s.id}
            libelle="Ajouter le logo"
          />
        </div>
      ))}
    </>
  );
}

function Comptes() {
  const [comptes, setComptes] = useState<CompteListe[]>([]);
  const [structures, setStructures] = useState<Structure[]>([]);
  const [message, setMessage] = useState('');

  const recharger = useCallback(() => {
    api.get<{ comptes: CompteListe[] }>('/comptes').then((r) => {
      if (r.ok) setComptes(r.donnees.comptes);
    });
    api.get<{ structures: Structure[] }>('/administration/structures').then((r) => {
      if (r.ok) setStructures(r.donnees.structures);
    });
  }, []);

  useEffect(recharger, [recharger]);

  return (
    <>
      {message && <p className="message message-succes">{message}</p>}
      <p className="discret">
        Rattacher un encadrant à sa structure lui donne le droit d&apos;attester
        les parcours qui s&apos;y déroulent. C&apos;est ce qui empêche quiconque
        de valider des parcours qui ne le concernent pas.
      </p>

      {comptes.map((c) => (
        <div key={c.id} className="carte">
          <div className="carte-entete">
            <div>
              <p className="carte-nom">{c.nom}</p>
              <p className="discret" style={{ margin: 0 }}>{c.email} · {c.role}</p>
            </div>
            {c.actif === 0 && <span className="pastille pastille-interrompu">désactivé</span>}
          </div>

          <p className="discret" style={{ margin: '0.5rem 0' }}>
            {c.structure ? `Rattaché à ${c.structure}` : 'Aucune structure : ne peut rien attester'}
          </p>

          {c.role === 'encadrant' && (
            <label className="champ" style={{ marginBottom: '0.5rem' }}>
              <span>Rattacher à</span>
              <select
                defaultValue=""
                onChange={async (e) => {
                  if (!e.target.value) return;
                  const r = await api.post(`/comptes/${c.id}/rattacher`, { structureId: e.target.value });
                  setMessage(r.ok ? 'Rattachement effectué.' : r.erreur);
                  recharger();
                }}
              >
                <option value="">Choisir une structure…</option>
                {structures.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
              </select>
            </label>
          )}

          <button
            type="button" className="bouton bouton-discret"
            onClick={async () => {
              const action = c.actif === 1 ? 'desactiver' : 'reactiver';
              const r = await api.post(`/comptes/${c.id}/${action}`);
              setMessage(r.ok ? 'Compte mis à jour.' : r.erreur);
              recharger();
            }}
          >
            {c.actif === 1 ? 'Désactiver' : 'Réactiver'}
          </button>
        </div>
      ))}
    </>
  );
}
