import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {generateKeyPairSync,sign} from 'node:crypto';
import {application} from '../../rec-server/server.mjs';
import {hash} from '../../rec-server/security.mjs';
import {fakeProvider} from './fake-provider.mjs';
const user={email:'hot-rec@example.invalid',sub:'subject-fictif',role:'admin'};
test('OAuth complet : PKCE, ticket unique, session, CORS, expiration et déconnexion',async()=>{
 const provider=fakeProvider(),cfg={base:'https://rec.example.invalid',front:'https://rec.example.invalid/',origin:'https://rec.example.invalid',clientId:'fake-client',clientSecret:'private-fake',allowed:[user]};
 let time=Date.now(),calls=0;const server=createServer(application(cfg,{fetcher:provider.fetcher,now:()=>time,call:async(body,u)=>{calls++;assert.equal(u.email,user.email);return {ok:true};}}));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const post=(path,body,token,origin=cfg.origin)=>fetch(base+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});
 try {
  assert.equal((await post('/api',{action:'v2.read'})).status,403);
  const verifier='a'.repeat(43),start=await (await post('/auth/start',{challenge:hash(verifier)})).json(),auth=new URL(start.url);
  assert.equal(auth.searchParams.get('scope'),'openid email');assert.equal(start.url.includes('private-fake'),false);
  provider.grants.set('fake-code',{nonce:auth.searchParams.get('nonce'),challenge:auth.searchParams.get('code_challenge')});
  const callback=await fetch(base+'/oauth/callback?code=fake-code&state='+auth.searchParams.get('state'),{redirect:'manual'});assert.equal(callback.status,303);
  const ticket=new URL(callback.headers.get('location')).hash.split('/').at(-1);
  const exchanged=await (await post('/auth/exchange',{ticket,verifier})).json();assert.equal(exchanged.expiresIn,900);assert.equal(JSON.stringify(exchanged).includes('MUST_NOT'),false);
  assert.equal((await post('/auth/exchange',{ticket,verifier})).status,403);
  assert.equal((await post('/api',{action:'v2.read'},exchanged.session)).status,200);assert.equal(calls,1);
  assert.equal((await post('/api',{},exchanged.session,'https://atalebappli.github.io')).status,403);
  assert.equal((await post('/api',{},exchanged.session,'https://evil.invalid')).status,403);assert.equal(calls,1);
  assert.equal((await post('/auth/logout',{},exchanged.session)).status,200);assert.equal((await post('/api',{},exchanged.session)).status,403);
  time+=900000;assert.equal((await post('/api',{},exchanged.session)).status,403);
 }finally{await new Promise(r=>server.close(r));}
});

test('origine Pages partagée non admise comme origine des sessions',()=>{
 assert.throws(()=>application({base:'https://rec-fictif.run.app',front:'https://atalebappli.github.io/suivi-depot-demo/',origin:'https://atalebappli.github.io'}),/INVALID_FRONTEND_ORIGIN/);
});
