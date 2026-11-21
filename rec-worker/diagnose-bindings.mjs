// Diagnostic strictement en lecture seule : un GET Cloudflare, aucun déploiement.
import {cloudflareRead,cloudflareReadErrorCode,checkSettings} from './publish.mjs';
import {target} from './release.mjs';
import {pathToFileURL} from 'node:url';

export function backendBindingFailure(settings){
 const matches=(settings.bindings || []).filter(b=>b.name==='REC_BACKEND_ENABLED');
 if(matches.length===0)return 'REC_BACKEND_MISSING';
 if(matches.length>1)return 'REC_BACKEND_DUPLICATE';
 const binding=matches[0];
 if(binding.type!=='plain_text')return 'REC_BACKEND_WRONG_BINDING_TYPE';
 if(typeof binding.text!=='string')return 'REC_BACKEND_VALUE_NOT_TEXT';
 if(binding.text!=='true'){
  if(binding.text.trim()==='true')return 'REC_BACKEND_EXTRA_WHITESPACE';
  if(binding.text.toLowerCase()==='true')return 'REC_BACKEND_WRONG_CASE';
  return 'REC_BACKEND_VALUE_MISMATCH';
 }
 return 'REC_BACKEND_OTHER_MISMATCH';
}
export function diagnosticCode(error){
 const code=error?.message || '';
 if(/^REC_BACKEND_(MISSING|DUPLICATE|WRONG_BINDING_TYPE|VALUE_NOT_TEXT|EXTRA_WHITESPACE|WRONG_CASE|VALUE_MISMATCH|OTHER_MISMATCH)$/.test(code))return code;
 if(/^UNEXPECTED_EXISTING_BINDING_(APP_ENV|REC_SERVER_URL|REC_BACKEND_ENABLED|REC_USER_ALLOWLIST|REC_AUTH_MODE|ASSETS|REC_AUTH|REC_OAUTH_CLIENT_ID|REC_OAUTH_CLIENT_SECRET|REC_APPS_SCRIPT_URL|REC_GATEWAY_KEY|REC_BOOTSTRAP_ADMIN|REC_BOOTSTRAP_SETUP_TOKEN|UNKNOWN_NAME)$/.test(code))return code;
 if(['REC_BACKEND_NOT_ACTIVE','OAUTH_CONFIGURATION_INCOMPLETE','MISSING_DEPLOYED_BINDING'].includes(code))return code;
 return cloudflareReadErrorCode(error) || 'DIAGNOSTIC_UNAVAILABLE';
}
export async function diagnose(env,{fetcher=fetch}={}){
 if(env.GITHUB_EVENT_NAME!=='workflow_dispatch' || env.GITHUB_REF!=='refs/heads/main' || env.GITHUB_REPOSITORY!==target.repository)throw Error('MANUAL_MAIN_REC_REQUIRED');
 const settings=await cloudflareRead('/workers/scripts/'+target.worker+'/settings',env.CLOUDFLARE_API_TOKEN,fetcher,'PRE_WORKER_SETTINGS');
 try{checkSettings(settings);}catch(error){
  if(error?.message==='UNEXPECTED_EXISTING_BINDING_REC_BACKEND_ENABLED')throw Error(backendBindingFailure(settings));
  throw error;
 }
 return {status:'bindings_validated',worker:target.worker};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
 try{console.log(JSON.stringify(await diagnose(process.env)));}
 catch(error){console.error('REC_DIAGNOSTIC '+diagnosticCode(error));process.exitCode=1;}
}
