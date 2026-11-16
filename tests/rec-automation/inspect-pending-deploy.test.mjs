import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectPendingDeploy} from '../../scripts/rec-automation/inspect-pending-deploy.mjs';
import {inspect} from '../../scripts/rec-automation/core.mjs';
import {setup,policy,candidate,deployment,clone} from './helpers.mjs';
import {digest,deploymentState} from '../../scripts/rec-automation/validation.mjs';
async function fixture(published=2) {
 const c=candidate('function current(){}'),old=candidate('function previous(){}'),tag='gha-43927899195';
 const previous=deployment(1),current=deployment(published);
 current.deploymentConfig.description=published===2?'REC '+c.sourceSha+' '+tag:'REC précédente';
 const f=setup({head:c,deployments:[current]});f.versions.set(1,{files:old.files});f.versions.set(2,{files:c.files});
 f.api.versions=async()=>[{scriptId:policy.scriptId,versionNumber:2,description:'REC '+c.sourceSha+' '+tag}];
 const b={schema:1,kind:'backup',tag:'backup-fictif',targetHash:policy.pins.scriptHash,sheetHash:policy.pins.sheetHash,account:policy.email,headHash:c.contentHash,content:{files:c.files},deployments:[previous]};
 const p={tag,status:'pending',operation:'deploy',sourceSha:c.sourceSha,desiredHash:c.contentHash,account:policy.email,targetHash:policy.pins.scriptHash,checkpoint:{tag:b.tag,hash:digest(b)},deploymentsBefore:deploymentState([previous],policy)};
 f.records.set('backup:'+b.tag,clone(b));f.records.set('operation:'+tag,clone(p));
 const expected={tag,sourceSha:c.sourceSha,hash:c.contentHash,backupTag:b.tag,backupHash:digest(b)};
 return {...f,policy:{...policy,deploymentId:current.deploymentId},expected,state:await inspect({api:f.api,policy}),pending:await f.store.pending()};
}
for(const [version,classification] of [[1,'previous_version_still_published'],[2,'new_version_published']])test('lecture de la version publiée '+version+' sans mutation',async()=>{
 const f=await fixture(version),before=clone([...f.records]);const r=await inspectPendingDeploy(f);
 assert.equal(r.classification,classification);assert.equal(r.createdVersion,2);assert.equal(r.publishedVersion,version);
 assert.equal(r.existingUrlUnchanged,true);assert.deepEqual([...f.records],before);assert.deepEqual(f.writes,[]);
});
test('version tierce non classée comme succès',async()=>{
 const f=await fixture(3);f.versions.set(3,{files:candidate('function third(){}').files});
 assert.equal((await inspectPendingDeploy(f)).classification,'unexpected_state');assert.deepEqual(f.writes,[]);
});
test('preuve sauvegarde, URL et version créée modifiées : arrêt',async()=>{
 for(const mode of ['backup','url','version','multiple']) {
  const f=await fixture();
  if(mode==='backup')f.expected.backupHash='0'.repeat(64);
  if(mode==='url')f.state.deployments[0].entryPoints[0].webApp.url='https://script.google.com/macros/s/OTHER_FICTIF/exec';
  if(mode==='version')f.versions.set(2,{files:candidate('function altered(){}').files});
  if(mode==='multiple')f.api.versions=async()=>[1,2].map(v=>({scriptId:policy.scriptId,versionNumber:v+1,description:'REC '+f.expected.sourceSha+' '+f.expected.tag}));
  await assert.rejects(()=>inspectPendingDeploy(f));assert.deepEqual(f.writes,[]);
 }
});

function rewriteFixtureBackup(f,mutate) {
 const key='backup:'+f.expected.backupTag,b=f.records.get(key);mutate(b);
 const hash=digest(b);f.expected.backupHash=hash;
 f.records.get('operation:'+f.expected.tag).checkpoint.hash=hash;
 f.pending[0].value.checkpoint.hash=hash;
}
for(const position of ['first','last'])test('HEAD non versionné '+position+' : comparaison du même périmètre',async()=>{
 const f=await fixture();rewriteFixtureBackup(f,b=>{
  const head={deploymentId:'HEAD_FICTIF_1234567890',deploymentConfig:{scriptId:policy.scriptId,description:'HEAD'}};
  if(position==='first')b.deployments.unshift(head);else b.deployments.push(head);
 });
 const before=clone([...f.records]),result=await inspectPendingDeploy(f);
 assert.equal(result.classification,'new_version_published');assert.deepEqual(result.backupDeploymentCounts,{raw:2,versioned:1,unversioned:1});
 assert.deepEqual([...f.records],before);assert.deepEqual(f.writes,[]);
});
test('divergences réelles de sauvegarde : refus distincts et sécurité maintenue',async()=>{
 for(const [mode,code] of [['count','COUNT'],['id','ID'],['version','VERSION'],['project','PROJECT'],['url','ENTRYPOINTS'],['public','ENTRYPOINTS']]) {
  const f=await fixture();rewriteFixtureBackup(f,b=>{
   const d=b.deployments[0];
   if(mode==='count')b.deployments.push(deployment(2,'SECOND_DEPLOY_FICTIF_1234567890'));
   if(mode==='id')d.deploymentId='OTHER_DEPLOY_FICTIF_1234567890';
   if(mode==='version')d.deploymentConfig.versionNumber=3;
   if(mode==='project')d.deploymentConfig.scriptId='SCRIPT_PROD_FICTIF_1234567890';
   if(mode==='url')d.entryPoints[0].webApp.url='https://script.google.com/macros/s/OTHER_FICTIF/exec';
   if(mode==='public')d.entryPoints[0].webApp.entryPointConfig.access='ANYONE_ANONYMOUS';
  });
  await assert.rejects(()=>inspectPendingDeploy(f),new RegExp('BACKUP_BASELINE_'+code+'_MISMATCH'));
  assert.deepEqual(f.writes,[]);
 }
});
test('scriptId brut absent accepté seulement dans la sauvegarde authentifiée',async()=>{
 const f=await fixture();rewriteFixtureBackup(f,b=>delete b.deployments[0].deploymentConfig.scriptId);
 assert.equal((await inspectPendingDeploy(f)).backupVerified,true);
 f.records.get('backup:'+f.expected.backupTag).deployments[0].deploymentConfig.versionNumber=4;
 await assert.rejects(()=>inspectPendingDeploy(f),/BACKUP_HASH_MISMATCH/);
});
