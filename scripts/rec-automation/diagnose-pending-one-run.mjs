// Lecture seule : ne publie ni version, ne réconcilie ni reçu, ne migre aucune donnée.
import {pathToFileURL} from 'node:url';
import {Google,PrivateDrive} from './google.mjs';
import {inspect} from './core.mjs';
import {inspectPendingDeploy,RECOVERY_ONE_RUN} from './inspect-pending-deploy.mjs';
import {readOnlyFetcher} from './diagnose-version.mjs';
import {Refusal,policyFromEnv,requireThat} from './validation.mjs';

export async function diagnosePendingOneRun({api,store,policy}) {
  requireThat(policy.gatewayTransport===true,'SIGNED_TRANSPORT_REQUIRED');
  const state=await inspect({api,policy});
  const pending=await store.pending();
  return inspectPendingDeploy({api,store,policy,state,pending,expected:RECOVERY_ONE_RUN});
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  (async()=>{
    requireThat(process.env.REC_AUTOMATION_ENABLED==='true','AUTOMATION_DISABLED');
    const policy=policyFromEnv(process.env);
    const api=new Google({policy,fetcher:readOnlyFetcher(),mask:()=>{}});
    await api.authenticate(JSON.parse(process.env.REC_GOOGLE_OAUTH || '{}'));
    const result=await diagnosePendingOneRun({api,store:new PrivateDrive(api),policy});
    console.log(JSON.stringify(result,null,2));
  })().catch(error=>{
    console.error('REC_DIAGNOSTIC_STOP '+(error instanceof Refusal?error.code:'DIAGNOSTIC_FAILED'));
    process.exitCode=1;
  });
}
