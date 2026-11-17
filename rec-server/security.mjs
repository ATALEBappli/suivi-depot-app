import {createHash,createHmac,timingSafeEqual,createPublicKey,verify,randomBytes} from 'node:crypto';
export const pins=Object.freeze({script:'78e98c211f7c0a055fd26ef132598d27e4e91d6fac2adacf9e3c71f7015d0d71',sheet:'defa8602371f49e0c1f118047af17a5c72c06f858d436884c3f1d902a98cce95',deployment:'85d16e00a6ea73278d4211295119ee7eb04e5d00dbd3fcad9ffa950516e2f063'});
export const hash=s=>createHash('sha256').update(s).digest('base64url');
export const hex=s=>createHash('sha256').update(s).digest('hex');
export const random=()=>randomBytes(32).toString('base64url');
export const mac=(s,key)=>createHmac('sha256',key).update(s).digest('base64url');
export function equal(a,b){if(typeof a!=='string' || typeof b!=='string')return false;const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length && timingSafeEqual(x,y);}
export function requireThat(value,code){if(!value)throw Error(code);}
export function identity(token,jwks,{clientId,nonce,allowed,now=Date.now()}) {
 const parts=token.split('.');requireThat(parts.length===3 && token.length<20000,'INVALID_ID_TOKEN');
 const header=JSON.parse(Buffer.from(parts[0],'base64url')),p=JSON.parse(Buffer.from(parts[1],'base64url'));
 requireThat(header.alg==='RS256' && typeof header.kid==='string','INVALID_ID_TOKEN');
 const keys=jwks.keys?.filter(k=>k.kid===header.kid && k.kty==='RSA' && (!k.use || k.use==='sig') && (!k.alg || k.alg==='RS256'));
 requireThat(keys?.length===1 && verify('RSA-SHA256',Buffer.from(parts[0]+'.'+parts[1]),createPublicKey({key:keys[0],format:'jwk'}),Buffer.from(parts[2],'base64url')),'INVALID_ID_TOKEN');
 requireThat(['https://accounts.google.com','accounts.google.com'].includes(p.iss) && p.aud===clientId && (!p.azp || p.azp===clientId) && p.nonce===nonce && p.email_verified===true && typeof p.sub==='string' && p.sub && typeof p.email==='string' && Number.isFinite(p.exp) && p.exp*1000>now && Number.isFinite(p.iat) && p.iat*1000<=now+60000 && p.iat*1000>now-3600000,'INVALID_ID_TOKEN');
 if(allowed===null)return {email:p.email.toLowerCase(),sub:p.sub};
 const user=allowed.find(u=>u.sub===p.sub && u.email===p.email.toLowerCase());requireThat(user,'ACCOUNT_NOT_ALLOWED');return {...user};
}
export function allowlist(value){const users=JSON.parse(value || '[]');requireThat(Array.isArray(users) && users.length<=20 && users.every(u=>typeof u.email==='string' && u.email===u.email.toLowerCase() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u.email) && typeof u.sub==='string' && /^[A-Za-z0-9_-]{1,150}$/.test(u.sub) && ['reader','admin'].includes(u.role)) && new Set(users.map(u=>u.sub)).size===users.length,'INVALID_ALLOWLIST');return users;}
export function config(env) {
 requireThat(env.APP_ENV==='REC','REC_ONLY');
 const base=new URL(env.REC_SERVER_URL),front=new URL(base.origin+'/');
 requireThat(base.protocol==='https:' && base.hostname.endsWith('.run.app') && !base.port && base.pathname==='/' && !base.search && !base.hash && !base.username && !base.password,'INVALID_SERVER_URL');
 const endpoint=new URL(env.REC_APPS_SCRIPT_URL);
 const match=endpoint.href.match(/^https:\/\/script\.google\.com\/macros\/s\/([A-Za-z0-9_-]+)\/exec$/);
 requireThat(match && hex(match[1])===pins.deployment,'WRONG_DEPLOYMENT_TARGET');
 requireThat(typeof env.REC_GATEWAY_KEY==='string' && /^[a-f0-9]{64}$/.test(env.REC_GATEWAY_KEY),'INVALID_GATEWAY_KEY');
 requireThat(typeof env.REC_OAUTH_CLIENT_ID==='string' && env.REC_OAUTH_CLIENT_ID.endsWith('.apps.googleusercontent.com') && env.REC_OAUTH_CLIENT_SECRET,'INVALID_OAUTH_CONFIG');
 return {base:base.origin,front:front.href,origin:front.origin,endpoint:endpoint.href,key:env.REC_GATEWAY_KEY,clientId:env.REC_OAUTH_CLIENT_ID,clientSecret:env.REC_OAUTH_CLIENT_SECRET,allowed:allowlist(env.REC_USER_ALLOWLIST)};
}
