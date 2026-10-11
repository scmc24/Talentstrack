import Link from 'next/link';
import { Partenaires } from './Partenaires';
import { SITE } from '../lib/site';

/**
 * Page de présentation.
 *
 * Elle expose le problème avant la solution. Un visiteur qui arrive sur
 * « plateforme de suivi des jeunes talents » sans comprendre ce qui manque
 * aujourd'hui range mentalement l'outil parmi les annuaires sportifs, dont
 * il connaît l'inefficacité.
 *
 * Aucun chiffre n'est avancé : les enquêtes menées sont exploratoires, et une
 * statistique inventée sur une page publique se retourne au premier
 * interlocuteur qui demande la source.
 */
export function Presentation() {
  /**
   * Données structurées.
   *
   * Elles décrivent la plateforme dans un format que les moteurs lisent
   * directement, sans avoir à interpréter la page. C'est ce qui permet
   * d'apparaître avec un libellé exact plutôt qu'avec un extrait choisi au
   * hasard dans le texte.
   */
  const donneesStructurees = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'TalentsTrack',
    url: SITE,
    applicationCategory: 'SportsApplication',
    operatingSystem: 'Tout navigateur web',
    inLanguage: 'fr',
    description:
      'Plateforme d\u2019enregistrement et de suivi des parcours de jeunes sportifs : étapes, modes de détection, grades et analyses territoriales.',
    areaServed: { '@type': 'Country', name: 'Cameroun' },
    audience: {
      '@type': 'Audience',
      audienceType: 'Entraîneurs, clubs, académies et centres de formation',
    },
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'XAF' },
  };

  return (
    <>
      <script
        type="application/ld+json"
        // Les données structurées sont engendrées ici et non saisies par un
        // utilisateur : aucune donnée extérieure n'y transite.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(donneesStructurees) }}
      />

      <section className="accueil bandeau-sombre">
        <div className="enveloppe">
          <div className="accueil-bloc">
            <img src="/logo-accueil.png" alt="TalentsTrack" className="accueil-logo" />
            <h1>Le parcours d&apos;un sportif, de ses débuts à sa carrière</h1>
            <p className="accueil-accroche">
              Où il a commencé, qui l&apos;a repéré, par quelles structures il
              est passé, ce qu&apos;il y a obtenu. Chaque étape attestée par un
              encadrant identifié, et située sur le territoire.
            </p>

            <div className="accueil-actions">
              <Link href="/connexion/" className="bouton bouton-principal">Se connecter</Link>
              <Link href="/inscription/" className="bouton bouton-discret">Créer un compte</Link>
            </div>

            <p className="accueil-note">
              Sportif avec un code remis par votre encadrant ?{' '}
              <Link href="/activation/">Activer mon accès</Link>
            </p>
          </div>
        </div>
      </section>

      {/* Le problème d'abord. Il est connu de tous les acteurs du milieu, mais
          rarement formulé, et c'est sa formulation qui justifie l'outil. */}
      <section className="section bandeau-clair">
        <div className="enveloppe">
          <span className="surtitre">Le problème</span>
          <h2 className="mesure">Les talents existent. Leur parcours, nulle part.</h2>
          <p className="mesure">
            Un jeune repéré à quinze ans dans un tournoi de quartier peut
            intégrer une académie, être sélectionné en équipe régionale, puis
            disparaître des radars. Rien ne subsiste de ce qu&apos;il a
            traversé, ni de ce qui l&apos;a fait progresser ou renoncer.
          </p>

          <div className="constats">
            <div className="constat">
              <h3>Le sportif n&apos;a rien à montrer</h3>
              <p>
                Sans parcours attesté, sa progression est invérifiable. Il
                n&apos;a aucun élément objectif à présenter, ce qui l&apos;expose
                aux intermédiaires qui monnaient des promesses d&apos;essais à
                l&apos;étranger.
              </p>
            </div>
            <div className="constat">
              <h3>L&apos;information part avec les gens</h3>
              <p>
                Un entraîneur qui change de club emporte la connaissance de ses
                joueurs. Fiches papier, carnets, souvenirs : aucune mémoire ne
                reste à la structure.
              </p>
            </div>
            <div className="constat">
              <h3>Aucun diagnostic possible</h3>
              <p>
                Dans quelles régions accède-t-on tardivement à un encadrement ?
                Où les talents sont-ils repérés faute de structures ? Combien de
                parcours s&apos;arrêtent, et pourquoi ? Personne ne sait
                répondre.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Le concept. C'est ici que se joue la différence avec un annuaire, et
          il faut que le visiteur reparte avec cette idée s'il n'en retient
          qu'une. */}
      <section className="section bandeau-sombre">
        <div className="enveloppe">
          <span className="surtitre">Le concept</span>
          <h2 className="mesure">Un parcours, pas un profil</h2>
          <p className="mesure-large">
            Un profil décrit un état à un instant, déclaré par l&apos;intéressé
            lui-même. Multiplié par des milliers, il produit un volume que
            personne ne consulte. Nous enregistrons autre chose : une suite
            d&apos;étapes situées dans l&apos;espace et dans le temps, et
            surtout ce qui relie ces étapes entre elles.
          </p>

          <div className="traces">
            <div className="trace">
              <span className="trace-etiquette">Première trace</span>
              <h3>Le socle</h3>
              <p>
                D&apos;où il part. L&apos;âge de son premier ballon, le contexte
                où le sport est entré dans sa vie, les conditions dans
                lesquelles il s&apos;entraîne.
              </p>
            </div>
            <div className="trace">
              <span className="trace-etiquette">Deuxième trace</span>
              <h3>Les étapes</h3>
              <p>
                Où il est passé. Une structure, une période, un niveau, un
                territoire. Du terrain de quartier au club professionnel.
              </p>
            </div>
            <div className="trace trace-appui">
              <span className="trace-etiquette">Troisième trace</span>
              <h3>Les transitions</h3>
              <p>
                Comment il est passé de l&apos;une à l&apos;autre. Recommandé
                par un entraîneur, repéré en tournoi, vu jouer au quartier.
                C&apos;est l&apos;information que personne ne consigne, et c&apos;est
                la plus parlante.
              </p>
            </div>
          </div>

          <p className="mesure-large" style={{ marginTop: '2rem' }}>
            Savoir qu&apos;un joueur est passé du quartier à l&apos;académie ne
            dit pas s&apos;il a été recommandé, repéré, ou s&apos;il s&apos;est
            présenté seul. Agrégée sur un territoire, cette information révèle
            si les talents y sont détectés grâce aux structures ou malgré leur
            absence.
          </p>
        </div>
      </section>

      <section className="section bandeau-clair">
        <div className="enveloppe">
          <span className="surtitre">Ce que ça change</span>
          <h2 className="mesure">Trois usages, un même enregistrement</h2>

          <div className="publics">
            <div className="public-bloc">
              <h3>Pour l&apos;encadrant</h3>
              <ul>
                <li>Un effectif qui reste à la structure, même s&apos;il la quitte</li>
                <li>Une étape saisie en moins d&apos;une minute, depuis un téléphone</li>
                <li>Une grille d&apos;évaluation par critères, suivie dans le temps</li>
                <li>Les signalements de ses sportifs, à examiner</li>
              </ul>
            </div>
            <div className="public-bloc">
              <h3>Pour le sportif</h3>
              <ul>
                <li>Un parcours documenté, qu&apos;il peut montrer</li>
                <li>Des grades et des mesures attestés, non déclarés</li>
                <li>Le droit de signaler ce qui est faux</li>
                <li>Un accès ouvert par son encadrant, pas une inscription anonyme</li>
              </ul>
            </div>
            <div className="public-bloc">
              <h3>Pour le territoire</h3>
              <ul>
                <li>D&apos;où viennent les sportifs, rapporté à la population</li>
                <li>Les zones où l&apos;on détecte faute de structures</li>
                <li>Les années écoulées avant un premier encadrement</li>
                <li>Les déplacements, et les parcours qui s&apos;interrompent</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="section bandeau-clair" style={{ borderTop: '1px solid var(--trait)' }}>
        <div className="enveloppe">
          <span className="surtitre">Ce qui la distingue</span>
          <h2 className="mesure">Quatre partis pris</h2>

          <div className="distinctions">
            <div className="distinction">
              <h3>Une donnée attestée, pas déclarée</h3>
              <p>
                Une saisie faite par l&apos;encadrant de la structure concernée
                vaut attestation. Ailleurs, elle reste une reconstitution, et
                c&apos;est écrit. Un recruteur sait donc ce qu&apos;il regarde.
              </p>
            </div>
            <div className="distinction">
              <h3>Le passé reconnu comme incertain</h3>
              <p>
                Un jeune de dix-sept ans a commencé à huit : personne n&apos;a
                documenté ces années. Les traces reconstituées sont acceptées,
                mais jamais confondues avec celles saisies sur le moment.
              </p>
            </div>
            <div className="distinction">
              <h3>Tous les sports, sans les confondre</h3>
              <p>
                Football et basketball ont des postes. Judo, karaté et nanbudo
                ont des grades et des catégories de poids. Chaque discipline
                garde son vocabulaire plutôt qu&apos;un modèle générique qui ne
                parlerait bien à personne.
              </p>
            </div>
            <div className="distinction">
              <h3>Des mineurs protégés par construction</h3>
              <p>
                Pas d&apos;inscription libre pour les sportifs, pas de contact
                direct entre un recruteur et un jeune, aucune donnée sociale
                visible sur une fiche. Pour les moins de quinze ans, c&apos;est
                le tuteur qui reçoit l&apos;accès.
              </p>
            </div>
          </div>
        </div>
      </section>

      <Partenaires />

      <section className="bandeau-sombre appel-final">
        <div className="enveloppe">
          <div className="mesure">
            <h2>Commencer, c&apos;est enregistrer une étape</h2>
            <p>
              La plateforme s&apos;installe structure par structure. Un
              entraîneur qui inscrit son effectif apporte trente parcours
              d&apos;un coup, et il est le seul à pouvoir dire d&apos;où
              viennent ses joueurs.
            </p>
            <div className="accueil-actions">
              <Link href="/inscription/" className="bouton bouton-principal">
                Créer un compte encadrant
              </Link>
              <Link href="/connexion/" className="bouton bouton-discret">Se connecter</Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
