import test from 'node:test';
import assert from 'node:assert/strict';
import {Google,PrivateDrive,SCOPES} from '../../scripts/rec-automation/google.mjs';
import {digest,Refusal} from '../../scripts/rec-automation/validation.mjs';
import {policy,REC,metadata,clone} from './helpers.mjs';
const credentials={client_id:'client-fictif',client_secret:'secret-fictif',refresh_token:'refresh-fictif'};
const response=(value,ok=true)=>({ok,json:async()=>clone(value)});
const token={access_token:'access-fictif',token_type:'Bearer',expires_in:3600,scope:SCOPES.join(' ')};
const refuses=(fn,code)=>assert.rejects(fn,e=>{assert.equal(e.code,code);return true;});

test('OAuth utilisateur : échange de refresh token unique et masquage',async()=>{
 const calls=[],masked=[];const api=new Google({policy,mask:x=>masked.push(x),fetcher:async(url,options)=>{calls.push({url,options});return response(token);}});
 await api.authenticate(credentials);assert.equal(calls.length,1);assert.equal(calls[0].url,'https://oauth2.googleapis.com/token');
 assert.equal(calls[0].options.body.get('grant_type'),'refresh_token');assert.equal(calls[0].options.redirect,'error');
 assert.ok(masked.includes('refresh-fictif'));assert.ok(masked.includes('access-fictif'));
});
for(const [name,data,code] of [
 ['refus',{},'OAUTH_REFRESH_FAILED'],['mauvais type',{...token,token_type:'Other'},'OAUTH_REFRESH_FAILED'],
 ['expiration proche',{...token,expires_in:100},'OAUTH_TOKEN_TOO_SHORT'],
 ['portées insuffisantes',{...token,scope:'openid email'},'MISSING_OAUTH_SCOPE']
])test('OAuth refuse '+name,async()=>{const api=new Google({policy,fetcher:async()=>response(data)});await refuses(()=>api.authenticate(credentials),code);});
test('aucun retry OAuth et aucune exception brute',async()=>{
 let count=0;const api=new Google({policy,fetcher:async()=>{count++;throw Error('PRIVATE_SECRET');}});
 await refuses(()=>api.authenticate(credentials),'OAUTH_CONNECTION_FAILED');assert.equal(count,1);
});
test('token expiré refusé avant requête',async()=>{
 let count=0;const api=new Google({policy,fetcher:async()=>{count++;return response(token);}});await api.authenticate(credentials);
 api.expiresAt=Date.now();await refuses(()=>api.project(),'OAUTH_TOKEN_EXPIRED');assert.equal(count,1);
});
test('API de gestion : cible fixe, pas de Sheets ni scripts.run',async()=>{
 const calls=[];const api=new Google({policy:{...policy,deploymentId:'DEPLOY_REC_FICTIF_1234567890'},fetcher:async(url,options)=>{calls.push({url,options});return response(url.includes('oauth2.googleapis.com')?token:options.method==='PUT' && url.includes('/deployments/')?{deploymentId:'DEPLOY_REC_FICTIF_1234567890'}:{deployments:[]});}});
 await api.authenticate(credentials);await api.project();await api.getContent();await api.getContent(3);
 await api.updateContent({files:[]});await api.createVersion('REC fictif');await api.createDeployment(3,'REC fictif');await api.updateDeployment(api.policy.deploymentId,3,'REC fictif');await api.deployments();
 for(const call of calls.filter(c=>c.url.startsWith('https://script.googleapis.com/'))) {
  assert.ok(call.url.startsWith('https://script.googleapis.com/v1/projects/'+policy.scriptId));assert.equal(call.options.redirect,'error');
  assert.equal(call.options.headers.Authorization,'Bearer access-fictif');assert.ok(!call.url.includes('access-fictif'));assert.ok(!call.url.includes(':run'));
 }
 const update=calls.find(c=>c.url.includes('/deployments/') && c.options.method==='PUT');
 assert.equal(JSON.parse(update.options.body).deploymentConfig.manifestFileName,'appsscript');
 assert.throws(()=>api.updateDeployment('DEPLOY_PROD_FICTIF_1234567890',3,''),/UNEXPECTED_DEPLOYMENT_ID/);
 assert.throws(()=>api.fileMetadata('SHEET_PROD_FICTIF_1234567890'),/UNEXPECTED_METADATA_TARGET/);
 await refuses(()=>api.request('GET','https://example.invalid'),'UNEXPECTED_GOOGLE_HOST');
});
test('écritures HTTP incertaines : tentative unique et erreur sans secrets',async()=>{
 for(const fail of ['throw','invalidJSON','status']) {
  let calls=0;const api=new Google({policy,fetcher:async url=>{
   if(url.includes('oauth2.googleapis.com'))return response(token);calls++;
   if(fail==='throw')throw Error('PRIVATE_BEARER');if(fail==='status')return response({error:'PRIVATE_BEARER'},false);
   return {ok:true,json:async()=>{throw Error('PRIVATE_BEARER');}};
  }});await api.authenticate(credentials);
  await assert.rejects(()=>api.updateContent({files:[]}),e=>{assert.equal(e.uncertain,true);assert.ok(!e.message.includes('PRIVATE'));return true;});assert.equal(calls,1);
 }
});
test('pagination de déploiements bornée',async()=>{
 let calls=0;const api=new Google({policy,fetcher:async url=>{
  if(url.includes('oauth2.googleapis.com'))return response(token);calls++;return response({deployments:[],nextPageToken:'fictif'});
 }});await api.authenticate(credentials);await refuses(()=>api.deployments(),'TOO_MANY_DEPLOYMENTS');assert.equal(calls,5);
});

