// Adaptateur Node conservé pour Cloud Run et tests locaux.
import {createServer} from 'node:http';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {site} from './site.mjs';
import {config} from './security.mjs';
import {application} from './application.mjs';
export {application,readJson} from './application.mjs';
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
 try{const cfg=config(process.env);createServer(application(cfg,{serveSite:site(fileURLToPath(new URL('./public/',import.meta.url)),cfg.base)})).listen(Number(process.env.PORT || 8080),'0.0.0.0');}
 catch{console.error('REC_SERVER_CONFIGURATION_REQUIRED');process.exitCode=1;}
}
