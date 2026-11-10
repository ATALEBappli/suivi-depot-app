import { readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function build(env = process.env, out = 'dist') {
  const mode = env.APP_ENV;
  if (!['REC', 'PROD'].includes(mode)) throw new Error('APP_ENV doit être REC ou PROD');
  const html = readFileSync('index.html', 'utf8');
  const historical = html.match(/window\.API_URL\s*=\s*"([^"]+)"/);
  if (!historical) throw new Error('Configuration historique introuvable');
  const pattern = /^https:\/\/script\.google\.com\/macros\/s\/([A-Za-z0-9_-]+)\/exec$/;
  const api = env[`${mode}_API_URL`] || '';
  if (api && !pattern.test(api)) throw new Error('URL API invalide (HTTPS /exec sans paramètres requis)');
  if (mode === 'REC' && api && pattern.exec(api)[1] === pattern.exec(historical[1])[1]) {
    throw new Error('REC ne peut pas cibler PROD');
  }
  if (mode === 'PROD' && !api) throw new Error('Configuration PROD obligatoire');
  // Une recette non configurée reste consultable mais ne peut émettre aucun appel API.
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const bootstrap = `(() => {
    const endpoint = ${JSON.stringify(api)};
    Object.defineProperty(window, 'API_URL', { value: endpoint, writable: false, configurable: false });
    Object.defineProperty(window, 'assertApiTarget', { value: function(value) {
      if (!endpoint) throw new Error('Configuration REC absente : appels API bloqués');
      const target = new URL(value);
      const expected = new URL(endpoint);
      if (target.origin !== expected.origin || target.pathname !== expected.pathname || target.username || target.password || target.hash) {
        throw new Error('Cible API non autorisée');
      }
    }, writable: false, configurable: false });
    document.addEventListener('DOMContentLoaded', () => {
      const banner = document.createElement('p');
      banner.textContent = ${JSON.stringify(mode)} + (endpoint ? '' : ' — Configuration REC absente : appels API bloqués');
      banner.setAttribute('role', 'status');
      document.body.prepend(banner);
    });
  })();`;
  let generated = html.replace(/<script>\s*\/\/ <<< REMPLACE[\s\S]*?<\/script>/, '<script src="environment.js"></script>');
  if (generated === html) throw new Error('Bloc configuration non remplacé');
  if (mode === 'REC') {
    generated = generated.replace(/<script>\s*if \("serviceWorker" in navigator\)[\s\S]*?<\/script>/, '');
    generated = generated.replace(/<link rel="manifest"[^>]*>/, '');
    if (/serviceWorker/.test(generated)) throw new Error('Service Worker REC détecté');
  }
  const app = readFileSync('app.js', 'utf8');
  const guarded = app.replace('return new Promise((resolve, reject) => {', 'return new Promise((resolve, reject) => {\n    window.assertApiTarget(url);');
  if (app === guarded) throw new Error('Point de contrôle JSONP introuvable');
  writeFileSync(`${out}/index.html`, generated);
  writeFileSync(`${out}/environment.js`, bootstrap);
  writeFileSync(`${out}/app.js`, guarded);
  copyFileSync('styles.css', `${out}/styles.css`);
  if (mode === 'PROD') {
    copyFileSync('sw.js', `${out}/sw.js`);
    copyFileSync('manifest.json', `${out}/manifest.json`);
  }
  writeFileSync(`${out}/_headers`, '/*\n  Cache-Control: no-store\n  X-Robots-Tag: noindex\n');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) build();
