import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reconcile,reconciliationGate,reconciliationFetcher,ARCHIVE} from '../../scripts/rec-automation/reconcile-version.mjs';
import {TAG} from '../../scripts/rec-automation/diagnose-version.mjs';
import {setup,candidate,deployment,policy,clone} from './helpers.mjs';
import {digest} from '../../scripts/rec-automation/validation.mjs';
function fixture() {
 const c=candidate(),d=deployment();d.deploymentConfig.description='REC '+c.sourceSha+' '+TAG;
 const f=setup({head:c,deployments:[d]});f.versions.set(1,{files:clone(c.files)});
 const b={schema:1,kind:'backup',tag:'backup-fictif',targetHash:policy.pins.scriptHash,sheetHash:policy.pins.sheetHash,account:policy.email,content:{files:clone(c.files)},headHash:c.contentHash,deployments:[]};
 const p={schema:1,kind:'operation',tag:TAG,status:'pending',operation:'deploy',sourceSha:c.sourceSha,desiredHash:c.contentHash,targetHash:policy.pins.scriptHash,account:policy.email,checkpoint:{tag:b.tag,hash:digest(b)},headBeforeHash:b.headHash,deploymentsBefore:[],intentHash:'f'.repeat(64)};
 f.records.set('backup:'+b.tag,clone(b));f.records.set('operation:'+TAG,clone(p));
 return {...f,policy,expectedHash:c.contentHash,sourceSha:c.sourceSha,deploymentHash:digest(d.deploymentId),operationHash:digest(p),p,b};
}
function intact(f) {
 assert.deepEqual(f.writes,[]);assert.deepEqual(f.records.get('backup:'+f.b.tag),f.b);
 assert.equal(f.versions.size,1);assert.equal(f.getDeployments().length,1);
 assert.equal(f.headHash(),f.expectedHash);
}
test('réconciliation du reçu uniquement et rejeu idempotent',async()=>{
 const f=fixture(),before=clone(f.getDeployments());
 const r=await reconcile(f);assert.equal(r.status,'reconciled');assert.equal(r.replayed,false);
 assert.deepEqual(f.records.get('backup:'+ARCHIVE).originalOperation,f.p);
 assert.equal(f.records.get('operation:'+TAG).status,'done');
 const originalArchive=clone(f.records.get('backup:'+ARCHIVE));
 const again=await reconcile(f);assert.equal(again.replayed,true);
 assert.deepEqual(f.records.get('backup:'+ARCHIVE),originalArchive);assert.deepEqual(f.getDeployments(),before);intact(f);
});
for(const phase of ['beforeArchive','afterArchive','beforeUpdate','afterUpdate'])test('interruption '+phase+' puis reprise sans doublon',async()=>{
 const f=fixture(),originalCreate=f.store.create,originalUpdate=f.store.update;let failed=false;
 f.store.create=async(...args)=>{
  if(!failed && phase==='beforeArchive'){failed=true;throw Error('INTERRUPTION');}
  const r=await originalCreate(...args);
  if(!failed && phase==='afterArchive'){failed=true;throw Error('RESPONSE_LOST');}return r;
 };
 f.store.update=async(...args)=>{
  if(!failed && phase==='beforeUpdate'){failed=true;throw Error('INTERRUPTION');}
  const r=await originalUpdate(...args);
  if(!failed && phase==='afterUpdate'){failed=true;throw Error('RESPONSE_LOST');}return r;
 };
 await assert.rejects(()=>reconcile(f));intact(f);
 assert.equal((await reconcile(f)).status,'reconciled');
 assert.equal([...f.records.keys()].filter(k=>k==='backup:'+ARCHIVE).length,1);intact(f);
});
test('preuves incorrectes refusées avant écriture',async()=>{
 for(const mode of ['hash','backup','deployment','head','otherPending']) {
  const f=fixture();
  if(mode==='hash')f.operationHash='0'.repeat(64);
  if(mode==='backup')f.records.get('backup:'+f.b.tag).account='autre@example.invalid';
  if(mode==='deployment')f.deploymentHash='0'.repeat(64);
  if(mode==='head')f.setContent(candidate('function changed(){}'));
  if(mode==='otherPending')f.records.set('operation:autre',{...clone(f.p),tag:'operation-autre'});
  await assert.rejects(()=>reconcile(f));assert.equal(f.calls.some(c=>['createRecord','updateRecord'].includes(c.name)),false);
 }
});
test('changement concurrent de reçu après sauvegarde interdit la finalisation',async()=>{
 const f=fixture(),create=f.store.create;
 f.store.create=async(...args)=>{const r=await create(...args);f.records.get('operation:'+TAG).intentHash='0'.repeat(64);return r;};
 await assert.rejects(()=>reconcile(f));assert.equal(f.records.get('operation:'+TAG).status,'pending');intact(f);
});
test('archive altérée ou reçu done étranger refusés',async()=>{
 for(const mode of ['archive','done']) {
  const f=fixture();await reconcile(f);
  if(mode==='archive')f.records.get('backup:'+ARCHIVE).originalOperation.intentHash='0'.repeat(64);
  else f.records.get('operation:'+TAG).result.versionNumber=2;
  await assert.rejects(()=>reconcile(f));intact(f);
 }
});
test('barrière HTTP : aucun changement Apps Script ou fichier Drive étranger',async()=>{
 let n=0;const fetcher=reconciliationFetcher({fetcher:async()=>{n++;},operationId:()=> 'receipt-fictif'});
 for(const method of ['POST','PUT','PATCH','DELETE'])assert.throws(()=>fetcher('https://script.googleapis.com/v1/projects/fictif/deployments',{method}),/RECONCILIATION_WRITE_REFUSED/);
 assert.throws(()=>fetcher('https://www.googleapis.com/upload/drive/v3/files/autre?uploadType=multipart',{method:'PATCH'}));
 assert.throws(()=>fetcher('https://www.googleapis.com/drive/v3/files/receipt-fictif',{method:'DELETE'}));
 await fetcher('https://www.googleapis.com/upload/drive/v3/files/receipt-fictif?uploadType=multipart',{method:'PATCH'});assert.equal(n,1);
});
test('gates explicites et workflow manuel protégé',()=>{
 const env={REC_AUTOMATION_ENABLED:'true',REC_MUTATIONS_ENABLED:'true',REC_RECONCILE_CONFIRMED:'true'};
 reconciliationGate(env);for(const key of Object.keys(env))assert.throws(()=>reconciliationGate({...env,[key]:'false'}));
 const s=readFileSync('.github/workflows/rec-reconcile-version-1.yml','utf8');
 assert.match(s,/on:\n  workflow_dispatch:/);assert.doesNotMatch(s,/push:|pull_request:|schedule:|workflow_call:/);
 assert.match(s,/environment: REC/);assert.match(s,/needs: tests/);assert.match(s,/group: apps-script-rec/);
 assert.equal((s.match(/github.ref == 'refs\/heads\/main'/g)||[]).length,2);
 assert.match(s,/REC_GOOGLE_OAUTH: \$\{\{ secrets.REC_GOOGLE_OAUTH \}\}/);
 assert.doesNotMatch(s,/cli\.mjs|contents: write|gh secret|createDeployment/);
});
test('échec de relecture après PATCH puis reprise du reçu finalisé',async()=>{
 const f=fixture(),read=f.store.read;let failed=false;
 f.store.read=async(...args)=>{const r=await read(...args);if(!failed && args[0]==='operation' && r?.value.status==='done'){failed=true;throw Error('READ_INTERRUPTED');}return r;};
 await assert.rejects(()=>reconcile(f));assert.equal(f.records.get('operation:'+TAG).status,'done');
 assert.equal((await reconcile(f)).replayed,true);intact(f);
});
test('changement des sources après archive arrête la finalisation',async()=>{
 const f=fixture(),create=f.store.create;
 f.store.create=async(...args)=>{const r=await create(...args);f.setContent(candidate('function concurrent(){}'));return r;};
 await assert.rejects(()=>reconcile(f));assert.equal(f.records.get('operation:'+TAG).status,'pending');assert.deepEqual(f.writes,[]);
});
