// UNIQUEMENT miniflare : aucune fixture n'est importée par l'entrée de déploiement.
import {DurableObject} from 'cloudflare:workers';
import {durableStore} from '../../rec-worker/store.mjs';
import {routes,authHandler} from '../../rec-worker/routes.mjs';
export class RecAuth extends DurableObject {
 constructor(ctx,env){super(ctx,env);this.storage=ctx.storage;this.handler=authHandler(JSON.parse(env.FIXTURE_CONFIG),env,ctx.storage);}
 fetch(request){return this.handler(request);}
 alarm(){return durableStore(this.storage).cleanup();}
}
export default {fetch(request,env){return routes(JSON.parse(env.FIXTURE_CONFIG),env,JSON.parse(env.FIXTURE_MANIFEST))(request);}};
