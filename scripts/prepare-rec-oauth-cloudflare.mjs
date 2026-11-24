// Archive de préparation uniquement : ne crée ni ne publie de service Cloudflare.
import { createHash } from 'node:crypto';
import { lstatSync, readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
export const allowedPages = Object.freeze(['index.html', 'confidentialite.html', 'conditions.html']);
const forbidden = /<\s*(?:script|form|iframe|object|embed)\b|\bon\w+\s*=|\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|serviceWorker|localStorage|sessionStorage|indexedDB)\b|\b(?:client_secret|refresh_token|access_token|private_key)\b/i;

export function validatePages(source) {
  if (!lstatSync(source).isDirectory() || lstatSync(source).isSymbolicLink())
    throw new Error('Source non ordinaire.');
  const names = readdirSync(source).filter((name) => name.endsWith('.html')).sort();
  if (JSON.stringify(names) !== JSON.stringify([...allowedPages].sort()))
    throw new Error('Liste des pages différente de la liste autorisée.');
  return allowedPages.map((name) => {
    const path = join(source, name);
    if (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink())
      throw new Error('Fichier non ordinaire : ' + name);
    const bytes = readFileSync(path);
    const html = bytes.toString('utf8');
    if (!html.includes('lang="fr"') || !html.includes('<title>') || forbidden.test(html))
      throw new Error('Page HTML non conforme : ' + name);
    for (const href of ['index.html', 'confidentialite.html', 'conditions.html']) {
      if (!html.includes('href="' + href + '"'))
        throw new Error('Lien de navigation manquant : ' + name + ' / ' + href);
    }
    if (/\b(?:src|href)\s*=\s*["']\s*(?:https?:|\/\/)/i.test(html))
      throw new Error('Ressource externe interdite : ' + name);
    return { name, bytes, sha256: createHash('sha256').update(bytes).digest('hex') };
  });
}

export function prepareRecOauthCloudflare({
  source = resolve(root, 'docs/rec/oauth-public'),
  target = resolve(root, 'work/rec-oauth-cloudflare'),
} = {}) {
  const files = validatePages(source);
  // Une balise explicite empêche de confondre ce ZIP avec une publication approuvée.
  mkdirSync(target, { recursive: false });
  for (const file of files) writeFileSync(join(target, file.name), file.bytes, { flag: 'wx' });
  writeFileSync(join(target, 'PREPARATION_NON_PUBLIABLE.txt'),
    'Brouillon REC. Ne pas publier : identité du responsable, durées de conservation et domaine Google à valider.\n',
    { flag: 'wx' });
  return files.map(({ name, sha256, bytes }) => ({ name, sha256, size: bytes.length }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  mkdirSync(resolve(root, 'work'), { recursive: true });
  const report = prepareRecOauthCloudflare();
  console.log('Paquet de préparation : work/rec-oauth-cloudflare/ (NON PUBLIABLE)');
  console.log(JSON.stringify(report, null, 2));
}
