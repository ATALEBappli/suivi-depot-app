// Aucune méthode Apps Script de mutation. Seuls deux fichiers Drive sont concernés.
import {pathToFileURL} from 'node:url';
import {Google,PrivateDrive} from './google.mjs';
import {inspect} from './core.mjs';
import {diagnose,HASH,SOURCE,TAG} from './diagnose-version.mjs';
import {Refusal,requireThat,isHash,digest,policyFromEnv,canonical,checkDeployment} from './validation.mjs';
export const ARCHIVE='reconcile-'+TAG;
export function reconciliationGate(env) {
  requireThat(env.REC_AUTOMATION_ENABLED==='true' && env.REC_MUTATIONS_ENABLED==='true','RECONCILIATION_DISABLED');
  requireThat(env.REC_RECONCILE_CONFIRMED==='true','MANUAL_AUDIT_REQUIRED');
}
export async function reconcile({api,store,policy,deploymentHash,operationHash,
  expectedHash=HASH,sourceSha=SOURCE,now=()=>new Date().toISOString()}) {
  requireThat(isHash(deploymentHash) && isHash(operationHash),'MISSING_PROOF_HASHES');
  const current=await store.read('operation',TAG);
  requireThat(current && ['pending','done'].includes(current.value.status),'MISSING_OPERATION');
  let archive=await store.read('backup',ARCHIVE);
  const original=current.value.status==='pending'?current.value:archive?.value.originalOperation;
  requireThat(original && original.status==='pending' && digest(original)===operationHash,'ORIGINAL_OPERATION_MISMATCH');
  const proofStore={
    read:async(kind,tag)=>kind==='operation' && tag===TAG?{...current,value:original}:store.read(kind,tag),
    pending:async()=>{
      const pending=await store.pending();
      requireThat(pending.length===(current.value.status==='pending'?1:0) &&
        pending.every(p=>p.id===current.id && digest(p.value)===operationHash),'PENDING_SET_MISMATCH');
      return [{...current,value:original}];
    }
  };
  async function verify() {
    await diagnose({api,store:proofStore,policy,expectedHash,sourceSha});
    const state=await inspect({api,policy});
    requireThat(state.headHash===expectedHash,'HEAD_CHANGED');
    const versioned=state.deployments.filter(d=>d.deploymentConfig?.versionNumber!==undefined);
    requireThat(versioned.length===1,'AMBIGUOUS_DEPLOYMENTS');
    const d=versioned[0];checkDeployment(d,policy,1);
    requireThat(d.deploymentConfig.description==='REC '+sourceSha+' '+TAG,'DESCRIPTION_MISMATCH');
    requireThat(d && digest(d.deploymentId)===deploymentHash,'DEPLOYMENT_CHANGED');
    requireThat(!policy.deploymentId || policy.deploymentId===d.deploymentId,'UNEXPECTED_DEPLOYMENT_ID');
    return {state,d};
  }
  const first=await verify();
  const archivedValue={schema:1,kind:'backup',tag:ARCHIVE,targetHash:policy.pins.scriptHash,
    sheetHash:policy.pins.sheetHash,account:policy.email,createdAt:archive?.value.createdAt || now(),
    headHash:first.state.headHash,content:{files:first.state.content.files},deployments:first.state.deployments,
    originalRecordId:current.id,originalOperation:original,operationHash,deploymentHash};
  if(!archive) {
    requireThat(current.value.status==='pending','MISSING_RECONCILIATION_BACKUP');
    await store.create('backup',ARCHIVE,archivedValue);
    archive=await store.read('backup',ARCHIVE);
  }
  requireThat(archive && digest(archive.value)===digest(archivedValue),'RECONCILIATION_BACKUP_MISMATCH');
  const fresh=await verify();
  requireThat(canonical(first.state.content.files)===canonical(fresh.state.content.files) &&
    canonical(first.state.deployments)===canonical(fresh.state.deployments),'REMOTE_STATE_CHANGED');
  const result={operation:'deploy',status:'done',requestTag:TAG,
    backupTag:original.checkpoint.tag,backupHash:original.checkpoint.hash,
    headHash:expectedHash,versionNumber:1};
  const done={...original,status:'done',completedAt:archive.value.createdAt,result,deployment:fresh.d,
    reconciliation:{schema:1,archiveTag:ARCHIVE,archiveHash:digest(archive.value),operationHash,deploymentHash}};
  const before=await store.read('operation',TAG);
  requireThat(before && before.id===current.id && digest(before.value)===digest(current.value),'OPERATION_CHANGED');
  if(current.value.status==='done')requireThat(digest(current.value)===digest(done),'COMPLETED_RECEIPT_MISMATCH');
  else await store.update(before,done);
  const after=await store.read('operation',TAG);
  requireThat(after && after.id===current.id && digest(after.value)===digest(done),'RECEIPT_VERIFICATION_FAILED');
  return {status:'reconciled',replayed:current.value.status==='done',version:1,
    deploymentHash,versionHash:expectedHash,archiveHash:digest(archive.value),
    originalBackupPreserved:true,appsScriptWrites:0};
}

// Aucun POST/PUT/PATCH/DELETE Apps Script ; seul le reçu exact peut être PATCHé.
export function reconciliationFetcher({fetcher=fetch,operationId}) {
  return (url,options={})=>{
    const u=new URL(url),method=options.method || 'GET';
    const upload=u.origin==='https://www.googleapis.com' && !u.username && !u.password &&
      u.searchParams.get('uploadType')==='multipart';
    const allowed=method==='GET' || (url==='https://oauth2.googleapis.com/token' && method==='POST') ||
      (upload && method==='POST' && u.pathname==='/upload/drive/v3/files') ||
      (upload && method==='PATCH' && operationId() && u.pathname==='/upload/drive/v3/files/'+encodeURIComponent(operationId()));
    requireThat(allowed,'RECONCILIATION_WRITE_REFUSED');return fetcher(url,options);
  };
}
async function main() {
  reconciliationGate(process.env);
  const policy=policyFromEnv(process.env);
  const mask=value=>process.stdout.write('::add-mask::'+String(value).replaceAll('%','%25').replaceAll('\r','%0D').replaceAll('\n','%0A')+'\n');
  let operationId='';
  const api=new Google({policy,fetcher:reconciliationFetcher({operationId:()=>operationId}),mask});
  await api.authenticate(JSON.parse(process.env.REC_GOOGLE_OAUTH || '{}'));
  const store=new PrivateDrive(api),record=await store.read('operation',TAG);
  requireThat(record,'MISSING_OPERATION');operationId=record.id;
  console.log(JSON.stringify(await reconcile({api,store,policy,
    deploymentHash:process.env.REC_EXPECTED_DEPLOYMENT_HASH,operationHash:process.env.REC_EXPECTED_OPERATION_HASH}),null,2));
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)
  main().catch(e=>{console.error('REC_RECONCILE_STOP '+(e instanceof Refusal?e.code:'RECONCILIATION_FAILED'));process.exitCode=1;});
