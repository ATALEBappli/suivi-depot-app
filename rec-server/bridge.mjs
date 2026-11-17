import {mac,equal,requireThat,random,pins} from './security.mjs';
const actions=new Set(['rec.status','v2.read','v2.simulate','v2.write','v2.import']);
export function authorized(body,user){requireThat(body && actions.has(body.action),'ACTION_NOT_ALLOWED');if(['v2.write','v2.import'].includes(body.action))requireThat(user.role==='admin','FORBIDDEN');}
export function bridge(config,{fetcher=fetch,now=Date.now,nonce=random}={}) {
 async function signed(body,user) {
  const id=nonce(),payload=JSON.stringify({version:1,timestamp:now(),nonce:id,actor:{email:user.email,sub:user.sub},request:body});
  let r=await fetcher(config.endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'rec.gateway',payload,mac:mac(payload,config.key)}),redirect:'manual',signal:AbortSignal.timeout(20000)});
  if([302,303].includes(r.status)){
   const location=new URL(r.headers.get('location'));requireThat(location.protocol==='https:' && location.hostname==='script.googleusercontent.com' && !location.username && !location.password && !location.port,'GOOGLE_REDIRECT_REFUSED');
   r=await fetcher(location.href,{method:'GET',redirect:'error',signal:AbortSignal.timeout(20000)});
  }
  requireThat(r.ok,'REC_CONNECTION_FAILED');const envelope=await r.json();
  requireThat(typeof envelope.payload==='string' && envelope.payload.length<3000000 && equal(envelope.mac,mac(envelope.payload,config.key)),'REC_RESPONSE_NOT_AUTHENTICATED');
  const result=JSON.parse(envelope.payload);requireThat(result.nonce===id,'REC_RESPONSE_REPLAY');return result.response;
 }
 return async(body,user)=>{
  authorized(body,user);
  const status=await signed({action:'rec.status'},user);
  requireThat(status.ok && status.environment==='REC' && status.scriptHash===pins.script && status.sheetHash===pins.sheet,'REC_TARGET_NOT_CONFIRMED');
  if(body.action==='rec.status')return status;
  return signed(body,user);
 };
}
