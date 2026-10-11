'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '../../lib/api';
import { useSession } from '../../composants/Session';

/**
 * Redirection du sportif vers sa propre fiche.
 *
 * Un sportif ne doit pas avoir à retrouver son identifiant pour consulter son
 * parcours : l'adresse est stable et la session fait le reste.
 */
export default function MonParcours() {
  const routeur = useRouter();
  const { compte, charge } = useSession();
  const [erreur, setErreur] = useState('');

  useEffect(() => {
    if (!charge) return;
    if (!compte) { setErreur('Connectez-vous pour voir votre parcours.'); return; }
    api.get<{ sportifId: string }>('/mon-parcours').then((r) => {
      if (r.ok) routeur.replace(`/sportif/?id=${r.donnees.sportifId}`);
      else setErreur(r.erreur);
    });
  }, [charge, compte, routeur]);

  if (erreur) {
    return (
      <section className="section enveloppe">
        <div className="vide">
          <p>{erreur}</p>
          <Link href="/connexion/" className="bouton bouton-principal">Se connecter</Link>
          <p className="discret" style={{ marginTop: '1rem' }}>
            Vous avez reçu un code de votre encadrant ?{' '}
            <Link href="/activation/">Activer mon accès</Link>
          </p>
        </div>
      </section>
    );
  }

  return <p className="chargement">Ouverture de votre parcours…</p>;
}
