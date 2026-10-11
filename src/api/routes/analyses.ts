import { Hono } from 'hono';
import type { Env, Variables } from '../types.ts';
import { distanceKm } from './parcours.ts';

export const analyses = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * Indicateurs territoriaux.
 *
 * Toutes ces restitutions reposent sur le rattachement administratif posé à
 * la saisie, jamais sur un calcul de position. C'est ce qui les rend
 * instantanées et reproductibles.
 */

/** Effectifs par région d'origine, rapportés à la population quand elle est connue. */
analyses.get('/talents-par-region', async (c) => {
  const r = await c.env.DB.prepare(
    `SELECT reg.id, reg.nom AS region, reg.population,
            COUNT(DISTINCT s.personne_id) AS effectif
     FROM sportifs s
     JOIN unites_admin u ON u.id = s.unite_origine_id
     JOIN unites_admin reg ON reg.id = COALESCE(u.parent_id, u.id)
     GROUP BY reg.id ORDER BY effectif DESC`,
  ).all();

  return c.json({
    regions: (r.results as any[]).map((x) => ({
      id: x.id,
      region: x.region,
      effectif: x.effectif,
      // Rapporter à la population évite de conclure qu'une région produit
      // plus de talents alors qu'elle compte simplement plus d'habitants.
      pourCentMille: x.population
        ? Math.round((x.effectif / x.population) * 100000 * 100) / 100
        : null,
    })),
  });
});

/**
 * Modes de détection par territoire.
 *
 * L'indicateur de carence : une part élevée de repérage informel signale que
 * les talents y sont détectés malgré l'absence de structures, et non grâce à
 * elles.
 */
analyses.get('/detection-par-territoire', async (c) => {
  const r = await c.env.DB.prepare(
    `SELECT u.id, u.nom AS territoire, t.mode, COUNT(*) AS n
     FROM transitions t
     JOIN etapes e ON e.id = t.etape_apres
     JOIN unites_admin u ON u.id = e.unite_id
     GROUP BY u.id, t.mode`,
  ).all();

  const parTerritoire = new Map<string, any>();
  for (const x of r.results as any[]) {
    if (!parTerritoire.has(x.id)) {
      parTerritoire.set(x.id, { id: x.id, territoire: x.territoire, total: 0, modes: {} });
    }
    const t = parTerritoire.get(x.id);
    t.modes[x.mode] = x.n;
    t.total += x.n;
  }

  const INFORMELS = ['reperage_informel', 'demarche_famille'];
  return c.json({
    territoires: [...parTerritoire.values()].map((t) => {
      const informel = INFORMELS.reduce((s, m) => s + (t.modes[m] ?? 0), 0);
      return {
        ...t,
        partInformelle: t.total ? Math.round((informel / t.total) * 100) : 0,
      };
    }).sort((a, b) => b.partInformelle - a.partInformelle),
  });
});

/** Délai entre le premier contact avec le sport et la première structure. */
analyses.get('/delai-encadrement', async (c) => {
  const r = await c.env.DB.prepare(
    `SELECT v.delai_ans, u.nom AS territoire, reg.nom AS region
     FROM v_delai_encadrement v
     LEFT JOIN unites_admin u ON u.id = v.unite_depart
     LEFT JOIN unites_admin reg ON reg.id = COALESCE(u.parent_id, u.id)`,
  ).all();

  const lignes = r.results as any[];
  const parRegion = new Map<string, number[]>();
  for (const l of lignes) {
    const cle = l.region ?? 'Inconnue';
    if (!parRegion.has(cle)) parRegion.set(cle, []);
    parRegion.get(cle)!.push(l.delai_ans);
  }

  return c.json({
    global: lignes.length ? mediane(lignes.map((l) => l.delai_ans)) : null,
    parRegion: [...parRegion.entries()].map(([region, valeurs]) => ({
      region,
      effectif: valeurs.length,
      // La médiane plutôt que la moyenne : sur de petits effectifs, un seul
      // parcours atypique déplacerait la moyenne au point de la rendre
      // trompeuse.
      medianeAns: mediane(valeurs),
      maxiAns: Math.max(...valeurs),
    })).sort((a, b) => b.medianeAns - a.medianeAns),
  });
});

