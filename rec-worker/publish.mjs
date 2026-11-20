// Seule mutation : Wrangler deploy de l'artefact vérifié, sur le Worker existant fixé.
import {spawnSync} from 'node:child_process';
import {appendFileSync,mkdtempSync,symlinkSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {target,verifyRelease} from './release.mjs';
import {requireThat,hex,pins} from '../rec-server/security.mjs';
export function gate(env){requireThat(env.GITHUB_EVENT_NAME==='workflow_dispatch' && env.GITHUB_REF==='refs/heads/main' && env.GITHUB_REPOSITORY===target.repository && env.GITHUB_SHA===env.GITHUB_WORKFLOW_SHA && /^[a-f0-9]{40}$/.test(env.GITHUB_SHA || '') && env.REC_PUBLICATION_CONFIRMED==='true','MANUAL_MAIN_REC_REQUIRED');}
const workerPath='/workers/scripts/'+target.worker;
const readSteps=Object.freeze({PRE_WORKER_SUBDOMAIN:workerPath+'/subdomain',PRE_WORKER_SETTINGS:workerPath+'/settings',POST_WORKER_SETTINGS:workerPath+'/settings',POST_LOG_SETTINGS:workerPath+'/script-settings'});
export async function cloudflareRead(path,token,fetcher=fetch,requestedStep){
 requireThat(typeof token==='string' && token.length>10 && !/\s/.test(token),'MISSING_REC_TOKEN');
 const step=requestedStep || Object.keys(readSteps).find(k=>readSteps[k]===path);
 requireThat(Object.hasOwn(readSteps,step) && readSteps[step]===path,'FORBIDDEN_API_PATH');
 const failure=reason=>Error('CLOUDFLARE_READ_'+step+'_'+reason);
 let response;
 try{response=await fetcher('https://api.cloudflare.com/client/v4/accounts/'+target.account+path,{headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(20000)});}catch{throw failure('NETWORK_ERROR');}
 if(!response.ok)throw failure('HTTP_'+response.status);
 let body;try{body=await response.json();}catch{throw failure('INVALID_RESPONSE');}
 if(body?.success!==true || !body.result || typeof body.result!=='object')throw failure('INVALID_RESPONSE');
 return body.result;
}
// Seuls des noms d'étape et raisons prédéfinis peuvent sortir dans les logs.
export function cloudflareReadErrorCode(error){return /^CLOUDFLARE_READ_(PRE_WORKER_SUBDOMAIN|PRE_WORKER_SETTINGS|POST_WORKER_SETTINGS|POST_LOG_SETTINGS)_(HTTP_[0-9]{3}|NETWORK_ERROR|INVALID_RESPONSE)$/.test(error?.message || '')?error.message:null;}
export function checkSettings(settings,{after=false,deploymentPin=pins.deployment}={}){
 const vars=releaseVars();const seen=new Set();
 for(const b of settings.bindings || []){
  requireThat(!seen.has(b.name),'UNEXPECTED_EXISTING_BINDING');seen.add(b.name);
  if(b.name==='ASSETS')requireThat(b.type==='assets','UNEXPECTED_EXISTING_BINDING');
  else if(b.name==='REC_AUTH')requireThat(b.type==='durable_object_namespace' && b.class_name==='RecAuth' && typeof b.namespace_id==='string' && (!b.script_name || b.script_name===target.worker),'WRONG_DURABLE_OBJECT');
  else if(['REC_OAUTH_CLIENT_SECRET','REC_GATEWAY_KEY','REC_BOOTSTRAP_ADMIN'].includes(b.name))requireThat(b.type==='secret_text','UNEXPECTED_EXISTING_BINDING');
  else if(b.name==='REC_OAUTH_CLIENT_ID')requireThat(b.type==='plain_text' && /^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(b.text || ''),'UNEXPECTED_EXISTING_BINDING');
  else if(b.name==='REC_APPS_SCRIPT_URL'){
   const match=b.type==='plain_text' && typeof b.text==='string' && b.text.match(/^https:\/\/script\.google\.com\/macros\/s\/([A-Za-z0-9_-]+)\/exec$/);
   requireThat(match && hex(match[1])===deploymentPin,'UNEXPECTED_EXISTING_BINDING');
  }
  else requireThat(b.type==='plain_text' && Object.hasOwn(vars,b.name) && b.text===vars[b.name],'UNEXPECTED_EXISTING_BINDING');
 }
 if(after)requireThat([...Object.keys(vars),'REC_AUTH','ASSETS'].every(name=>name==='ASSETS' || seen.has(name)),'MISSING_DEPLOYED_BINDING');
 const oauth=['REC_OAUTH_CLIENT_ID','REC_OAUTH_CLIENT_SECRET'],backend=['REC_APPS_SCRIPT_URL','REC_GATEWAY_KEY'];
 const complete=names=>{const n=names.filter(name=>seen.has(name)).length;requireThat(n===0 || n===names.length,'OAUTH_CONFIGURATION_INCOMPLETE');return n===names.length;};
 return {oauthConfigured:complete(oauth),backendConfigured:complete(backend),bootstrapConfigured:seen.has('REC_BOOTSTRAP_ADMIN')};
}
// ScriptSetting.observability et tail_consumers sont optionnels et nullables.
// Absence = fonctionnalité non configurée ; un objet présent doit rester explicite.
export function checkLogSettings(settings){
 const object=v=>v!==null && typeof v==='object' && !Array.isArray(v);
 const off=v=>v===undefined || v===false;
 const empty=v=>v==null || (Array.isArray(v) && v.length===0);
 const reject=()=>requireThat(false,'UNEXPECTED_LOG_COLLECTION');
 if(!object(settings) || !off(settings.logpush) || !empty(settings.tail_consumers))reject();
 const obs=settings.observability;
 if(obs==null)return; // Schéma officiel : undefined ou null, pas de collecte configurée.
 if(!object(obs) || obs.enabled!==false)reject();
 for(const name of ['logs','traces','issues','agents']){
  const channel=obs[name];if(channel==null)continue;
  if(!object(channel) || !(name==='logs'?channel.enabled===false:off(channel.enabled)))reject();
  // Une destination reste interdite, même si le canal est déclaré inactif.
  if(!empty(channel.destinations))reject();
 }
}
const releaseVars=()=>({APP_ENV:'REC',REC_SERVER_URL:target.origin,REC_BACKEND_ENABLED:'false',REC_USER_ALLOWLIST:'[]',REC_AUTH_MODE:'local'});
export async function verifyPublic(directory,{fetcher=fetch,oauthConfigured=false}={}){
 const receipt=verifyRelease(directory),get=path=>fetcher(target.origin+path,{redirect:'error',signal:AbortSignal.timeout(20000)});
 const root=await get('/'),index=receipt.files.find(f=>f.path==='public/local/index.html');
 requireThat(root.ok && hex(new Uint8Array(await root.arrayBuffer()))===index?.sha256 && root.headers.get('content-security-policy')?.includes("frame-ancestors 'none'"),'PUBLIC_ASSET_MISMATCH');
 for(const f of receipt.files.filter(f=>f.path.startsWith('public/') && f.path!=='public/manifest.json')){
  const path='/'+f.path.slice(7),r=await get(path);requireThat(r.ok && hex(new Uint8Array(await r.arrayBuffer()))===f.sha256,'PUBLIC_ASSET_MISMATCH');
 }
 const config=await get('/rec-config.mjs');requireThat(config.ok && (await config.text())==='export default Object.freeze('+JSON.stringify({apiBase:target.origin})+');','WRONG_PUBLIC_ORIGIN');
 for(const path of ['/.env','/manifest.json','/worker.mjs'])requireThat((await get(path)).status===404,'PRIVATE_FILE_EXPOSED');
 for(const path of ['/api','/auth/start']){
  const r=await get(path),body=await r.json();requireThat(r.status===403 && body.ok===false,'PRIVATE_ENTRY_NOT_CLOSED');
 }
 const session=await get('/local/session'),state=await session.json();
 requireThat(session.ok && state.ok===true && state.user===null && state.csrf===null && state.backendEnabled===false,'PRIVATE_ENTRY_NOT_CLOSED');
 const anonymous=await fetcher(target.origin+'/local/api',{method:'POST',headers:{Origin:target.origin,'Content-Type':'application/json'},body:JSON.stringify({action:'rec.status'}),redirect:'error',signal:AbortSignal.timeout(20000)});
 const blocked=await anonymous.json();requireThat(anonymous.status===403 && blocked.error==='SESSION_REQUIRED','PRIVATE_ENTRY_NOT_CLOSED');
 return {status:'verified_public_interface_backend_disabled',sha256:receipt.sha256,url:target.origin};
}
export async function publish(directory,{env=process.env,fetcher=fetch,deploy}={}){
 gate(env);const receipt=verifyRelease(directory,{sourceSha:env.GITHUB_SHA,expectedHash:env.REC_RELEASE_HASH});requireThat(/^[a-f0-9]{64}$/.test(env.REC_RELEASE_HASH || ''),'MISSING_RELEASE_HASH');
 const token=env.CLOUDFLARE_API_TOKEN;
 requireThat((await cloudflareRead(workerPath+'/subdomain',token,fetcher,'PRE_WORKER_SUBDOMAIN')).enabled===true,'WORKER_SUBDOMAIN_NOT_ENABLED');
 const pre=checkSettings(await cloudflareRead(workerPath+'/settings',token,fetcher,'PRE_WORKER_SETTINGS')); // 404/mauvais droit => arrêt AVANT deploy ; jamais créer un second Worker.
 await deploy(resolve(directory,'wrangler.jsonc'));
 verifyRelease(directory,{sourceSha:env.GITHUB_SHA,expectedHash:receipt.sha256});
 const post=checkSettings(await cloudflareRead(workerPath+'/settings',token,fetcher,'POST_WORKER_SETTINGS'),{after:true});
 requireThat(pre.oauthConfigured===post.oauthConfigured && pre.backendConfigured===post.backendConfigured && pre.bootstrapConfigured===post.bootstrapConfigured,'OAUTH_CONFIGURATION_CHANGED');
 const logs=await cloudflareRead(workerPath+'/script-settings',token,fetcher,'POST_LOG_SETTINGS');
 checkLogSettings(logs);
 return verifyPublic(directory,{fetcher,oauthConfigured:post.oauthConfigured});
}
export function runDeployment(config,{env=process.env,spawn=spawnSync}={}){
 const temp=mkdtempSync(tmpdir()+'/rec-wrangler-logs-');
 try{
  const logfile=temp+'/discard.log';symlinkSync('/dev/null',logfile);
  const child=spawn(process.execPath,[resolve('rec-worker/node_modules/wrangler/bin/wrangler.js'),'deploy','--config',config,'--no-bundle'],{env:{...env,CLOUDFLARE_ACCOUNT_ID:target.account,CLOUDFLARE_ENV:'',WRANGLER_SEND_METRICS:'false',WRANGLER_LOG:'error',WRANGLER_LOG_SANITIZE:'true',WRANGLER_LOG_PATH:logfile,CI:'true'},stdio:['ignore','pipe','pipe'],maxBuffer:3000000});
  // Aucun log Wrangler persistant ; stdout/stderr capturés ne sont jamais reproduits.
  requireThat(child.status===0,'WORKER_DEPLOY_FAILED');
 }finally{rmSync(temp,{recursive:true,force:true});}
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
 try{const result=await publish(process.argv[2],{deploy:async config=>runDeployment(config)});console.log(JSON.stringify(result));if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,`Interface REC vérifiée : ${result.url}\n\nBundle SHA-256 : ${result.sha256}\n\nBackend désactivé.\n`);}
 catch(e){const known=['MANUAL_MAIN_REC_REQUIRED','WRONG_RELEASE_SOURCE','RELEASE_HASH_MISMATCH','WRONG_RELEASE_TARGET_OR_FLAGS','MISSING_RELEASE_HASH','MISSING_REC_TOKEN','WORKER_SUBDOMAIN_NOT_ENABLED','UNEXPECTED_EXISTING_BINDING','WRONG_DURABLE_OBJECT','MISSING_DEPLOYED_BINDING','OAUTH_CONFIGURATION_INCOMPLETE','OAUTH_CONFIGURATION_CHANGED','UNEXPECTED_LOG_COLLECTION','WORKER_DEPLOY_FAILED','PUBLIC_ASSET_MISMATCH','WRONG_PUBLIC_ORIGIN','PRIVATE_FILE_EXPOSED','PRIVATE_ENTRY_NOT_CLOSED'];console.error('REC_WORKER_STOP '+((known.includes(e.message)?e.message:cloudflareReadErrorCode(e)) || 'PUBLICATION_NOT_VERIFIED'));process.exitCode=1;}
}