function drive() {
 const data=new Map(),calls=[];let seq=0;
 const api=new Google({policy,fetcher:async(url,options)=>{
  calls.push({url,options});if(url.includes('oauth2.googleapis.com'))return response(token);
  const u=new URL(url),id=u.pathname.split('/').at(-1);
  if(u.pathname.startsWith('/upload/drive/v3/files')) {
   const boundary=options.headers['Content-Type'].split('boundary=')[1];
   const parts=options.body.split('--'+boundary);
   const parse=p=>JSON.parse(p.split('\r\n\r\n')[1].trim());
   const m=parse(parts[1]),value=parse(parts[2]);const fileId=options.method==='POST'?'fichier-fictif-'+(++seq):id;
   const meta={...metadata('application/json',REC,true),...m,id:fileId};data.set(fileId,{meta,value});return response(meta);
  }
  if(u.pathname==='/drive/v3/files') {
   const q=u.searchParams.get('q'),props={};for(const m of q.matchAll(/key='([^']+)' and value='([^']+)'/g))props[m[1]]=m[2];
   return response({files:[...data.values()].filter(r=>Object.entries(props).every(([k,v])=>r.meta.appProperties?.[k]===v)).map(r=>r.meta)});
  }
  const record=data.get(id);if(!record)return response({},false);
  return response(u.searchParams.get('alt')==='media'?record.value:record.meta);
 }});
 return {api,store:new PrivateDrive(api),data,calls};
}
const value=(kind,tag)=>({schema:1,kind,tag,targetHash:policy.pins.scriptHash,account:policy.email,...(kind==='operation'?{status:'pending',checkpoint:{tag:'backup-fictif-001',hash:'0'.repeat(64)},intentHash:'a'.repeat(64)}:{content:{files:[]}})});
test('Drive : sauvegarde privée en root, relue, sans artefact public',async()=>{
 const d=drive();await d.api.authenticate(credentials);const v=value('backup','backup-fictif-001');
 const saved=await d.store.create('backup',v.tag,v);assert.deepEqual(saved.value,v);assert.equal(d.data.size,1);
 assert.equal((await d.store.read('backup',v.tag)).id,saved.id);
 const upload=d.calls.find(c=>c.url.includes('/upload/'));assert.deepEqual(JSON.parse(upload.options.body.split('\r\n\r\n')[1].split('\r\n--')[0]).parents,['root']);
});
test('Drive : doublon refusé et aucune suppression',async()=>{
 const d=drive();await d.api.authenticate(credentials);const v=value('backup','backup-fictif-002');await d.store.create('backup',v.tag,v);
 await refuses(()=>d.store.create('backup',v.tag,v),'PRIVATE_REFERENCE_ALREADY_EXISTS');assert.equal(d.data.size,1);
 assert.ok(d.calls.every(c=>c.options.method!=='DELETE'));
});
test('Drive : accès partagé refusé avant lecture des sources',async()=>{
 const d=drive();await d.api.authenticate(credentials);const v=value('backup','backup-fictif-003');const r=await d.store.create('backup',v.tag,v);
 d.data.get(r.id).meta.permissions.push({type:'anyone',role:'reader'});const calls=d.calls.length;
 await refuses(()=>d.store.read('backup',v.tag),'UNEXPECTED_SHARING');assert.ok(!d.calls.slice(calls).some(c=>c.url.includes('alt=media')));
});
test('Drive : sauvegarde d’un autre compte refusée',async()=>{
 const d=drive();await d.api.authenticate(credentials);const v=value('backup','backup-fictif-004');const r=await d.store.create('backup',v.tag,v);d.data.get(r.id).meta.owners[0].emailAddress='other@example.invalid';
 await refuses(()=>d.store.read('backup',v.tag),'WRONG_RESOURCE_OWNER');
});
test('Drive : pending durable, mises à jour relues et changements concurrents refusés',async()=>{
 const d=drive();await d.api.authenticate(credentials);const v=value('operation','operation-fictif-001');const r=await d.store.create('operation',v.tag,v);
 assert.equal((await d.store.pending()).length,1);
 await d.store.update(r,{...v,status:'done',result:{status:'done'}});assert.equal((await d.store.pending()).length,0);
 await refuses(()=>d.store.update(r,{...v,status:'done'}),'OPERATION_CHANGED');
});
test('Drive : état JSON incohérent et référence ambiguë refusés',async()=>{
 const d=drive();await d.api.authenticate(credentials);const v=value('operation','operation-fictif-002');const r=await d.store.create('operation',v.tag,v);
 d.data.get(r.id).value.status='done';await refuses(()=>d.store.read('operation',v.tag),'INVALID_OPERATION_STATE');
 const copy=clone(d.data.get(r.id));copy.meta.id='autre-fictif';d.data.set(copy.meta.id,copy);await refuses(()=>d.store.read('operation',v.tag),'AMBIGUOUS_PRIVATE_RECORD');
});
test('Drive : références injectant une requête interdites',async()=>{
 const d=drive();await d.api.authenticate(credentials);const n=d.calls.length;
 await refuses(()=>d.store.read('backup',"' or trashed=false"),'INVALID_PRIVATE_REFERENCE');assert.equal(d.calls.length,n);
});

