/**
 * Élève un compte existant au rôle d'administrateur.
 *
 * Le mot de passe n'est jamais manipulé ici : il a été haché par le service
 * lui-même, avec le sel de production, au moment de l'inscription. Tenter de
 * produire ce hachage depuis un poste de travail obligerait à y recopier le
 * sel de production, ce qui est précisément ce qu'on cherche à éviter.
 *
 * Usage :
 *   node scripts/promouvoir-admin.mjs adresse@exemple.cm            (distant)
 *   node scripts/promouvoir-admin.mjs adresse@exemple.cm --local
 */
import { spawnSync } from 'node:child_process';

const email = (process.argv[2] ?? '').trim().toLowerCase();
const local = process.argv.includes('--local');

if (!email || !email.includes('@')) {
  console.error('Indiquez l\'adresse du compte à élever.');
  console.error('  node scripts/promouvoir-admin.mjs adresse@exemple.cm');
  process.exit(1);
}

// L'apostrophe est doublée : une adresse en contenant une couperait la
// requête en deux et la ferait échouer, voire pire.
const sur = email.replace(/'/g, "''");
const portee = local ? '--local' : '--remote';

function executer(sql) {
  // Wrangler est appelé par son fichier plutôt que par la commande npx :
  // sous Windows, npx n'est pas toujours résoluble depuis un script.
  const r = spawnSync(
    process.execPath,
    ['node_modules/wrangler/bin/wrangler.js', 'd1', 'execute', 'talentstrack',
     portee, '--yes', '--command', sql],
    { encoding: 'utf8' },
  );
  if (r.status !== 0) {
    console.error((r.stderr || r.stdout || '').trim());
    process.exit(1);
  }
  return r.stdout;
}

const avant = executer(
  `SELECT id, nom, email, role, actif FROM personnes WHERE email = '${sur}'`,
);

if (!avant.includes(email)) {
  console.error(`Aucun compte avec l'adresse ${email}.`);
  console.error('Créez-le d\'abord depuis la page d\'inscription du site.');
  process.exit(1);
}

executer(`UPDATE personnes SET role = 'admin', actif = 1 WHERE email = '${sur}'`);

const apres = executer(
  `SELECT nom, email, role FROM personnes WHERE email = '${sur}'`,
);
console.log(apres.trim());
console.log(`\n${email} est désormais administrateur.`);
console.log('Rechargez la page du site : le rôle est relu à chaque requête,');
console.log('aucune reconnexion n\'est nécessaire.');
