import {readFileSync,writeFileSync,appendFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {Refusal,requireThat,digest,policyFromEnv,canonical} from './validation.mjs';
import {packageCommit} from './package.mjs';
import {Google,PrivateDrive} from './google.mjs';
import {operate} from './core.mjs';

const mask=value=>process.stdout.write('::add-mask::'+String(value).replaceAll('%','%25').replaceAll('\r','%0D').replaceAll('\n','%0A')+'\n');
function summary(result,env) {
  const text=JSON.stringify(result,null,2);
  process.stdout.write(text+'\n');
  if(env.GITHUB_STEP_SUMMARY)writeFileSync(env.GITHUB_STEP_SUMMARY,'## REC Apps Script\n\n```json\n'+text+'\n```\n');
}
export function executionGate(env) {
  requireThat(env.REC_AUTOMATION_ENABLED==='true','AUTOMATION_DISABLED');
  requireThat(['inspect','install','deploy','restore'].includes(env.REC_OPERATION),'INVALID_OPERATION');
  if(env.REC_OPERATION!=='inspect')requireThat(env.REC_MUTATIONS_ENABLED==='true','MUTATIONS_DISABLED');
}
export async function main(args=process.argv.slice(2),env=process.env) {
  const [mode,file]=args;
  if(mode==='package') {
    requireThat(typeof file==='string','MISSING_OUTPUT_PATH');
    const value=packageCommit(env.SOURCE_SHA);writeFileSync(file,JSON.stringify(value)+'\n',{mode:0o600,flag:'wx'});
    if(env.GITHUB_OUTPUT)appendFileSync(env.GITHUB_OUTPUT,'content_hash='+value.contentHash+'\n');
    summary({sourceSha:value.sourceSha,contentHash:value.contentHash,files:value.files.length},env);return;
  }
  requireThat(mode==='run' || mode==='gate','INVALID_MODE');
  executionGate(env);
  if(mode==='gate'){process.stdout.write('REC activation gates passed. Aucun accès Google.\n');return;}
  const policy=policyFromEnv(env);
  // Aucun token n'est envoyé avant validation des empreintes de cible fixes.
  let credentials;try{credentials=JSON.parse(env.REC_GOOGLE_OAUTH || '');}catch{throw new Refusal('INVALID_OAUTH_CONFIGURATION');}
  for(const key of ['REC_SCRIPT_ID','REC_SHEET_ID','REC_OWNER_EMAIL','REC_GOOGLE_EMAIL','REC_DEPLOYMENT_ID'])if(env[key])mask(env[key]);
  const operation=env.REC_OPERATION;
  const candidate=['install','deploy'].includes(operation)?JSON.parse(readFileSync(file,'utf8')):undefined;
  if(candidate) {
    requireThat(candidate.sourceSha===env.SOURCE_SHA,'SOURCE_SHA_MISMATCH');
    requireThat(candidate.contentHash===env.REC_EXPECTED_BUNDLE_HASH,'BUNDLE_PROVENANCE_MISMATCH');
  }
  requireThat(typeof env.GITHUB_RUN_ID==='string' && /^\d+$/.test(env.GITHUB_RUN_ID),'MISSING_RUN_ID');
  const api=new Google({policy,mask});await api.authenticate(credentials);
  const request={operation,candidate,requestTag:'gha-'+env.GITHUB_RUN_ID,
    auditConfirmed:env.REC_AUDIT_CONFIRMED==='true',expectedHeadHash:env.REC_EXPECTED_HEAD_HASH || '',
    backupTag:env.REC_BACKUP_REFERENCE || '',backupHash:env.REC_BACKUP_HASH || '',
    recoveryTag:env.REC_RECOVERY_REFERENCE || '',restoreDeployment:env.REC_RESTORE_DEPLOYMENT==='true'};
  const result=await operate({request,api,store:new PrivateDrive(api),policy});summary(result,env);
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  main().catch(error=>{
    // Pas de stack, corps d'erreur Google, URL, identité, source ou credentials.
    const code=error instanceof Refusal?error.code:'AUTOMATION_FAILED';
    process.stderr.write('REC_STOP '+code+(error.uncertain?' — résultat distant incertain, inspecter avant toute reprise.':'')+'\n');
    process.exitCode=1;
  });
}
