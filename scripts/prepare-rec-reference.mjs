// Synchronise seulement le sous-dossier référentiel ; jamais les écrans finance.
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const out=resolve(process.argv[2] || 'work/rec-reference');mkdirSync(out,{recursive:true});
for(const file of ['referentiel-v2.css','referentiel-v2.js','referentiel-v2-import.js'])writeFileSync(out+'/'+file,readFileSync(file));
writeFileSync(out+'/referentiel-v2-model.js',readFileSync('apps-script/src/ReferentielV2.gs'));
let html=readFileSync('referentiel-v2.html','utf8');
html=html.replace('<meta charset="utf-8">',`<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'; worker-src 'none'">`);
html=html.replace('<script src="referentiel-v2-model.js">','<script src="transport.js"></script><script src="referentiel-v2-model.js">');
writeFileSync(out+'/index.html',html);
writeFileSync(out+'/transport.js',`// Aucun accès Google direct ; session gérée par l'application parente.\nwindow.recReferenceRequest=body=>{\n if(window.parent===window || typeof window.parent.recReferenceRequest!=='function')return Promise.reject(Error('Ouvrir Paramétrage depuis l’application REC authentifiée.'));\n return window.parent.recReferenceRequest(body);\n};\n`);
console.log('Référentiel REC préparé, aucune publication.');
