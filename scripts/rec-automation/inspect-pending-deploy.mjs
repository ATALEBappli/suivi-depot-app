// Lecture uniquement : ne finalise aucun reçu et ne publie aucune version.
import {requireThat,digest,contentHash,privateManifest,checkDeployment,canonical} from './validation.mjs';
export const RECOVERY=Object.freeze({
  tag:'gha-43927899195',sourceSha:'5b09f18289cd9ac5f6acf74289bd75f60c695332',
  hash:'d0d1a31c52723910498536be899944f69d4c6085c76070190928efa74a21a22e',
  backupTag:'2f69e4f2-0868-4cd7-acaf-d93c9ad69737',
  backupHash:'a2db8fc517ebf147536788173e471a0d73c945f2f01f50a12203c6dfbc5a5b22'
});
export const RECOVERY_V3=Object.freeze({
  tag:'gha-44785870895',sourceSha:'ad5c72bf31ea822b459ef6867470e331f80a8c8f',
  hash:'0a542c4f4953d67b27eec822628d13d1375428e9aebdc90ef3c4f579ad4d58b6',
  backupTag:'2fabf0aa-6941-4a21-889f-a02e3e72d67c',
  backupHash:'6fc5745fd734761513b93403982c097d554882fd53ad7137766c035d3c8fa33b'
});
// Cible exacte du run unique #50. Empreintes non secrètes constatées dans les
// journaux inspect ; aucune possibilité de viser une autre opération.
export const RECOVERY_ONE_RUN=Object.freeze({
  tag:'gha-45038142518-deploy',sourceSha:'23e480d84b8f7964d5b978094945b70a2d42a13f',
  hash:'cbee0b2b863fba15257480eef44d3615191e1e07d2352e4c5cecf27a03abce61',
  backupTag:'0e71f760-7814-456f-8a7c-c16ac696f265',
  backupHash:'0b63e4dd91b8986e3f044a8dd6cbbbd8b796f290a1fba74aca1e0063c38eb29f'
});
function sameEntrypoint(before,after,expected,policy) {
  if(canonical(before)===canonical(after))return true;
  if(expected.tag!==RECOVERY_V3.tag || !policy.gatewayTransport || before?.length!==1 || after?.length!==1)return false;
  const old=before[0],next=after[0];
  return old.entryPointType==='WEB_APP' && next.entryPointType==='WEB_APP' &&
    old.webApp?.url===next.webApp?.url &&
    old.webApp?.entryPointConfig?.executeAs==='USER_DEPLOYING' &&
    next.webApp?.entryPointConfig?.executeAs==='USER_DEPLOYING' &&
    old.webApp?.entryPointConfig?.access==='MYSELF' &&
    next.webApp?.entryPointConfig?.access==='ANYONE_ANONYMOUS';
}
export async function inspectPendingDeploy({api,store,policy,state,pending,expected=RECOVERY}) {
  requireThat(pending.length===1,'AMBIGUOUS_PENDING_DEPLOY');
  const record=pending[0],p=record.value;
  requireThat(p.tag===expected.tag && p.status==='pending' && p.operation==='deploy' &&
    p.sourceSha===expected.sourceSha && p.desiredHash===expected.hash && p.account===policy.email &&
    p.targetHash===policy.pins.scriptHash && p.checkpoint?.tag===expected.backupTag &&
    p.checkpoint.hash===expected.backupHash,'PENDING_PROOF_MISMATCH');
  requireThat(state.headHash===expected.hash,'HEAD_CHANGED');
  const saved=await store.read('backup',expected.backupTag),b=saved?.value;
  requireThat(b && digest(b)===expected.backupHash,'BACKUP_HASH_MISMATCH');
  requireThat(b.schema===1 && b.kind==='backup' && b.tag===expected.backupTag &&
    b.targetHash===policy.pins.scriptHash && b.sheetHash===policy.pins.sheetHash &&
    b.account===policy.email && b.headHash===expected.hash && contentHash(b.content)===expected.hash,'BACKUP_TARGET_MISMATCH');
  privateManifest(JSON.parse(b.content.files.find(f=>f.name==='appsscript').source),{gatewayTransport:policy.gatewayTransport});
  const deployments=state.deployments.filter(d=>d.deploymentConfig?.versionNumber!==undefined);
  requireThat(policy.deploymentId && deployments.length===1 && deployments[0].deploymentId===policy.deploymentId,'UNEXPECTED_EXISTING_DEPLOYMENT');
  const d=deployments[0];checkDeployment(d,policy);
  const before=p.deploymentsBefore;
  requireThat(Array.isArray(before) && before.length===1 && before[0].id===d.deploymentId &&
    before[0].scriptId===policy.scriptId && Number.isInteger(before[0].version) && before[0].version>0 &&
    sameEntrypoint(before[0].entryPoints,d.entryPoints,expected,policy),'BASELINE_DEPLOYMENT_MISMATCH');
  // La sauvegarde conserve la réponse REST brute (HEAD compris), tandis que
  // deploymentsBefore ne conserve que les déploiements versionnés.
  requireThat(Array.isArray(b.deployments),'INVALID_BACKUP_DEPLOYMENTS');
  const backupVersioned=b.deployments.filter(d=>d?.deploymentConfig?.versionNumber!==undefined);
  requireThat(backupVersioned.length===1,'BACKUP_BASELINE_COUNT_MISMATCH');
  const baseline=backupVersioned[0];
  requireThat(baseline.deploymentId===before[0].id,'BACKUP_BASELINE_ID_MISMATCH');
  requireThat(baseline.deploymentConfig.versionNumber===before[0].version,'BACKUP_BASELINE_VERSION_MISMATCH');
  requireThat(!Object.hasOwn(baseline.deploymentConfig,'scriptId') || baseline.deploymentConfig.scriptId===policy.scriptId,'BACKUP_BASELINE_PROJECT_MISMATCH');
  requireThat(canonical(baseline.entryPoints)===canonical(before[0].entryPoints),'BACKUP_BASELINE_ENTRYPOINTS_MISMATCH');
  const matches=(await api.versions()).filter(v=>v.description==='REC '+expected.sourceSha+' '+expected.tag);
  requireThat(matches.length===1 && Number.isInteger(matches[0].versionNumber) &&
    matches[0].versionNumber>before[0].version && matches[0].scriptId===policy.scriptId,'AMBIGUOUS_CREATED_VERSION');
  const created=matches[0].versionNumber;
  async function versionHash(version) {
    const snapshot=await api.getContent(version);requireThat(snapshot.scriptId===policy.scriptId,'WRONG_VERSION_TARGET');
    privateManifest(JSON.parse(snapshot.files.find(f=>f.name==='appsscript').source),{gatewayTransport:policy.gatewayTransport});return contentHash(snapshot);
  }
  requireThat(await versionHash(created)===expected.hash,'CREATED_VERSION_CONTENT_CHANGED');
  const published=d.deploymentConfig.versionNumber,publishedHash=await versionHash(published);
  let classification='unexpected_state';
  if(published===created && publishedHash===expected.hash && d.deploymentConfig.description==='REC '+expected.sourceSha+' '+expected.tag)classification='new_version_published';
  else if(published===before[0].version)classification='previous_version_still_published';
  const reread=await store.read('operation',expected.tag);
  requireThat(reread && reread.id===record.id && digest(reread.value)===digest(p),'OPERATION_CHANGED');
  requireThat(contentHash(await api.getContent())===expected.hash &&
    canonical(await api.deployments())===canonical(state.deployments),'REMOTE_STATE_CHANGED');
  return {requestTag:expected.tag,classification,publishedVersion:published,createdVersion:created,
    previousVersion:before[0].version,publishedHash,expectedHash:expected.hash,
    deploymentHash:digest(d.deploymentId),operationHash:digest(p),
    existingUrlUnchanged:true,backupVerified:true,readOnly:true,
    backupDeploymentCounts:{raw:b.deployments.length,versioned:backupVersioned.length,
      unversioned:b.deployments.length-backupVersioned.length}};
}
