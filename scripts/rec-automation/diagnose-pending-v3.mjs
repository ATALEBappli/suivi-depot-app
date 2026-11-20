// Diagnostic du seul reçu v3 : ne modifie ni Apps Script ni Drive.
import {Google,PrivateDrive} from './google.mjs';
import {pathToFileURL} from 'node:url';
import {inspect} from './core.mjs';
import {inspectPendingDeploy,RECOVERY_V3} from './inspect-pending-deploy.mjs';
import {readOnlyFetcher} from './diagnose-version.mjs';
import {Refusal,policyFromEnv,requireThat} from './validation.mjs';

export async function diagnosePendingV3({api,store,policy}) {
  requireThat(policy.gatewayTransport===true,'SIGNED_TRANSPORT_REQUIRED');
  const state=await inspect({api,policy}),pending=await store.pending();
  return inspectPendingDeploy({api,store,policy,state,pending,expected:RECOVERY_V3});
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  (async()=>{
    requireThat(process.env.REC_AUTOMATION_ENABLED==='true','AUTOMATION_DISABLED');
    const policy=policyFromEnv(process.env);
    const api=new Google({policy,fetcher:readOnlyFetcher(),mask:()=>{}});
    await api.authenticate(JSON.parse(process.env.REC_GOOGLE_OAUTH || '{}'));
    const result=await diagnosePendingV3({api,store:new PrivateDrive(api),policy});
    console.log(JSON.stringify(result,null,2));
  })().catch(e=>{console.error('REC_DIAGNOSTIC_STOP '+(e instanceof Refusal?e.code:'DIAGNOSTIC_FAILED'));process.exitCode=1;});
}
