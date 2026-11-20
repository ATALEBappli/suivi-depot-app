// Préparation locale seulement : export Git approuvé + validation de tous les assets.
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,cpSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {hex} from '../rec-server/security.mjs';
import {site} from '../rec-server/site.mjs';
const [checkout,sha]=process.argv.slice(2),here=fileURLToPath(new URL('.',import.meta.url)),out=resolve(here,'../rec-server/public');
if(!checkout || !/^[a-f0-9]{40}$/.test(sha || ''))throw Error('Checkout frontend et SHA complet approuvé requis.');
execFileSync(process.execPath,['scripts/prepare-cloud-run-site.mjs',sha,out],{cwd:resolve(checkout),stdio:'inherit'});

const manifest=JSON.parse(readFileSync(out+'/manifest.json'));
cpSync(resolve(here,'../rec-local'),out+'/local',{recursive:true});
for(const path of ['local/index.html','local/app.mjs','local/style.css'])manifest.files.push({path,sha256:hex(readFileSync(out+'/'+path))});
writeFileSync(out+'/manifest.json',JSON.stringify(manifest,null,2)+'\n');
site(out,'https://rec-fictif.compte-fictif.workers.dev');
writeFileSync(here+'generated-manifest.mjs','// Généré localement, aucun secret.\nexport default '+JSON.stringify(manifest)+';\n');
console.log('Frontend vérifié et configuration Workers préparée ; aucun service créé.');
