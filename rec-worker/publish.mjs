// Seule mutation : Wrangler deploy de l'artefact vérifié, sur le Worker existant fixé.
import {spawnSync} from 'node:child_process';
import {appendFileSync,mkdtempSync,symlinkSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {target,verifyRelease} from './release.mjs';
import {requireThat,hex} from '../rec-server/security.mjs';
export function gate(env){requireThat(env.GITHUB_EVENT_NAME==='workflow_dispatch' && env.GITHUB_REF==='refs/heads/main' && env.GITHUB_REPOSITORY===target.repository && env.GITHUB_SHA===env.GITHUB_WORKFLOW_SHA && /^[a-f0-9]{40}$/.test(env.GITHUB_SHA || '') && env.REC_PUBLICATION_CONFIRMED==='true','MANUAL_MAIN_REC_REQUIRED');}
export async function cloudflareRead(path,token,fetcher=fetch){
 requireThat(typeof token==='string' && token.length>10 && !/\s/.test(token),'MISSING_REC_TOKEN');
 requireThat(['/workers/subdomain','/workers/scripts/'+target.worker+'/settings','/workers/scripts/'+target.worker+'/script-settings'].includes(path),'FORBIDDEN_API_PATH');
 const response=await fetcher('https://api.cloudflare.com/client/v4/accounts/'+target.account+path,{headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(20000)});
 requireThat(response.ok,'CLOUDFLARE_READ_FAILED_'+response.status);const body=await response.json();requireThat(body.success===true && body.result && typeof body.result==='object','CLOUDFLARE_READ_FAILED');return body.result;
}
export function checkSettings(settings,{after=false}={}){
 const vars=releaseVars();const seen=new Set();
 for(const b of settings.bindings || []){
  requireThat(!seen.has(b.name),'UNEXPECTED_EXISTING_BINDING');seen.add(b.name);
  if(b.name==='ASSETS')requireThat(b.type==='assets','UNEXPECTED_EXISTING_BINDING');
  else if(b.name==='REC_AUTH')requireThat(b.type==='durable_object_namespace' && b.class_name==='RecAuth' && typeof b.namespace_id==='string' && (!b.script_name || b.script_name===target.worker),'WRONG_DURABLE_OBJECT');
  else requireThat(b.type==='plain_text' && Object.hasOwn(vars,b.name) && b.text===vars[b.name],'UNEXPECTED_EXISTING_BINDING');
 }
 if(after)requireThat([...Object.keys(vars),'REC_AUTH','ASSETS'].every(name=>name==='ASSETS' || seen.has(name)),'MISSING_DEPLOYED_BINDING');
}
const releaseVars=()=>({APP_ENV:'REC',REC_SERVER_URL:target.origin,REC_BACKEND_ENABLED:'false',REC_USER_ALLOWLIST:'[]'});
export async function verifyPublic(directory,{fetcher=fetch}={}){
 const receipt=verifyRelease(directory),get=path=>fetcher(target.origin+path,{redirect:'error',signal:AbortSignal.timeout(20000)});
 const root=await get('/'),index=receipt.files.find(f=>f.path==='public/index.html');
 requireThat(root.ok && hex(new Uint8Array(await root.arrayBuffer()))===index?.sha256 && root.headers.get('content-security-policy')?.includes("frame-ancestors 'none'"),'PUBLIC_ASSET_MISMATCH');
 for(const f of receipt.files.filter(f=>f.path.startsWith('public/') && f.path!=='public/manifest.json')){
  const path='/'+f.path.slice(7),r=await get(path);requireThat(r.ok && hex(new Uint8Array(await r.arrayBuffer()))===f.sha256,'PUBLIC_ASSET_MISMATCH');
 }
 const config=await get('/rec-config.mjs');requireThat(config.ok && (await config.text())==='export default Object.freeze('+JSON.stringify({apiBase:target.origin})+');','WRONG_PUBLIC_ORIGIN');
 for(const path of ['/.env','/manifest.json','/worker.mjs'])requireThat((await get(path)).status===404,'PRIVATE_FILE_EXPOSED');
 for(const path of ['/api','/auth/start']){const r=await fetcher(target.origin+path,{method:'POST',headers:{Origin:target.origin,'Content-Type':'application/json'},body:'{}',redirect:'error',signal:AbortSignal.timeout(20000)});requireThat(r.status===503 && (await r.json()).error==='REC_SERVER_CONFIGURATION_REQUIRED','PRIVATE_ENTRY_NOT_CLOSED');}
 return {status:'verified_public_interface_backend_disabled',sha256:receipt.sha256,url:target.origin};
}
export async function publish(directory,{env=process.env,fetcher=fetch,deploy}={}){
 gate(env);const receipt=verifyRelease(directory,{sourceSha:env.GITHUB_SHA,expectedHash:env.REC_RELEASE_HASH});requireThat(/^[a-f0-9]{64}$/.test(env.REC_RELEASE_HASH || ''),'MISSING_RELEASE_HASH');
 const token=env.CLOUDFLARE_API_TOKEN;
 requireThat((await cloudflareRead('/workers/subdomain',token,fetcher)).subdomain===target.subdomain,'WRONG_ACCOUNT_SUBDOMAIN');
 checkSettings(await cloudflareRead('/workers/scripts/'+target.worker+'/settings',token,fetcher)); // 404/mauvais droit => arrêt AVANT deploy ; jamais créer un second Worker.
 await deploy(resolve(directory,'wrangler.jsonc'));
 verifyRelease(directory,{sourceSha:env.GITHUB_SHA,expectedHash:receipt.sha256});
 checkSettings(await cloudflareRead('/workers/scripts/'+target.worker+'/settings',token,fetcher),{after:true});
 const logs=await cloudflareRead('/workers/scripts/'+target.worker+'/script-settings',token,fetcher);
 requireThat(logs.observability?.enabled===false && logs.logpush!==true && !(logs.tail_consumers?.length),'UNEXPECTED_LOG_COLLECTION');
 return verifyPublic(directory,{fetcher});
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
 catch(e){const known=['MANUAL_MAIN_REC_REQUIRED','WRONG_RELEASE_SOURCE','RELEASE_HASH_MISMATCH','WRONG_RELEASE_TARGET_OR_FLAGS','MISSING_RELEASE_HASH','MISSING_REC_TOKEN','CLOUDFLARE_READ_FAILED','WRONG_ACCOUNT_SUBDOMAIN','UNEXPECTED_EXISTING_BINDING','WRONG_DURABLE_OBJECT','MISSING_DEPLOYED_BINDING','UNEXPECTED_LOG_COLLECTION','WORKER_DEPLOY_FAILED','PUBLIC_ASSET_MISMATCH','WRONG_PUBLIC_ORIGIN','PRIVATE_FILE_EXPOSED','PRIVATE_ENTRY_NOT_CLOSED'];console.error('REC_WORKER_STOP '+((known.includes(e.message) || /^CLOUDFLARE_READ_FAILED_[0-9]{3}$/.test(e.message))?e.message:'PUBLICATION_NOT_VERIFIED'));process.exitCode=1;}
}
