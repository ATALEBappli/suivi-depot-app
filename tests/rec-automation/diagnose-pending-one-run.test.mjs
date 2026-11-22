import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {diagnosePendingOneRun} from '../../scripts/rec-automation/diagnose-pending-one-run.mjs';
import {RECOVERY_ONE_RUN} from '../../scripts/rec-automation/inspect-pending-deploy.mjs';
import {readOnlyFetcher} from '../../scripts/rec-automation/diagnose-version.mjs';
import {digest,deploymentState} from '../../scripts/rec-automation/validation.mjs';
import {setup,policy,candidate,deployment,clone} from './helpers.mjs';

async function fixture(published=5) {
  const current=candidate('function nouvelleVersion(){}');
  const previous=candidate('function ancienneVersion(){}');
  const baseline=deployment(4),active=deployment(published);
  active.deploymentConfig.description=published===5?
    'REC '+RECOVERY_ONE_RUN.sourceSha+' '+RECOVERY_ONE_RUN.tag:'REC précédente';
  const t=setup({head:current,deployments:[active]});
  t.versions.set(4,{files:previous.files});
  t.versions.set(5,{files:current.files});
  t.api.versions=async()=>[{scriptId:policy.scriptId,versionNumber:5,
    description:'REC '+RECOVERY_ONE_RUN.sourceSha+' '+RECOVERY_ONE_RUN.tag}];
  const backup={schema:1,kind:'backup',tag:RECOVERY_ONE_RUN.backupTag,
    targetHash:policy.pins.scriptHash,sheetHash:policy.pins.sheetHash,
    account:policy.email,headHash:current.contentHash,content:{files:current.files},deployments:[baseline]};
  const pending={tag:RECOVERY_ONE_RUN.tag,status:'pending',operation:'deploy',
    sourceSha:RECOVERY_ONE_RUN.sourceSha,desiredHash:current.contentHash,
    account:policy.email,targetHash:policy.pins.scriptHash,
    checkpoint:{tag:RECOVERY_ONE_RUN.backupTag,hash:digest(backup)},
    deploymentsBefore:deploymentState([baseline],policy)};
  t.records.set('backup:'+RECOVERY_ONE_RUN.backupTag,clone(backup));
  t.records.set('operation:'+RECOVERY_ONE_RUN.tag,clone(pending));
  return {t,policy:{...policy,gatewayTransport:true,deploymentId:active.deploymentId},
    expected:{...RECOVERY_ONE_RUN,hash:current.contentHash,backupHash:digest(backup)}};
}

test('cible épinglée au reçu du run unique #50',()=>{
  assert.equal(RECOVERY_ONE_RUN.tag,'gha-45038142518-deploy');
  assert.equal(RECOVERY_ONE_RUN.hash,'cbee0b2b863fba15257480eef44d3615191e1e07d2352e4c5cecf27a03abce61');
  assert.equal(RECOVERY_ONE_RUN.backupTag,'0e71f760-7814-456f-8a7c-c16ac696f265');
});
test('diagnostic fail-closed si preuves fictives différentes, aucune mutation',async()=>{
  const {t,policy:p}=await fixture();
  await assert.rejects(()=>diagnosePendingOneRun({api:t.api,store:t.store,policy:p}),/PENDING_PROOF_MISMATCH|HEAD_CHANGED/);
  assert.deepEqual(t.writes,[]);
});
test('aucune mutation possible depuis le transport diagnostic',async()=>{
  const fetcher=readOnlyFetcher(async()=>({ok:true}));
  assert.throws(()=>fetcher('https://script.googleapis.com/v1/projects/target/content',{method:'PUT'}),/DIAGNOSTIC_WRITE_REFUSED/);
  assert.throws(()=>fetcher('https://www.googleapis.com/drive/v3/files',{method:'POST'}),/DIAGNOSTIC_WRITE_REFUSED/);
});
test('workflow sans paramètre d’écriture ni mutation',()=>{
  const workflow=readFileSync('.github/workflows/rec-diagnose-pending-one-run.yml','utf8');
  assert.match(workflow,/workflow_dispatch:/);
  assert.match(workflow,/diagnose-pending-one-run\.mjs/);
  assert.doesNotMatch(workflow,/REC_MUTATIONS_ENABLED|REC_RECONCILE_CONFIRMED|REC_OPERATION:|install|deploy\.mjs/);
});
