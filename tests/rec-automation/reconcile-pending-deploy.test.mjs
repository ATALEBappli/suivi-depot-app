import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reconcilePendingDeploy,pendingReconciliationGate,ARCHIVE} from '../../scripts/rec-automation/reconcile-pending-deploy.mjs';
import {RECOVERY} from '../../scripts/rec-automation/inspect-pending-deploy.mjs';
import {setup,policy,candidate,deployment,clone} from './helpers.mjs';
import {digest,deploymentState} from '../../scripts/rec-automation/validation.mjs';

function fixture() {
  const current=candidate('function verified(){}'),old=candidate('function old(){}');
  const d=deployment(2),before=deployment(1);
  d.deploymentConfig.description='REC '+current.sourceSha+' '+RECOVERY.tag;
  const f=setup({head:current,deployments:[d]});
  f.versions.set(1,{files:old.files});f.versions.set(2,{files:current.files});
  f.api.versions=async()=>[{scriptId:policy.scriptId,versionNumber:2,
    description:'REC '+current.sourceSha+' '+RECOVERY.tag}];
  const b={schema:1,kind:'backup',tag:'backup-fictif',targetHash:policy.pins.scriptHash,
    sheetHash:policy.pins.sheetHash,account:policy.email,headHash:current.contentHash,
    content:{files:current.files},deployments:[before]};
  const p={schema:1,kind:'operation',tag:RECOVERY.tag,status:'pending',operation:'deploy',
    sourceSha:current.sourceSha,desiredHash:current.contentHash,account:policy.email,
    targetHash:policy.pins.scriptHash,checkpoint:{tag:b.tag,hash:digest(b)},
    deploymentsBefore:deploymentState([before],policy),headBeforeHash:current.contentHash,
    intentHash:'f'.repeat(64)};
  f.records.set('backup:'+b.tag,clone(b));f.records.set('operation:'+RECOVERY.tag,clone(p));
  const expected={tag:RECOVERY.tag,sourceSha:current.sourceSha,hash:current.contentHash,
    backupTag:b.tag,backupHash:digest(b)};
  return {...f,policy:{...policy,deploymentId:d.deploymentId},expected,
    operationHash:digest(p),deploymentHash:digest(d.deploymentId),p,b};
}

test('finalise le reçu et préserve la version publiée, puis rejoue sans mutation',async()=>{
  const f=fixture(),before=clone(f.getDeployments());
  const r=await reconcilePendingDeploy(f);
  assert.equal(r.status,'reconciled');assert.equal(r.version,2);assert.equal(r.replayed,false);
  assert.equal(f.records.get('operation:'+RECOVERY.tag).status,'done');
  assert.deepEqual(f.records.get('backup:'+ARCHIVE).originalOperation,f.p);
  const second=await reconcilePendingDeploy(f);
  assert.equal(second.replayed,true);
  assert.deepEqual(f.getDeployments(),before);assert.deepEqual(f.writes,[]);
});

test('preuves contradictoires et version non publiée refusées avant toute écriture',async()=>{
  for(const mode of ['operation','deployment','version','backup','otherPending']) {
    const f=fixture();
    if(mode==='operation')f.operationHash='0'.repeat(64);
    if(mode==='deployment')f.deploymentHash='0'.repeat(64);
    if(mode==='version'){const d=f.getDeployments();d[0].deploymentConfig.versionNumber=1;f.setDeployments(d);}
    if(mode==='backup')f.records.get('backup:'+f.b.tag).account='wrong@example.invalid';
    if(mode==='otherPending')f.records.set('operation:other',{...f.p,tag:'other'});
    await assert.rejects(()=>reconcilePendingDeploy(f));
    assert.equal(f.calls.some(c=>['createRecord','updateRecord'].includes(c.name)),false);
  }
});

test('interruption avant ou après la sauvegarde permet la reprise, sans doublon',async()=>{
  for(const phase of ['beforeArchive','afterArchive','beforeUpdate','afterUpdate']) {
    const f=fixture(),create=f.store.create,update=f.store.update;let failed=false;
    f.store.create=async(...args)=>{
      if(!failed && phase==='beforeArchive'){failed=true;throw Error('INTERRUPTED');}
      const r=await create(...args);
      if(!failed && phase==='afterArchive'){failed=true;throw Error('LOST_RESPONSE');}return r;
    };
    f.store.update=async(...args)=>{
      if(!failed && phase==='beforeUpdate'){failed=true;throw Error('INTERRUPTED');}
      const r=await update(...args);
      if(!failed && phase==='afterUpdate'){failed=true;throw Error('LOST_RESPONSE');}return r;
    };
    await assert.rejects(()=>reconcilePendingDeploy(f));
    assert.equal((await reconcilePendingDeploy(f)).status,'reconciled');
    assert.equal([...f.records.keys()].filter(k=>k==='backup:'+ARCHIVE).length,1);
    assert.deepEqual(f.writes,[]);
  }
});

test('audit manuel obligatoire et workflow exclusivement manuel',()=>{
  const env={REC_AUTOMATION_ENABLED:'true',REC_MUTATIONS_ENABLED:'true',REC_RECONCILE_CONFIRMED:'true'};
  pendingReconciliationGate(env);
  for(const key of Object.keys(env))assert.throws(()=>pendingReconciliationGate({...env,[key]:'false'}));
  const workflow=readFileSync('.github/workflows/rec-reconcile-pending-deploy.yml','utf8');
  assert.match(workflow,/on:\n  workflow_dispatch:/);
  assert.doesNotMatch(workflow,/push:|pull_request:|schedule:|workflow_call:/);
  assert.match(workflow,/environment: REC/);
  assert.match(workflow,/group: apps-script-rec/);
  assert.match(workflow,/needs: tests/);
  assert.equal((workflow.match(/github.ref == 'refs\/heads\/main'/g)||[]).length,2);
  assert.doesNotMatch(workflow,/cli\.mjs|contents: write|gh secret/);
});
