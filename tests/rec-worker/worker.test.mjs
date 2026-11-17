import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {localWorker} from './harness.mjs';
import {fakeProvider} from '../rec-server/fake-provider.mjs';
import {hash,config,pins} from '../../rec-server/security.mjs';
import {durableStore} from '../../rec-worker/store.mjs';
import {edgeFetch} from '../../rec-worker/routes.mjs';
import {memoryStore} from '../../rec-server/auth-store.mjs';
const user={email:'hot-rec@example.invalid',sub:'subject-fictif',role:'admin'};
const cfg={base:'https://rec-fictif.compte-fictif.workers.dev',front:'https://rec-fictif.compte-fictif.workers.dev/',origin:'https://rec-fictif.compte-fictif.workers.dev',clientId:'fake-client',clientSecret:'FAKE_ONLY',allowed:[user]};
const site=new URL('../../rec-server/public',import.meta.url).pathname;
test('runtime Workers/SQLite : OAuth après redémarrage, ticket atomique, session, révocation, aucun Apps Script',async()=>{
 const temp=mkdtempSync(tmpdir()+'/rec-sqlite-'),provider=fakeProvider();let w;
 const post=(path,body,token,origin=cfg.origin)=>w.mf.dispatchFetch(cfg.base+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});
 try{
  w=await localWorker({cfg,site,provider,persist:temp,enabled:'false'});
  assert.equal((await post('/api',{})).status,403);
  const preflight=await w.mf.dispatchFetch(cfg.base+'/api',{method:'OPTIONS',headers:{Origin:cfg.origin,'Access-Control-Request-Method':'POST'}});assert.equal(preflight.status,204);
  const root=await w.mf.dispatchFetch(cfg.base+'/');assert.equal(root.status,200);assert.match(root.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  assert.equal((await w.mf.dispatchFetch(cfg.base+'/manifest.json')).status,404);
  assert.equal((await w.mf.dispatchFetch(cfg.base+'/.env')).status,404);
  assert.match((await w.mf.dispatchFetch(cfg.base+'/referentiel/index.html')).headers.get('content-security-policy'),/frame-ancestors 'self'/);
  const verifier='a'.repeat(43),start=await (await post('/auth/start',{challenge:hash(verifier)})).json(),auth=new URL(start.url);
  provider.grants.set('fixture-code',{nonce:auth.searchParams.get('nonce'),challenge:auth.searchParams.get('code_challenge')});
  await w.close();w=await localWorker({cfg,site,provider,persist:temp,enabled:'false'});
  const callback=cfg.base+'/oauth/callback?code=fixture-code&state='+auth.searchParams.get('state');
  const response=await w.mf.dispatchFetch(callback,{redirect:'manual'});assert.equal(response.status,303);
  assert.equal((await w.mf.dispatchFetch(callback,{redirect:'manual'})).status,403);
  const ticket=new URL(response.headers.get('location')).hash.split('/').at(-1);
  const exchanges=await Promise.all([post('/auth/exchange',{ticket,verifier}),post('/auth/exchange',{ticket,verifier})]);
  assert.deepEqual(exchanges.map(r=>r.status).sort(),[200,403]);const session=(await exchanges.find(r=>r.status===200).json()).session;
  assert.equal((await post('/api',{action:'rec.status'},session)).status,200);assert.equal((await (await post('/api',{action:'rec.status'},session)).json()).error,'REC_BACKEND_DISABLED');
  assert.equal((await post('/api',{},session,'https://atalebappli.github.io')).status,403);
  await w.close();w=await localWorker({cfg:{...cfg,allowed:[]},site,provider,persist:temp,enabled:'false'});
  assert.equal((await post('/api',{action:'rec.status'},session)).status,403);
 }finally{await w?.close();rmSync(temp,{recursive:true,force:true});}
});
test('origine Workers explicitement validée ; garde cible inchangée',()=>{
 const source=readFileSync(new URL('../../rec-server/security.mjs',import.meta.url),'utf8');assert.match(source,/hex\(match\[1\]\)===pins.deployment/);assert.equal(pins.script.length,64);
 for(const url of ['https://rec-fictif.compte-fictif.workers.dev.evil.invalid','https://atalebappli.github.io','http://rec-fictif.compte-fictif.workers.dev','https://rec-fictif.compte-fictif.workers.dev/path'])assert.throws(()=>config({APP_ENV:'REC',REC_SERVER_URL:url},{hosting:'cloudflare'}),/INVALID_SERVER_URL/);
 assert.throws(()=>config({APP_ENV:'REC',REC_SERVER_URL:cfg.base,REC_APPS_SCRIPT_URL:'https://script.google.com/macros/s/FICTIF/exec'},{hosting:'cloudflare'}),/WRONG_DEPLOYMENT_TARGET/);
 assert.throws(()=>config({APP_ENV:'REC',REC_SERVER_URL:cfg.base}),/INVALID_SERVER_URL/);
});
test('stockage : expiration, capacité, unicité, limitation et identifiants hachés',async()=>{
 const values=new Map();let time=100000,sequence=0;const tx={get:async k=>values.get(k),put:async(k,v)=>values.set(k,v),delete:async k=>values.delete(k),list:async({prefix})=>new Map([...values].filter(([k])=>k.startsWith(prefix)))};let queue=Promise.resolve();const storage={...tx,transaction:fn=>{const result=queue.then(()=>fn(tx));queue=result.catch(()=>{});return result;}};
 const store=durableStore(storage,{now:()=>time,randomId:()=>String(++sequence)});
 const id=await store.put('tickets',{challenge:'fictif'},1000,1);assert.equal([...values.keys()].some(k=>k==='tickets:'+id),false);
 await assert.rejects(store.put('tickets',{},1000,1),/RATE_LIMIT/);
 const once=await Promise.allSettled([store.take('tickets',id),store.take('tickets',id)]);assert.equal(once.filter(x=>x.status==='fulfilled').length,1);
 const session=await store.put('sessions',{user},1000,1);time+=1001;await store.cleanup();assert.equal(values.has('sessions:'+hash(session)),false);assert.equal(await store.get('sessions',session),undefined);await store.put('sessions',{user},1000,1);
 for(let i=0;i<10;i++)await store.rate();await assert.rejects(store.rate(),/RATE_LIMIT/);time+=60000;await store.rate();
 const mem=memoryStore();const ticket=await mem.put('tickets',{},1000,2);const result=await Promise.allSettled([mem.take('tickets',ticket),mem.take('tickets',ticket)]);assert.equal(result.filter(r=>r.status==='fulfilled').length,1);
});

test('fetch edge refuse les redirections OAuth et laisse le contrôle HMAC des redirects Apps Script',async()=>{
 const original=globalThis.fetch;const seen=[];
 globalThis.fetch=async(url,options)=>{seen.push(options.redirect);return new Response(null,{status:302,headers:{Location:'https://evil.invalid'}});};
 try{await assert.rejects(edgeFetch('https://oauth2.googleapis.com/token',{redirect:'error'}),/REDIRECT_REFUSED/);assert.equal((await edgeFetch('https://script.google.com/macros/s/FICTIF/exec',{redirect:'manual'})).status,302);assert.deepEqual(seen,['manual','manual']);}finally{globalThis.fetch=original;}
});
