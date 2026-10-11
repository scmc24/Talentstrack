'use client';

import { useEffect, useState } from 'react';

/**
 * Proposition d'installation.
 *
 * Le navigateur signale qu'il peut installer l'application en émettant un
 * événement, qu'il faut retenir : l'invite ne peut être présentée qu'une
 * fois, et seulement en réaction à un geste de l'utilisateur.
 *
 * La bannière n'apparaît pas d'emblée. Proposer d'installer un outil avant
 * même de l'avoir montré obtient un refus, et ce refus empêche le navigateur
 * de reproposer avant plusieurs mois.
 */
type Invite = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const CLE_REFUS = 'talentstrack_installation_refusee';

export function Installation() {
  const [invite, setInvite] = useState<Invite | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Déjà installée : l'application s'ouvre hors du navigateur.
    const installee = window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as any).standalone === true;
    if (installee) return;

    let refusee = false;
    try { refusee = localStorage.getItem(CLE_REFUS) === '1'; } catch { /* navigation privée */ }
    if (refusee) return;

    const capter = (e: Event) => {
      e.preventDefault();
      setInvite(e as Invite);
      // Laisser le temps de voir l'écran avant de proposer quoi que ce soit.
      setTimeout(() => setVisible(true), 8000);
    };

    window.addEventListener('beforeinstallprompt', capter);
    return () => window.removeEventListener('beforeinstallprompt', capter);
  }, []);

  if (!invite || !visible) return null;

  function refuser() {
    try { localStorage.setItem(CLE_REFUS, '1'); } catch { /* ignoré */ }
    setVisible(false);
  }

  return (
    <div className="installation" role="dialog" aria-label="Installer l'application">
      <img src="/icone-192.png" alt="" width={44} height={44} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p className="installation-titre">Installer TalentsTrack</p>
        <p className="installation-detail">
          Accès direct depuis l&apos;écran d&apos;accueil, sans passer par le navigateur.
        </p>
      </div>
      <div className="installation-actions">
        <button
          type="button" className="bouton bouton-principal"
          onClick={async () => {
            await invite.prompt();
            await invite.userChoice;
            setVisible(false);
            setInvite(null);
          }}
        >
          Installer
        </button>
        <button type="button" className="bouton bouton-discret" onClick={refuser}>
          Plus tard
        </button>
      </div>
    </div>
  );
}

/**
 * Enregistrement de l'agent de service.
 *
 * Il conditionne l'installation : les navigateurs ne proposent l'ajout à
 * l'écran d'accueil que si un agent est enregistré et traite les requêtes.
 */
export function AgentService() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    // Après le chargement : l'enregistrement consomme de la bande passante,
    // et il ne doit pas concurrencer l'affichage de la page.
    const poser = () => navigator.serviceWorker.register('/sw.js').catch(() => { /* ignoré */ });
    if (document.readyState === 'complete') poser();
    else window.addEventListener('load', poser, { once: true });
  }, []);

  return null;
}
