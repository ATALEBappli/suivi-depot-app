import {localApplication,cleanupLocal} from './local-auth.mjs';
import {DurableObject} from 'cloudflare:workers';
import {config,frontendConfig,requireThat} from '../rec-server/security.mjs';
import {routes,authHandler,failure} from './routes.mjs';
import {durableStore} from './store.mjs';
import manifest from './generated-manifest.mjs';
export class RecAuth extends DurableObject {
 constructor(ctx,env){super(ctx,env);this.storage=ctx.storage;this.handler=env.REC_AUTH_MODE==='local'?localApplication(env,ctx.storage):authHandler(config(env,{hosting:'cloudflare'}),env,ctx.storage);}
 async fetch(request){try{return await this.handler(request);}catch{return failure();}}
 async alarm(){await durableStore(this.storage).cleanup();await cleanupLocal(this.storage);}
}
export default {
 async fetch(request,env){try{requireThat(env.REC_AUTH_MODE===undefined || ['local','oauth'].includes(env.REC_AUTH_MODE),'INVALID_AUTH_MODE');return await routes(frontendConfig(env,{hosting:'cloudflare'}),env,manifest,{beforeAuth:()=>config(env,{hosting:'cloudflare'})})(request);}catch{return failure();}}
};
