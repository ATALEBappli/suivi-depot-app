import {randomUUID} from 'node:crypto';
import {hash,equal,random,requireThat,frontendConfig} from '../rec-server/security.mjs';
import {passwordRecord,verifyPassword,usernameInput,validPasswordRecord} from './passwords.mjs';
import {bridge,authorized} from '../rec-server/bridge.mjs';
const roles=['admin','manager','reader'],sessionCookie='__Host-rec_session';
const safeUser=u=>({id:u.id,username:u.username,role:u.role,active:u.active,version:u.version});
const headers={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'"};
const cookie=(token,maxAge=900)=>sessionCookie+'='+token+'; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age='+maxAge;
const key=(area,value)=>'local:'+area+':'+hash(value);
const fail=code=>{throw Error(code);};
export function localApplication(env,storage,{now=Date.now,call}={}){
 requireThat(env.REC_AUTH_MODE==='local','FORBIDDEN');
 const cfg=frontendConfig(env,{hosting:'cloudflare'});
 async function initialize(){
  if(await storage.get('local:initialized'))return true;
  if(!env.REC_BOOTSTRAP_ADMIN)return false;
  let u;try{u=JSON.parse(env.REC_BOOTSTRAP_ADMIN);}catch{return fail('PRIVATE_INITIALIZATION_REQUIRED');}
  requireThat(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(u.id || '') && u.role==='admin' && validPasswordRecord(u.password),'PRIVATE_INITIALIZATION_REQUIRED');usernameInput(u.username);
  await storage.transaction(async tx=>{if(await tx.get('local:initialized'))return;requireThat((await tx.list({prefix:'local:user:'})).size===0,'PRIVATE_INITIALIZATION_REQUIRED');await tx.put(key('user',u.username),{id:u.id,username:u.username,role:'admin',active:true,version:1,password:u.password});await tx.put('local:initialized',{schema:1});});return true;
 }
 const setupAvailable=()=>typeof env.REC_BOOTSTRAP_SETUP_TOKEN==='string' && /^[A-Za-z0-9_-]{43,128}$/.test(env.REC_BOOTSTRAP_SETUP_TOKEN);
 async function rate(name,limit){
  await storage.transaction(async tx=>{const k=key('rate',name),time=now();let r=await tx.get(k);if(!r || r.exp<=time)r={count:0,exp:time+900000};requireThat(r.count<limit,'LOGIN_RATE_LIMIT');await tx.put(k,{...r,count:r.count+1});});
 }
 async function prune(){for(const prefix of ['local:session:','local:rate:'])for(const[k,v]of await storage.list({prefix}))if(v.exp<=now())await storage.delete(k);}
 async function session(request){
  const value=request.headers.get('Cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(sessionCookie+'='))?.slice(sessionCookie.length+1);
  if(!/^[A-Za-z0-9_-]{43}$/.test(value || ''))return;
  const s=await storage.get(key('session',value));if(!s || s.exp<=now())return;
  const u=await storage.get(key('user',s.username));if(!u?.active || u.id!==s.userId || u.version!==s.version)return;
  return {s,u,token:value};
 }
 async function backend(body,u){
  authorized(body,u);
  if(env.REC_BACKEND_ENABLED!=='true')return {ok:false,error:'REC_BACKEND_DISABLED'};
  // Ces propriétés sont vérifiées avant la première requête signée, sans dépendre d'OAuth.
  const {backendConfig}=await import('../rec-server/security.mjs');const bc=backendConfig(env,{hosting:'cloudflare'});
  return (call || bridge(bc))(body,{...safeUser(u),authMode:'local'});
 }
 return async request=>{
  const reply=(status,data,extra={})=>Response.json(data,{status,headers:{...headers,...extra}});
  try{
   requireThat(new URL(request.url).origin===cfg.origin,'FORBIDDEN');
   const path=new URL(request.url).pathname;
   if(!['/local/session','/local/bootstrap','/local/login','/local/logout','/local/password','/local/users','/local/api'].includes(path))return reply(404,{ok:false,error:'NOT_FOUND'});
   if(request.method==='GET')requireThat(!request.headers.get('Sec-Fetch-Site') || request.headers.get('Sec-Fetch-Site')==='same-origin','FORBIDDEN');
   else requireThat(request.method==='POST' && request.headers.get('Origin')===cfg.origin && request.headers.get('Content-Type')?.split(';')[0]==='application/json','FORBIDDEN');
   const initialized=await initialize();
   let current=await session(request);
   if(path==='/local/session' && request.method==='GET')return reply(200,{ok:true,user:current?safeUser(current.u):null,csrf:current?.s.csrf || null,bootstrapRequired:!initialized,bootstrapOnPhone:!initialized && setupAvailable(),backendEnabled:env.REC_BACKEND_ENABLED==='true'});
   requireThat(request.method==='POST','FORBIDDEN');
   if(!['/local/login','/local/bootstrap'].includes(path))requireThat(current,'SESSION_REQUIRED');
   if(current && !['/local/login','/local/bootstrap'].includes(path))requireThat(request.headers.get('X-REC-CSRF')===current.s.csrf,'FORBIDDEN');
   const declared=Number(request.headers.get('Content-Length'));requireThat(!declared || declared<=600000,'INVALID_REQUEST');
   const chunks=[];let length=0;if(request.body)for await(const chunk of request.body){length+=chunk.length;requireThat(length<=600000,'INVALID_REQUEST');chunks.push(chunk);}
   const bytes=new Uint8Array(length);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}let body;try{body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{fail('INVALID_REQUEST');}
   requireThat(body && typeof body==='object' && !Array.isArray(body),'INVALID_REQUEST');
   if(path==='/local/bootstrap'){
    requireThat(length<=4096,'INVALID_REQUEST');
    // Codes de diagnostic par étape, sans message brut, mot de passe ou secret.
    // Les erreurs attendues de validation restent inchangées.
    let stage='rate';
    try{
     await rate('bootstrap-global',10);
     await rate('bootstrap-ip:'+hash(request.headers.get('CF-Connecting-IP') || 'local'),5);
     stage='token';
     const token=body.setupToken;
     requireThat(!initialized && setupAvailable() && typeof token==='string' && token.length<=128 && equal(hash(token),hash(env.REC_BOOTSTRAP_SETUP_TOKEN)),'AUTH_FAILED');
     stage='password';
     const username=usernameInput(body.username),password=passwordRecord(body.password),id=randomUUID();
     stage='storage';
     await storage.transaction(async tx=>{
      requireThat(!(await tx.get('local:initialized')) && (await tx.list({prefix:'local:user:'})).size===0,'AUTH_FAILED');
      await tx.put(key('user',username),{id,username,role:'admin',active:true,version:1,password});
      await tx.put('local:initialized',{schema:1});
     });
     return reply(200,{ok:true,initialized:true});
    }catch(error){
     if(['AUTH_FAILED','LOGIN_RATE_LIMIT','INVALID_PASSWORD','INVALID_USERNAME'].includes(error?.message))throw error;
     fail({rate:'BOOTSTRAP_RATE_UNAVAILABLE',token:'BOOTSTRAP_TOKEN_CHECK_FAILED',password:'BOOTSTRAP_CRYPTO_UNAVAILABLE',storage:'BOOTSTRAP_STORAGE_UNAVAILABLE'}[stage]);
    }
   }
   if(path==='/local/login'){
    requireThat(length<=4096,'INVALID_REQUEST');await prune();
    await rate('global',30);await rate('ip:'+hash(request.headers.get('CF-Connecting-IP') || 'local'),10);
    const username=typeof body.username==='string'?body.username.toLowerCase():'';
    await rate('name:'+hash(username),5);
    const u=/^[a-z0-9][a-z0-9._-]{2,63}$/.test(username)?await storage.get(key('user',username)):undefined;
    const valid=verifyPassword(body.password,u?.password);requireThat(initialized && valid && u?.active,'AUTH_FAILED');
    const token=random(),csrf=random();requireThat((await storage.list({prefix:'local:session:'})).size<500,'LOGIN_RATE_LIMIT');
    await storage.put(key('session',token),{userId:u.id,username:u.username,version:u.version,csrf,exp:now()+900000});
    if(storage.setAlarm && !(await storage.getAlarm()))await storage.setAlarm(now()+60000);
    return reply(200,{ok:true,user:safeUser(u),csrf},{'Set-Cookie':cookie(token)});
   }
   // Revalider après la lecture asynchrone du corps : un rôle peut avoir changé entre-temps.
   const fresh=await session(request);requireThat(fresh && fresh.u.id===current.u.id && fresh.u.version===current.u.version,'SESSION_REQUIRED');current=fresh;
   const {u,token}=current;
   if(path==='/local/logout'){await storage.delete(key('session',token));return reply(200,{ok:true},{'Set-Cookie':cookie('',0)});}
   if(path==='/local/password'){
    await rate('reauth:'+u.id,5);
    requireThat(length<=4096 && verifyPassword(body.currentPassword,u.password),'AUTH_FAILED');const password=passwordRecord(body.password);
    await storage.transaction(async tx=>{const fresh=await tx.get(key('user',u.username));requireThat(fresh.version===u.version,'SESSION_REQUIRED');await tx.put(key('user',u.username),{...fresh,password,version:fresh.version+1});});
    return reply(200,{ok:true},{'Set-Cookie':cookie('',0)});
   }
   if(path==='/local/users'){
    requireThat(u.role==='admin','FORBIDDEN');
    if(body.action==='list')return reply(200,{ok:true,users:[...(await storage.list({prefix:'local:user:'})).values()].map(safeUser)});
    await rate('reauth:'+u.id,5);
    requireThat(body.action==='save' && length<=8192 && verifyPassword(body.currentPassword,u.password),'AUTH_FAILED');
    const name=usernameInput(body.username);requireThat(roles.includes(body.role) && typeof body.active==='boolean','INVALID_REQUEST');
    const password=body.password?passwordRecord(body.password):null;
    await storage.transaction(async tx=>{
     const actor=await tx.get(key('user',u.username));requireThat(actor.active && actor.version===u.version && actor.role==='admin','SESSION_REQUIRED');
     const previous=await tx.get(key('user',name)),users=[...(await tx.list({prefix:'local:user:'})).values()];
     requireThat(previous || (password && users.length<100),'INVALID_REQUEST');
     if(previous?.active && previous.role==='admin' && (!body.active || body.role!=='admin'))requireThat(users.some(x=>x.id!==previous.id && x.active && x.role==='admin'),'LAST_ADMIN');
     await tx.put(key('user',name),{id:previous?.id || randomUUID(),username:name,role:body.role,active:body.active,version:(previous?.version || 0)+1,password:password || previous.password});
    });return reply(200,{ok:true});
   }
   if(path==='/local/api'){
    if(body.action==='rec.localStatus')return reply(200,{ok:true,environment:'REC',authMode:'local',backendEnabled:env.REC_BACKEND_ENABLED==='true',user:safeUser(u)});
    return reply(200,await backend(body,u));
   }
   return reply(404,{ok:false,error:'NOT_FOUND'});
  }catch(e){
   const diagnostic=['BOOTSTRAP_RATE_UNAVAILABLE','BOOTSTRAP_TOKEN_CHECK_FAILED','BOOTSTRAP_CRYPTO_UNAVAILABLE','BOOTSTRAP_STORAGE_UNAVAILABLE'];
   const allowed=['FORBIDDEN','SESSION_REQUIRED','AUTH_FAILED','LOGIN_RATE_LIMIT','INVALID_PASSWORD','INVALID_USERNAME','INVALID_REQUEST','LAST_ADMIN','PRIVATE_INITIALIZATION_REQUIRED',...diagnostic];
   return reply(diagnostic.includes(e.message)?503:e.message==='LOGIN_RATE_LIMIT'?429:e.message==='AUTH_FAILED'?401:403,{ok:false,error:allowed.includes(e.message)?e.message:'REC_REQUEST_FAILED'});
  }
 };
}
export async function cleanupLocal(storage,now=Date.now){let pending=false;for(const prefix of ['local:session:','local:rate:'])for(const[k,v]of await storage.list({prefix})){if(v.exp<=now())await storage.delete(k);else pending=true;}if(pending && storage.setAlarm)await storage.setAlarm(now()+60000);}
