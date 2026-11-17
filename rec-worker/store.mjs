import {random,hash,requireThat} from '../rec-server/security.mjs';
const areas=new Set(['states','tickets','sessions']);
// Transactions SQLite du même objet : prise à usage unique persistée AVANT OAuth/API.
export function durableStore(storage,{now=Date.now,randomId=random}={}) {
 const key=(n,id)=>{requireThat(areas.has(n),'INVALID_STORE');return n+':'+(id?hash(id):'');};
 return {
  async put(n,value,ttl,cap){const id=await storage.transaction(async tx=>{const prefix=key(n,''),entries=await tx.list({prefix});let count=0;for(const[k,v]of entries){if(v.exp<=now())await tx.delete(k);else count++;}requireThat(count<cap,'RATE_LIMIT');const id=randomId();await tx.put(key(n,id),{...value,exp:now()+ttl});return id;});if(storage.setAlarm && !(await storage.getAlarm()))await storage.setAlarm(now()+60000);return id;},
  async get(n,id){if(typeof id!=='string')return;const v=await storage.get(key(n,id));return v?.exp>now()?v:undefined;},
  async take(n,id){requireThat(typeof id==='string','AUTH_EXPIRED');return storage.transaction(async tx=>{const k=key(n,id),v=await tx.get(k);await tx.delete(k);requireThat(v?.exp>now(),'AUTH_EXPIRED');return v;});},
  async delete(n,id){if(typeof id==='string')await storage.delete(key(n,id));},
  async cleanup(){let remaining=false;for(const n of areas){for(const[k,v]of await storage.list({prefix:key(n,'')})){if(v.exp<=now())await storage.delete(k);else remaining=true;}}if(remaining && storage.setAlarm)await storage.setAlarm(now()+60000);},
  async rate(){await storage.transaction(async tx=>{let v=await tx.get('rate');if(!v || now()-v.window>=60000)v={window:now(),count:0};requireThat(++v.count<=10,'RATE_LIMIT');await tx.put('rate',v);});}
 };
}
