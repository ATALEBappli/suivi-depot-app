import {DurableObject} from 'cloudflare:workers';
import {config} from '../rec-server/security.mjs';
import {routes,authHandler,failure} from './routes.mjs';
import {durableStore} from './store.mjs';
import manifest from './generated-manifest.mjs';
export class RecAuth extends DurableObject {
 constructor(ctx,env){super(ctx,env);this.storage=ctx.storage;this.handler=authHandler(config(env,{hosting:'cloudflare'}),env,ctx.storage);}
 async fetch(request){try{return await this.handler(request);}catch{return failure();}}
 async alarm(){await durableStore(this.storage).cleanup();}
}
export default {
 async fetch(request,env){try{return await routes(config(env,{hosting:'cloudflare'}),env,manifest)(request);}catch{return failure();}}
};
