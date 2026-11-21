import {mac,equal,requireThat,random,pins} from './security.mjs';
const actions=new Set(['rec.status','v2.read','v2.simulate','v2.write','v2.import','rec.testTransaction.create','rec.testTransaction.list','rec.reference','finance.read','finance.preview','finance.write','finance.configure']);
export function authorized(body,user){
 requireThat(body && actions.has(body.action),'ACTION_NOT_ALLOWED');
 requireThat(['admin','manager','reader'].includes(user.role),'FORBIDDEN');
 if(['v2.simulate','v2.write','v2.import','finance.configure','rec.testTransaction.create'].includes(body.action))requireThat(user.role==='admin','FORBIDDEN');
 if(['finance.preview','finance.write'].includes(body.action))requireThat(['admin','manager'].includes(user.role),'FORBIDDEN');
}
export function bridge(config,{fetcher=fetch,now=Date.now,nonce=random}={}) {
 async function signed(body,user) {
  const id=nonce(),payload=JSON.stringify({version:user.authMode==='local'?2:1,timestamp:now(),nonce:id,actor:user.authMode==='local'?{id:user.id,role:user.role,authVersion:user.version}:{email:user.email,sub:user.sub},request:body});
  let signedPayload;try{signedPayload=mac(payload,config.key);}catch{throw Error('REC_GATEWAY_SIGNING_FAILED');}
  // Un POST a peut-être été exécuté avant un échec réseau : aucun nouvel essai automatique.
  let r;try{r=await fetcher(config.endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'rec.gateway',payload,mac:signedPayload}),redirect:'manual',signal:AbortSignal.timeout(45000)});}catch{throw Error('REC_GATEWAY_POST_FAILED');}
  if([302,303].includes(r.status)){
   let location;try{location=new URL(r.headers.get('location'));}catch{throw Error('REC_GATEWAY_REDIRECT_INVALID');}
   requireThat(location.protocol==='https:' && location.hostname==='script.googleusercontent.com' && !location.username && !location.password && !location.port,'GOOGLE_REDIRECT_REFUSED');
   // Seul le GET de restitution est réessayé : jamais le POST susceptible d'écrire.
   let received=false;
   for(let attempt=0;attempt<2 && !received;attempt++){
    if(attempt)await new Promise(resolve=>setTimeout(resolve,350));
    try{
     const answer=await fetcher(location.href,{method:'GET',redirect:'error',signal:AbortSignal.timeout(20000)});
     // Le service Google a déjà exécuté doPost ; certaines réponses ContentService
     // échouent momentanément en 404/502/503/504 à la première lecture.
     if([404,502,503,504].includes(answer.status) && attempt===0)continue;
     r=answer;received=true;
    }catch{if(attempt===1)throw Error('REC_GATEWAY_REDIRECT_FETCH_FAILED');}
   }
   requireThat(received,'REC_GATEWAY_REDIRECT_FETCH_FAILED');
  }
  requireThat(r.ok,'REC_CONNECTION_FAILED');let envelope;
  try{envelope=await r.json();}catch{throw Error('REC_GATEWAY_INVALID_JSON');}
  requireThat(envelope && typeof envelope==='object','REC_GATEWAY_INVALID_ENVELOPE');
  requireThat(typeof envelope.payload==='string' && envelope.payload.length<3000000 && equal(envelope.mac,mac(envelope.payload,config.key)),'REC_RESPONSE_NOT_AUTHENTICATED');
  let result;try{result=JSON.parse(envelope.payload);}catch{throw Error('REC_GATEWAY_INVALID_ENVELOPE');}
  requireThat(result && result.nonce===id,'REC_RESPONSE_REPLAY');return result.response;
 }
 return async(body,user)=>{
  authorized(body,user);
  const status=await signed({action:'rec.status'},user);
  requireThat(status.ok && status.environment==='REC' && status.scriptHash===pins.script && status.sheetHash===pins.sheet,'REC_TARGET_NOT_CONFIRMED');
  if(body.action==='rec.status')return status;
  return signed(body,user);
 };
}
