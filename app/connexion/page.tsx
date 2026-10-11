'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '../../lib/api';
import { useSession } from '../../composants/Session';

export default function Connexion() {
  const routeur = useRouter();
  const { recharger } = useSession();
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);

  return (
    <section className="acces bandeau-sombre">
      <div className="enveloppe">
      <h1>Connexion</h1>
      {erreur && <p className="message message-erreur">{erreur}</p>}

      <div className="carte">
        <label className="champ">
          <span>Adresse électronique</span>
          <input type="text" inputMode="email" value={email} autoComplete="username"
                 onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="champ">
          <span>Mot de passe</span>
          <input type="password" value={motDePasse} autoComplete="current-password"
                 onChange={(e) => setMotDePasse(e.target.value)} />
        </label>
        <button
          type="button" className="bouton bouton-principal bouton-large" disabled={envoi}
          onClick={async () => {
            setEnvoi(true); setErreur('');
            const r = await api.post('/comptes/connexion', { email, motDePasse });
            setEnvoi(false);
            if (r.ok) { recharger(); routeur.push('/'); } else setErreur(r.erreur);
          }}
        >
          {envoi ? 'Connexion…' : 'Se connecter'}
        </button>
      </div>

      <p className="discret">
        Encadrant ou recruteur sans compte ?{' '}
        <Link href="/inscription/">Créer un compte</Link>
      </p>
      <p className="discret">
        Sportif avec un code remis par votre encadrant ?{' '}
        <Link href="/activation/">Activer mon accès</Link>
      </p>
    </div>
    </section>
  );
}