test('réponses REST : scriptId présent, absent ou différent ; provenance non sérialisable',async()=>{
 const {checkDeployment,deploymentState}=await import('../../scripts/rec-automation/validation.mjs');
 const {deployment}=await import('./helpers.mjs');
 for(const field of ['present','absent','different','null']) {
  const d=deployment();
  if(field==='absent')delete d.deploymentConfig.scriptId;
  if(field==='different')d.deploymentConfig.scriptId='SCRIPT_PROD_FICTIF_1234567890';
  if(field==='null')d.deploymentConfig.scriptId=null;
  const calls=[];
  const api=new Google({policy,fetcher:async(url,options)=>{calls.push({url,method:options.method});return response(url==='https://oauth2.googleapis.com/token'?token:{deployments:[d]});}});
  await api.authenticate(credentials);const [got]=await api.deployments();
  assert.equal(calls[1].url.startsWith('https://script.googleapis.com/v1/projects/'+policy.scriptId+'/deployments?'),true);
  assert.equal(calls[1].method,'GET');
  if(field==='different'||field==='null')assert.throws(()=>checkDeployment(got,policy,1),/WRONG_DEPLOYMENT_TARGET/);
  else {
   checkDeployment(got,policy,1);
   assert.equal(deploymentState([got],policy)[0].scriptId,policy.scriptId);
   if(field==='absent')assert.throws(()=>checkDeployment(clone(got),policy,1),/WRONG_DEPLOYMENT_TARGET/);
  }
 }
});
test('provenance contradictoire et permissions publiques restent refusées',async()=>{
 const {checkDeployment,rememberDeploymentProject}=await import('../../scripts/rec-automation/validation.mjs');
 const {deployment}=await import('./helpers.mjs');
 const d=deployment();rememberDeploymentProject(d,'SCRIPT_PROD_FICTIF_1234567890');
 assert.throws(()=>checkDeployment(d,policy,1),/WRONG_DEPLOYMENT_TARGET/);
 const p=deployment();delete p.deploymentConfig.scriptId;rememberDeploymentProject(p,policy.scriptId);
 p.entryPoints[0].webApp.entryPointConfig.access='ANYONE_ANONYMOUS';
 assert.throws(()=>checkDeployment(p,policy,1),/PUBLIC_DEPLOYMENT_REFUSED/);
});
test('mise à jour de la même URL : réponse sans scriptId liée à la route REC, mauvais ID refusé',async()=>{
 const {deployment}=await import('./helpers.mjs');const {checkDeployment}=await import('../../scripts/rec-automation/validation.mjs');
 for(const mode of ['absent','present','different','otherId']) {
  const d=deployment(2);if(mode==='absent')delete d.deploymentConfig.scriptId;
  if(mode==='different')d.deploymentConfig.scriptId='SCRIPT_PROD_FICTIF_1234567890';
  if(mode==='otherId')d.deploymentId='OTHER_DEPLOY_FICTIF_1234567890';
  const calls=[],api=new Google({policy:{...policy,deploymentId:'DEPLOY_REC_FICTIF_1234567890'},fetcher:async(url,options)=>{calls.push({url,method:options.method});return response(url==='https://oauth2.googleapis.com/token'?token:d);}});
  await api.authenticate(credentials);
  if(mode==='otherId')await assert.rejects(()=>api.updateDeployment(api.policy.deploymentId,2,'REC fictif'),/UNEXPECTED_DEPLOYMENT_ID/);
  else {const result=await api.updateDeployment(api.policy.deploymentId,2,'REC fictif');if(mode==='different')assert.throws(()=>checkDeployment(result,policy,2),/WRONG_DEPLOYMENT_TARGET/);else checkDeployment(result,policy,2);}
  assert.equal(calls[1].method,'PUT');assert.ok(calls[1].url.endsWith('/deployments/DEPLOY_REC_FICTIF_1234567890'));
  assert.equal(calls.filter(c=>c.method==='POST' && c.url.includes('script.googleapis.com')).length,0);
 }
});
test('liste des versions : GET limité au projet REC et pagination bornée',async()=>{
 const calls=[];const api=new Google({policy,fetcher:async(url,options)=>{calls.push({url,method:options.method});return response(url==='https://oauth2.googleapis.com/token'?token:{versions:[],nextPageToken:'fictif'});}});
 await api.authenticate(credentials);await assert.rejects(()=>api.versions(),/TOO_MANY_VERSIONS/);
 assert.equal(calls.length,6);for(const c of calls.slice(1)){assert.equal(c.method,'GET');assert.ok(c.url.startsWith('https://script.googleapis.com/v1/projects/'+policy.scriptId+'/versions?'));}
});
