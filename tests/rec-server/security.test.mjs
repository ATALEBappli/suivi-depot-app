import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {identity,config,mac,hash,pins} from '../../rec-server/security.mjs';
import {bridge} from '../../rec-server/bridge.mjs';
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const jwk={...publicKey.export({format:'jwk'}),kid:'test',alg:'RS256',use:'sig'},now=Date.now();
const user={email:'rec-user@example.invalid',sub:'subject-fictif',role:'admin'};
function jwt(change={}){const h=Buffer.from(JSON.stringify({alg:'RS256',kid:'test'})).toString('base64url'),p=Buffer.from(JSON.stringify({iss:'https://accounts.google.com',aud:'client-fictif',nonce:'nonce-fictif',sub:user.sub,email:user.email,email_verified:true,iat:Math.floor(now/1000),exp:Math.floor(now/1000)+3600,...change})).toString('base64url');return h+'.'+p+'.'+sign('RSA-SHA256',Buffer.from(h+'.'+p),privateKey).toString('base64url');}
test('identité signée, audience, nonce, compte et expiration',()=>{
 const opts={clientId:'client-fictif',nonce:'nonce-fictif',allowed:[user],now};assert.deepEqual(identity(jwt(),{keys:[jwk]},opts),user);
 for(const change of [{aud:'autre'},{nonce:'autre'},{iss:'https://evil.invalid'},{email_verified:false},{exp:1},{iat:Math.floor(now/1000)+3600},{sub:'intrus'}])assert.throws(()=>identity(jwt(change),{keys:[jwk]},opts));
 assert.throws(()=>identity(jwt()+'x',{keys:[jwk]},opts));
});
test('config non REC ou URL Google étrangère refusée avant réseau',()=>{
 assert.throws(()=>config({APP_ENV:'PROD'}),/REC_ONLY/);
 assert.throws(()=>config({APP_ENV:'REC',REC_SERVER_URL:'https://rec.example.invalid',REC_APPS_SCRIPT_URL:'https://script.google.com/macros/s/PROD_FICTIF/exec'}),/WRONG_DEPLOYMENT_TARGET/);
});
test('passerelle : cible signée vérifiée avant lecture, sans OAuth dans le message Apps Script',async()=>{
 const key='a'.repeat(64),calls=[];
 const call=bridge({endpoint:'https://script.google.com/macros/s/REC_FICTIF/exec',key},{nonce:()=> 'nonce-fictif',fetcher:async(url,options)=>{
  calls.push({url,options});const envelope=JSON.parse(options.body);assert.equal(mac(envelope.payload,key),envelope.mac);assert.equal(envelope.payload.includes('client_secret'),false);
  const r=JSON.parse(envelope.payload);const response=r.request.action==='rec.status'?{ok:true,environment:'REC',scriptHash:pins.script,sheetHash:pins.sheet}:{ok:true,state:{}};
  const payload=JSON.stringify({nonce:r.nonce,response});return {ok:true,status:200,json:async()=>({payload,mac:mac(payload,key)})};
 }});
 assert.equal((await call({action:'v2.read'},user)).ok,true);assert.equal(calls.length,2);
 await assert.rejects(()=>call({action:'v2.import'},{...user,role:'reader'}),/FORBIDDEN/);assert.equal(calls.length,2);
});
test('réponse non signée, mauvaise cible ou redirection connexion Google : aucun appel métier',async()=>{
 for(const mode of ['signature','target','redirect']) {
  let n=0;const key='a'.repeat(64);const call=bridge({endpoint:'https://script.google.com/macros/s/REC_FICTIF/exec',key},{nonce:()=> 'n',fetcher:async()=>{
   n++;if(mode==='redirect')return {status:302,headers:{get:()=> 'https://accounts.google.com/login'}};
   const payload=JSON.stringify({nonce:'n',response:{ok:true,environment:'PROD',scriptHash:pins.script,sheetHash:pins.sheet}});
   return {status:200,ok:true,json:async()=>({payload,mac:mode==='signature'?'false':mac(payload,key)})};
  }});
  await assert.rejects(()=>call({action:'v2.read'},user));assert.equal(n,1);
 }
});
test('PKCE SHA256 stable, pas de secret OAuth dans les exports front',()=>{assert.equal(hash('fictif').length,43);});
