// PBKDF2 asynchrone WebCrypto : compatible avec le runtime Cloudflare Workers.
// Les sels, itérations et dérivés restent compatibles avec les comptes existants.
import {requireThat} from '../rec-server/security.mjs';
export const passwordPolicy=Object.freeze({algorithm:'PBKDF2-SHA256',iterations:600000,saltBytes:32,keyBytes:32});
export function passwordInput(value){requireThat(typeof value==='string' && [...value].length>=15 && [...value].length<=128 && Buffer.byteLength(value)<=512 && !/[\u0000-\u001f\u007f]/.test(value),'INVALID_PASSWORD');return value;}
export function usernameInput(value){requireThat(typeof value==='string' && /^[a-z0-9][a-z0-9._-]{2,63}$/.test(value),'INVALID_USERNAME');return value;}
async function derive(password,salt){
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
 const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:passwordPolicy.iterations,hash:'SHA-256'},key,passwordPolicy.keyBytes*8);
 return new Uint8Array(bits);
}
export async function passwordRecord(password){
 passwordInput(password);
 const salt=crypto.getRandomValues(new Uint8Array(passwordPolicy.saltBytes));
 return {...passwordPolicy,salt:Buffer.from(salt).toString('hex'),hash:Buffer.from(await derive(password,salt)).toString('hex')};
}
export function validPasswordRecord(r){return r?.algorithm==='PBKDF2-SHA256' && r.iterations===600000 && r.saltBytes===32 && r.keyBytes===32 && /^[a-f0-9]{64}$/.test(r.salt || '') && /^[a-f0-9]{64}$/.test(r.hash || '');}
export async function verifyPassword(password,record){
 const usable=typeof password==='string' && Buffer.byteLength(password)<=512;
 const valid=validPasswordRecord(record);
 const r=valid?record:{salt:'0'.repeat(64),hash:'0'.repeat(64)};
 const actual=await derive(usable?password:'INVALID',Buffer.from(r.salt,'hex'));
 const expected=Buffer.from(r.hash,'hex');
 let difference=0;for(let i=0;i<passwordPolicy.keyBytes;i++)difference|=actual[i]^expected[i];
 return usable && valid && difference===0;
}
