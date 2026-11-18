import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,randomBytes} from 'node:crypto';
import {runtime} from '../../scripts/v2-local-runtime.mjs';
import {mac,pins} from '../../rec-server/security.mjs';
import {authorized} from '../../rec-server/bridge.mjs';

const key='b'.repeat(64),actor={email:'rec-user@example.invalid',sub:'test-sub',role:'admin'};
function setup({enabled='1',role='admin'}={}) {
 const r=runtime({signedTransport:true,properties:{REFERENTIEL_V2:'1',REC_TEST_TRANSACTIONS:enabled,REC_GATEWAY_KEY:key,REC_USER_ALLOWLIST:JSON.stringify([{...actor,role}])}}),cache=new Map();
 r.api.ScriptApp={getScriptId:()=> 'SCRIPT_REC_FICTIF'};
 r.api.CacheService={getScriptCache:()=>({get:k=>cache.get(k),put:(k,v)=>cache.set(k,v)})};
 const original=r.api.Utilities.computeDigest;
 r.api.Utilities.computeDigest=(a,s)=>s==='SCRIPT_REC_FICTIF'?[...Buffer.from(pins.script,'hex')]:s==='MOCK_REC'?[...Buffer.from(pins.sheet,'hex')]:original(a,s);
 r.api.Utilities.computeHmacSha256Signature=(s,k)=>[...createHmac('sha256',k).update(s).digest()];
 r.api._v2Load_=()=>({state:{logements:[{id:'L1',actif:true}],baux:[{id:'B1',logementId:'L1',locataireId:'T1',statut:'actif',arrivee:'2026-01-01'}],locataires:[{id:'T1',nom:'Fictif'}],loyers:[{bailId:'B1',montant:15000,effet:null}]}});
 return r;
}
function signed(r,request) {
 const payload=JSON.stringify({version:1,timestamp:Date.now(),nonce:randomBytes(32).toString('base64url'),actor:{email:actor.email,sub:actor.sub},request});
 const out=r.post({action:'rec.gateway',payload,mac:mac(payload,key)});
 if(!out.payload)return out;
 return JSON.parse(out.payload).response;
}
const transaction={environment:'REC',testOnly:true,activity:'rental',direction:'in',nature:'income',operationDate:'2026-11-18',period:'2026-11',amount:15000,payment:'cash',logementId:'L1',bailId:'B1',locataireId:'T1',description:'Loyer 2026-11 — TEST REC'};
const create={action:'rec.testTransaction.create',requestId:'test-payment-001',transaction};

test('refuse les transactions lorsque le drapeau REC est désactivé',()=>{
 const r=setup({enabled:'0'});
 assert.equal(signed(r,create).ok,false);
 assert.deepEqual(r.writes,[]);
});
test('réserve les écritures aux administrateurs et conserve la lecture',()=>{
 const r=setup({role:'reader'});
 assert.throws(()=>authorized(create,{role:'reader'}),/FORBIDDEN/);
 assert.equal(signed(r,create).ok,false);
 assert.deepEqual(r.writes,[]);
 assert.deepEqual(signed(r,{action:'rec.testTransaction.list'}).transactions,[]);
});
test('écrit uniquement dans le journal fictif dédié et rejoue sans doublon',()=>{
 const r=setup();
 assert.equal(signed(r,create).ok,true);
 assert.deepEqual(r.writes,['create:rec_test_transactions','rec_test_transactions','rec_test_transactions']);
 const before=r.tables.rec_test_transactions.length;
 assert.equal(signed(r,create).replayed,true);
 assert.equal(r.tables.rec_test_transactions.length,before);
 const rows=signed(r,{action:'rec.testTransaction.list'}).transactions;
 assert.equal(rows.length,1);
 assert.equal(rows[0].testOnly,true);
 assert.equal(rows[0].requestId,create.requestId);
});
test('refuse les payloads falsifiés et les changements de cible',()=>{
 const r=setup();
 for(const tx of [{...transaction,testOnly:false},{...transaction,environment:'PROD'},{...transaction,bailId:'B2'},{...transaction,amount:0},{...transaction,description:'Loyer normal'}]) {
  assert.equal(signed(r,{...create,transaction:tx}).ok,false);
 }
 assert.deepEqual(r.writes,[]);
 r.props.SPREADSHEET_ID='PROD_FICTIF';
 assert.equal(signed(r,create).ok,false);
 assert.deepEqual(r.writes,[]);
});
