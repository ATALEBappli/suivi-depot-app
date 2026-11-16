import test from 'node:test';
import assert from 'node:assert/strict';
import {diagnose,readOnlyFetcher,TAG} from '../../scripts/rec-automation/diagnose-version.mjs';
import {setup,candidate,deployment,policy} from './helpers.mjs';
import {digest,contentHash} from '../../scripts/rec-automation/validation.mjs';
function fixture() {
 const c=candidate(),d=deployment();d.deploymentConfig.description='REC '+c.sourceSha+' '+TAG;
 const f=setup({head:c,deployments:[d]});
 const original=f.api.getContent;f.api.getContent=v=>v?Promise.resolve({scriptId:policy.scriptId,files:c.files}):original();
 const b={schema:1,kind:'backup',tag:'backup-fictif',targetHash:policy.pins.scriptHash,sheetHash:policy.pins.sheetHash,account:policy.email,content:{files:c.files},headHash:contentHash(c),deployments:[]};
 const p={schema:1,kind:'operation',tag:TAG,status:'pending',operation:'deploy',sourceSha:c.sourceSha,desiredHash:c.contentHash,targetHash:policy.pins.scriptHash,account:policy.email,checkpoint:{tag:b.tag,hash:digest(b)},headBeforeHash:b.headHash,deploymentsBefore:[]};
 const store={pending:async()=>[{value:p}],read:async kind=>({value:kind==='backup'?b:p})};
 return {api:f.api,store,policy,expectedHash:c.contentHash,sourceSha:c.sourceSha,b,p,writes:f.writes};
}
test('diagnostic version et sauvegarde sans écriture',async()=>{const f=fixture();const r=await diagnose(f);assert.equal(r.backupVerified,true);assert.deepEqual(f.writes,[]);assert.equal(f.p.status,'pending');});
test('contenu inattendu refusé',async()=>{const f=fixture();f.expectedHash='0'.repeat(64);await assert.rejects(()=>diagnose(f));assert.deepEqual(f.writes,[]);});
test('sauvegarde altérée refusée',async()=>{const f=fixture();f.b.account='intrus@example.invalid';await assert.rejects(()=>diagnose(f),/BACKUP_HASH_MISMATCH/);});
test('barrière HTTP refuse toutes les mutations métier avant réseau',async()=>{let n=0;const fetcher=readOnlyFetcher(async()=>{n++;});for(const method of ['POST','PUT','PATCH','DELETE'])assert.throws(()=>fetcher('https://script.googleapis.com/v1/projects/fictif',{method}),/DIAGNOSTIC_WRITE_REFUSED/);await fetcher('https://oauth2.googleapis.com/token',{method:'POST'});assert.equal(n,1);});

test('déploiement public refusé avant lecture de la sauvegarde',async()=>{
 const f=fixture();const list=await f.api.deployments();
 list[0].entryPoints[0].webApp.entryPointConfig.access='ANYONE_ANONYMOUS';
 f.api.deployments=async()=>list;
 await assert.rejects(()=>diagnose(f),/PUBLIC_DEPLOYMENT_REFUSED/);assert.deepEqual(f.writes,[]);
});
test('plusieurs déploiements ou mauvais projet refusés',async()=>{
 for(const mode of ['multiple','target']) {
  const f=fixture(),list=await f.api.deployments();
  if(mode==='multiple')list.push(deployment(2,'SECOND_DEPLOY_FICTIF_1234567890'));
  else list[0].deploymentConfig.scriptId='SCRIPT_PROD_FICTIF_1234567890';
  f.api.deployments=async()=>list;
  await assert.rejects(()=>diagnose(f),new RegExp(mode==='multiple'?'AMBIGUOUS_DEPLOYMENTS':'WRONG_DEPLOYMENT_TARGET'));
  assert.deepEqual(f.writes,[]);
 }
});
test('journal non pending refusé sans modification',async()=>{const f=fixture();f.p.status='done';await assert.rejects(()=>diagnose(f),/PENDING_MISMATCH/);assert.deepEqual(f.writes,[]);});
test('workflow exclusivement manuel, main, environnement REC et aucune commande de mutation',async()=>{
 const {readFileSync}=await import('node:fs');
 const s=readFileSync('.github/workflows/rec-diagnostic-version-1.yml','utf8');
 assert.match(s,/on:\n  workflow_dispatch:\n/);
 assert.doesNotMatch(s,/pull_request:|push:|schedule:|workflow_run:|workflow_call:/);
 assert.equal((s.match(/github.ref == 'refs\/heads\/main'/g)||[]).length,2);
 assert.match(s,/environment: REC/);assert.match(s,/group: apps-script-rec/);
 assert.match(s,/ref: \$\{\{ github.workflow_sha \}\}/);
 assert.match(s,/needs: tests/);assert.match(s,/contents: read/);
 assert.match(s,/REC_GOOGLE_OAUTH: \$\{\{ secrets.REC_GOOGLE_OAUTH \}\}/);
 assert.doesNotMatch(s,/cli\.mjs|REC_MUTATIONS_ENABLED|contents: write|id-token: write/);
 assert.match(s,/run: node scripts\/rec-automation\/diagnose-version.mjs/);
});
