// Diagnostic uniquement : aucune réconciliation ni écriture distante.
import {pathToFileURL} from 'node:url';
import {Google,PrivateDrive} from './google.mjs';
import {inspect} from './core.mjs';
import {Refusal,policyFromEnv,requireThat,candidateOf,contentHash,digest,checkDeployment,deploymentState} from './validation.mjs';
export const SOURCE='894f1c63ee1f4fd5fe6dcfbcfcee4bbebcc25b4a';
export const HASH='e8b71cf7920a70e77f4d4ead41790ebf4930882a54f9efcd22d07106f419ecb8';
export const TAG='gha-43825230600';
export async function diagnose({api,store,policy,expectedHash=HASH,sourceSha=SOURCE}) {
  const state=await inspect({api,policy});
  const versioned=state.deployments.filter(d=>d.deploymentConfig?.versionNumber!==undefined);
  requireThat(versioned.length===1,'AMBIGUOUS_DEPLOYMENTS');
  const d=versioned[0];checkDeployment(d,policy,1);
  requireThat(d.deploymentConfig.description==='REC '+sourceSha+' '+TAG,'DESCRIPTION_MISMATCH');
  const snapshot=await api.getContent(1);
  requireThat(snapshot.scriptId===policy.scriptId,'WRONG_VERSION_TARGET');
  candidateOf({schema:1,sourceSha,files:snapshot.files,contentHash:expectedHash});
  const pending=await store.pending();
  requireThat(pending.length===1 && pending[0].value.tag===TAG,'PENDING_SET_MISMATCH');
  const record=await store.read('operation',TAG),p=record?.value;
  requireThat(p && digest(p)===digest(pending[0].value),'OPERATION_CHANGED');
  requireThat(p.status==='pending' && p.operation==='deploy' && p.sourceSha===sourceSha &&
    p.desiredHash===expectedHash && p.targetHash===policy.pins.scriptHash && p.account===policy.email,'PENDING_MISMATCH');
  const saved=await store.read('backup',p.checkpoint.tag),b=saved?.value;
  requireThat(b && digest(b)===p.checkpoint.hash,'BACKUP_HASH_MISMATCH');
  requireThat(b.kind==='backup' && b.schema===1 && b.tag===p.checkpoint.tag && b.targetHash===policy.pins.scriptHash &&
    b.sheetHash===policy.pins.sheetHash && b.account===policy.email && contentHash(b.content)===b.headHash,'BACKUP_TARGET_MISMATCH');
  requireThat(b.headHash===p.headBeforeHash && digest(deploymentState(b.deployments,policy))===digest(p.deploymentsBefore),'BACKUP_BASELINE_MISMATCH');
  // deploymentsBefore est un état normalisé dans le reçu, contre une liste brute dans la sauvegarde.
  return {status:'verified_read_only',version:1,files:5,versionHash:expectedHash,
    deploymentHash:digest(d.deploymentId),operationHash:digest(p),
    headMatches:state.headHash===expectedHash,pending:TAG,backupVerified:true,
    deploymentIdConfigured:policy.deploymentId===d.deploymentId,reconciliationPerformed:false};
}
export function readOnlyFetcher(fetcher=fetch) {
  return (url,options={})=>{
    const method=options.method || 'GET';
    requireThat(method==='GET' || (url==='https://oauth2.googleapis.com/token' && method==='POST'),'DIAGNOSTIC_WRITE_REFUSED');
    return fetcher(url,options);
  };
}
async function main() {
  requireThat(process.env.REC_AUTOMATION_ENABLED==='true','AUTOMATION_DISABLED');
  const policy=policyFromEnv(process.env);
  const mask=value=>process.stdout.write('::add-mask::'+String(value).replaceAll('%','%25').replaceAll('\r','%0D').replaceAll('\n','%0A')+'\n');
  const api=new Google({policy,fetcher:readOnlyFetcher(),mask});
  await api.authenticate(JSON.parse(process.env.REC_GOOGLE_OAUTH || '{}'));
  console.log(JSON.stringify(await diagnose({api,store:new PrivateDrive(api),policy}),null,2));
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)
  main().catch(e=>{console.error('REC_DIAGNOSTIC_STOP '+(e instanceof Refusal?e.code:'DIAGNOSTIC_FAILED'));process.exitCode=1;});
