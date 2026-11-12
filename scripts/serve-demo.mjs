// Sert exclusivement demo/ : impossible de charger le frontend historique ou les backends.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';
const root = fileURLToPath(new URL('../demo/', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.mjs': 'text/javascript', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = resolve(root, '.' + (path === '/' ? '/index.html' : path));
    if (!file.startsWith(root.endsWith(sep) ? root : root + sep) || !types[extname(file)]) throw Error();
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self'; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'; worker-src 'none'; frame-ancestors 'none'" });
    res.end(body);
  } catch { res.writeHead(404); res.end('Introuvable'); }
}).listen(Number(process.env.DEMO_PORT || 4173), process.env.DEMO_HOST || (process.argv.includes('--lan') ? '0.0.0.0' : '127.0.0.1'), () => {
  console.log('Prototype fictif : http://localhost:' + (process.env.DEMO_PORT || 4173));
});
