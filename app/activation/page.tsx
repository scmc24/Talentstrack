'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';
import { useSession } from '../../composants/Session';

/**
 * Activation d'un compte sportif.
 *
 * Le code identifie la personne : il n'y a rien à revendiquer, et aucune
 * possibilité de se rattacher au parcours d'un autre. L'adresse électronique
 * reste facultative, car beaucoup de jeunes n'en ont pas et l'exiger
 * fermerait la porte à ceux-là mêmes qu'il s'agit de suivre.
 */
export default function Activation() {
  const routeur = useRouter();
  const { recharger } = useSession();
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);

  return (
    <section className="acces bandeau-sombre">
      <div className="enveloppe">
      <h1>Activer mon accès</h1>
      <p className="discret">
        Votre encadrant vous a remis un code. Il ouvre l&apos;accès à votre
        parcours, et à lui seul.
      </p>

      {erreur && <p className="message message-erreur">{erreur}</p>}

      <div className="carte">
        <label className="champ">
          <span>Code d&apos;accès</span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ABCD-2345"
            // Chiffres et lettres sans accent : le clavier doit s'ouvrir en
            // majuscules, sans correction automatique qui transformerait le code.
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            style={{ letterSpacing: '0.12em', fontSize: '18px' }}
          />
        </label>

        <label className="champ">
          <span>Adresse électronique (facultatif)</span>
          <input type="text" inputMode="email" value={email}
                 onChange={(e) => setEmail(e.target.value)} />
          <span className="aide">
            Sans adresse, seul votre encadrant pourra vous rouvrir un accès si
            vous oubliez votre mot de passe.
          </span>
        </label>

        <label className="champ">
          <span>Choisissez un mot de passe</span>
          <input type="password" value={motDePasse} autoComplete="new-password"
                 onChange={(e) => setMotDePasse(e.target.value)} />
          <span className="aide">Au moins 8 caractères.</span>
        </label>

        <button
          type="button" className="bouton bouton-principal bouton-large" disabled={envoi}
          onClick={async () => {
            setEnvoi(true); setErreur('');
            const r = await api.post('/comptes/activation', {
              code, email: email || undefined, motDePasse,
            });
            setEnvoi(false);
            if (r.ok) { recharger(); routeur.push('/mon-parcours/'); }
            else setErreur(r.erreur);
          }}
        >
          {envoi ? 'Activation…' : 'Activer mon accès'}
        </button>
      </div>
    </div>
    </section>
  );
}
