// Préparation/validation locale de l'artefact exact ; jamais de réseau ni de secret.
import {readFileSync,writeFileSync,cpSync,mkdirSync,readdirSync,lstatSync} from 'node:fs';
import {resolve,relative} from 'node:path';
import {pathToFileURL} from 'node:url';
import {hex,requireThat} from '../rec-server/security.mjs';
import {site} from '../rec-server/site.mjs';
export const target=Object.freeze({repository:'ATALEBappli/suivi-depot-app',account:'18ef4a62d73a6a9f776df0488b63ebba',worker:'suivi-depot-rec',subdomain:'amine-taleb',origin:'https://suivi-depot-rec.amine-taleb.workers.dev',frontendSha:'8cee35c60b77ee4cd01960990c4ad937cf52d2d9'});
const json=(p,code)=>{try{return JSON.parse(readFileSync(p,'utf8'));}catch{throw Error(code);}};
export function releaseConfig(){return {name:target.worker,account_id:target.account,main:'worker.js',find_additional_modules:false,compatibility_date:'2026-07-30',compatibility_flags:['nodejs_compat'],workers_dev:true,preview_urls:false,assets:{directory:'./public',binding:'ASSETS',run_worker_first:true,html_handling:'none',not_found_handling:'none'},durable_objects:{bindings:[{name:'REC_AUTH',class_name:'RecAuth'}]},migrations:[{tag:'v1',new_sqlite_classes:['RecAuth']}],observability:{enabled:false},logpush:false,tail_consumers:[],vars:{APP_ENV:'REC',REC_SERVER_URL:target.origin,REC_BACKEND_ENABLED:'false',REC_USER_ALLOWLIST:'[]'}};}
function files(root,dir=root){const result=[];for(const e of readdirSync(dir)){const p=resolve(dir,e),stat=lstatSync(p);requireThat(!stat.isSymbolicLink(),'UNSAFE_RELEASE_FILE');if(stat.isDirectory())result.push(...files(root,p));else{requireThat(stat.isFile(),'UNSAFE_RELEASE_FILE');const name=relative(root,p).replaceAll('\\','/');if(name!=='release.json')result.push({path:name,sha256:hex(readFileSync(p))});}}return result.sort((a,b)=>a.path.localeCompare(b.path));}
const digest=list=>hex(JSON.stringify(list));
export function verifyRelease(directory,{sourceSha,expectedHash}={}){
 const root=resolve(directory),receipt=json(root+'/release.json','RELEASE_RECEIPT_INVALID');
 requireThat(receipt.schema===1 && /^[a-f0-9]{40}$/.test(receipt.sourceSha) && (!sourceSha || receipt.sourceSha===sourceSha) && receipt.frontendSha===target.frontendSha,'WRONG_RELEASE_SOURCE');
 const entries=files(root);requireThat(JSON.stringify(receipt.files)===JSON.stringify(entries) && receipt.sha256===digest(entries) && (!expectedHash || receipt.sha256===expectedHash),'RELEASE_HASH_MISMATCH');
 requireThat(JSON.stringify(json(root+'/wrangler.jsonc','RELEASE_CONFIG_INVALID'))===JSON.stringify(releaseConfig()),'WRONG_RELEASE_TARGET_OR_FLAGS');
 const manifest=json(root+'/public/manifest.json','FRONTEND_MANIFEST_INVALID');requireThat(manifest.sourceSha===target.frontendSha,'WRONG_FRONTEND_SOURCE');site(root+'/public',target.origin);
 const allowed=new Set(['worker.js','wrangler.jsonc','public/manifest.json',...manifest.files.map(f=>'public/'+f.path)]);
 requireThat(entries.length===allowed.size && entries.every(f=>allowed.has(f.path)),'UNEXPECTED_RELEASE_FILE');
 return receipt;
}
export function createRelease({bundle,publicDirectory,output,sourceSha}){
 requireThat(/^[a-f0-9]{40}$/.test(sourceSha || ''),'INVALID_SOURCE_SHA');
 let script;try{script=readFileSync(resolve(bundle,'worker.js'));}catch(e){throw Error(e.code==='ENOENT'?'COMPILED_WORKER_MISSING':'COMPILED_WORKER_UNREADABLE');}
 requireThat(script.length>100 && script.length<3000000,'INVALID_COMPILED_WORKER');
 try{mkdirSync(output);}catch(e){throw Error(e.code==='EEXIST'?'RELEASE_OUTPUT_EXISTS':'RELEASE_OUTPUT_CREATE_FAILED');}
 writeFileSync(resolve(output,'worker.js'),script);try{cpSync(publicDirectory,resolve(output,'public'),{recursive:true});}catch{throw Error('PUBLIC_ASSETS_COPY_FAILED');}
 writeFileSync(resolve(output,'wrangler.jsonc'),JSON.stringify(releaseConfig(),null,2)+'\n');
 const entries=files(resolve(output)),receipt={schema:1,sourceSha,frontendSha:target.frontendSha,files:entries,sha256:digest(entries)};
 writeFileSync(resolve(output,'release.json'),JSON.stringify(receipt,null,2)+'\n');return verifyRelease(output,{sourceSha});
}
// Liste fermée : jamais de message brut, chemin, contenu JSON ou variable d'environnement.
export function releaseErrorCode(error){
 const allowed=new Set(['INVALID_OPERATION','INVALID_SOURCE_SHA','INVALID_COMPILED_WORKER','COMPILED_WORKER_MISSING','COMPILED_WORKER_UNREADABLE','RELEASE_OUTPUT_EXISTS','RELEASE_OUTPUT_CREATE_FAILED','PUBLIC_ASSETS_COPY_FAILED','RELEASE_RECEIPT_INVALID','RELEASE_CONFIG_INVALID','FRONTEND_MANIFEST_INVALID','UNSAFE_RELEASE_FILE','WRONG_RELEASE_SOURCE','RELEASE_HASH_MISMATCH','WRONG_RELEASE_TARGET_OR_FLAGS','WRONG_FRONTEND_SOURCE','UNEXPECTED_RELEASE_FILE','INVALID_FRONTEND_MANIFEST','INVALID_FRONTEND_ASSET','UNSAFE_FRONTEND_ASSET','FRONTEND_ASSET_CHANGED','MISSING_FRONTEND_ASSET']);
 return allowed.has(error?.message)?error.message:'RELEASE_NOT_VERIFIED';
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
 try{const [op,...args]=process.argv.slice(2);let receipt;if(op==='create'){const[bundle,publicDirectory,output,sourceSha]=args;receipt=createRelease({bundle,publicDirectory,output,sourceSha});}else if(op==='verify')receipt=verifyRelease(args[0],{sourceSha:args[1],expectedHash:args[2]});else throw Error('INVALID_OPERATION');console.log(JSON.stringify({sourceSha:receipt.sourceSha,frontendSha:receipt.frontendSha,sha256:receipt.sha256,files:receipt.files.length}));}
 catch(e){console.error('REC_WORKER_STOP '+releaseErrorCode(e));process.exitCode=1;}
}
