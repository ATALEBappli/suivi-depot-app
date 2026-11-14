// Simulation locale exclusivement. Sorties nominatives seulement dans work/ ignoré par Git.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,sep} from 'node:path';
import {spawnSync} from 'node:child_process';
import vm from 'node:vm';
const [input,output='work/us-015-import',stateFile]=process.argv.slice(2);
if(!input)throw Error('Usage : node scripts/prepare-referentiel-v2.mjs source.xlsx|csv|json [work/dossier-sortie] [etat-v2.json]');
if(!resolve(output).startsWith(resolve('work')+sep))throw Error('Les sorties privées doivent rester dans work/.');
const parsed=spawnSync('python3',['scripts/read-referentiel.py',input],{encoding:'utf8',maxBuffer:10*1024*1024});
if(parsed.status!==0)throw Error(parsed.stderr || 'Lecture impossible');
const context=vm.createContext({});vm.runInContext(readFileSync('apps-script/src/ReferentielV2.gs','utf8'),context);
const model=vm.runInContext('ReferentielV2',context),rows=model.normalize(JSON.parse(parsed.stdout));
const state=stateFile?JSON.parse(readFileSync(stateFile,'utf8')):model.empty();
const report={mode:'simulation_locale_sans_google',cible:stateFile?'export_local_fourni':'referentiel_local_vide',date:new Date().toISOString(),...model.simulate(state,rows,new Date().toISOString().slice(0,10)),datesInitiales:null,cautionsInitiales:null};
mkdirSync(output,{recursive:true});
writeFileSync(output+'/lignes.json',JSON.stringify(rows,null,2)+'\n');writeFileSync(output+'/rapport.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({sortie:output,total:report.total,creations:report.creations,identiques:report.identiques,conflits:report.conflits,transactionsCreees:0}));
if(report.conflits)process.exitCode=2;
