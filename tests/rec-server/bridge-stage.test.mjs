import test from 'node:test';
import assert from 'node:assert/strict';
import {bridge} from '../../rec-server/bridge.mjs';

const cfg={endpoint:'https://script.google.com/macros/s/FICTITIOUS/exec',key:'a'.repeat(64)};
const user={id:'00000000-0000-4000-8000-000000000001',username:'fiction',role:'admin',version:1,authMode:'local'};
const body={action:'rec.status'};
const nonce=()=> 'n'.repeat(43);

test('échecs de transport classés sans exposer URL, réponse ou erreur privée',async()=>{
 const cases=[
  [async()=>{throw Error('private response body');},'REC_GATEWAY_FETCH_FAILED'],
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
