// Exécute les octets compilés EXACTS avec la vraie liaison Static Assets locale.
import {resolve} from 'node:path';
import {verifyRelease,target,releaseConfig} from '../../rec-worker/release.mjs';
import {verifyPublic} from '../../rec-worker/publish.mjs';
import {localWorker} from './harness.mjs';
const directory=resolve(process.argv[2]);verifyRelease(directory,{sourceSha:process.argv[3],expectedHash:process.argv[4]});
const worker=await localWorker({cfg:{base:target.origin},site:directory+'/public',productionEnv:releaseConfig().vars,compiled:directory+'/worker.js',realAssets:true});
try{console.log(JSON.stringify({scope:'local_workerd_only',...await verifyPublic(directory,{fetcher:(url,options)=>worker.mf.dispatchFetch(url,options)})}));}finally{await worker.close();}
