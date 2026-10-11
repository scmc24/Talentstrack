import { base } from '../lib/serveur';

type Partenaire = { id: string; nom: string; type: string; territoire: string; logo_id: string };

/**
 * Structures partenaires, lues côté serveur.
 *
 * Elles étaient d'abord chargées depuis le navigateur, ce qui les rendait
 * absentes du HTML envoyé : sur une page de présentation, dont tout l'objet
 * est d'être lue dès l'arrivée, c'était un contresens.
 *
 * Seules les structures vérifiées et dotées d'un logo y figurent. Une
 * rubrique remplie de noms saisis à la volée perdrait toute valeur, et
 * afficherait des établissements qui n'ont jamais donné leur accord. La
 * section disparaît entièrement tant qu'aucune ne remplit ces conditions :
 * une rubrique « partenaires » vide fait plus de tort que son absence.
 */
export async function Partenaires() {
  const r = await base().prepare(
    `SELECT s.id, s.nom, f.id AS logo_id, ts.nom AS type, u.nom AS territoire
     FROM structures s
     JOIN fichiers f ON f.type_cible = 'structure' AND f.cible_id = s.id AND f.usage = 'logo'
     JOIN types_structure ts ON ts.id = s.type_id
     JOIN unites_admin u ON u.id = s.unite_id
     WHERE s.verifiee = 1
     ORDER BY s.nom
     LIMIT 24`,
  ).all();

  const partenaires = r.results as unknown as Partenaire[];
  if (partenaires.length === 0) return null;

  return (
    <section className="section bandeau-sombre">
      <div className="enveloppe">
        <span className="surtitre">Ils suivent leurs effectifs</span>
        <h2 className="mesure">Structures partenaires</h2>
        <p className="mesure">
          Clubs, académies et établissements qui enregistrent les parcours de
          leurs sportifs sur la plateforme.
        </p>

        <div className="partenaires">
          {partenaires.map((p) => (
            <div key={p.id} className="partenaire" title={`${p.type} · ${p.territoire}`}>
              {/* Le nom accompagne toujours le logo : un logo seul n'est
                  identifiable que par ceux qui le connaissent déjà. */}
              <img src={`/api/fichiers/${p.logo_id}`} alt="" loading="lazy" />
              <span>{p.nom}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
