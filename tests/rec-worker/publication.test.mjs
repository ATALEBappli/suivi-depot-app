import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,readlinkSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {createRelease,verifyRelease,target,releaseConfig} from '../../rec-worker/release.mjs';
import {publish,gate,checkSettings,cloudflareRead,verifyPublic,runDeployment} from '../../rec-worker/publish.mjs';
const sha='a'.repeat(40),token='FICTITIOUS_TOKEN_TEST_ONLY';
function candidate(){const root=mkdtempSync(tmpdir()+'/rec-publication-');mkdirSync(root+'/compiled');writeFileSync(root+'/compiled/worker.js','// Fictitious compiled script for integrity tests only.\n'.repeat(5));const out=root+'/release',receipt=createRelease({bundle:root+'/compiled',publicDirectory:new URL('../../rec-server/public',import.meta.url).pathname,output:out,sourceSha:sha});return {root,out,receipt};}
function env(hash){return {GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:'refs/heads/main',GITHUB_REPOSITORY:target.repository,GITHUB_SHA:sha,GITHUB_WORKFLOW_SHA:sha,REC_PUBLICATION_CONFIRMED:'true',REC_RELEASE_HASH:hash,CLOUDFLARE_API_TOKEN:token};}
const bindings=()=>[...Object.entries(releaseConfig().vars).map(([name,text])=>({name,text,type:'plain_text'})),{name:'REC_AUTH',type:'durable_object_namespace',class_name:'RecAuth',namespace_id:'fictitious-namespace'},{name:'ASSETS',type:'assets'}];
function fakeRemote(out,{missing=false,subdomain=target.subdomain,postLogs={observability:{enabled:false}},assetChanged=false}={}){
 const calls=[];let deployed=false;
 return {calls,deployed:()=>{deployed=true;},fetcher:async(url,options={})=>{
  calls.push({url,method:options.method || 'GET'});
  if(url.startsWith('https://api.cloudflare.com/')){
   assert.equal(options.headers.Authorization,'Bearer '+token);assert.equal(options.redirect,'error');assert.ok(url.startsWith('https://api.cloudflare.com/client/v4/accounts/'+target.account+'/workers/'));
   if(url.endsWith('/workers/subdomain'))return Response.json({success:true,result:{subdomain}});
   if(url.endsWith('/script-settings'))return Response.json({success:true,result:postLogs});
   assert.ok(url.endsWith('/workers/scripts/'+target.worker+'/settings'));
   if(missing)return Response.json({success:false,errors:[{message:'MUST_NOT_BE_LOGGED'}]},{status:404});
   return Response.json({success:true,result:{bindings:deployed?bindings():[]}});
  }
  assert.equal(new URL(url).origin,target.origin);const path=new URL(url).pathname;
  if(path==='/rec-config.mjs')return new Response('export default Object.freeze('+JSON.stringify({apiBase:target.origin})+');');
  if(['/.env','/manifest.json','/worker.mjs'].includes(path))return new Response('',{status:404});
  if(['/api','/auth/start'].includes(path)){assert.equal(options.method,'POST');return Response.json({ok:false,error:'REC_SERVER_CONFIGURATION_REQUIRED'},{status:503});}
  return new Response(assetChanged?'changed':readFileSync(out+'/public'+(path==='/'?'/index.html':path)),{headers:{'Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'"}});
 }};
}
test('gates : jamais push/PR/branche/fork ni workflow différent ; API hors cible refusée',async()=>{
 const base=env('b'.repeat(64));gate(base);
 for(const patch of [{GITHUB_EVENT_NAME:'push'},{GITHUB_EVENT_NAME:'pull_request'},{GITHUB_REF:'refs/heads/fix/example'},{GITHUB_REPOSITORY:'other/repository'},{GITHUB_WORKFLOW_SHA:'c'.repeat(40)},{REC_PUBLICATION_CONFIRMED:'false'}])assert.throws(()=>gate({...base,...patch}),/MANUAL_MAIN_REC_REQUIRED/);
 let calls=0;await assert.rejects(cloudflareRead('/workers/scripts/other/settings',token,async()=>{calls++;}),/FORBIDDEN_API_PATH/);assert.equal(calls,0);
});
test('artefact : sources, config fixe, intégrité et absence de fichier supplémentaire',()=>{
 const c=candidate();try{
  assert.equal(verifyRelease(c.out,{sourceSha:sha,expectedHash:c.receipt.sha256}).sha256,c.receipt.sha256);
  assert.throws(()=>verifyRelease(c.out,{sourceSha:'d'.repeat(40)}),/WRONG_RELEASE_SOURCE/);
  assert.throws(()=>verifyRelease(c.out,{expectedHash:'0'.repeat(64)}),/RELEASE_HASH_MISMATCH/);
  writeFileSync(c.out+'/extra.txt','fictitious');assert.throws(()=>verifyRelease(c.out),/RELEASE_HASH_MISMATCH/);rmSync(c.out+'/extra.txt');
  const p=c.out+'/wrangler.jsonc',original=readFileSync(p);const config=JSON.parse(original);config.vars.REC_BACKEND_ENABLED='true';writeFileSync(p,JSON.stringify(config));assert.throws(()=>verifyRelease(c.out),/RELEASE_HASH_MISMATCH/);writeFileSync(p,original);
  writeFileSync(c.out+'/worker.js','changed');assert.throws(()=>verifyRelease(c.out),/RELEASE_HASH_MISMATCH/);
 }finally{rmSync(c.root,{recursive:true,force:true});}
});
test('refuse les secrets/propriétés inattendues, backend actif et DO étranger AVANT remplacement',()=>{
 for(const b of [{name:'REC_OAUTH_CLIENT_SECRET',type:'secret_text'},{name:'REC_BACKEND_ENABLED',type:'plain_text',text:'true'},{name:'REC_AUTH',type:'durable_object_namespace',class_name:'Other',namespace_id:'fictitious'},{name:'REC_AUTH',type:'durable_object_namespace',class_name:'RecAuth',namespace_id:'fictitious',script_name:'other'}])assert.throws(()=>checkSettings({bindings:[b]}));
 checkSettings({bindings:[]});checkSettings({bindings:bindings()},{after:true});assert.throws(()=>checkSettings({bindings:[]},{after:true}),/MISSING_DEPLOYED_BINDING/);
});
test('publication simulée : existence exigée, aucun autre Worker, assets exacts et API fermée',async()=>{
 const c=candidate();try{
  for(const options of [{missing:true},{subdomain:'other'}]){const remote=fakeRemote(c.out,options);let writes=0;await assert.rejects(publish(c.out,{env:env(c.receipt.sha256),fetcher:remote.fetcher,deploy:async()=>{writes++;}}));assert.equal(writes,0);}
  const remote=fakeRemote(c.out);let writes=0;const result=await publish(c.out,{env:env(c.receipt.sha256),fetcher:remote.fetcher,deploy:async config=>{writes++;assert.equal(config,c.out+'/wrangler.jsonc');remote.deployed();}});
  assert.equal(writes,1);assert.equal(result.status,'verified_public_interface_backend_disabled');assert.equal(remote.calls.some(c=>/google|other|dzkoora/i.test(c.url)),false);
  for(const c of remote.calls.filter(c=>c.url.startsWith('https://api.cloudflare.com/')))assert.equal(c.method,'GET');
  await assert.rejects(verifyPublic(c.out,{fetcher:fakeRemote(c.out,{assetChanged:true}).fetcher}),/PUBLIC_ASSET_MISMATCH/);
 }finally{rmSync(c.root,{recursive:true,force:true});}
});
test('échec/interruption après tentative : pas de deuxième déploiement ni restauration automatique',async()=>{
 const c=candidate();try{
  for(const mode of ['interrupted','postcheck']){const remote=fakeRemote(c.out,{postLogs:{observability:{enabled:true}}});let writes=0;
   await assert.rejects(publish(c.out,{env:env(c.receipt.sha256),fetcher:remote.fetcher,deploy:async()=>{writes++;if(mode==='interrupted')throw Error('interruption');remote.deployed();}}));assert.equal(writes,1);
  }
 }finally{rmSync(c.root,{recursive:true,force:true});}
});
test('workflow exclusivement manuel, secret uniquement en REC/publish, artefact unique sans recompile',()=>{
 const w=readFileSync(new URL('../../.github/workflows/rec-worker-manual.yml',import.meta.url),'utf8');
 assert.match(w,/workflow_dispatch:/);assert.doesNotMatch(w,/^  (push|pull_request|schedule|workflow_call):/m);
 const [prepare,publish]=w.split('\n  publish:');assert.equal(prepare.includes('secrets.'),false);assert.match(publish,/name: REC/);assert.match(publish,/secrets.CLOUDFLARE_API_TOKEN/);assert.equal((w.match(/secrets\./g)||[]).length,1);assert.doesNotMatch(w,/id-token: write|contents: write|continue-on-error/);assert.doesNotMatch(publish,/--dry-run|release.mjs create/);assert.match(w,/cancel-in-progress: false/);
});

test('Wrangler : compte forcé, absence de logs persistants, aucune sortie brute',()=>{
 let path;runDeployment('/fictitious/wrangler.jsonc',{env:{CLOUDFLARE_API_TOKEN:token},spawn:(command,args,options)=>{
  assert.equal(options.env.CLOUDFLARE_ACCOUNT_ID,target.account);assert.equal(options.env.WRANGLER_SEND_METRICS,'false');assert.equal(options.env.WRANGLER_LOG_SANITIZE,'true');
  path=options.env.WRANGLER_LOG_PATH;assert.equal(readlinkSync(path),'/dev/null');assert.ok(args.includes('--no-bundle'));assert.deepEqual(options.stdio,['ignore','pipe','pipe']);return {status:0,stdout:token,stderr:token};
 }});assert.equal(existsSync(path),false);
 assert.throws(()=>runDeployment('/fictitious/wrangler.jsonc',{env:{},spawn:()=>({status:1,stderr:token})}),/^Error: WORKER_DEPLOY_FAILED$/);
});
