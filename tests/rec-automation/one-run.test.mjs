import test from 'node:test';
import assert from 'node:assert/strict';
import {publishOneRun} from '../../scripts/rec-automation/one-run.mjs';
import {setup,policy,candidate,clone} from './helpers.mjs';

const run=(t,options={})=>publishOneRun({candidate:candidate(),api:t.api,store:t.store,
  policy,runId:'12345678',auditConfirmed:true,...options});
const refuses=(fn,code)=>assert.rejects(fn,e=>{assert.equal(e.code,code);return true;});

test('un seul run : inspect, sauvegarde vérifiée, install puis deploy',async()=>{
  const t=setup(),r=await run(t);
  assert.equal(r.status,'done');assert.equal(r.installed,true);
  assert.deepEqual(t.writes,['content','version','deployment']);
  assert.ok(await t.store.read('backup',r.installBackupTag));
  assert.ok(await t.store.read('backup',r.deployBackupTag));
  assert.equal((await t.store.pending()).length,0);
});
test('HEAD déjà installé : ne réécrit pas les sources',async()=>{
  const t=setup({head:candidate()}),r=await run(t);
  assert.equal(r.installed,false);assert.deepEqual(t.writes,['version','deployment']);
});
test('attestation manquante : aucune I/O Google',async()=>{
  const t=setup();await refuses(()=>run(t,{auditConfirmed:false}),'MANUAL_AUDIT_REQUIRED');
  assert.deepEqual(t.calls,[]);
});
test('pending préexistant : arrêt sans mutation ni réessai',async()=>{
  const t=setup();t.records.set('operation:pending-fictif-001',{status:'pending',tag:'pending-fictif-001',operation:'install',checkpoint:{tag:'backup-fictif-001',hash:'a'.repeat(64)}});
  await refuses(()=>run(t),'PENDING_OPERATION');assert.deepEqual(t.writes,[]);
});
test('erreur installation : jamais de publication',async()=>{
  const t=setup({hooks:{afterContent(){throw Error('GOOGLE_UNCERTAIN');}}});
  await assert.rejects(()=>run(t));assert.deepEqual(t.writes,['content']);
  assert.equal((await t.store.pending()).length,1);
});
test('HEAD modifié entre installation et publication : arrêt',async()=>{
  const t=setup();const old=t.store.pending;let checks=0;
  t.store.pending=async()=>{checks++;if(checks===3)t.setContent({files:candidate('function concurrent(){}').files});return old();};
  await refuses(()=>run(t),'HEAD_CHANGED');
  assert.deepEqual(t.writes,['content']);
});
test('mauvais bundle refusé sans écriture',async()=>{
  const t=setup(),bad=clone(candidate());bad.contentHash='0'.repeat(64);
  await refuses(()=>run(t,{candidate:bad}),'CANDIDATE_HASH_MISMATCH');
  assert.deepEqual(t.calls,[]);
});
