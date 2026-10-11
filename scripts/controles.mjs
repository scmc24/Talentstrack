/**
 * Lance tous les contrôles du projet.
 * À exécuter avant chaque livraison.
 */
import { spawnSync } from 'node:child_process';

const controles = [
  ['Schéma et analyses', ['scripts/test-schema.mjs']],
  ['API de bout en bout', ['--experimental-strip-types', 'scripts/test-api.ts']],
];

let echoue = false;

// Vérification de types du code applicatif. Elle passe par npx et non par
// node, d'où son traitement à part.
{
  process.stdout.write('\n── Types du code applicatif\n');
  const r = spawnSync('npx', ['tsc', '--noEmit'], { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
  const sortie = (r.stdout + r.stderr).trim();
  console.log(sortie || 'Aucune erreur de type.');
  if (r.status !== 0) echoue = true;
}

for (const [intitule, args] of controles) {
  process.stdout.write(`\n── ${intitule}\n`);
  const r = spawnSync(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
  const sortie = (r.stdout + r.stderr)
    .split('\n')
    .filter((l) => !/ExperimentalWarning|trace-warnings/.test(l))
    .join('\n').trim();
  if (sortie) console.log(sortie);
  if (r.status !== 0) echoue = true;
}

console.log(echoue ? '\nAu moins un contrôle a échoué.' : '\nTous les contrôles passent.');
process.exit(echoue ? 1 : 0);
