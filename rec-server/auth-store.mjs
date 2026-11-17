import {random,requireThat} from './security.mjs';
// Uniquement pour Node mono-instance. Workers utilise le stockage transactionnel.
export function memoryStore({now=Date.now,randomId=random}={}) {
 const areas=new Map();let window=0,count=0;
 const area=n=>{if(!areas.has(n))areas.set(n,new Map());return areas.get(n);};
 const prune=m=>{for(const[k,v]of m)if(v.exp<=now())m.delete(k);};
 return {
  async put(n,value,ttl,cap){const m=area(n);prune(m);requireThat(m.size<cap,'RATE_LIMIT');const id=randomId();m.set(id,{...value,exp:now()+ttl});return id;},
  async get(n,id){const m=area(n);prune(m);return m.get(id);},
  async take(n,id){const m=area(n);prune(m);const v=m.get(id);m.delete(id);requireThat(v,'AUTH_EXPIRED');return v;},
  async delete(n,id){area(n).delete(id);},
  async rate(){if(now()-window>=60000){window=now();count=0;}requireThat(++count<=10,'RATE_LIMIT');}
 };
}
