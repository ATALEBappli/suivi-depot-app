import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,pbkdf2Sync} from 'node:crypto';
import {localApplication,cleanupLocal} from '../../rec-worker/local-auth.mjs';
import {passwordRecord,verifyPassword,passwordPolicy,derivePasswordHmac} from '../../rec-worker/passwords.mjs';
import {authorized} from '../../rec-server/bridge.mjs';
import {backendConfig} from '../../rec-server/security.mjs';
import {localWorker} from './harness.mjs';
import {routes} from '../../rec-worker/routes.mjs';
const origin='https://rec-fictif.compte-fictif.workers.dev',password='Fictitious password test 2026!',record=await passwordRecord(password);
test('edge REC transmet toujours son propre état backend au DO, jamais celui du client',async()=>{
 const observed=[];
 const env={REC_AUTH_MODE:'local',REC_BACKEND_ENABLED:'true',REC_AUTH:{idFromName:()=> 'rec-auth-v1',get:()=>({fetch:async r=>{
  observed.push(r.headers.get('X-REC-Edge-Backend'));return Response.json({ok:true});
 }})}};
 const handler=routes({origin,base:origin},env,{files:[]});
 await handler(new Request(origin+'/local/session',{headers:{'X-REC-Edge-Backend':'false'}}));
 assert.deepEqual(observed,['true']);
 env.REC_BACKEND_ENABLED='false';
 await handler(new Request(origin+'/local/session',{headers:{'X-REC-Edge-Backend':'true'}}));
 assert.deepEqual(observed,['true','false']);
});
export function memory(){const values=new Map();let chain=Promise.resolve();const tx={get:async k=>structuredClone(values.get(k)),put:async(k,v)=>values.set(k,structuredClone(v)),delete:async k=>values.delete(k),list:async({prefix})=>new Map([...values].filter(([k])=>k.startsWith(prefix)).map(([k,v])=>[k,structuredClone(v)]))};return {...tx,values,transaction:fn=>{const r=chain.then(()=>fn(tx));chain=r.catch(()=>{});return r;},getAlarm:async()=>null,setAlarm:async()=>{}};}
function setup(){let time=Date.now();const storage=memory(),env={APP_ENV:'REC',REC_SERVER_URL:origin,REC_BACKEND_ENABLED:'false',REC_AUTH_MODE:'local',REC_BOOTSTRAP_ADMIN:JSON.stringify({id:randomUUID(),username:'admin-test',role:'admin',password:record})},handler=localApplication(env,storage,{now:()=>time});return {storage,env,handler,advance:()=>{time+=900001;}};}
async function post(s,path,body={},session,patch={}){const r=await s.handler(new Request(origin+'/local/'+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(session?{Cookie:session.cookie,'X-REC-CSRF':session.csrf}:{}),...patch},body:JSON.stringify(body)}));return {status:r.status,...await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0],headers:r.headers};}
async function login(s,username='admin-test',pass=password){return post(s,'login',{username,password:pass});}
test('PBKDF2 WebCrypto 600k, sels uniques, entrée stricte, compatibilité Node et aucun clair',async()=>{const b=await passwordRecord(password);assert.equal(passwordPolicy.iterations,600000);assert.notEqual(b.salt,record.salt);assert.equal(await verifyPassword(password,b),true);assert.equal(await verifyPassword('incorrect',b),false);assert.equal(await verifyPassword(password,null),false);assert.equal(JSON.stringify(b).includes(password),false);await assert.rejects(passwordRecord('short'),/INVALID_PASSWORD/);assert.equal(b.hash,pbkdf2Sync(password,Buffer.from(b.salt,'hex'),600000,32,'sha256').toString('hex'));});
test('repli Cloudflare PBKDF2 au-delà de 100k : HMAC natif identique au dérivé existant',()=>{
 const salt=Buffer.from(record.salt,'hex');
 assert.equal(derivePasswordHmac(password,salt).toString('hex'),record.hash);
 assert.notEqual(derivePasswordHmac('Fictitious invalid password',salt).toString('hex'),record.hash);
});
test('initialisation privée, anonymat, session HttpOnly, CSRF, backend désactivé, expiration et logout',async()=>{const s=setup();const anonymous=await post(s,'api',{action:'rec.status'});assert.equal(anonymous.error,'SESSION_REQUIRED');const l=await login(s);assert.equal(l.ok,true);assert.match(l.headers.get('set-cookie'),/Secure; HttpOnly; SameSite=Strict/);assert.equal(l.user.role,'admin');assert.equal(JSON.stringify(l).includes(record.hash),false);assert.equal((await post(s,'api',{action:'rec.status'},l)).error,'REC_BACKEND_DISABLED');assert.equal((await post(s,'api',{action:'rec.status'},l,{'X-REC-CSRF':'bad'})).error,'FORBIDDEN');assert.equal((await post(s,'api',{action:'rec.status'},l,{Origin:'https://evil.invalid'})).error,'FORBIDDEN');assert.equal((await post(s,'api',{action:'rec.localStatus'},l)).backendEnabled,false);await post(s,'logout',{},l);assert.equal((await post(s,'api',{},l)).error,'SESSION_REQUIRED');const next=await login(s);s.advance();assert.equal((await post(s,'api',{},next)).error,'SESSION_REQUIRED');await cleanupLocal(s.storage,()=>Date.now()+1000000);assert.equal((await s.storage.list({prefix:'local:session:'})).size,0);assert.equal(JSON.stringify([...s.storage.values]).includes(password),false);});
test('échecs génériques et limite par identifiant ; aucune inscription ni admin par défaut',async()=>{const s=setup();for(let i=0;i<5;i++)assert.equal((await login(s,'absent','incorrect')).error,'AUTH_FAILED');assert.equal((await login(s,'absent')).status,429);s.advance();assert.equal((await login(s,'absent')).status,401);const e={...s.env};delete e.REC_BOOTSTRAP_ADMIN;const handler=localApplication(e,memory());const state=await (await handler(new Request(origin+'/local/session'))).json();assert.equal(state.bootstrapRequired,true);assert.equal(state.user,null);assert.equal((await handler(new Request(origin+'/local/signup'))).status,404);});
test('initialisation iPhone à jeton privé Cloudflare : usage unique, serveur uniquement, aucun compte Google',async()=>{
 const s=setup();delete s.env.REC_BOOTSTRAP_ADMIN;s.env.REC_BOOTSTRAP_SETUP_TOKEN='a'.repeat(43);
 const state=await (await s.handler(new Request(origin+'/local/session'))).json();
 assert.equal(state.bootstrapRequired,true);assert.equal(state.bootstrapOnPhone,true);
 assert.equal((await post(s,'bootstrap',{setupToken:'b'.repeat(43),username:'amine',password})).error,'AUTH_FAILED');
 assert.equal((await login(s,'amine')).error,'AUTH_FAILED');
 const created=await post(s,'bootstrap',{setupToken:s.env.REC_BOOTSTRAP_SETUP_TOKEN,username:'amine',password});
 assert.deepEqual({status:created.status,ok:created.ok,initialized:created.initialized},{status:200,ok:true,initialized:true});
 assert.equal(JSON.stringify(created).includes(password),false);
 assert.equal(JSON.stringify(created).includes(s.env.REC_BOOTSTRAP_SETUP_TOKEN),false);
 assert.equal((await login(s,'amine',password)).user.role,'admin');
 assert.equal((await post(s,'bootstrap',{setupToken:s.env.REC_BOOTSTRAP_SETUP_TOKEN,username:'second',password})).error,'AUTH_FAILED');
 assert.equal((await (await s.handler(new Request(origin+'/local/session'))).json()).bootstrapOnPhone,false);
 delete s.env.REC_BOOTSTRAP_SETUP_TOKEN;
 assert.equal((await login(s,'amine',password)).ok,true);
});
test('bootstrap iPhone refusé si jeton absent, trop faible, origine tierce ou après limite',async()=>{
 const s=setup();delete s.env.REC_BOOTSTRAP_ADMIN;
 const body={setupToken:'x'.repeat(43),username:'amine',password};
 assert.equal((await post(s,'bootstrap',body)).error,'AUTH_FAILED');
 s.env.REC_BOOTSTRAP_SETUP_TOKEN='trop-court';
 assert.equal((await post(s,'bootstrap',body)).error,'AUTH_FAILED');
 s.env.REC_BOOTSTRAP_SETUP_TOKEN='x'.repeat(43);
 assert.equal((await post(s,'bootstrap',body,undefined,{Origin:'https://evil.invalid'})).error,'FORBIDDEN');
 for(let i=0;i<3;i++)assert.equal((await post(s,'bootstrap',{...body,setupToken:'wrong'})).error,'AUTH_FAILED');
 assert.equal((await post(s,'bootstrap',body)).status,429);
 assert.equal((await s.storage.list({prefix:'local:user:'})).size,0);
});
test('diagnostic bootstrap stable et non sensible : stockage indisponible',async()=>{
 const s=setup();delete s.env.REC_BOOTSTRAP_ADMIN;s.env.REC_BOOTSTRAP_SETUP_TOKEN='k'.repeat(64);
 const original=s.storage.transaction;let count=0;
 s.storage.transaction=fn=>{count++;if(count===3)throw Error('private token / raw internal storage failure');return original(fn);};
 const result=await post(s,'bootstrap',{setupToken:s.env.REC_BOOTSTRAP_SETUP_TOKEN,username:'amine',password});
 assert.equal(result.status,503);assert.equal(result.error,'BOOTSTRAP_STORAGE_UNAVAILABLE');
 assert.equal(JSON.stringify(result).includes('private token'),false);
 assert.equal(JSON.stringify(result).includes(s.env.REC_BOOTSTRAP_SETUP_TOKEN),false);
 assert.equal(JSON.stringify(result).includes(password),false);
 assert.equal((await s.storage.list({prefix:'local:user:'})).size,0);
});
test('diagnostic bootstrap stable : indisponibilité de la limitation de débit',async()=>{
 const s=setup();delete s.env.REC_BOOTSTRAP_ADMIN;s.env.REC_BOOTSTRAP_SETUP_TOKEN='k'.repeat(64);
 s.storage.transaction=()=>{throw Error('sensitive Cloudflare exception');};
 const result=await post(s,'bootstrap',{setupToken:s.env.REC_BOOTSTRAP_SETUP_TOKEN,username:'amine',password});
 assert.equal(result.status,503);assert.equal(result.error,'BOOTSTRAP_RATE_UNAVAILABLE');
 assert.equal(JSON.stringify(result).includes('sensitive Cloudflare'),false);
});
test('gestion comptes, dernier admin, révocation rôle et mot de passe, lecteur interdit',async()=>{const s=setup(),admin=await login(s);assert.equal((await post(s,'users',{action:'save',username:'reader-test',role:'reader',active:true,password,currentPassword:password},admin)).ok,true);const reader=await login(s,'reader-test');assert.equal((await post(s,'users',{action:'list'},reader)).error,'FORBIDDEN');for(const action of ['v2.write','v2.simulate','finance.write','finance.configure'])assert.equal((await post(s,'api',{action},reader)).error,'FORBIDDEN');assert.equal((await post(s,'users',{action:'save',username:'reader-test',role:'manager',active:true,currentPassword:password},admin)).ok,true);assert.equal((await post(s,'api',{},reader)).error,'SESSION_REQUIRED');assert.equal((await post(s,'users',{action:'save',username:'admin-test',role:'reader',active:true,currentPassword:password},admin)).error,'LAST_ADMIN');const manager=await login(s,'reader-test');assert.equal((await post(s,'api',{action:'finance.write'},manager)).error,'REC_BACKEND_DISABLED');assert.equal((await post(s,'password',{currentPassword:password,password:'New fictitious password 2026'},manager)).ok,true);assert.equal((await post(s,'api',{},manager)).error,'SESSION_REQUIRED');});
test('chaque action : matrice serveur et cible PROD refusée avant réseau',()=>{for(const role of ['admin','manager','reader'])for(const action of ['rec.status','rec.reference','finance.read','v2.read','rec.testTransaction.list','v2.simulate','v2.write','v2.import','finance.preview','finance.write','finance.configure','rec.testTransaction.create']){const expected=['v2.simulate','v2.write','v2.import','finance.configure','rec.testTransaction.create'].includes(action)?role==='admin':['finance.preview','finance.write'].includes(action)?role!=='reader':true;if(expected)authorized({action},{role});else assert.throws(()=>authorized({action},{role}),/FORBIDDEN/);}assert.throws(()=>authorized({action:'unknown'},{role:'admin'}),/ACTION_NOT_ALLOWED/);assert.throws(()=>backendConfig({APP_ENV:'PROD',REC_SERVER_URL:origin},{hosting:'cloudflare'}),/REC_ONLY/);assert.throws(()=>backendConfig({APP_ENV:'REC',REC_SERVER_URL:origin,REC_APPS_SCRIPT_URL:'https://script.google.com/macros/s/PROD_FICTIF/exec'},{hosting:'cloudflare'}),/WRONG_DEPLOYMENT_TARGET/);});
test('véritable workerd / SQLite : mot de passe 600k sans OAuth, routes anciennes closes et backend OFF',async()=>{const s=setup(),w=await localWorker({cfg:{base:origin},site:new URL('../../rec-server/public',import.meta.url).pathname,productionEnv:s.env});try{const root=await w.mf.dispatchFetch(origin+'/');assert.equal(root.status,200);assert.match(await root.text(),/login-form/);const r=await w.mf.dispatchFetch(origin+'/local/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({username:'admin-test',password})});const data=await r.json();assert.equal(r.status,200);assert.equal(data.user.role,'admin');for(const path of ['/api','/auth/start','/oauth/callback'])assert.equal((await w.mf.dispatchFetch(origin+path)).status,403);assert.equal((await w.mf.dispatchFetch(origin+'/local/session',{headers:{Cookie:r.headers.get('set-cookie').split(';')[0]}})).status,200);}finally{await w.close();}});
test('véritable workerd / SQLite : premier administrateur créé depuis Safari avec jeton privé',async()=>{
 const s=setup();delete s.env.REC_BOOTSTRAP_ADMIN;s.env.REC_BOOTSTRAP_SETUP_TOKEN='f'.repeat(64);
 const w=await localWorker({cfg:{base:origin},site:new URL('../../rec-server/public',import.meta.url).pathname,productionEnv:s.env});
 try{
  const root=await w.mf.dispatchFetch(origin+'/');assert.match(await root.text(),/bootstrap-form/);
  const status=await (await w.mf.dispatchFetch(origin+'/local/session')).json();assert.equal(status.bootstrapOnPhone,true);
  const init=await w.mf.dispatchFetch(origin+'/local/bootstrap',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({setupToken:s.env.REC_BOOTSTRAP_SETUP_TOKEN,username:'amine',password})});
  assert.equal(init.status,200);assert.equal((await init.json()).initialized,true);
  const login=await w.mf.dispatchFetch(origin+'/local/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({username:'amine',password})});assert.equal(login.status,200);
  const second=await w.mf.dispatchFetch(origin+'/local/bootstrap',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({setupToken:s.env.REC_BOOTSTRAP_SETUP_TOKEN,username:'other',password})});assert.equal(second.status,401);
 }finally{await w.close();}
});
test('révocation pendant la lecture du corps : aucun appel métier autorisé avec un rôle périmé',async()=>{const s=setup(),l=await login(s);const body={async *[Symbol.asyncIterator](){for(const[k,v]of s.storage.values)if(k.startsWith('local:user:'))s.storage.values.set(k,{...v,version:v.version+1,role:'reader'});yield new TextEncoder().encode(JSON.stringify({action:'rec.localStatus'}));}};const r=await s.handler({url:origin+'/local/api',method:'POST',headers:new Headers({Origin:origin,'Content-Type':'application/json',Cookie:l.cookie,'X-REC-CSRF':l.csrf}),body});assert.equal((await r.json()).error,'SESSION_REQUIRED');});
test('diagnostic du pont REC : classes non sensibles sans divulgation des erreurs internes',async()=>{
 const s=setup(),session=await login(s);s.env.REC_BACKEND_ENABLED='true';
 // L'URL et la clé sont fictives : le pont est injecté et aucun réseau n'est appelé.
 s.env.REC_GATEWAY_KEY='a'.repeat(64);
 s.env.REC_APPS_SCRIPT_URL='https://script.google.com/macros/s/AKfycbwWb1T3lPQhsa2mflZVhvdhF04Bic5X5wGoQhmwsTHa4RkqZgcqYm8R5lGrGtqVBOk1hA/exec';
 const cases={REC_CONNECTION_FAILED:'REC_GATEWAY_CONNECTION_FAILED',GOOGLE_REDIRECT_REFUSED:'REC_GATEWAY_REDIRECT_REFUSED',REC_RESPONSE_NOT_AUTHENTICATED:'REC_GATEWAY_SIGNATURE_INVALID',REC_RESPONSE_REPLAY:'REC_GATEWAY_NONCE_INVALID',REC_TARGET_NOT_CONFIRMED:'REC_GATEWAY_TARGET_INVALID',REC_GATEWAY_REDIRECT_INVALID:'REC_GATEWAY_REDIRECT_INVALID',REC_GATEWAY_FETCH_FAILED:'REC_GATEWAY_FETCH_FAILED',REC_GATEWAY_SIGNING_FAILED:'REC_GATEWAY_SIGNING_FAILED',REC_GATEWAY_INVALID_JSON:'REC_GATEWAY_INVALID_JSON',REC_GATEWAY_INVALID_ENVELOPE:'REC_GATEWAY_INVALID_ENVELOPE','sensitive raw backend failure':'REC_GATEWAY_UNAVAILABLE'};
 for(const[source,expected]of Object.entries(cases)){
  s.handler=localApplication(s.env,s.storage,{call:async()=>{throw Error(source);}});
  const result=await post(s,'api',{action:'rec.status'},session);
  assert.equal(result.status,503);assert.equal(result.error,expected);
  assert.equal(JSON.stringify(result).includes('sensitive'),false);
 }
 delete s.env.REC_GATEWAY_KEY;
 s.handler=localApplication(s.env,s.storage,{call:async()=>{throw Error('should not call');}});
 assert.equal((await post(s,'api',{action:'rec.status'},session)).error,'REC_BACKEND_CONFIGURATION_INVALID');
});
