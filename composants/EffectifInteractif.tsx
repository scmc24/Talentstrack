'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '../lib/api';
import { Ajout, Valide } from './Icones';
import type { CompteServeur, LigneEffectif } from '../lib/serveur';

/**
 * Partie interactive de l'effectif.
 *
 * Les données arrivent déjà chargées depuis le serveur : ce composant ne fait
 * que ce qui exige le navigateur, à savoir traiter les signalements. Après
 * une action, la page est redemandée au serveur plutôt que rechargée par un
 * appel séparé, ce qui garantit que l'affichage reflète la base.
 */
export function EffectifInteractif({
  compte, effectif, contestationsInitiales,
}: {
  compte: CompteServeur;
  effectif: LigneEffectif[];
  contestationsInitiales: any[];
}) {
  const routeur = useRouter();
  const [contestations, setContestations] = useState(contestationsInitiales);
  const [message, setMessage] = useState('');

  const attestes = effectif.filter((s) => s.nb_attestees > 0).length;
  const interrompus = effectif.filter((s) => s.statut === 'interrompu').length;
  const sansEtape = effectif.filter((s) => s.nb_etapes === 0).length;

  async function traiter(id: string, decision: 'acceptee' | 'refusee') {
    const r = await api.post(`/contestations/${id}/traiter`, { decision });
    setMessage(r.ok
      ? decision === 'acceptee'
        ? 'Signalement accepté : l’attestation est retirée en attendant correction.'
        : 'Signalement refusé.'
      : r.erreur);
    setContestations((c) => c.filter((x) => x.id !== id));
    routeur.refresh();
  }

  if (compte.role === 'sportif') {
    return (
      <section className="section enveloppe">
        <h1>Bonjour {compte.nom.split(' ')[0]}</h1>
        <p className="message message-info">
          <Link href="/mon-parcours/">Voir mon parcours</Link>
        </p>
      </section>
    );
  }

  return (
    <section className="section enveloppe">
      <h1>Effectif suivi</h1>

      {message && <p className="message message-succes">{message}</p>}

      {compte.role === 'encadrant' && !compte.structure_id && (
        <p className="message message-info">
          Votre compte n&apos;est rattaché à aucune structure : vos saisies
          seront enregistrées comme reconstituées. Demandez votre rattachement
          à un administrateur.
        </p>
      )}

      {/* Les signalements passent avant les compteurs : un sportif qui
          conteste attend une réponse, et une erreur laissée en place
          discrédite toute la base. */}
      {contestations.length > 0 && (
        <div className="carte" style={{ borderLeft: '3px solid var(--ocre)' }}>
          <h3>Signalements à examiner</h3>
          {contestations.map((ct) => (
            <div key={ct.id} style={{ paddingTop: '0.5rem' }}>
              <p style={{ margin: 0 }}>
                <strong>{ct.sportif}</strong>
                {ct.structure && <span className="discret"> · {ct.structure}</span>}
              </p>
              <p className="discret" style={{ margin: '0 0 0.5rem' }}>
                {String(ct.motif).replace(/_/g, ' ')}{ct.texte && ` — « ${ct.texte} »`}
              </p>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button type="button" className="bouton bouton-second"
                        onClick={() => traiter(ct.id, 'acceptee')}>
                  Il a raison
                </button>
                <button type="button" className="bouton bouton-discret"
                        onClick={() => traiter(ct.id, 'refusee')}>
                  L&apos;étape est juste
                </button>
                <Link href={`/sportif/?id=${ct.sportif_id}`} className="bouton bouton-discret">
                  Voir le parcours
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="indicateurs" style={{ marginBottom: '1.5rem' }}>
        <div className="indicateur">
          <div className="indicateur-valeur">{effectif.length}</div>
          <div className="indicateur-libelle">sportifs suivis</div>
        </div>
        <div className="indicateur">
          <div className="indicateur-valeur" style={{ color: 'var(--terrain)' }}>{attestes}</div>
          <div className="indicateur-libelle">parcours attestés</div>
        </div>
        <div className="indicateur">
          <div className="indicateur-valeur" style={{ color: 'var(--ocre)' }}>{sansEtape}</div>
          <div className="indicateur-libelle">sans aucune étape</div>
        </div>
        <div className="indicateur">
          <div className="indicateur-valeur" style={{ color: 'var(--alerte)' }}>{interrompus}</div>
          <div className="indicateur-libelle">parcours interrompus</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        <Link href="/saisie/" className="bouton bouton-principal">
          <Ajout taille={18} /> Enregistrer une étape
        </Link>
        <Link href="/nouveau-sportif/" className="bouton bouton-discret">
          Ajouter un sportif
        </Link>
      </div>

      {effectif.length === 0 && (
        <div className="vide">
          <p>Aucun sportif enregistré pour l&apos;instant.</p>
          <Link href="/nouveau-sportif/" className="bouton bouton-principal">
            Ajouter le premier
          </Link>
        </div>
      )}

      {effectif.map((s) => (
        <Link key={s.id} href={`/sportif/?id=${s.id}`} className="carte carte-lien">
          <div className="carte-entete">
            <div>
              <p className="carte-nom">{s.nom}</p>
              <p className="discret" style={{ margin: 0 }}>
                {s.discipline}
                {s.poste && ` · ${s.poste}`}
                {s.origine && ` · ${s.origine}`}
              </p>
            </div>
            {s.nb_attestees > 0 ? (
              <span className="pastille pastille-attestee">
                <Valide taille={13} /> {s.nb_attestees}
              </span>
            ) : (
              <span className="pastille pastille-reconstituee">à attester</span>
            )}
          </div>
          <p className="discret" style={{ margin: '0.5rem 0 0' }}>
            {s.nb_etapes === 0
              ? 'Aucune étape enregistrée'
              : `${s.nb_etapes} étape${s.nb_etapes > 1 ? 's' : ''}`}
            {s.structure_actuelle && ` · actuellement ${s.structure_actuelle}`}
            {s.statut === 'interrompu' && ' · parcours interrompu'}
          </p>
        </Link>
      ))}
    </section>
  );
}
