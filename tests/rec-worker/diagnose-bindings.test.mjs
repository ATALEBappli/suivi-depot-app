import test from 'node:test';
import assert from 'node:assert/strict';
import {diagnose,diagnosticCode,backendBindingFailure} from '../../rec-worker/diagnose-bindings.mjs';
import {checkSettings} from '../../rec-worker/publish.mjs';
import {target} from '../../rec-worker/release.mjs';
import {readFileSync} from 'node:fs';

const env={GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:'refs/heads/main',GITHUB_REPOSITORY:target.repository,CLOUDFLARE_API_TOKEN:'FICTITIOUS_TOKEN_TEST_ONLY'};
const binding=(name,text)=>({name,type:'plain_text',text});
test('diagnostic REC ne fait qu’un GET et ne publie aucun contenu de bindings',async()=>{
 const calls=[];const fetcher=async(url,options)=>{
  calls.push({url,method:options.method || 'GET'});
  return Response.json({success:true,result:{bindings:[binding('APP_ENV','REC'),binding('REC_AUTH_MODE','local'),binding('REC_BACKEND_ENABLED','true')]}});
 };
 assert.deepEqual(await diagnose(env,{fetcher}),{status:'bindings_validated',worker:target.worker});
 assert.deepEqual(calls,[{url:`https://api.cloudflare.com/client/v4/accounts/${target.account}/workers/scripts/${target.worker}/settings`,method:'GET'}]);
 for(const patch of [{GITHUB_REF:'refs/heads/prod'},{GITHUB_EVENT_NAME:'push'},{GITHUB_REPOSITORY:'other/other'}]){
  await assert.rejects(diagnose({...env,...patch},{fetcher}),/MANUAL_MAIN_REC_REQUIRED/);
 }
 assert.equal(calls.length,1);
});
test('diagnostic cite uniquement le nom autorisé, jamais une valeur ni un nom arbitraire',()=>{
 const secret='NEVER_LOG_THIS_TEST_SECRET';
 for(const item of [binding('REC_SERVER_URL',secret),binding('REC_BACKEND_ENABLED','false'),{name:'REC_GATEWAY_KEY',type:'plain_text',text:secret}]){
  let result;try{checkSettings({bindings:[item]});}catch(e){result=diagnosticCode(e);}
  assert.match(result,/^UNEXPECTED_EXISTING_BINDING_(REC_SERVER_URL|REC_BACKEND_ENABLED|REC_GATEWAY_KEY)$/);
  assert.ok(!result.includes(secret));
 }
 assert.equal(diagnosticCode(new Error('UNEXPECTED_EXISTING_BINDING_UNKNOWN_NAME')),'UNEXPECTED_EXISTING_BINDING_UNKNOWN_NAME');
 assert.equal(diagnosticCode(new Error('UNEXPECTED_EXISTING_BINDING_MY_PRIVATE_TOKEN_123')),'DIAGNOSTIC_UNAVAILABLE');
 assert.equal(diagnosticCode(new Error('secret value')),'DIAGNOSTIC_UNAVAILABLE');
});
test('backend REC : détail du refus sans révéler la valeur',async()=>{
 const cases=[
  {list:[],code:'REC_BACKEND_MISSING'},
  {list:[binding('REC_BACKEND_ENABLED','true'),binding('REC_BACKEND_ENABLED','true')],code:'REC_BACKEND_DUPLICATE'},
  {list:[{name:'REC_BACKEND_ENABLED',type:'json',text:'true'}],code:'REC_BACKEND_WRONG_BINDING_TYPE'},
  {list:[binding('REC_BACKEND_ENABLED',true)],code:'REC_BACKEND_VALUE_NOT_TEXT'},
  {list:[binding('REC_BACKEND_ENABLED',' true ')],code:'REC_BACKEND_EXTRA_WHITESPACE'},
  {list:[binding('REC_BACKEND_ENABLED','TRUE')],code:'REC_BACKEND_WRONG_CASE'},
  {list:[binding('REC_BACKEND_ENABLED','private-value')],code:'REC_BACKEND_VALUE_MISMATCH'},
 ];
 for(const {list,code} of cases){
  assert.equal(backendBindingFailure({bindings:list}),code);
  assert.equal(diagnosticCode(new Error(code)),code);
 }
 const fetcher=async()=>Response.json({success:true,result:{bindings:[binding('REC_BACKEND_ENABLED','private-value')]}});
 await assert.rejects(diagnose(env,{fetcher}),error=>diagnosticCode(error)==='REC_BACKEND_VALUE_MISMATCH');
});
test('workflow de diagnostic manuel et sans capacité d’écriture',()=>{
 const workflow=readFileSync(new URL('../../.github/workflows/rec-worker-diagnose-bindings.yml',import.meta.url),'utf8');
 assert.match(workflow,/workflow_dispatch:/);
 assert.match(workflow,/contents: read/);
 assert.match(workflow,/name: REC/);
 assert.match(workflow,/secrets\.CLOUDFLARE_API_TOKEN/);
 assert.doesNotMatch(workflow,/\b(push|pull_request|schedule):|wrangler|deploy|REC_MUTATIONS_ENABLED|contents: write|id-token: write/);
});
