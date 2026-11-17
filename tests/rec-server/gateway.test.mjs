import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {runtime} from '../../scripts/v2-local-runtime.mjs';
import {mac,pins} from '../../rec-server/security.mjs';
const key='a'.repeat(64),user={email:'rec-user@example.invalid',sub:'subject-fictif',role:'admin'};
function setup(role='admin',active='0',signedTransport=false){
 const r=runtime({signedTransport,properties:{REFERENTIEL_V2:active,REC_GATEWAY_KEY:key,REC_USER_ALLOWLIST:JSON.stringify([{...user,role}])}}),cache=new Map();
 r.api.ScriptApp={getScriptId:()=> 'SCRIPT_REC_FICTIF'};
 r.api.CacheService={getScriptCache:()=>({get:k=>cache.get(k),put:(k,v)=>cache.set(k,v)})};
 const original=r.api.Utilities.computeDigest;
 r.api.Utilities.computeDigest=(a,s)=>s==='SCRIPT_REC_FICTIF'?[...Buffer.from(pins.script,'hex')]:s==='MOCK_REC'?[...Buffer.from(pins.sheet,'hex')]:original(a,s);
 r.api.Utilities.computeHmacSha256Signature=(s,k)=>[...createHmac('sha256',k).update(s).digest()];
 r.setActor('');return r;
}
function envelope(request,change={}){const payload=JSON.stringify({version:1,timestamp:Date.now(),nonce:Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url'),actor:{email:user.email,sub:user.sub},request,...change});return {action:'rec.gateway',payload,mac:mac(payload,key)};}
function result(r,body){const out=r.post(body);if(!out.payload)return out;assert.equal(out.mac,mac(out.payload,key));return JSON.parse(out.payload).response;}
test('anonyme : GET, JSONP, POST et RPC ne révèlent ni ne modifient les données',()=>{
 const r=setup(),before=JSON.stringify(r.tables);
 for(const params of [{},{action:'config',what:'all'},{action:'v2.read'},{callback:'fictif'}])assert.equal(r.get(params).ok,false);
 assert.equal(r.post({type:'Entrée',date:'2026-11-17',montant:1}).ok,false);assert.equal(r.api.v2Client({action:'v2.read'}).ok,false);
 assert.equal(JSON.stringify(r.tables),before);assert.deepEqual(r.writes,[]);
});
test('lecture signée et simulation sans activer ni créer un journal',()=>{
 const r=setup(),before=JSON.stringify(r.tables);assert.equal(result(r,envelope({action:'rec.status'})).environment,'REC');
 const data=result(r,envelope({action:'v2.read'}));assert.equal(data.ok,true);assert.equal(data.active,false);
 assert.equal(result(r,envelope({action:'v2.simulate',rows:[{num:'01',type:'F3',etage:'RDC',locataire:'FICTIF',loyer:100}]})).report.creations,1);
 assert.equal(JSON.stringify(r.tables),before);assert.deepEqual(r.writes,[]);
});
test('MAC, expiration, replay, compte, cible et rôle : refus',()=>{
 for(const mode of ['mac','expired','replay','user','target','role']) {
  const r=setup(mode==='role'?'reader':'admin','1'),before=JSON.stringify(r.tables);
  const request={action:'v2.write',requestId:'gateway-test-fictif',expectedRevision:0,command:{action:'logement',data:{numero:'01',type:'F3',etage:'RDC',actif:true}}};
  const e=envelope(mode==='replay'?{action:'v2.read'}:request,mode==='expired'?{timestamp:1}:mode==='user'?{actor:{email:'intrus@example.invalid',sub:'intrus'}}:{});
  if(mode==='mac')e.mac='false';if(mode==='target')r.api.ScriptApp.getScriptId=()=> 'PROD_FICTIF';if(mode==='replay')assert.equal(result(r,e).ok,true);
  assert.equal(result(r,e).ok,false);assert.equal(JSON.stringify(r.tables),before);assert.deepEqual(r.writes,[]);
 }
});
test('V2 inactive bloque une écriture admin ; après activation fictive auteur Hotmail conservé et requête idempotente',()=>{
 for(const active of ['0','1']) {
  const r=setup('admin',active),request={action:'v2.write',requestId:'gateway-write-fictif',expectedRevision:0,command:{action:'logement',data:{numero:'1',type:'f3',etage:'RDC',actif:true}}};
  const out=result(r,envelope(request));assert.equal(out.ok,active==='1');
  if(active==='1'){assert.equal(result(r,envelope(request)).replayed,true);const state=result(r,envelope({action:'v2.read'})).state;assert.equal(state.logements.length,1);assert.equal(state.historique[0].auteur,user.email);}
  assert.equal(r.api._recVerifiedActor_,null);
 }
});
test('lecteur : état actif conservé mais contrôles UI en lecture seule',()=>{
 const r=setup('reader','1'),data=result(r,envelope({action:'v2.read'}));assert.equal(data.active,true);assert.equal(data.canWrite,false);
});
test('changement de propriétés entre authentification et écriture : aucun accès à la cible étrangère',()=>{
 const r=setup('admin','1'),ids=[],open=r.api.SpreadsheetApp.openById;
 r.api.SpreadsheetApp.openById=id=>{ids.push(id);return open(id);};
 const original=r.api.CacheService.getScriptCache;
 r.api.CacheService.getScriptCache=()=>{const c=original();return {get:c.get,put:(k,v)=>{c.put(k,v);r.props.SPREADSHEET_ID='PROD_FICTIF';r.props.REC_SPREADSHEET_ID='PROD_FICTIF';}};};
 const out=result(r,envelope({action:'v2.write',requestId:'race-test-fictif',expectedRevision:0,command:{action:'logement',data:{numero:'01',type:'F3',etage:'RDC',actif:true}}}));
 assert.equal(out.ok,false);assert.equal(ids.includes('PROD_FICTIF'),false);assert.deepEqual(r.writes,[]);assert.equal(r.api._recVerifiedActor_,null);
});

test('mode signé : même le compte de maintenance ne contourne pas le MAC via HTTP ou RPC',()=>{
 const r=setup('admin','1',true),before=JSON.stringify(r.tables);r.setActor('admin@example.invalid');
 for(const params of [{action:'v2.read'},{action:'config',what:'all'},{action:'add',type:'Entrée',montant:'1',date:'2026-11-17'},{callback:'evil'}])assert.equal(r.get(params).ok,false);
 assert.equal(r.post({action:'v2.write',requestId:'bypass-test-fictif',expectedRevision:0,command:{action:'logement',data:{numero:'01',type:'F3',actif:true}}}).ok,false);
 assert.equal(r.api.v2Client({action:'v2.read'}).ok,false);assert.equal(JSON.stringify(r.tables),before);assert.deepEqual(r.writes,[]);
 assert.equal(result(r,envelope({action:'v2.read'})).ok,true);
});
test('transport signé sans clé : aucun accès, même avec la session du mainteneur',()=>{
 const r=setup('admin','1',true);r.setActor('admin@example.invalid');r.props.REC_GATEWAY_KEY='';
 assert.equal(r.get({action:'v2.read'}).ok,false);assert.equal(r.api.v2Client({action:'v2.read'}).ok,false);
 assert.equal(result(r,envelope({action:'v2.read'})).ok,false);assert.deepEqual(r.writes,[]);
});
test('éviction du cache nonce : le même message ne crée pas une deuxième écriture',()=>{
 const r=setup('admin','1',true),e=envelope({action:'v2.write',requestId:'cache-eviction-fictif',expectedRevision:0,command:{action:'logement',data:{numero:'01',type:'F3',etage:'RDC',actif:true}}});
 assert.equal(result(r,e).ok,true);const before=JSON.stringify(r.tables);
 r.api.CacheService.getScriptCache=()=>({get:()=>null,put:()=>{}});
 assert.equal(result(r,e).replayed,true);assert.equal(JSON.stringify(r.tables),before);
});