/** Flux migratoires : d'où viennent les sportifs, où vont-ils. */
analyses.get('/flux', async (c) => {
  const r = await c.env.DB.prepare(
    `SELECT ud.nom AS depart, ua.nom AS arrivee, COUNT(*) AS n
     FROM v_parcours p
     JOIN unites_admin ud ON ud.id = p.unite_depart
     JOIN unites_admin ua ON ua.id = p.unite_actuelle
     WHERE p.a_migre = 1
     GROUP BY ud.nom, ua.nom ORDER BY n DESC`,
  ).all();
  return c.json({ flux: r.results });
});

/** Réseau de recommandation entre encadrants et structures d'accueil. */
analyses.get('/reseau', async (c) => {
  const r = await c.env.DB.prepare(
    `SELECT pe.id AS agent_id, pe.nom AS recommandant,
            st.nom AS destination, u.nom AS territoire, rr.n
     FROM v_reseau_recommandation rr
     JOIN personnes pe ON pe.id = rr.recommandant
     LEFT JOIN structures st ON st.id = rr.structure_destination
     LEFT JOIN unites_admin u ON u.id = rr.unite_destination
     ORDER BY rr.n DESC`,
  ).all();
  return c.json({ liens: r.results });
});

/** Déperdition : répartition des motifs d'interruption. */
analyses.get('/deperdition', async (c) => {
  const r = await c.env.DB.prepare(
    `SELECT motif_fin, COUNT(*) AS n FROM etapes
     WHERE motif_fin IS NOT NULL AND motif_fin <> 'progression'
     GROUP BY motif_fin ORDER BY n DESC`,
  ).all();
  const actifs = await c.env.DB.prepare(
    `SELECT statut, COUNT(*) AS n FROM sportifs GROUP BY statut`,
  ).all();
  return c.json({ motifs: r.results, statuts: actifs.results });
});

/**
 * Structures à proximité d'un point.
 *
 * Présélection par encadrement rectangulaire, puis distance exacte calculée
 * sur la liste réduite. Le calcul reste côté application afin de ne dépendre
 * d'aucune fonction mathématique particulière de la base.
 */
analyses.get('/structures-proches', async (c) => {
  const lat = Number(c.req.query('lat'));
  const lon = Number(c.req.query('lon'));
  const rayon = Math.min(Number(c.req.query('rayon') ?? 25), 500);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return c.json({ erreur: 'Position invalide.' }, 400);
  }

  // Un degré de latitude vaut environ 111 km ; en longitude, cette distance
  // se resserre vers les pôles, d'où la correction par le cosinus.
  const dLat = rayon / 111;
  const dLon = rayon / (111 * Math.cos(lat * Math.PI / 180));

  const r = await c.env.DB.prepare(
    `SELECT st.id, st.nom, st.lat, st.lon, ts.nom AS type, u.nom AS territoire
     FROM structures st
     JOIN types_structure ts ON ts.id = st.type_id
     JOIN unites_admin u ON u.id = st.unite_id
     WHERE st.lat BETWEEN ? AND ? AND st.lon BETWEEN ? AND ?`,
  ).bind(lat - dLat, lat + dLat, lon - dLon, lon + dLon).all();

  const proches = (r.results as any[])
    .map((s) => ({ ...s, km: Math.round(distanceKm(lat, lon, s.lat, s.lon) * 10) / 10 }))
    .filter((s) => s.km <= rayon)
    .sort((a, b) => a.km - b.km);

  return c.json({ structures: proches, rayon });
});

function mediane(valeurs: number[]): number {
  const t = [...valeurs].sort((a, b) => a - b);
  const m = Math.floor(t.length / 2);
  return t.length % 2 ? t[m] : Math.round(((t[m - 1] + t[m]) / 2) * 10) / 10;
}
