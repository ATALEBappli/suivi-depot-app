import test from 'node:test';
import assert from 'node:assert/strict';
import {bridge} from '../../rec-server/bridge.mjs';
import {mac,pins} from '../../rec-server/security.mjs';

const cfg={endpoint:'https://script.google.com/macros/s/FICTITIOUS/exec',key:'a'.repeat(64)};
const user={id:'00000000-0000-4000-8000-000000000001',username:'fiction',role:'admin',version:1,authMode:'local'};
const body={action:'rec.status'};
const nonce=()=> 'n'.repeat(43);

test('échecs de transport classés sans exposer URL, réponse ou erreur privée',async()=>{
 const cases=[
  [async()=>{throw Error('private response body');},'REC_GATEWAY_POST_FAILED'],
  [async()=>new Response(null,{status:302,headers:{Location:'not an absolute URL'}}),'REC_GATEWAY_REDIRECT_INVALID'],
  [async()=>new Response('private html body',{status:200}),'REC_GATEWAY_INVALID_JSON'],
  [async()=>Response.json({ok:false,error:'secret private backend error'}),'REC_RESPONSE_NOT_AUTHENTICATED'],
  [async()=>new Response('denied',{status:403}),'REC_CONNECTION_FAILED'],
 ];
 for(const [fetcher,code] of cases){
  const execute=bridge(cfg,{fetcher,nonce});
  await assert.rejects(execute(body,user),err=>{
   assert.equal(err.message,code);
   assert.equal(err.message.includes('private'),false);
   return true;
  });
 }
});

test('après redirection Google, un échec GET ne relance jamais le POST',async()=>{
 const calls=[];
 const fetcher=async(url,options)=>{
  calls.push({url,method:options.method});
  if(calls.length===1)return new Response(null,{status:302,headers:{Location:'https://script.googleusercontent.com/macros/echo?user_content_key=fiction'}});
  throw Error('private backend response');
 };
 await assert.rejects(bridge(cfg,{fetcher,nonce})(body,user),/REC_GATEWAY_REDIRECT_FETCH_FAILED/);
 assert.deepEqual(calls.map(x=>x.method),['POST','GET','GET']);
 assert.equal(calls.length,3);
});

test('une réponse GET récupérée à la deuxième tentative est vérifiée par MAC et nonce',async()=>{
 const calls=[];
 const fetcher=async(url,options)=>{
  calls.push(options.method);
  if(calls.length===1)return new Response(null,{status:302,headers:{Location:'https://script.googleusercontent.com/macros/echo?user_content_key=fiction'}});
  if(calls.length===2)throw Error('temporary network issue');
  const payload=JSON.stringify({nonce:nonce(),response:{ok:true,environment:'REC',scriptHash:pins.script,sheetHash:pins.sheet}});
  return Response.json({payload,mac:mac(payload,cfg.key)});
 };
 const result=await bridge(cfg,{fetcher,nonce})(body,user);
 assert.equal(result.ok,true);
 assert.deepEqual(calls,['POST','GET','GET']);
});
