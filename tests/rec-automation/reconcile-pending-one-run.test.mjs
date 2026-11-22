import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reconcilePendingDeploy} from '../../scripts/rec-automation/reconcile-pending-deploy.mjs';
import {RECOVERY_ONE_RUN} from '../../scripts/rec-automation/inspect-pending-deploy.mjs';
import {reconciliationFetcher} from '../../scripts/rec-automation/reconcile-version.mjs';
import {digest,deploymentState} from '../../scripts/rec-automation/validation.mjs';
import {setup,policy,candidate,deployment,clone} from './helpers.mjs';

function fixture() {
  const newContent=candidate('function versionQuatre(){}');
  const oldContent=candidate('function versionTrois(){}');
  const previous=deployment(3),active=deployment(4);
  active.deploymentConfig.description='REC '+RECOVERY_ONE_RUN.sourceSha+' '+RECOVERY_ONE_RUN.tag;
  active.entryPoints[0].webApp.entryPointConfig.access='ANYONE_ANONYMOUS';
  previous.entryPoints[0].webApp.entryPointConfig.access='ANYONE_ANONYMOUS';
  const f=setup({head:newContent,deployments:[active]});
  f.versions.set(3,{files:oldContent.files});
  f.versions.set(4,{files:newContent.files});
  f.api.versions=async()=>[{scriptId:policy.scriptId,versionNumber:4,
    description:'REC '+RECOVERY_ONE_RUN.sourceSha+' '+RECOVERY_ONE_RUN.tag}];
  const b={schema:1,kind:'backup',tag:RECOVERY_ONE_RUN.backupTag,
    targetHash:policy.pins.scriptHash,sheetHash:policy.pins.sheetHash,
    account:policy.email,headHash:newContent.contentHash,
    content:{files:newContent.files},deployments:[previous]};
  const p={schema:1,kind:'operation',tag:RECOVERY_ONE_RUN.tag,status:'pending',
    operation:'deploy',sourceSha:RECOVERY_ONE_RUN.sourceSha,desiredHash:newContent.contentHash,
    account:policy.email,targetHash:policy.pins.scriptHash,
    checkpoint:{tag:b.tag,hash:digest(b)},deploymentsBefore:deploymentState([previous],{...policy,gatewayTransport:true}),
    headBeforeHash:newContent.contentHash,intentHash:'f'.repeat(64)};
  f.records.set('backup:'+b.tag,clone(b));
  f.records.set('operation:'+p.tag,clone(p));
  return {...f,policy:{...policy,deploymentId:active.deploymentId,gatewayTransport:true},
    expected:{...RECOVERY_ONE_RUN,hash:newContent.contentHash,backupHash:digest(b)},
    expectedVersion:4,operationHash:digest(p),deploymentHash:digest(active.deploymentId)};
}

test('version 4 publiée : archive le reçu exact et clôture sans Google Apps Script ni Sheets',async()=>{
  const f=fixture(),before=clone(f.getDeployments()),result=await reconcilePendingDeploy(f);
  assert.equal(result.status,'reconciled');assert.equal(result.version,4);
  assert.equal(f.records.get('operation:'+RECOVERY_ONE_RUN.tag).status,'done');
  assert.equal(f.records.get('backup:reconcile-'+RECOVERY_ONE_RUN.tag).originalOperation.status,'pending');
  assert.deepEqual(f.writes,[]);assert.deepEqual(f.getDeployments(),before);
  assert.equal((await reconcilePendingDeploy(f)).replayed,true);
});
test('preuve divergente ou version 4 non publiée : refuse avant toute écriture',async()=>{
  for(const defect of ['operation','deployment','version','backup','pending']) {
    const f=fixture();
    if(defect==='operation')f.operationHash='0'.repeat(64);
    if(defect==='deployment')f.deploymentHash='0'.repeat(64);
    if(defect==='version'){const ds=f.getDeployments();ds[0].deploymentConfig.versionNumber=3;f.setDeployments(ds);}
    if(defect==='backup')f.records.get('backup:'+RECOVERY_ONE_RUN.backupTag).account='unexpected@example.invalid';
    if(defect==='pending')f.records.set('operation:extra-fictif',{status:'pending',tag:'extra-fictif'});
    await assert.rejects(()=>reconcilePendingDeploy(f));
    assert.deepEqual(f.writes,[]);
    assert.equal(f.calls.some(c=>['createRecord','updateRecord'].includes(c.name)),false);
  }
});
test('transport refuse toute écriture hors sauvegarde privée/reçu précis',()=>{
  const fetcher=reconciliationFetcher({fetcher:async()=>({ok:true}),operationId:()=> 'RECORD_REC_FICTIF_1234567890'});
  assert.throws(()=>fetcher('https://script.googleapis.com/v1/projects/abc/deployments',{method:'POST'}),/RECONCILIATION_WRITE_REFUSED/);
  assert.throws(()=>fetcher('https://www.googleapis.com/upload/drive/v3/files/DIFFERENT?uploadType=multipart',{method:'PATCH'}),/RECONCILIATION_WRITE_REFUSED/);
});
test('workflow manuel et fermé : aucun déploiement ni déclenchement automatique',()=>{
  const workflow=readFileSync('.github/workflows/rec-reconcile-pending-one-run.yml','utf8');
  assert.match(workflow,/on:\n  workflow_dispatch:/);
  assert.match(workflow,/inputs\.audit_confirmed == true/);
  assert.match(workflow,/environment: REC/);
  assert.match(workflow,/group: apps-script-rec/);
  assert.match(workflow,/reconcile-pending-one-run\.mjs/);
  assert.doesNotMatch(workflow,/push:|pull_request:|schedule:|workflow_call:|contents: write/);
});
