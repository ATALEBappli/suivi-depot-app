import {randomUUID} from 'node:crypto';
import {TARGET,Refusal,requireThat,digest,isHash,isTag,canonical,contentOf,contentHash,
  privateManifest,candidateOf,checkIdentity,checkFile,checkDeployment,deploymentState} from './validation.mjs';

// Aucune I/O native : toutes les opérations Google passent par les interfaces injectées.
export async function inspect({api,policy}) {
  const identity=await api.identity();checkIdentity(identity,policy);
  const project=await api.project();
  requireThat(project?.scriptId===policy.scriptId && project.title===policy.pins.title && !project.parentId,'WRONG_PROJECT');
  const allowed=[policy.ownerEmail,policy.email];
  checkFile(await api.fileMetadata(policy.scriptId),{owner:policy.ownerEmail,allowed,editor:policy.email,mime:'application/vnd.google-apps.script'});
  checkFile(await api.fileMetadata(policy.sheetId),{owner:policy.ownerEmail,allowed,editor:policy.email,mime:'application/vnd.google-apps.spreadsheet'});
  const raw=await api.getContent();requireThat(raw.scriptId===policy.scriptId,'WRONG_CONTENT_TARGET');
  const content=contentOf(raw),deployments=await api.deployments();
  return {identity,content,headHash:contentHash(content),deployments,deploymentsState:deploymentState(deployments,policy,{inspect:true})};
}
function mutatingReview(request, state) {
  requireThat(request.auditConfirmed===true,'MANUAL_AUDIT_REQUIRED');
  requireThat(isHash(request.expectedHeadHash) && request.expectedHeadHash===state.headHash,'HEAD_CHANGED');
  // La case attestée couvre propriétés, permissions hors PROD, sauvegarde config,
  // gel des exécutions et audit des déclencheurs de CHAQUE compte propriétaire.
}
function safeCurrent(state,policy) {
  privateManifest(state.content.manifest,{baseline:true});
  deploymentState(state.deployments,policy);
  const versioned=state.deployments.filter(d=>d.deploymentConfig?.versionNumber!==undefined);
  requireThat(versioned.every(d=>d.deploymentId===policy.deploymentId),'UNEXPECTED_EXISTING_DEPLOYMENT');
  if(policy.deploymentId)requireThat(versioned.length===1,'EXPECTED_DEPLOYMENT_NOT_FOUND');
}
function summary(state,pending) {
  return {operation:'inspect',status:'inspected',headHash:state.headHash,files:state.content.files.length,
    versionedDeployments:state.deploymentsState.length,
    privateHead:state.content.manifest.webapp?.access==='MYSELF' && state.content.manifest.webapp?.executeAs==='USER_DEPLOYING',
    pending:pending.map(p=>({requestTag:p.value.tag,operation:p.value.operation,backupTag:p.value.checkpoint.tag,backupHash:p.value.checkpoint.hash}))};
}
async function checkUnchanged(api,policy,state) {
  const raw=await api.getContent();requireThat(raw.scriptId===policy.scriptId && contentHash(raw)===state.headHash,'HEAD_CHANGED');
  requireThat(canonical(deploymentState(await api.deployments(),policy))===canonical(deploymentState(state.deployments,policy)),'DEPLOYMENTS_CHANGED');
}
async function checkedBackup(store,policy,state,now,uuid) {
  const value={schema:1,kind:'backup',tag:uuid(),targetHash:policy.pins.scriptHash,sheetHash:policy.pins.sheetHash,
    createdAt:now(),account:policy.email,headHash:state.headHash,content:{files:state.content.files},deployments:state.deployments};
  const hash=digest(value);await store.create('backup',value.tag,value);
  const saved=await store.read('backup',value.tag);
  requireThat(saved && digest(saved.value)===hash,'BACKUP_VERIFICATION_FAILED');
  return {tag:value.tag,hash};
}
function backupValue(saved,policy,expectedHash) {
  requireThat(saved && isHash(expectedHash) && digest(saved.value)===expectedHash,'BACKUP_HASH_MISMATCH');
  const b=saved.value;
  requireThat(b.schema===1 && b.kind==='backup' && b.targetHash===policy.pins.scriptHash && b.sheetHash===policy.pins.sheetHash && b.account===policy.email,'WRONG_BACKUP_TARGET');
  requireThat(contentHash(b.content)===b.headHash,'CORRUPT_BACKUP');
  privateManifest(contentOf(b.content).manifest,{baseline:true});
  deploymentState(b.deployments,policy);
  return b;
}

