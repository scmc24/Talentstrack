'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, type Referentiels } from '../../lib/api';
import { useSession } from '../../composants/Session';

export default function Inscription() {
  const routeur = useRouter();
  const { recharger } = useSession();
  const [ref, setRef] = useState<Referentiels | null>(null);

  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [telephone, setTelephone] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [role, setRole] = useState('encadrant');
  const [uniteId, setUnite] = useState('');
  const [erreur, setErreur] = useState('');
  const [champ, setChamp] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    api.get<Referentiels>('/referentiels').then((r) => { if (r.ok) setRef(r.donnees); });
  }, []);

  const unites = (ref?.unites ?? []).filter((u) => u.niveau !== 'pays');

  return (
    <section className="acces bandeau-sombre">
      <div className="enveloppe">
      <h1>Créer un compte</h1>
      {erreur && <p className="message message-erreur">{erreur}</p>}

      <div className="carte">
        <h3>Votre rôle</h3>
        <div className="choix" style={{ marginBottom: '1.25rem' }}>
          <button type="button" aria-pressed={role === 'encadrant'} onClick={() => setRole('encadrant')}>
            Encadrant
            <br /><span className="discret">J&apos;entraîne des jeunes</span>
          </button>
          <button type="button" aria-pressed={role === 'recruteur'} onClick={() => setRole('recruteur')}>
            Recruteur
            <br /><span className="discret">Je cherche des profils</span>
          </button>
        </div>

        <label className="champ">
          <span>Nom et prénoms</span>
          <input value={nom} onChange={(e) => setNom(e.target.value)} autoComplete="name"
                 aria-invalid={champ === 'nom'} />
        </label>

        <label className="champ">
          <span>Adresse électronique</span>
          <input type="text" inputMode="email" value={email} autoComplete="username"
                 onChange={(e) => setEmail(e.target.value)} aria-invalid={champ === 'email'} />
        </label>

        <label className="champ">
          <span>Téléphone (facultatif)</span>
          <input type="tel" inputMode="tel" value={telephone}
                 onChange={(e) => setTelephone(e.target.value)} placeholder="6 99 88 77 66" />
        </label>

        <label className="champ">
          <span>Territoire où vous exercez</span>
          <select value={uniteId} onChange={(e) => setUnite(e.target.value)}>
            <option value="">À préciser</option>
            {unites.map((u) => <option key={u.id} value={u.id}>{u.nom}</option>)}
          </select>
        </label>

        <label className="champ">
          <span>Mot de passe</span>
          <input type="password" value={motDePasse} autoComplete="new-password"
                 onChange={(e) => setMotDePasse(e.target.value)} aria-invalid={champ === 'motDePasse'} />
          <span className="aide">Au moins 8 caractères.</span>
        </label>

        <button
          type="button" className="bouton bouton-principal bouton-large" disabled={envoi}
          onClick={async () => {
            setEnvoi(true); setErreur(''); setChamp(null);
            const r = await api.post('/comptes/inscription', {
              nom, email, telephone, motDePasse, role, uniteId: uniteId || undefined,
            });
            setEnvoi(false);
            if (r.ok) { recharger(); routeur.push('/'); }
            else { setErreur(r.erreur); setChamp(r.champ ?? null); }
          }}
        >
          {envoi ? 'Création…' : 'Créer mon compte'}
        </button>
      </div>

      {/* Dit d'emblée ce qui attend l'utilisateur : un encadrant qui ne
          comprendrait pas pourquoi il ne peut rien attester abandonnerait. */}
      <p className="message message-info">
        Votre compte sera actif immédiatement pour la consultation. Un
        administrateur doit vous rattacher à votre structure pour que vos
        saisies fassent foi.
      </p>

      <p className="discret">
        Déjà inscrit ? <Link href="/connexion/">Se connecter</Link>
      </p>
    </div>
    </section>
  );
}
