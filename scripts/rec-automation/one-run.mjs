import {operate} from './core.mjs';
import {Refusal,requireThat,candidateOf} from './validation.mjs';

// Le même compte, la même cible et le même artefact restent épinglés pendant
// inspect -> install -> deploy. Chaque mutation conserve son propre checkpoint.
export async function publishOneRun({candidate,api,store,policy,runId,auditConfirmed}) {
  requireThat(auditConfirmed===true,'MANUAL_AUDIT_REQUIRED');
  requireThat(typeof runId==='string' && /^\d+$/.test(runId),'MISSING_RUN_ID');
  const approved=candidateOf(candidate,{gatewayTransport:policy.gatewayTransport});
  const observed=await operate({request:{operation:'inspect'},api,store,policy});
  requireThat(observed.pending.length===0,'PENDING_OPERATION');

  let headHash=observed.headHash;
  let installation=null;
  if(headHash!==approved.contentHash) {
    installation=await operate({request:{operation:'install',candidate:approved,
      requestTag:'gha-'+runId+'-install',auditConfirmed:true,expectedHeadHash:headHash},api,store,policy});
    headHash=installation.headHash;
    requireThat(headHash===approved.contentHash,'INSTALL_HASH_MISMATCH');
  }
  const beforeDeploy=await operate({request:{operation:'inspect'},api,store,policy});
  requireThat(beforeDeploy.pending.length===0,'PENDING_OPERATION');
  requireThat(beforeDeploy.headHash===approved.contentHash,'HEAD_CHANGED');
  const publication=await operate({request:{operation:'deploy',candidate:approved,
    requestTag:'gha-'+runId+'-deploy',auditConfirmed:true,expectedHeadHash:beforeDeploy.headHash},api,store,policy});
  requireThat(publication.status==='done','DEPLOY_NOT_CONFIRMED');
  return {operation:'publish',status:'done',sourceSha:approved.sourceSha,
    installed:installation!==null,installBackupTag:installation?.backupTag || null,
    deployBackupTag:publication.backupTag,versionNumber:publication.versionNumber};
}
