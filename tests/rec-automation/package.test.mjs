import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {spawnSync,execFileSync} from 'node:child_process';
import {executionGate} from '../../scripts/rec-automation/cli.mjs';
import {packageCommit} from '../../scripts/rec-automation/package.mjs';
import {policyFromEnv,contentHash,digest} from '../../scripts/rec-automation/validation.mjs';
import {manifest,policy,metadata} from './helpers.mjs';
const sha='f'.repeat(40);
function source(overrides={},mode='100644') {
 const files={
  'apps-script/src/Code.gs':'throw new Error("SOURCE_MUST_NOT_EXECUTE");',
  'apps-script/src/ReferentielV2.gs':'var Modele = {};',
  'apps-script/src/ReferentielV2Api.gs':'function v2Client(){}',
  'apps-script/src/appsscript.json':JSON.stringify(manifest),
  'referentiel-v2.html':'<html><link rel="stylesheet" href="referentiel-v2.css"><script src="referentiel-v2.js"></script></html>',
  'referentiel-v2.css':'body {color:black}',
  'referentiel-v2.js':'throw new Error("SOURCE_MUST_NOT_EXECUTE");',...overrides};
 return (...args)=>{
  if(args[0]==='rev-parse')return sha+'\n';
  if(args[0]==='ls-tree'){const p=args.at(-1);return files[p]===undefined?'':mode+' blob '+('a'.repeat(40))+'\t'+p+'\n';}
  if(args[0]==='show')return files[args[1].slice(41)];throw Error('unexpected git');
 };
}
test('packaging data-only : JS compilé sans exécution et cinq fichiers seulement',()=>{
 const c=packageCommit(sha,source());assert.equal(c.files.length,5);assert.equal(c.contentHash,contentHash(c));assert.ok(c.files.find(f=>f.name==='ParametrageV2').source.includes('<style>'));
});
for(const [label,files,mode] of [
 ['symlink',{},'120000'],['JS invalide',{'referentiel-v2.js':'function {'},'100644'],
 ['ressource externe',{'referentiel-v2.html':'<script src="https://example.invalid"></script>'},'100644'],
 ['collision globale entre GS',{'apps-script/src/Code.gs':'const DOUBLON=1;','apps-script/src/ReferentielV2Api.gs':'const DOUBLON=2;'},'100644'],
 ['fermeture script injectée',{'referentiel-v2.js':'const x="</script>";'},'100644'],
 ['manifest public',{'apps-script/src/appsscript.json':JSON.stringify({...manifest,webapp:{access:'ANYONE'}})},'100644']
])test('packaging refuse '+label,()=>assert.throws(()=>packageCommit(sha,source(files,mode))));
test('source SHA non hexadécimale : aucune commande Git',()=>{
 let calls=0;assert.throws(()=>packageCommit('main;commande',()=>{calls++;}));assert.equal(calls,0);
});
test('packaging depuis un vrai commit Git fictif, sans dépendance à l’historique du checkout',()=>{
 const dir=mkdtempSync(join(tmpdir(),'rec-package-'));
 const git=(...args)=>execFileSync('git',args,{cwd:dir,encoding:'utf8'});
 try {
  git('init','-q');const getter=source();
  for(const path of ['apps-script/src/Code.gs','apps-script/src/ReferentielV2.gs','apps-script/src/ReferentielV2Api.gs','apps-script/src/appsscript.json','referentiel-v2.html','referentiel-v2.css','referentiel-v2.js']){
   mkdirSync(dirname(join(dir,path)),{recursive:true});writeFileSync(join(dir,path),getter('show',sha+':'+path));
  }
  git('add','.');git('-c','user.name=Fictif','-c','user.email=fictif@example.invalid','-c','commit.gpgsign=false','-c','core.hooksPath=/dev/null','commit','-qm','Fixture fictive');
  const real=git('rev-parse','HEAD').trim();assert.equal(packageCommit(real,git).files.length,5);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('cibles de test/PROD refusées par les empreintes de production du contrôleur',()=>{
 assert.throws(()=>policyFromEnv({REC_SCRIPT_ID:'SCRIPT_PROD_FICTIF_123456',REC_SHEET_ID:'SHEET_PROD_FICTIF_123456',REC_GOOGLE_EMAIL:'rec@example.invalid',REC_OWNER_EMAIL:'owner@example.invalid'}),/WRONG_SCRIPT_TARGET/);
});
test('CLI désactivée et mauvaise cible : aucun secret dans la sortie',()=>{
 for(const enabled of ['false','true']){
  const r=spawnSync(process.execPath,['scripts/rec-automation/cli.mjs','run'],{encoding:'utf8',env:{...process.env,
   REC_AUTOMATION_ENABLED:enabled,REC_OPERATION:'inspect',REC_SCRIPT_ID:'SCRIPT_PROD_FICTIF_123456',REC_SHEET_ID:'SHEET_PROD_FICTIF_123456',REC_GOOGLE_OAUTH:'PRIVATE_FAKE_CREDENTIAL'}});
  assert.notEqual(r.status,0);assert.ok(!r.stderr.includes('PRIVATE_FAKE'));assert.ok(!r.stdout.includes('PRIVATE_FAKE'));
  assert.match(r.stderr,enabled==='true'?/WRONG_SCRIPT_TARGET/:/AUTOMATION_DISABLED/);
 }
});
test('workflow : manuel, gate inactive par défaut, orchestrateur séparé et actions figées',()=>{
 const text=readFileSync('.github/workflows/rec-apps-script-manual.yml','utf8');
 assert.match(text,/on:\n  workflow_dispatch:/);assert.ok(!/\n  (push|pull_request|schedule|workflow_run|repository_dispatch):/.test(text));
 assert.match(text,/github.ref == 'refs\/heads\/main'/);assert.match(text,/vars.REC_AUTOMATION_ENABLED == 'true'/);
 assert.match(text,/environment: REC/);assert.match(text,/cancel-in-progress: false/);assert.match(text,/ref: \$\{\{ github.workflow_sha \}\}/);
 for(const match of text.matchAll(/uses:\s+([^\s#]+)/g))assert.match(match[1],/@[a-f0-9]{40}$/);
 assert.ok(!text.includes('pull_request_target'));assert.ok(!text.includes('id-token: write'));
 const privileged=text.split('  google:')[1];assert.ok(!privileged.includes('packageCommit'));assert.ok(!/npm |pip |curl /.test(privileged));
 assert.ok(!text.includes('REC_SCRIPT_ID: ${{ inputs.'));assert.ok(!text.includes('REC_SHEET_ID: ${{ inputs.'));
});

test('démarrage inspect seul : aucune mutation possible sans le second gate',()=>{
 const env={REC_AUTOMATION_ENABLED:'true',REC_OPERATION:'inspect'};assert.doesNotThrow(()=>executionGate(env));
 for(const operation of ['install','deploy','restore'])assert.throws(()=>executionGate({...env,REC_OPERATION:operation}),/MUTATIONS_DISABLED/);
});
test('gates explicites : mutations autorisées seulement après activation séparée',()=>{
 for(const operation of ['install','deploy','restore'])assert.doesNotThrow(()=>executionGate({REC_AUTOMATION_ENABLED:'true',REC_MUTATIONS_ENABLED:'true',REC_OPERATION:operation}));
 assert.throws(()=>executionGate({REC_AUTOMATION_ENABLED:'false',REC_MUTATIONS_ENABLED:'true',REC_OPERATION:'install'}),/AUTOMATION_DISABLED/);
});
