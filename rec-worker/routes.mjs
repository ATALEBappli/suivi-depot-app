import {hex,requireThat} from '../rec-server/security.mjs';
import {application} from '../rec-server/application.mjs';
import {handle} from './adapter.mjs';
import {durableStore} from './store.mjs';
const security={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'"};
export function failure(status=503){return Response.json({ok:false,error:'REC_SERVER_CONFIGURATION_REQUIRED'},{status,headers:security});}
export function routes(cfg,env,manifest,{fetcher=fetch}={}){
 const assets=new Map(manifest.files.map(f=>['/'+f.path,f]));
 return async request=>{
  const url=new URL(request.url);if(url.origin!==cfg.origin)return failure(403);
  if(request.method==='GET' && url.pathname==='/rec-config.mjs')return new Response('export default Object.freeze('+JSON.stringify({apiBase:cfg.base})+');',{headers:{...security,'Content-Type':'text/javascript; charset=utf-8'}});
  const path=url.pathname==='/'?'/index.html':url.pathname;
  if(request.method==='GET' && assets.has(path)){
   const response=await env.ASSETS.fetch(new Request(cfg.base+path)),bytes=await response.arrayBuffer();
   requireThat(response.ok && hex(new Uint8Array(bytes))===assets.get(path).sha256,'FRONTEND_ASSET_CHANGED');
   const headers=new Headers(response.headers);for(const[k,v]of Object.entries(security))headers.set(k,v);
   headers.set('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self'; frame-src 'self'; connect-src 'self'; form-action 'none'; base-uri 'none'; object-src 'none'; worker-src 'none'; frame-ancestors "+(path==='/referentiel/index.html'?"'self'":"'none'"));
   return new Response(bytes,{headers});
  }
  if(!['/oauth/callback','/auth/start','/auth/exchange','/auth/logout','/api'].includes(path))return new Response('Not found',{status:404,headers:security});
  return env.REC_AUTH.get(env.REC_AUTH.idFromName('rec-auth-v1')).fetch(request);
 };
}
export async function edgeFetch(url,options={}){
 const refuse=options.redirect==='error';const response=await fetch(url,{...options,redirect:refuse?'manual':options.redirect});
 requireThat(!refuse || response.status<300 || response.status>=400,'REDIRECT_REFUSED');return response;
}
export function authHandler(cfg,env,storage,{fetcher=edgeFetch,call}={}){
 const blocked=async()=>({ok:false,error:'REC_BACKEND_DISABLED'});
 // La découverte OAuth fonctionne sans appel Google Apps Script. Ouverture distincte.
 const options={fetcher,authStore:durableStore(storage)};
 if(env.REC_BACKEND_ENABLED!=='true')options.call=blocked;else if(call)options.call=call;
 const app=application(cfg,options);return request=>handle(app,request);
}
