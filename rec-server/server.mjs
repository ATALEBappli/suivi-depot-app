// Node 24, sans dépendance. Secrets exclusivement dans l'environnement serveur.
import {createServer} from 'node:http';
import {pathToFileURL} from 'node:url';
import {random,hash,requireThat,identity,config} from './security.mjs';
import {bridge} from './bridge.mjs';
export function application(cfg,{fetcher=fetch,now=Date.now,call=bridge(cfg,{fetcher,now}),randomId=random}={}) {
 const states=new Map(),tickets=new Map(),sessions=new Map();let jwksCache=null,jwksUntil=0;
 const prune=map=>{for(const [k,v] of map)if(v.exp<=now())map.delete(k);};
 const put=(map,value,ttl,cap)=>{prune(map);requireThat(map.size<cap,'RATE_LIMIT');const id=randomId();map.set(id,{...value,exp:now()+ttl});return id;};
 const take=(map,id)=>{const value=map.get(id);map.delete(id);requireThat(value && value.exp>now(),'AUTH_EXPIRED');return value;};
 async function jsonBody(req){let data='';for await(const chunk of req){data+=chunk;requireThat(Buffer.byteLength(data)<600000,'REQUEST_TOO_LARGE');}return JSON.parse(data);}
 async function jwks(){if(!jwksCache || jwksUntil<=now()){const r=await fetcher('https://www.googleapis.com/oauth2/v3/certs',{redirect:'error',signal:AbortSignal.timeout(10000)});requireThat(r.ok,'IDENTITY_UNAVAILABLE');jwksCache=await r.json();jwksUntil=now()+300000;}return jwksCache;}
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Security-Policy',"default-src 'none'; frame-ancestors 'none'");
  const origin=req.headers.origin;
  const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
  try {
   const url=new URL(req.url,cfg.base);
   if(url.pathname==='/oauth/callback' && req.method==='GET') {
    const flow=take(states,url.searchParams.get('state'));requireThat(!url.searchParams.has('error') && url.searchParams.get('code'),'AUTH_CANCELLED');
    const r=await fetcher('https://oauth2.googleapis.com/token',{method:'POST',redirect:'error',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',code:url.searchParams.get('code'),client_id:cfg.clientId,client_secret:cfg.clientSecret,redirect_uri:cfg.base+'/oauth/callback',code_verifier:flow.verifier}),signal:AbortSignal.timeout(10000)});
    requireThat(r.ok,'AUTH_FAILED');const token=await r.json();requireThat(typeof token.id_token==='string','AUTH_FAILED');
    const verified=identity(token.id_token,await jwks(),{clientId:cfg.clientId,nonce:flow.nonce,allowed:null,now:now()});
    const user=cfg.allowed.find(u=>u.email===verified.email && u.sub===verified.sub);
    if(!user){send(403,{ok:false,error:'ACCOUNT_NOT_ALLOWED',verifiedGoogleIdentity:verified,instruction:'Identité vérifiée uniquement. Aucun accès REC. Renseigner cette identité dans les configurations privées serveur et Apps Script, sans jeton OAuth.'});return;}
    // Les jetons Google ne sont ni conservés, ni renvoyés au navigateur.
    const ticket=put(tickets,{user,challenge:flow.challenge},60000,100);
    res.writeHead(303,{Location:cfg.front+'#parametrage/login/'+ticket});res.end();return;
   }
   requireThat(origin===cfg.origin,'ORIGIN_NOT_ALLOWED');
   res.setHeader('Access-Control-Allow-Origin',cfg.origin);res.setHeader('Vary','Origin');
   if(req.method==='OPTIONS'){
    requireThat(req.headers['access-control-request-method']==='POST','METHOD_NOT_ALLOWED');
    res.writeHead(204,{'Access-Control-Allow-Methods':'POST','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Max-Age':'300'});res.end();return;
   }
   requireThat(req.method==='POST' && req.headers['content-type']?.split(';')[0]==='application/json','METHOD_NOT_ALLOWED');
   const body=await jsonBody(req);
   if(url.pathname==='/auth/start') {
    requireThat(typeof body.challenge==='string' && /^[A-Za-z0-9_-]{43}$/.test(body.challenge),'INVALID_PKCE');
    const verifier=randomId(),nonce=randomId(),state=put(states,{verifier,nonce,challenge:body.challenge},300000,100);
    const q=new URLSearchParams({client_id:cfg.clientId,redirect_uri:cfg.base+'/oauth/callback',response_type:'code',scope:'openid email',state,nonce,code_challenge:hash(verifier),code_challenge_method:'S256',prompt:'select_account'});
    send(200,{url:'https://accounts.google.com/o/oauth2/v2/auth?'+q});return;
   }
   if(url.pathname==='/auth/exchange') {
    const t=take(tickets,body.ticket);requireThat(typeof body.verifier==='string' && /^[A-Za-z0-9_-]{43}$/.test(body.verifier) && hash(body.verifier)===t.challenge,'INVALID_PKCE');
    const session=put(sessions,{user:t.user},900000,200);send(200,{session,expiresIn:900});return;
   }
   const id=req.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];prune(sessions);
   const session=sessions.get(id);requireThat(session && session.exp>now(),'SESSION_REQUIRED');
   if(url.pathname==='/auth/logout'){sessions.delete(id);send(200,{ok:true});return;}
   requireThat(url.pathname==='/api','NOT_FOUND');const response=await call(body,session.user);
   if(body.action==='rec.status' && response.ok)response.authenticatedAs={email:session.user.email,role:session.user.role};
   send(200,response);
  }catch(e){
   // Aucun corps Google, compte, code OAuth, MAC ou détail de configuration dans les logs.
   const allowed=['ORIGIN_NOT_ALLOWED','RATE_LIMIT','ACCOUNT_NOT_ALLOWED','AUTH_EXPIRED','AUTH_CANCELLED','SESSION_REQUIRED','FORBIDDEN','ACTION_NOT_ALLOWED','REC_TARGET_NOT_CONFIRMED'];
   send(allowed.includes(e.message)?403:400,{ok:false,error:allowed.includes(e.message)?e.message:'REC_REQUEST_FAILED'});
  }
 };
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
 try{const cfg=config(process.env);createServer(application(cfg)).listen(Number(process.env.PORT || 8080),'0.0.0.0');}
 catch{console.error('REC_SERVER_CONFIGURATION_REQUIRED');process.exitCode=1;}
}