export async function operate({request,api,store,policy,now=()=>new Date().toISOString(),uuid=randomUUID}) {
  requireThat(['inspect','install','deploy','restore'].includes(request.operation),'INVALID_OPERATION');
  const state=await inspect({api,policy});
  const pending=await store.pending();
  if(request.operation==='inspect')return summary(state,pending);
  requireThat(isTag(request.requestTag),'INVALID_REQUEST_TAG');
  const candidate=['install','deploy'].includes(request.operation)?candidateOf(request.candidate):null;
  const intent={operation:request.operation,sourceHash:candidate?.contentHash || null,
    sourceSha:candidate?.sourceSha || null,expectedHeadHash:request.expectedHeadHash,
    backupTag:request.backupTag || null,backupHash:request.backupHash || null,
    restoreDeployment:request.restoreDeployment===true,recoveryTag:request.recoveryTag || null};
  const intentHash=digest(intent);
  const previous=await store.read('operation',request.requestTag);
  if(previous) {
    requireThat(previous.value.intentHash===intentHash,'REQUEST_REPLAY_CONFLICT');
    requireThat(previous.value.status==='done','UNCERTAIN_PREVIOUS_OPERATION');
    return {...previous.value.result,replayed:true};
  }
  mutatingReview(request,state);safeCurrent(state,policy);
  let recovery=null;
  if(pending.length) {
    requireThat(request.operation==='restore' && pending.length===1 && request.recoveryTag===pending[0].value.tag,'PENDING_OPERATION');
    recovery=pending[0];
    requireThat(recovery.value.targetHash===policy.pins.scriptHash && request.backupTag===recovery.value.checkpoint.tag && request.backupHash===recovery.value.checkpoint.hash,'WRONG_RECOVERY_CHECKPOINT');
    // Une publication incertaine exige d'abord une réconciliation humaine du
    // déploiement. Aucun DELETE/archivage ou rollback public automatique.
    if(recovery.value.operation==='deploy')requireThat(canonical(state.deploymentsState)===canonical(recovery.value.deploymentsBefore),'DEPLOYMENT_RECONCILIATION_REQUIRED');
  } else requireThat(!request.recoveryTag,'UNKNOWN_RECOVERY_OPERATION');

  let desired=null,restoreVersion=null;
  if(request.operation==='restore') {
    requireThat(isTag(request.backupTag),'INVALID_BACKUP_REFERENCE');
    const backup=backupValue(await store.read('backup',request.backupTag),policy,request.backupHash);
    desired=contentOf(backup.content);
    if(request.restoreDeployment===true) {
      requireThat(policy.deploymentId,'NO_PREVIOUS_PRIVATE_DEPLOYMENT');
      const d=backup.deployments.find(d=>d.deploymentId===policy.deploymentId);
      requireThat(d,'NO_PREVIOUS_PRIVATE_DEPLOYMENT');checkDeployment(d,policy);
      restoreVersion=d.deploymentConfig.versionNumber;
      const version=await api.getContent(restoreVersion);
      requireThat(version.scriptId===policy.scriptId,'WRONG_CONTENT_TARGET');privateManifest(contentOf(version).manifest);
    }
  } else desired=candidate;
  if(request.operation==='install')requireThat(state.content.files.every(f=>desired.files.some(d=>d.name===f.name && d.type===f.type)),'REMOTE_FILE_REMOVAL_REFUSED');
  if(request.operation==='deploy')requireThat(state.headHash===candidate.contentHash,'INSTALL_REQUIRED');
  const checkpoint=await checkedBackup(store,policy,state,now,uuid);
  const record={schema:1,kind:'operation',tag:request.requestTag,targetHash:policy.pins.scriptHash,
    account:policy.email,status:'pending',operation:request.operation,intentHash,checkpoint,
    createdAt:now(),headBeforeHash:state.headHash,deploymentsBefore:state.deploymentsState,
    desiredHash:contentHash(desired),sourceSha:candidate?.sourceSha || null};
  let operationFile;
  if(recovery) {
    // Même verrou persistant pendant une reprise : pas de deuxième pending.
    record.recoveryOf=recovery.value.tag;record.recoveryCheckpoint=checkpoint;record.checkpoint=recovery.value.checkpoint;
    operationFile=recovery;
    await store.update(operationFile,{...record,tag:recovery.value.tag});
  } else operationFile=await store.create('operation',record.tag,record);
  const lockTag=recovery?.value.tag || record.tag;
  const locked=await store.read('operation',lockTag);
  requireThat(locked && locked.value.status==='pending' && locked.value.intentHash===intentHash,'OPERATION_CHECKPOINT_FAILED');
  await checkUnchanged(api,policy,state);

  let versionNumber=null,deployment=null;
  if(request.operation==='install' || request.operation==='restore') {
    await api.updateContent({files:desired.files});
    const after=await api.getContent();
    requireThat(after.scriptId===policy.scriptId && contentHash(after)===contentHash(desired),'CONTENT_VERIFICATION_FAILED');
    if(restoreVersion) {
      deployment=await api.updateDeployment(policy.deploymentId,restoreVersion,'REC restore '+record.tag);
      checkDeployment(deployment,policy,restoreVersion);versionNumber=restoreVersion;
    }
  } else {
    const version=await api.createVersion('REC '+candidate.sourceSha+' '+record.tag);
    requireThat(version.scriptId===policy.scriptId && Number.isInteger(version.versionNumber) && version.versionNumber>0,'VERSION_VERIFICATION_FAILED');
    versionNumber=version.versionNumber;
    const snapshot=await api.getContent(versionNumber);
    requireThat(snapshot.scriptId===policy.scriptId && contentHash(snapshot)===candidate.contentHash,'VERSION_CONTENT_CHANGED');
    privateManifest(contentOf(snapshot).manifest);
    await checkUnchanged(api,policy,state);
    deployment=policy.deploymentId?
      await api.updateDeployment(policy.deploymentId,versionNumber,'REC '+candidate.sourceSha+' '+record.tag):
      await api.createDeployment(versionNumber,'REC '+candidate.sourceSha+' '+record.tag);
    checkDeployment(deployment,policy,versionNumber);
  }
  if(deployment) {
    const remote=(await api.deployments()).find(d=>d.deploymentId===deployment.deploymentId);
    checkDeployment(remote,policy,versionNumber);
  }
  const result={operation:request.operation,status:'done',requestTag:request.requestTag,
    backupTag:checkpoint.tag,backupHash:checkpoint.hash,headHash:contentHash(desired),versionNumber};
  const done={...locked.value,status:'done',completedAt:now(),result,
    deployment:deployment || null}; // URL/ID uniquement dans le reçu Drive privé.
  await store.update(locked,done);
  const completed=await store.read('operation',lockTag);
  requireThat(completed && digest(completed.value)===digest(done),'RECEIPT_VERIFICATION_FAILED');
  return result;
}
