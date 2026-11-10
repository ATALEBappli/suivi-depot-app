import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ignored = new Set(['.git', 'node_modules', '.venv', 'venv']);
let checked = 0;

function check(source, label, module = false) {
  const result = spawnSync(process.execPath,
    ['--check', ...(module ? ['--input-type=module'] : [])],
    { input: source, encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    console.error(`ÉCHEC : ${label}`);
    console.error(result.error?.message || result.stderr);
    process.exitCode = 1;
  } else {
    console.log(`OK : ${label}`);
  }
  checked++;
}

function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory() && !ignored.has(entry.name)) walk(path);
    if (entry.isFile() && /\.(?:js|mjs|cjs|gs)$/.test(entry.name)) {
      check(readFileSync(path, 'utf8'), relative(root, path), entry.name.endsWith('.mjs'));
    }
  }
}

walk(root);
// Extraction adaptée aux balises simples du HTML actuel ; ce n’est pas un parseur HTML général.
const html = readFileSync(join(root, 'index.html'), 'utf8');
let inline = 0;
for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
  const attributes = match[1];
  if (/\bsrc\s*=/i.test(attributes)) continue;
  const type = attributes.match(/\btype\s*=\s*["']([^"']+)["']/i)?.[1];
  if (type && !['module', 'text/javascript', 'application/javascript'].includes(type)) continue;
  check(match[2], `index.html : script intégré ${++inline}`, type === 'module');
}
console.log(`${checked} sources analysées ; aucun JavaScript applicatif exécuté.`);
