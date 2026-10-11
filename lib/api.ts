/**
 * Client de l'API.
 *
 * Le site est livré en fichiers statiques : tout ce qui vit est chargé ici,
 * depuis le navigateur.
 */
/**
 * Les services sont servis par le même Worker que les pages, sous /api.
 * Plus d'adresse à configurer, plus de CORS, et le cookie de session part
 * naturellement avec chaque requête.
 */
export const BASE_API = '/api';

export type Reponse<T> =
  | { ok: true; donnees: T }
  | { ok: false; erreur: string; champ?: string | null; statut: number };

async function appeler<T>(chemin: string, options: RequestInit = {}): Promise<Reponse<T>> {
  try {
    const r = await fetch(BASE_API + chemin, {
      ...options,
      // Indispensable : le cookie de session est inaccessible au script et ne
      // part pas sans cette option, l'API vivant sur un autre domaine.
      // Même origine : « same-origin » suffit et reste plus strict.
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
    });
    const texte = await r.text();
    const donnees = texte ? JSON.parse(texte) : {};

    if (!r.ok) {
      return { ok: false, erreur: donnees.erreur ?? 'Une erreur est survenue.', champ: donnees.champ ?? null, statut: r.status };
    }
    return { ok: true, donnees: donnees as T };
  } catch {
    // Panne réseau : sur une connexion mobile instable, c'est le cas le plus
    // fréquent, et le message doit dire quoi faire plutôt que « erreur ».
    return { ok: false, erreur: 'Connexion impossible. Vérifiez votre réseau et réessayez.', statut: 0 };
  }
}

export const api = {
  get: <T>(chemin: string) => appeler<T>(chemin),
  post: <T>(chemin: string, corps?: unknown) =>
    appeler<T>(chemin, { method: 'POST', body: JSON.stringify(corps ?? {}) }),
  supprimer: <T>(chemin: string) => appeler<T>(chemin, { method: 'DELETE' }),
};

export type Referentiels = {
  unites: { id: string; nom: string; niveau: string; parent_id: string | null }[];
  disciplines: {
    id: string; nom: string; type: string;
    avec_postes: number; avec_grades: number; avec_categories: number;
  }[];
  postes: { id: string; discipline_id: string; nom: string }[];
  typesStructure: { id: string; nom: string; rang: number }[];
  modesTransition: { id: string; nom: string }[];
  motifsFin: { id: string; nom: string }[];
  niveaux: { id: string; nom: string }[];
};

export type EtapeParcours = {
  id: string; structure: string | null; typeStructure: string | null;
  territoire: string; territoireId: string;
  debut: string; fin: string | null; enCours: boolean;
  niveau: string; motifFin: string | null; fiabilite: string;
  arriveePar: string | null; agent: string | null; note: string | null;
  evolution: string | null; distanceEtapePrecedente: number | null;
};

export type Parcours = {
  sportif: {
    id: string; nom: string; age: number | null;
    discipline: string; disciplineId: string;
    statut: string; origine: string | null;
  };
  debuts: { agePremierContact: number | null; agePremiereStructure: number | null; contexteInitial: string | null; delaiEncadrement: number | null } | null;
  etapes: EtapeParcours[];
  resume: { nbEtapes: number; attestees: number; aMigre: boolean };
};

export type Resultat = {
  id: string; nom: string; discipline: string; poste: string | null;
  origine: string | null; statut: string; structureActuelle: string | null;
  nbEtapes: number; nbAttestees: number;
};

export type Compte = {
  id: string;
  nom: string;
  role: 'sportif' | 'encadrant' | 'recruteur' | 'admin';
  structure_id: string | null;
  structure?: string | null;
};

export type EtatPlateforme = {
  etat: Record<string, number>;
  alertes: string[];
};
