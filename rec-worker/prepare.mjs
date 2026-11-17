// Préparation locale seulement : export Git approuvé + validation de tous les assets.
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {site} from '../rec-server/site.mjs';
const [checkout,sha]=process.argv.slice(2),here=fileURLToPath(new URL('.',import.meta.url)),out=resolve(here,'../rec-server/public');
if(!checkout || !/^[a-f0-9]{40}$/.test(sha || ''))throw Error('Checkout frontend et SHA complet approuvé requis.');
execFileSync(process.execPath,['scripts/prepare-cloud-run-site.mjs',sha,out],{cwd:resolve(checkout),stdio:'inherit'});
site(out,'https://rec-fictif.compte-fictif.workers.dev');
const manifest=JSON.parse(readFileSync(out+'/manifest.json'));
writeFileSync(here+'generated-manifest.mjs','// Généré localement, aucun secret.\nexport default '+JSON.stringify(manifest)+';\n');
console.log('Frontend vérifié et configuration Workers préparée ; aucun service créé.');
