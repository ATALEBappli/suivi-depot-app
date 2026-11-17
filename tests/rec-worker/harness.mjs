import {createRequire} from 'node:module';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
const require=createRequire(new URL('../../rec-worker/package.json',import.meta.url));
const {Miniflare,convertV4MiniflareOptions}=require('miniflare'),{build}=require('esbuild');
export async function localWorker({cfg,site,provider,google,port=0,persist,enabled='true'}){
 const temp=mkdtempSync(tmpdir()+'/rec-worker-fixture-');
 await build({entryPoints:[new URL('./fixture-worker.mjs',import.meta.url).pathname],outfile:temp+'/fixture.mjs',bundle:true,platform:'node',format:'esm',external:['cloudflare:workers','node:*'],logLevel:'silent'});
 const manifest=JSON.parse(readFileSync(site+'/manifest.json'));
 const options=convertV4MiniflareOptions({name:'rec-test',scriptPath:temp+'/fixture.mjs',modulesRoot:temp,modules:true,compatibilityDate:'2026-07-30',compatibilityFlags:['nodejs_compat'],port,host:'127.0.0.1',durableObjects:{REC_AUTH:{className:'RecAuth',useSQLite:true}},durableObjectsPersist:persist || false,bindings:{FIXTURE_CONFIG:JSON.stringify(cfg),FIXTURE_MANIFEST:JSON.stringify(manifest),REC_BACKEND_ENABLED:enabled},serviceBindings:{ASSETS:async request=>{const path=new URL(request.url).pathname;const file=manifest.files.find(f=>'/'+f.path===path);if(!file)return new Response('',{status:404});const contentType=path.endsWith('.html')?'text/html':/\.m?js$/.test(path)?'text/javascript':path.endsWith('.css')?'text/css':path.endsWith('.svg')?'image/svg+xml':'font/woff2';return new Response(readFileSync(site+'/'+file.path),{headers:{'Content-Type':contentType}});}},outboundService:async request=>{
  const u=new URL(request.url);
  if(u.hostname==='script.google.com'){if(!google)throw Error('GOOGLE_BUSINESS_CALL_FORBIDDEN_IN_TEST');return Response.json(google.post(await request.json()));}
  if(['oauth2.googleapis.com','www.googleapis.com'].includes(u.hostname)){
   const r=await provider.fetcher(request.url,{body:request.method==='POST'?new URLSearchParams(await request.text()):undefined});return Response.json(await r.json());
  }
  throw Error('EXTERNAL_REQUEST_BLOCKED');
 }});
 options.resourcePersistencePath=persist;options.logRequests=false;
 const mf=new Miniflare(options);
 await mf.ready;
 return {mf,close:async()=>{await mf.dispose();rmSync(temp,{recursive:true,force:true});}};
}
