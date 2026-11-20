import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,readlinkSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {createRelease,verifyRelease,target,releaseConfig} from '../../rec-worker/release.mjs';
import {publish,gate,checkSettings,cloudflareRead,verifyPublic,runDeployment,cloudflareReadErrorCode,checkLogSettings} from '../../rec-worker/publish.mjs';
import {hex} from '../../rec-server/security.mjs';
const sha='a'.repeat(40),token='FICTITIOUS_TOKEN_TEST_ONLY';
function candidate(){const root=mkdtempSync(tmpdir()+'/rec-publication-');mkdirSync(root+'/compiled');writeFileSync(root+'/compiled/worker.js','// Fictitious compiled script for integrity tests only.\n'.repeat(5));const out=root+'/release',receipt=createRelease({bundle:root+'/compiled',publicDirectory:new URL('../../rec-server/public',import.meta.url).pathname,output:out,sourceSha:sha});return {root,out,receipt};}
function env(hash){return {GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:'refs/heads/main',GITHUB_REPOSITORY:target.repository,GITHUB_SHA:sha,GITHUB_WORKFLOW_SHA:sha,REC_PUBLICATION_CONFIRMED:'true',REC_RELEASE_HASH:hash,CLOUDFLARE_API_TOKEN:token};}
const bindings=()=>[...Object.entries(releaseConfig().vars).map(([name,text])=>({name,text,type:'plain_text'})),{name:'REC_AUTH',type:'durable_object_namespace',class_name:'RecAuth',namespace_id:'fictitious-namespace'},{name:'ASSETS',type:'assets'}];
function oauthBindings(){return [{name:'REC_OAUTH_CLIENT_ID',type:'plain_text',text:'12345-fictitious.apps.googleusercontent.com'},{name:'REC_OAUTH_CLIENT_SECRET',type:'secret_text'},{name:'REC_GATEWAY_KEY',type:'secret_text'}];}
function fakeRemote(out,{missing=false,enabled=true,postLogs={observability:{enabled:false}},assetChanged=false,oauth=false,removeOAuthAfter=false}={}){
 const calls=[];let deployed=false;
 return {calls,deployed:()=>{deployed=true;},fetcher:async(url,options={})=>{
  calls.push({url,method:options.method || 'GET'});
  if(url.startsWith('https://api.cloudflare.com/')){
   assert.equal(options.headers.Authorization,'Bearer '+token);assert.equal(options.redirect,'error');assert.ok(url.startsWith('https://api.cloudflare.com/client/v4/accounts/'+target.account+'/workers/'));
   if(url.endsWith('/workers/scripts/'+target.worker+'/subdomain'))return Response.json({success:true,result:{enabled,previews_enabled:false}});
   if(url.endsWith('/script-settings'))return Response.json({success:true,result:postLogs});
   assert.ok(url.endsWith('/workers/scripts/'+target.worker+'/settings'));
   if(missing)return Response.json({success:false,errors:[{message:'MUST_NOT_BE_LOGGED'}]},{status:404});
   return Response.json({success:true,result:{bindings:[...(deployed?bindings():[]),...(oauth && (!deployed || !removeOAuthAfter)?oauthBindings():[])]}});
  }
  assert.equal(new URL(url).origin,target.origin);const path=new URL(url).pathname;
  if(path==='/rec-config.mjs')return new Response('export default Object.freeze('+JSON.stringify({apiBase:target.origin})+');');
  if(['/.env','/manifest.json','/worker.mjs'].includes(path))return new Response('',{status:404});
  if(['/api','/auth/start'].includes(path))return Response.json({ok:false,error:'REC_SERVER_CONFIGURATION_REQUIRED'},{status:403});
  if(path==='/local/session')return Response.json({ok:true,user:null,csrf:null,backendEnabled:false,bootstrapRequired:true});
  if(path==='/local/api')return Response.json({ok:false,error:'SESSION_REQUIRED'},{status:403});
  return new Response(assetChanged?'changed':readFileSync(out+'/public'+(path==='/'?'/local/index.html':path)),{headers:{'Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'"}});
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
 for(const b of [{name:'REC_OAUTH_CLIENT_SECRET',type:'plain_text',text:'exposed'},{name:'REC_GATEWAY_KEY',type:'plain_text',text:'exposed'},{name:'REC_OAUTH_CLIENT_ID',type:'plain_text',text:'invalid'},{name:'REC_APPS_SCRIPT_URL',type:'plain_text',text:'https://script.google.com/macros/s/WRONG/exec'},{name:'REC_BACKEND_ENABLED',type:'plain_text',text:'true'},{name:'REC_AUTH',type:'durable_object_namespace',class_name:'Other',namespace_id:'fictitious'},{name:'REC_AUTH',type:'durable_object_namespace',class_name:'RecAuth',namespace_id:'fictitious',script_name:'other'}])assert.throws(()=>checkSettings({bindings:[b]}));
 assert.throws(()=>checkSettings({bindings:oauthBindings()}),/OAUTH_CONFIGURATION_INCOMPLETE/);
 checkSettings({bindings:[]});checkSettings({bindings:bindings()},{after:true});assert.throws(()=>checkSettings({bindings:[]},{after:true}),/MISSING_DEPLOYED_BINDING/);
});
test('OAuth REC : quatre paramètres requis, secrets privés et cible Apps Script épinglée',()=>{
 const deployment='FICTITIOUS_REC_DEPLOYMENT',pin=hex(deployment);
 const configured=[...oauthBindings(),{name:'REC_APPS_SCRIPT_URL',type:'plain_text',text:'https://script.google.com/macros/s/'+deployment+'/exec'}];
 assert.equal(checkSettings({bindings:configured},{deploymentPin:pin}).oauthConfigured,true);
 assert.throws(()=>checkSettings({bindings:configured},{deploymentPin:hex('WRONG')}),/UNEXPECTED_EXISTING_BINDING/);
 for(const b of configured){assert.throws(()=>checkSettings({bindings:configured.filter(x=>x!==b)},{deploymentPin:pin}),/OAUTH_CONFIGURATION_INCOMPLETE/);}
});
test('OAuth présent sans configuration complète : publication bloquée avant toute écriture',async()=>{
 const c=candidate();try{const remote=fakeRemote(c.out,{oauth:true});let writes=0;
  await assert.rejects(publish(c.out,{env:env(c.receipt.sha256),fetcher:remote.fetcher,deploy:async()=>{writes++;}}),/OAUTH_CONFIGURATION_INCOMPLETE/);
  assert.equal(writes,0);
 }finally{rmSync(c.root,{recursive:true,force:true});}
});
test('contrôle public OAuth préparé : requêtes GET seulement et API privée fermée',async()=>{
 const c=candidate();try{const remote=fakeRemote(c.out,{oauth:true});
  const result=await verifyPublic(c.out,{fetcher:remote.fetcher,oauthConfigured:true});
  assert.equal(result.status,'verified_public_interface_backend_disabled');
  assert.deepEqual(remote.calls.filter(x=>x.method==='POST').map(x=>new URL(x.url).pathname),['/local/api']);
 }finally{rmSync(c.root,{recursive:true,force:true});}
});
test('publication simulée : existence exigée, aucun autre Worker, assets exacts et API fermée',async()=>{
 const c=candidate();try{
  for(const options of [{missing:true},{enabled:false}]){const remote=fakeRemote(c.out,options);let writes=0;await assert.rejects(publish(c.out,{env:env(c.receipt.sha256),fetcher:remote.fetcher,deploy:async()=>{writes++;}}));assert.equal(writes,0);}
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

test('Individual Workers Editor : aucun appel compte global, contrôles Worker existant et sous-domaine préservés',async()=>{
 const c=candidate();try{
  const remote=fakeRemote(c.out);let writes=0,globalCalls=0;
  const scoped=async(url,options)=>{if(new URL(url).pathname.endsWith('/workers/subdomain')){globalCalls++;return Response.json({success:false,errors:[{message:'FICTITIOUS_PRIVATE_ERROR'}]},{status:400});}return remote.fetcher(url,options);};
  const result=await publish(c.out,{env:env(c.receipt.sha256),fetcher:scoped,deploy:async()=>{writes++;remote.deployed();}});
  assert.equal(globalCalls,0);assert.equal(writes,1);assert.equal(result.status,'verified_public_interface_backend_disabled');
  assert.ok(remote.calls[0].url.endsWith('/workers/scripts/'+target.worker+'/subdomain'));
  const denied=fakeRemote(c.out,{enabled:false});writes=0;
  await assert.rejects(publish(c.out,{env:env(c.receipt.sha256),fetcher:denied.fetcher,deploy:async()=>{writes++;}}),/WORKER_SUBDOMAIN_NOT_ENABLED/);assert.equal(writes,0);
 }finally{rmSync(c.root,{recursive:true,force:true});}
});
test('diagnostic de chaque lecture : étape + statut, sans corps/jeton/exception brute ni poursuite',async()=>{
 const steps={PRE_WORKER_SUBDOMAIN:'/subdomain',PRE_WORKER_SETTINGS:'/settings',POST_WORKER_SETTINGS:'/settings',POST_LOG_SETTINGS:'/script-settings'};
 for(const [step,suffix]of Object.entries(steps)){
  const path='/workers/scripts/'+target.worker+suffix;
  for(const status of [400,401,403,404]){
   let bodyRead=false;const response={ok:false,status,json:async()=>{bodyRead=true;return {errors:[{message:token}]};}};
   await assert.rejects(cloudflareRead(path,token,async()=>response,step),e=>{assert.equal(cloudflareReadErrorCode(e),'CLOUDFLARE_READ_'+step+'_HTTP_'+status);assert.equal(e.message.includes(token),false);return true;});assert.equal(bodyRead,false);
  }
  await assert.rejects(cloudflareRead(path,token,async()=>{throw Error(token);},step),e=>cloudflareReadErrorCode(e)==='CLOUDFLARE_READ_'+step+'_NETWORK_ERROR');
  await assert.rejects(cloudflareRead(path,token,async()=>({ok:true,json:async()=>{throw Error(token);}}),step),e=>cloudflareReadErrorCode(e)==='CLOUDFLARE_READ_'+step+'_INVALID_RESPONSE');
 }
 assert.equal(cloudflareReadErrorCode(Error(token)),null);
 let called=false;await assert.rejects(cloudflareRead('/workers/subdomain',token,async()=>{called=true;}),/FORBIDDEN_API_PATH/);assert.equal(called,false);
 await assert.rejects(cloudflareRead('/workers/scripts/'+target.worker+'/settings',token,async()=>{called=true;},'PRE_WORKER_SUBDOMAIN'),/FORBIDDEN_API_PATH/);assert.equal(called,false);
 const c=candidate();try{let writes=0;await assert.rejects(publish(c.out,{env:env(c.receipt.sha256),fetcher:async()=>new Response('',{status:400}),deploy:async()=>{writes++;}}),/CLOUDFLARE_READ_PRE_WORKER_SUBDOMAIN_HTTP_400/);assert.equal(writes,0);}finally{rmSync(c.root,{recursive:true,force:true});}
});

test('publish : diagnostic pré/post exact, arrêt sans poursuite et sans reprise automatique',async()=>{
 const c=candidate();try{
  const steps={PRE_WORKER_SUBDOMAIN:'/subdomain',PRE_WORKER_SETTINGS:'/settings',POST_WORKER_SETTINGS:'/settings',POST_LOG_SETTINGS:'/script-settings'};
  for(const [step,suffix]of Object.entries(steps)){
   const remote=fakeRemote(c.out);let writes=0;
   const fetcher=async(url,options)=>{const phase=writes===0?'PRE':'POST';if(url.startsWith('https://api.cloudflare.com/') && url.endsWith('/workers/scripts/'+target.worker+suffix) && step.startsWith(phase+'_'))return new Response(token,{status:400});return remote.fetcher(url,options);};
   await assert.rejects(publish(c.out,{env:env(c.receipt.sha256),fetcher,deploy:async()=>{writes++;remote.deployed();}}),e=>cloudflareReadErrorCode(e)==='CLOUDFLARE_READ_'+step+'_HTTP_400');
   assert.equal(writes,step.startsWith('PRE_')?0:1);
  }
 }finally{rmSync(c.root,{recursive:true,force:true});}
});

test('régression logs OFF : ScriptSetting nullable/omis équivaut à une collecte non configurée',()=>{
 for(const settings of [{},{logpush:false,tail_consumers:[]},{logpush:false,observability:null,tail_consumers:null},{observability:{enabled:false}},{observability:{enabled:false,logs:null,traces:null,issues:null}},{observability:{enabled:false,logs:{enabled:false,invocation_logs:true,persist:true,destinations:[]},traces:{enabled:false,destinations:[]},issues:{enabled:false}}}])assert.doesNotThrow(()=>checkLogSettings(settings));
 // L'ancien contrôle rejetait les deux représentations officielles OFF.
 for(const settings of [{logpush:false,tail_consumers:[]},{logpush:false,observability:null,tail_consumers:null}])assert.equal(settings.observability?.enabled===false,false);
});
test('logs : activation/exports ou types indéterminés toujours refusés',()=>{
 const invalid=[null,[],{logpush:true},{logpush:'false'},{logpush:null},{tail_consumers:[{service:'fictitious-consumer'}]},{tail_consumers:{}},{observability:true},{observability:[]},{observability:{}},{observability:{enabled:true}},{observability:{enabled:'false'}}];
 for(const name of ['logs','traces','issues','agents']){
  invalid.push({observability:{enabled:false,[name]:{enabled:true}}},{observability:{enabled:false,[name]:{enabled:'false'}}},{observability:{enabled:false,[name]:{enabled:false,destinations:['fictitious-destination']}}},{observability:{enabled:false,[name]:{enabled:false,destinations:'not-an-array'}}});
 }
 invalid.push({observability:{enabled:false,logs:{}}});
 for(const settings of invalid)assert.throws(()=>checkLogSettings(settings),/^Error: UNEXPECTED_LOG_COLLECTION$/);
});
test('publication simulée après logs OFF nullable : tous les contrôles publics continuent, aucun vrai déploiement',async()=>{
 const c=candidate();try{
  for(const postLogs of [{logpush:false,observability:null,tail_consumers:[]},{logpush:false,tail_consumers:null}]){
   const remote=fakeRemote(c.out,{postLogs});let writes=0;const result=await publish(c.out,{env:env(c.receipt.sha256),fetcher:remote.fetcher,deploy:async()=>{writes++;remote.deployed();}});
   assert.equal(writes,1);assert.equal(result.status,'verified_public_interface_backend_disabled');assert.ok(remote.calls.some(c=>c.url===target.origin+'/auth/start'));
  }
  // Corriger le faux positif ne permet pas de sauter la vérification du frontend.
  const changed=fakeRemote(c.out,{postLogs:{observability:null},assetChanged:true});
  await assert.rejects(publish(c.out,{env:env(c.receipt.sha256),fetcher:changed.fetcher,deploy:async()=>changed.deployed()}),/PUBLIC_ASSET_MISMATCH/);
 }finally{rmSync(c.root,{recursive:true,force:true});}
});

test('migration locale : OAuth facultatif, couple HMAC/URL épinglé, bootstrap secret privé',()=>{
 const deployment='FICTITIOUS_REC_DEPLOYMENT',deploymentPin=hex(deployment),backend=[{name:'REC_APPS_SCRIPT_URL',type:'plain_text',text:'https://script.google.com/macros/s/'+deployment+'/exec'},{name:'REC_GATEWAY_KEY',type:'secret_text'}];
 const settings=checkSettings({bindings:[...backend,{name:'REC_BOOTSTRAP_ADMIN',type:'secret_text'}]},{deploymentPin});assert.equal(settings.oauthConfigured,false);assert.equal(settings.backendConfigured,true);assert.equal(settings.bootstrapConfigured,true);
 assert.throws(()=>checkSettings({bindings:[{name:'REC_BOOTSTRAP_ADMIN',type:'plain_text',text:'FICTITIOUS'}]}),/UNEXPECTED_EXISTING_BINDING/);assert.equal(releaseConfig().keep_vars,true);assert.equal(releaseConfig().vars.REC_AUTH_MODE,'local');
});
