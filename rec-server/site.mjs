// Aucun répertoire arbitraire : seuls les assets du manifeste public vérifié sont servis.
import {readFileSync,lstatSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {hex,requireThat} from './security.mjs';
const required=['index.html','styles.css','app.mjs','model.mjs','finance-data.mjs','finance-model.mjs','finance-view.mjs','rec-client.mjs','referentiel/index.html','referentiel/transport.js','referentiel/referentiel-v2-model.js','referentiel/referentiel-v2-import.js','referentiel/referentiel-v2.js','referentiel/referentiel-v2.css'];
const allowed=p=>required.includes(p) || ['local/index.html','local/app.mjs','local/style.css'].includes(p) || ['location-entry.mjs','location-entry-view.mjs','rec-test-summary.mjs','rec-test-summary-view.mjs'].includes(p) || /^assets\/[A-Za-z0-9_-]+\.(svg|woff2|txt|md)$/.test(p);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.woff2':'font/woff2','.txt':'text/plain','.md':'text/plain'};
export function site(directory,base) {
 const root=resolve(directory),manifest=JSON.parse(readFileSync(root+'/manifest.json','utf8'));
 requireThat(manifest.schema===1 && manifest.repository==='ATALEBappli/suivi-depot-demo' && /^[a-f0-9]{40}$/.test(manifest.sourceSha) && Array.isArray(manifest.files) && manifest.files.length<=40,'INVALID_FRONTEND_MANIFEST');
 const assets=new Map();let total=0;
 for(const f of manifest.files){
  requireThat(typeof f.path==='string' && allowed(f.path) && !assets.has('/'+f.path) && /^[a-f0-9]{64}$/.test(f.sha256),'INVALID_FRONTEND_ASSET');
  const file=root+'/'+f.path;requireThat(!lstatSync(file).isSymbolicLink() && lstatSync(file).isFile(),'UNSAFE_FRONTEND_ASSET');
  const bytes=readFileSync(file);total+=bytes.length;requireThat(total<10000000 && bytes.length<2000000 && hex(bytes)===f.sha256,'FRONTEND_ASSET_CHANGED');
  assets.set('/'+f.path,bytes);
 }
 requireThat(required.every(p=>assets.has('/'+p)),'MISSING_FRONTEND_ASSET');
 return (path,res)=>{
  if(path==='/rec-config.mjs'){
   res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8'});res.end('export default Object.freeze('+JSON.stringify({apiBase:base})+');');return true;
  }
  const key=path==='/'?'/index.html':path,bytes=assets.get(key);if(!bytes)return false;
  res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self'; frame-src 'self'; connect-src 'self'; form-action 'none'; base-uri 'none'; object-src 'none'; worker-src 'none'; frame-ancestors "+(key==='/referentiel/index.html'?"'self'":"'none'"));
  res.writeHead(200,{'Content-Type':mime[extname(key)]});res.end(bytes);return true;
 };
}
