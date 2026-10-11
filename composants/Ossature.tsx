'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useSession } from './Session';
import { Effectif, Ajout, Recherche, Carte } from './Icones';

export function Entete() {
  const chemin = usePathname();
  const { compte, recharger } = useSession();

  // Aucun lien applicatif tant que personne n'est connecté : proposer
  // « Nouvelle étape » à un visiteur l'envoie vers un écran qui le rejette,
  // ce qui donne l'impression d'un site cassé plutôt que protégé.
  const liens = !compte ? [] : [
    ...(compte.role === 'sportif'
      ? [{ href: '/mon-parcours/', libelle: 'Mon parcours' }]
      : [
          { href: '/', libelle: 'Effectif' },
          { href: '/saisie/', libelle: 'Nouvelle étape' },
          { href: '/recherche/', libelle: 'Recherche' },
          { href: '/analyses/', libelle: 'Territoires' },
        ]),
    ...(compte.role === 'admin' ? [{ href: '/administration/', libelle: 'Administration' }] : []),
  ];

  return (
    <header className="entete">
      <div className="enveloppe entete-rangee">
        <Link href="/" className="marque" aria-label="TalentsTrack, accueil">
          {/* Le logo est servi en image plutôt que recomposé en texte : il
              porte un dégradé et une typographie propres à la marque. */}
          <img src="/logo-entete.png" alt="TalentsTrack" width={176} height={36} />
        </Link>
        <nav className="entete-nav" aria-label="Navigation principale">
          {liens.map((l) => (
            <Link key={l.href} href={l.href} aria-current={chemin === l.href ? 'page' : undefined}>
              {l.libelle}
            </Link>
          ))}
        </nav>
        <span className="compte-actif">
          {compte ? (
            <>
              {compte.nom}
              {' · '}
              <button
                type="button"
                style={{
                  background: 'none', border: 'none', color: 'inherit',
                  textDecoration: 'underline', cursor: 'pointer',
                  font: 'inherit', padding: 0, minHeight: 'auto',
                }}
                onClick={async () => { await api.post('/comptes/deconnexion'); recharger(); }}
              >
                Déconnexion
              </button>
            </>
          ) : (
            <Link href="/connexion/" style={{ color: 'inherit' }}>Se connecter</Link>
          )}
        </span>
      </div>
    </header>
  );
}

export function NavBasse() {
  const chemin = usePathname();
  const { compte } = useSession();

  // Masquée hors connexion : une barre de navigation vers des pages
  // inaccessibles occupe un sixième de l'écran pour rien.
  if (!compte) return null;

  const liens = compte.role === 'sportif'
    ? [
        { href: '/mon-parcours/', libelle: 'Mon parcours', Icone: Effectif },
        { href: '/analyses/', libelle: 'Territoires', Icone: Carte },
      ]
    : [
        { href: '/', libelle: 'Effectif', Icone: Effectif },
        { href: '/saisie/', libelle: 'Saisir', Icone: Ajout },
        { href: '/recherche/', libelle: 'Chercher', Icone: Recherche },
        compte.role === 'admin'
          ? { href: '/administration/', libelle: 'Gérer', Icone: Carte }
          : { href: '/analyses/', libelle: 'Territoires', Icone: Carte },
      ];
  return (
    <nav className="nav-basse" aria-label="Navigation">
      {liens.map(({ href, libelle, Icone }) => (
        <Link key={href} href={href} aria-current={chemin === href ? 'page' : undefined}>
          <Icone taille={21} />
          {libelle}
        </Link>
      ))}
    </nav>
  );
}

/**
 * Pied de page.
 *
 * Il ne porte que ce qui aide à comprendre à qui l'on a affaire. Pas de liens
 * applicatifs : ils mèneraient à des écrans qui rejettent un visiteur.
 */
export function PiedPage() {
  const { compte } = useSession();
  if (compte) return null;

  return (
    <footer style={{
      background: 'var(--encre)', color: 'rgba(255,255,255,0.6)',
      padding: '2rem 0', fontSize: 'var(--t-s)',
    }}>
      <div className="enveloppe">
        <img src="/logo-entete.png" alt="TalentsTrack"
             style={{ height: '32px', width: 'auto', marginBottom: '0.75rem' }} />
        <p style={{ margin: '0 0 0.5rem' }}>
          Suivi des parcours de jeunes sportifs, Cameroun.
        </p>
        <p style={{ margin: 0 }}>
          Les données concernant des mineurs ne sont jamais publiques. Aucun
          contact direct entre un recruteur et un sportif : tout passe par sa
          structure.
        </p>
      </div>
    </footer>
  );
}
