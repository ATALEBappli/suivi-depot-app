// Préparation locale uniquement : aucun réseau, sous-processus, OAuth ou envoi.
import { readFileSync, readdirSync, lstatSync, realpathSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve, relative, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fail = code => { throw new Error(code); };
const hash = value => createHash('sha256').update(value).digest('hex');
function inside(parent, path) {
  const rel = relative(parent, path);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}
function privateFile(path, repo) {
  if (!isAbsolute(path)) fail('CHEMIN_ABSOLU_REQUIS');
  if (inside(repo, realpathSync(path))) fail('CONFIG_PRIVEE_DANS_DEPOT');
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) fail('FICHIER_PRIVE_INVALIDE');
  if (stat.mode & 0o077) fail('PERMISSIONS_PRIVEES_REQUISES');
  return readFileSync(path, 'utf8');
}
function keys(object, expected) {
  if (!object || typeof object !== 'object' || Array.isArray(object) ||
      Object.keys(object).sort().join() !== [...expected].sort().join()) fail('SCHEMA_INVALIDE');
}
export function prepare({ policy, binding, metadata, backup, out }, repo = root) {
  repo = realpathSync(repo);
  const p = JSON.parse(privateFile(policy, repo));
  const b = JSON.parse(privateFile(binding, repo));
  const m = JSON.parse(privateFile(metadata, repo));
  const raw = privateFile(backup, repo), snapshot = JSON.parse(raw);
  keys(p, ['environment', 'scriptId', 'title']);
  keys(b, ['scriptId', 'rootDir']);
  if (p.environment !== 'REC' || p.title !== 'SuiviDepotAPI-REC' ||
      typeof p.scriptId !== 'string' || !/^[\w-]{20,}$/.test(p.scriptId)) fail('POLITIQUE_REC_INVALIDE');
  if (b.scriptId !== p.scriptId || m.scriptId !== p.scriptId || snapshot.scriptId !== p.scriptId ||
      m.title !== p.title || m.parentId) fail('CIBLE_REC_INCOHERENTE');
  if (!isAbsolute(out) || resolve(out) !== out) fail('SORTIE_ABSOLUE_REQUISE');
  // Le parent doit exister ; sa résolution empêche une sortie via lien vers le dépôt.
  const parent = realpathSync(dirname(out));
  if (inside(repo, parent) || parent !== dirname(out) || (lstatSync(parent).mode & 0o077)) fail('SORTIE_PRIVEE_REQUISE');
  if (b.rootDir !== join(out, 'src')) fail('RACINE_LIAISON_INVALIDE');
  if (!Array.isArray(snapshot.files) || !snapshot.files.length) fail('SAUVEGARDE_INCOMPLETE');
  const seen = new Set();
  for (const file of snapshot.files) {
    if (!file || typeof file.name !== 'string' || !/^[\w/-]+$/.test(file.name) ||
        !['SERVER_JS', 'HTML', 'JSON'].includes(file.type) || typeof file.source !== 'string' ||
        seen.has(file.name)) fail('SAUVEGARDE_INVALIDE');
    seen.add(file.name);
  }
  const manifest = snapshot.files.find(f => f.name === 'appsscript' && f.type === 'JSON');
  if (!manifest || !JSON.parse(manifest.source).runtimeVersion) fail('MANIFESTE_DISTANT_ABSENT');
  const source = join(repo, 'apps-script/src');
  const entries = readdirSync(source).sort();
  if (entries.join() !== ['Code.gs', 'README.md', 'appsscript.json'].sort().join()) fail('INVENTAIRE_SOURCE_INATTENDU');
  const files = {};
  for (const name of ['Code.gs', 'appsscript.json']) {
    const path = join(source, name);
    if (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) fail('SOURCE_INVALIDE');
    files[name] = readFileSync(path, 'utf8');
    if (!files[name].trim()) fail('SOURCE_VIDE');
  }
  if (JSON.parse(files['appsscript.json']).runtimeVersion !== 'V8') fail('MANIFESTE_SOURCE_INVALIDE');
  // mkdir sans recursive refuse une sortie existante : aucune sauvegarde écrasée.
  mkdirSync(out, { mode: 0o700 });
  const save = (path, data) => writeFileSync(join(out, path), data, { mode: 0o600, flag: 'wx' });
  save('remote-backup.json', raw);
  save('remote-metadata.json', JSON.stringify(m, null, 2));
  mkdirSync(join(out, 'src'), { mode: 0o700 });
  for (const [name, content] of Object.entries(files)) save(`src/${name}`, content);
  save('.clasp.json', JSON.stringify(b, null, 2));
  const report = {
    environment: 'REC', state: 'STOP_BEFORE_PUSH', preparedAt: new Date().toISOString(),
    backupSha256: hash(raw), sourceSha256: Object.fromEntries(Object.entries(files).map(([n, s]) => [n, hash(s)])),
    targetFingerprint: hash(p.scriptId),
    warning: 'Preuve locale uniquement. Compte, fraîcheur distante, propriété Sheets et accord humain à vérifier séparément.'
  };
  save('review.json', JSON.stringify(report, null, 2));
  return report;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2), options = {};
    if (args.length !== 10) fail('USAGE: --policy PATH --binding PATH --metadata PATH --backup PATH --out PATH');
    for (let i = 0; i < args.length; i += 2) {
      const key = args[i].slice(2);
      if (!args[i].startsWith('--') || !['policy', 'binding', 'metadata', 'backup', 'out'].includes(key) || options[key]) fail('ARGUMENT_INVALIDE');
      options[key] = args[i + 1];
    }
    prepare(options);
    console.log('REC : dossier de revue préparé. ARRÊT OBLIGATOIRE AVANT ENVOI. Aucun envoi exécuté.');
  } catch (error) {
    // Ne pas imprimer chemins privés, contenus JSON, identifiants ou messages système.
    console.error('Préparation refusée :', /^[A-Z_]+$/.test(error.message) ? error.message : 'ENTREE_OU_SORTIE_INVALIDE');
    process.exitCode = 1;
  }
}
