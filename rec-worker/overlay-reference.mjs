// Remplace explicitement le seul sous-dossier référentiel du frontend figé.
// Aucun écran financier ni donnée REC n'est lu ou modifié.
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {hex,requireThat} from '../rec-server/security.mjs';

const repo=fileURLToPath(new URL('../',import.meta.url));
const names=['index.html','transport.js','referentiel-v2-model.js','referentiel-v2-import.js','referentiel-v2.js','referentiel-v2.css'];
export function overlayReference(publicDirectory,{generate=true}={}) {
 const dir=resolve(publicDirectory),manifestPath=dir+'/manifest.json';
 const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
 requireThat(manifest.repository==='ATALEBappli/suivi-depot-demo' && Array.isArray(manifest.files),'INVALID_FRONTEND_MANIFEST');
 const paths=names.map(name=>'referentiel/'+name);
 requireThat(paths.every(path=>manifest.files.filter(file=>file.path===path).length===1),'MISSING_FRONTEND_ASSET');
 if(generate)execFileSync(process.execPath,['scripts/prepare-rec-reference.mjs',dir+'/referentiel'],{cwd:repo,stdio:'ignore'});
 const sources=Object.fromEntries(paths.map(path=>[path,readFileSync(dir+'/'+path)]));
 requireThat(sources['referentiel/index.html'].includes('id="migration-preview"') && sources['referentiel/index.html'].includes('id="migration-confirm"'),'V2_MIGRATION_UI_MISSING');
 requireThat(sources['referentiel/referentiel-v2.js'].includes("action:'v2.simulate'") && sources['referentiel/referentiel-v2.js'].includes("action:'v2.import'") && sources['referentiel/referentiel-v2.js'].includes("action:'rec.reference'"),'V2_MIGRATION_UI_MISSING');
 requireThat(sources['referentiel/index.html'].indexOf('<h2>Locataires</h2>')<sources['referentiel/index.html'].indexOf('<h2>Logements</h2>'),'V2_MIGRATION_UI_MISSING');
 manifest.files=manifest.files.map(file=>paths.includes(file.path)?{...file,sha256:hex(sources[file.path])}:file);
 writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
 return {files:paths.length,migrationPreview:true};
}
