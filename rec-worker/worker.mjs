import {localApplication,cleanupLocal} from './local-auth.mjs';
import {DurableObject} from 'cloudflare:workers';
import {config,frontendConfig,requireThat} from '../rec-server/security.mjs';
import {routes,authHandler,failure} from './routes.mjs';
import {durableStore} from './store.mjs';
import manifest from './generated-manifest.mjs';
export class RecAuth extends DurableObject {
 constructor(ctx,env){super(ctx,env);this.storage=ctx.storage;this.localEnv=env.REC_AUTH_MODE==='local'?env:null;this.handler=this.localEnv?null:authHandler(config(env,{hosting:'cloudflare'}),env,ctx.storage);}
 async fetch(request){try{
  if(this.localEnv){
   // Le Worker public écrase cet en-tête avant le transfert interne.
   const enabled=request.headers.get('X-REC-Edge-Backend');
   requireThat(enabled==='true' || enabled==='false','INVALID_EDGE_BACKEND_STATE');
   return await localApplication({...this.localEnv,REC_BACKEND_ENABLED:enabled},this.storage)(request);
  }
  return await this.handler(request);
 }catch{return failure();}}
 async alarm(){await durableStore(this.storage).cleanup();await cleanupLocal(this.storage);}
}
export default {
 async fetch(request,env){try{requireThat(env.REC_AUTH_MODE===undefined || ['local','oauth'].includes(env.REC_AUTH_MODE),'INVALID_AUTH_MODE');return await routes(frontendConfig(env,{hosting:'cloudflare'}),env,manifest,{beforeAuth:()=>config(env,{hosting:'cloudflare'})})(request);}catch{return failure();}}
};
