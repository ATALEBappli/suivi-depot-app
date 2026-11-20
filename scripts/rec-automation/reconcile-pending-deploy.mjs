// Reçu gha-43927899195 uniquement : aucune mutation Apps Script ni Sheets.
import {pathToFileURL} from 'node:url';
import {Google,PrivateDrive} from './google.mjs';
import {inspect} from './core.mjs';
import {inspectPendingDeploy,RECOVERY,RECOVERY_V3} from './inspect-pending-deploy.mjs';
import {reconciliationFetcher} from './reconcile-version.mjs';
import {Refusal,requireThat,isHash,digest,policyFromEnv,canonical} from './validation.mjs';

export const ARCHIVE='reconcile-'+RECOVERY.tag;
export function pendingReconciliationGate(env) {
  requireThat(env.REC_AUTOMATION_ENABLED==='true' && env.REC_MUTATIONS_ENABLED==='true','RECONCILIATION_DISABLED');
  requireThat(env.REC_RECONCILE_CONFIRMED==='true','MANUAL_AUDIT_REQUIRED');
}

export async function reconcilePendingDeploy({api,store,policy,operationHash,deploymentHash,
  expected=RECOVERY,expectedVersion=2,now=()=>new Date().toISOString()}) {
  requireThat(isHash(operationHash) && isHash(deploymentHash),'MISSING_PROOF_HASHES');
  requireThat(expected?.tag===RECOVERY.tag || expected?.tag===RECOVERY_V3.tag,'UNKNOWN_RECOVERY_TARGET');
  const archiveTag='reconcile-'+expected.tag;
  const current=await store.read('operation',expected.tag);
  requireThat(current && ['pending','done'].includes(current.value.status),'MISSING_OPERATION');
  const archived=await store.read('backup',archiveTag);
  const original=current.value.status==='pending'?current.value:archived?.value.originalOperation;
  requireThat(original?.status==='pending' && digest(original)===operationHash,'ORIGINAL_OPERATION_MISMATCH');
  const proofStore={
    read:(kind,tag)=>kind==='operation' && tag===expected.tag?Promise.resolve({...current,value:original}):store.read(kind,tag),
  };
  async function verify() {
    const pending=await store.pending();
    requireThat(pending.length===(current.value.status==='pending'?1:0) &&
      pending.every(p=>p.id===current.id && digest(p.value)===operationHash),'PENDING_SET_MISMATCH');
    const state=await inspect({api,policy});
    const proof=await inspectPendingDeploy({api,store:proofStore,policy,state,
      pending:[{...current,value:original}],expected});
    requireThat(proof.classification==='new_version_published' && proof.publishedVersion===expectedVersion &&
      proof.createdVersion===expectedVersion && proof.publishedHash===expected.hash && proof.backupVerified &&
      proof.existingUrlUnchanged && proof.readOnly,'PUBLISHED_VERSION_NOT_VERIFIED');
    const deployments=state.deployments.filter(d=>d.deploymentConfig?.versionNumber!==undefined);
    requireThat(deployments.length===1 && digest(deployments[0].deploymentId)===deploymentHash &&
      deployments[0].deploymentId===policy.deploymentId,'DEPLOYMENT_PROOF_MISMATCH');
    return {state,proof,deployment:deployments[0]};
  }
  const first=await verify();
  const archiveValue={schema:1,kind:'backup',tag:archiveTag,targetHash:policy.pins.scriptHash,
    sheetHash:policy.pins.sheetHash,account:policy.email,
    createdAt:archived?.value.createdAt || now(),headHash:first.state.headHash,
    content:{files:first.state.content.files},deployments:first.state.deployments,
    originalRecordId:current.id,originalOperation:original,operationHash,deploymentHash};
  let archive=archived;
  if(!archive) {
    requireThat(current.value.status==='pending','MISSING_RECONCILIATION_BACKUP');
    await store.create('backup',archiveTag,archiveValue);
    archive=await store.read('backup',archiveTag);
  }
  requireThat(archive && digest(archive.value)===digest(archiveValue),'RECONCILIATION_BACKUP_MISMATCH');
  const second=await verify();
  requireThat(canonical(first.state.content.files)===canonical(second.state.content.files) &&
    canonical(first.state.deployments)===canonical(second.state.deployments),'REMOTE_STATE_CHANGED');
  const result={operation:'deploy',status:'done',requestTag:expected.tag,
    backupTag:original.checkpoint.tag,backupHash:original.checkpoint.hash,
    headHash:expected.hash,versionNumber:expectedVersion};
  const done={...original,status:'done',completedAt:archive.value.createdAt,result,
    deployment:second.deployment,
    reconciliation:{schema:1,archiveTag,archiveHash:digest(archive.value),operationHash,deploymentHash}};
  const before=await store.read('operation',expected.tag);
  requireThat(before && before.id===current.id && digest(before.value)===digest(current.value),'OPERATION_CHANGED');
  if(current.value.status==='done')requireThat(digest(current.value)===digest(done),'COMPLETED_RECEIPT_MISMATCH');
  else await store.update(before,done);
  const after=await store.read('operation',expected.tag);
  requireThat(after && after.id===current.id && digest(after.value)===digest(done),'RECEIPT_VERIFICATION_FAILED');
  return {status:'reconciled',replayed:current.value.status==='done',version:expectedVersion,
    archiveHash:digest(archive.value),originalBackupPreserved:true,appsScriptWrites:0};
}

export async function main(expected=RECOVERY,expectedVersion=2) {
  pendingReconciliationGate(process.env);
  const policy=policyFromEnv(process.env);
  const mask=value=>process.stdout.write('::add-mask::'+String(value).replaceAll('%','%25').replaceAll('\r','%0D').replaceAll('\n','%0A')+'\n');
  let operationId='';
  const api=new Google({policy,fetcher:reconciliationFetcher({operationId:()=>operationId}),mask});
  await api.authenticate(JSON.parse(process.env.REC_GOOGLE_OAUTH || '{}'));
  const store=new PrivateDrive(api),record=await store.read('operation',expected.tag);
  requireThat(record,'MISSING_OPERATION');operationId=record.id;
  console.log(JSON.stringify(await reconcilePendingDeploy({api,store,policy,
    deploymentHash:process.env.REC_EXPECTED_DEPLOYMENT_HASH,expected,expectedVersion,
    operationHash:process.env.REC_EXPECTED_OPERATION_HASH}),null,2));
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)
  main().catch(e=>{console.error('REC_RECONCILE_STOP '+(e instanceof Refusal?e.code:'RECONCILIATION_FAILED'));process.exitCode=1;});
