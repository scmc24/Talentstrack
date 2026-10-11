'use client';

import { createContext, useContext, useState, useCallback } from 'react';
import { api, type Compte } from '../lib/api';

type Etat = {
  compte: Compte | null;
  peutAttester: boolean;
  charge: boolean;
  recharger: () => void;
};

const Contexte = createContext<Etat>({
  compte: null, peutAttester: false, charge: false, recharger: () => {},
});

/**
 * État de session partagé.
 *
 * Centralisé ici pour que chaque écran n'interroge pas l'API de son côté : à
 * quatre écrans, cela ferait quatre appels à chaque navigation, ce qui se
 * sent sur une connexion mobile.
 */
export function FournisseurSession({
  children, compteInitial,
}: {
  children: React.ReactNode;
  /** Compte lu côté serveur. Fourni, il évite un appel réseau au chargement
   *  de chaque page, et surtout l'affichage d'un en-tête « Se connecter »
   *  pendant une fraction de seconde alors que la personne est connectée. */
  compteInitial: Compte | null;
}) {
  const [compte, setCompte] = useState<Compte | null>(compteInitial);
  const [peutAttester, setPeut] = useState(
    compteInitial?.role === 'admin'
    || (compteInitial?.role === 'encadrant' && !!compteInitial.structure_id),
  );
  const [charge, setCharge] = useState(true);

  const recharger = useCallback(() => {
    api.get<{ compte: Compte | null; peutAttester: boolean }>('/comptes/moi').then((r) => {
      if (r.ok) { setCompte(r.donnees.compte); setPeut(r.donnees.peutAttester ?? false); }
      setCharge(true);
    });
  }, []);

  return (
    <Contexte.Provider value={{ compte, peutAttester, charge, recharger }}>
      {children}
    </Contexte.Provider>
  );
}

export function useSession() { return useContext(Contexte); }
