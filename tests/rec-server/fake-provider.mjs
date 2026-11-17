import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {hash} from '../../rec-server/security.mjs';
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const user={email:'hot-rec@example.invalid',sub:'subject-fictif',role:'admin'};
export function fakeProvider(){
 const grants=new Map();
 return {grants,fetcher:async(url,options)=>{
  if(url==='https://www.googleapis.com/oauth2/v3/certs')return {ok:true,json:async()=>({keys:[{...publicKey.export({format:'jwk'}),kid:'fake',alg:'RS256'}]})};
  assert.equal(url,'https://oauth2.googleapis.com/token');
  const grant=grants.get(options.body.get('code'));assert.ok(grant);assert.equal(hash(options.body.get('code_verifier')),grant.challenge);
  const h=Buffer.from(JSON.stringify({alg:'RS256',kid:'fake'})).toString('base64url'),p=Buffer.from(JSON.stringify({iss:'https://accounts.google.com',aud:'fake-client',nonce:grant.nonce,email:user.email,sub:user.sub,email_verified:true,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');
  return {ok:true,json:async()=>({id_token:h+'.'+p+'.'+sign('RSA-SHA256',Buffer.from(h+'.'+p),privateKey).toString('base64url'),access_token:'MUST_NOT_LEAVE_SERVER'})};
 }};
}
