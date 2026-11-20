// PBKDF2 natif exécuté exclusivement dans le Durable Object (CPU 30 s), jamais au front.
import {pbkdf2Sync,randomBytes,timingSafeEqual} from 'node:crypto';
import {requireThat} from '../rec-server/security.mjs';
export const passwordPolicy=Object.freeze({algorithm:'PBKDF2-SHA256',iterations:600000,saltBytes:32,keyBytes:32});
export function passwordInput(value){requireThat(typeof value==='string' && [...value].length>=15 && [...value].length<=128 && Buffer.byteLength(value)<=512 && !/[\u0000-\u001f\u007f]/.test(value),'INVALID_PASSWORD');return value;}
export function usernameInput(value){requireThat(typeof value==='string' && /^[a-z0-9][a-z0-9._-]{2,63}$/.test(value),'INVALID_USERNAME');return value;}
export function passwordRecord(password){passwordInput(password);const salt=randomBytes(32).toString('hex');return {...passwordPolicy,salt,hash:pbkdf2Sync(password,Buffer.from(salt,'hex'),600000,32,'sha256').toString('hex')};}
export function validPasswordRecord(r){return r?.algorithm==='PBKDF2-SHA256' && r.iterations===600000 && r.saltBytes===32 && r.keyBytes===32 && /^[a-f0-9]{64}$/.test(r.salt || '') && /^[a-f0-9]{64}$/.test(r.hash || '');}
export function verifyPassword(password,record){
 const usable=typeof password==='string' && Buffer.byteLength(password)<=512;
 const r=validPasswordRecord(record)?record:{salt:'0'.repeat(64),hash:'0'.repeat(64)};
 const actual=pbkdf2Sync(usable?password:'INVALID',Buffer.from(r.salt,'hex'),600000,32,'sha256');
 return usable && validPasswordRecord(record) && timingSafeEqual(actual,Buffer.from(r.hash,'hex'));
}
