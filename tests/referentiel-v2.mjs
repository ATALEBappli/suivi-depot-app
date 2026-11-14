import assert from 'node:assert/strict';
import {runtime} from '../scripts/v2-local-runtime.mjs';
const t=runtime(), M=t.model;
let serial=0,count=0;const ctx={actor:'test@example.invalid',now:'2026-11-14T12:00:00Z',id:()=>`test-${++serial}`};
const rows=[{num:'05',type:'F4',etage:'1er',locataire:'Fictif A',loyer:25000},{num:'06',type:'F3',etage:'1er',locataire:'Fictif B',loyer:17000}];
const test=(name,fn)=>{fn();count++;console.log('OK',name);};
const apply=(s,action,data)=>M.apply(s,{action,data},ctx);
const plain=x=>JSON.parse(JSON.stringify(x));
let s=M.importRows(M.empty(),rows,ctx);
test('import préserve numéros, dates nulles, DZD et caution inconnue',()=>{assert.equal(s.logements[0].numero,'05');assert.equal(s.baux[0].arrivee,null);assert.equal(s.baux[0].suiviFinancierDepuis,null);assert.equal(s.baux[0].cautionPrevue,null);assert.equal(s.baux[0].devise,'DZD');assert.equal(M.rent(s,s.baux[0].id,'2026-11-14'),25000);});
test('simulation sans mutation et réimport idempotent',()=>{const before=JSON.stringify(s);assert.equal(M.simulate(s,rows,'2026-11-14').identiques,2);assert.equal(M.importRows(s,rows,ctx).logements.length,2);assert.equal(JSON.stringify(s),before);});
test('conflit import ne modifie aucune entité',()=>{const before=JSON.stringify(s);assert.throws(()=>M.importRows(s,[{...rows[0],loyer:5}],ctx),/IMPORT_CONFLICT/);assert.equal(JSON.stringify(s),before);});
for(const bad of [[{...rows[0],num:5}],[rows[0],rows[0]],[{...rows[0],loyer:-1}],[{...rows[0],loyer:0.001}],[{...rows[0],locataire:'=CMD'}]])test('import invalide '+JSON.stringify(bad),()=>assert.throws(()=>M.simulate(s,bad,'2026-11-14')));
const b=s.baux[0];
function bailData(b,extra={}) {const {devise,...d}=plain(b);return {...d,...extra};}
test('trois dates distinctes et absence de faux impayés/encaissements',()=>{
 s=apply(s,'bail',bailData(b,{arrivee:'2020-01-01',suiviFinancierDepuis:'2026-11-01',cautionPrevue:0}));
 const f=M.financial(s,b.id,'2025-01-01');assert.equal(f.statut,'non_determine');assert.equal(f.cautionEncaissee,null);assert.equal(f.soldeARestituer,null);assert.equal(f.cautionPrevue,0);assert.equal(M.financial(s,b.id,'2026-11-01').statut,'a_rapprocher');
});
test('dates invalides, suivi hors bail et identités de bail immuables',()=>{
 for(const extra of [{arrivee:'2026-02-30'},{depart:'2019-01-01',statut:'termine'},{suiviFinancierDepuis:'2019-01-01'},{locataireId:s.locataires[1].id},{loyer:3}])assert.throws(()=>apply(s,'bail',bailData(s.baux[0],extra)));
});
test('révision loyer datée conserve les anciennes valeurs',()=>{
 s=apply(s,'loyer',{bailId:b.id,montant:27000,effet:'2026-12-01'});
 assert.equal(M.rent(s,b.id,'2026-11-30'),25000);assert.equal(M.rent(s,b.id,'2026-12-01'),27000);
 assert.throws(()=>apply(s,'loyer',{bailId:b.id,montant:1,effet:'2026-10-01'}));
 assert.throws(()=>apply(s,'loyer',{bailId:b.id,montant:1,effet:'2026-12-01'}));
});
test('remplacement sans perte historique et chevauchement refusé',()=>{
 const next={logementId:b.logementId,locataireId:s.locataires[1].id,statut:'actif',arrivee:'2027-01-01',loyer:28000};
 assert.throws(()=>apply(s,'bail',next),/OVERLAPPING_BAILS/);
 s=apply(s,'bail',bailData(s.baux[0],{statut:'termine',depart:'2027-01-01'}));s=apply(s,'bail',next);
 assert.equal(s.baux.filter(x=>x.logementId===b.logementId).length,2);assert.equal(M.rent(s,b.id,'2026-12-01'),27000);
 assert.equal(M.legacy(s,'2026-12-31')[0].locataire,'Fictif A');assert.equal(M.legacy(s,'2027-01-01')[0].locataire,'Fictif B');
});
test('replay du delta et historique auteur',()=>{const initial=M.empty();assert.deepEqual(plain(M.replay(initial,M.delta(initial,s))),plain(s));assert.ok(s.historique.every(h=>h.auteur===ctx.actor));});
const historical=JSON.stringify(t.tables);
test('lecture/simulation API ne crée aucun onglet et ne modifie rien',()=>{
 assert.equal(t.get({action:'v2.read'}).revision,0);assert.equal(t.get({action:'v2.simulate',rows:JSON.stringify(rows)}).report.creations,2);
 assert.equal(JSON.stringify(t.tables),historical);assert.equal(t.writes.length,0);
});
const request={action:'v2.import',requestId:'import-test-001',expectedRevision:0,rows,preview:t.get({action:'v2.simulate',rows:JSON.stringify(rows)}).preview};
test('import API un commit, historique inchangé et lecture legacy compatible',()=>{
 assert.equal(t.post(request).ok,true);assert.equal(t.tables.v2_referentiel_commits.length,2);
 for(const name of ['transactions','config_logements','config_locaux','config_hedam'])assert.deepEqual(t.tables[name],JSON.parse(historical)[name]);
 const config=t.get({action:'config',what:'all'}).config.logements;assert.deepEqual(config.map(x=>Object.keys(x)),[['num','type','locataire','loyer'],['num','type','locataire','loyer']]);assert.equal(config[0].num,'05');
});
test('réponse perdue : même requête rejouée sans doublon, changement refusé',()=>{
 const before=t.writes.length;assert.equal(t.post(request).replayed,true);assert.equal(t.writes.length,before);
 assert.equal(t.post({...request,rows:[rows[0]]}).error,'IDEMPOTENCY_CONFLICT');
});
test('révision périmée et écritures GET refusées',()=>{
 assert.equal(t.post({...request,requestId:'import-test-002'}).error,'STALE_REVISION');
 assert.equal(t.get({action:'v2.write'}).error,'POST_REQUIRED');
});
test('ancien référentiel impossible à modifier après activation',()=>{
 const n=t.writes.length;assert.equal(t.get({action:'config',save:'logements',payload:encodeURIComponent(JSON.stringify(rows))}).ok,false);assert.equal(t.writes.length,n);
});
test('action métier API et reprise sur nouveau runtime',()=>{
 const loaded=t.get({action:'v2.read'});const id=loaded.state.logements[0].id;
 const result=t.post({action:'v2.write',requestId:'edit-test-001',expectedRevision:1,command:{action:'logement',data:{...loaded.state.logements[0],etage:'Toit'}}});assert.equal(result.ok,true);
 const recovered=runtime({data:structuredClone(t.tables)}).get({action:'v2.read'});assert.equal(recovered.revision,2);assert.equal(recovered.state.logements.find(x=>x.id===id).etage,'Toit');
});
test('droits serveur, activation et environnement contrôlés',()=>{
 for(const properties of [{REFERENTIEL_V2:'0'},{APP_ENV:'PROD'},{REC_SPREADSHEET_ID:'OTHER'},{V2_ADMIN_EMAIL:''}]) {
  const r=runtime({properties});assert.equal(r.post(request).ok,false);assert.equal(r.writes.length,0);
 }
 const r=runtime();r.setActor('other@example.invalid');assert.equal(r.post(request).error,'FORBIDDEN');assert.equal(r.get({action:'v2.read'}).error,'FORBIDDEN');assert.equal(r.writes.length,0);
});
test('panne avant append, reprise sûre après entête seule',()=>{
 let fail=true;const r=runtime({failAppend:(name,row)=>name==='v2_referentiel_commits' && row[0]===1 && fail});
 assert.equal(r.post(request).ok,false);assert.equal(r.get({action:'v2.read'}).revision,0);fail=false;assert.equal(r.post(request).ok,true);assert.equal(r.get({action:'v2.read'}).state.baux.length,2);
});
test('journal corrompu échoue sans mutation',()=>{
 const data=structuredClone(t.tables);data.v2_referentiel_commits[1][0]=8;const r=runtime({data});assert.equal(r.get({action:'v2.read'}).ok,false);assert.equal(r.post(request).ok,false);assert.equal(r.writes.length,0);
});

test('aperçu import obligatoire, contenu modifié refusé avant écriture',()=>{
 const r=runtime();assert.equal(r.post({...request,preview:'changed'}).error,'IMPORT_PREVIEW_CHANGED');assert.equal(r.writes.length,0);
});
test('dates modifiables sur un bail créé avec arrivée connue',()=>{
 let x=M.empty();x=apply(x,'logement',{numero:'REC-DATE',type:'F2',etage:'',actif:true});x=apply(x,'locataire',{nom:'Fictif dates'});
 x=apply(x,'bail',{logementId:x.logements[0].id,locataireId:x.locataires[0].id,arrivee:'2020-01-01',statut:'actif',loyer:100});
 x=apply(x,'bail',bailData(x.baux[0],{arrivee:'2021-01-01'}));assert.equal(x.baux[0].arrivee,'2021-01-01');assert.equal(x.loyers[0].montant,100);
});

test('départ programmé et suivi financier hors bail',()=>{
 let x=M.importRows(M.empty(),rows,ctx);const original=x.baux[0];x=apply(x,'bail',bailData(original,{depart:'2027-01-01'}));
 assert.equal(x.baux[0].statut,'actif');assert.equal(M.financial(x,original.id,'2027-01-01').statut,'hors_bail');assert.throws(()=>M.financial(x,original.id,null));
});
test('append réussi mais réponse perdue : nouvelle tentative sans doublon',()=>{
 let fail=true;const r=runtime({afterAppend:(name,row)=>{if(name==='v2_referentiel_commits' && row[0]===1 && fail)throw Error('LOST_RESPONSE');}});
 assert.equal(r.post(request).ok,false);assert.equal(r.get({action:'v2.read'}).revision,1);fail=false;
 assert.equal(r.post(request).replayed,true);assert.equal(r.tables.v2_referentiel_commits.length,2);
});
test('taille de commit excessive refusée sans création de journal',()=>{
 const r=runtime();const large=Array.from({length:20},(_,i)=>({num:'REC-LARGE-'+i,type:'F2',etage:'',locataire:'Fictif '+('x'.repeat(1500))+i,loyer:1}));
 const preview=r.get({action:'v2.simulate',rows:JSON.stringify(large)}).preview;
 assert.equal(r.post({...request,rows:large,preview}).error,'COMMIT_TOO_LARGE');assert.equal(r.writes.length,0);
});
test('interface privée et identité du serveur, aucun appel public sans propriétaire',()=>{
 const out=t.api.doGet({parameter:{action:'v2.ui'}});assert.equal(out.htmlFile,'ParametrageV2');
 const r=runtime();r.setActor('');assert.equal(r.get({action:'v2.ui'}).error,'FORBIDDEN');
 assert.equal(r.api.v2Client({action:'v2.read'}).error,'FORBIDDEN');
});

test('modifications V2 relues par le contrat historique sans réécriture des transactions',()=>{
 const r=runtime(), before=structuredClone(r.tables);
 const preview=r.get({action:'v2.simulate',rows:JSON.stringify(rows)}).preview;
 assert.equal(r.post({...request,preview}).ok,true);
 let revision=1, seq=0;
 const edit=(action,data)=>assert.equal(r.post({action:'v2.write',requestId:`compatibility-${++seq}`,expectedRevision:revision++,command:{action,data}}).ok,true);
 const loaded=r.get({action:'v2.read'}).state;
 const housing=loaded.logements[0], tenant=loaded.locataires[0], lease=loaded.baux[0];
 edit('logement',{...housing,type:'F2',etage:'Toit'});
 edit('locataire',{...tenant,nom:'Locataire fictif corrigé',complement:'Fictif'});
 edit('bail',bailData(lease,{arrivee:'2020-01-01',suiviFinancierDepuis:'2026-11-01'}));
 const result=r.get({action:'config',what:'all'});
 assert.equal(result.referentielV2,true);
 assert.deepEqual(result.config.logements[0],{num:housing.numero,type:'F2',locataire:'Locataire fictif corrigé',loyer:25000});
 assert.equal(r.get({}).rows.length,before.transactions.length-1);
 for(const key of ['transactions','config_logements','config_locaux','config_hedam'])assert.deepEqual(r.tables[key],before[key]);
 assert.equal(r.post({type:'Entrée',date:'2026-11-14',montant:1,description:'Encaissement fictif de test'}).ok,true);
 assert.equal(r.tables.transactions.length,before.transactions.length+1);
 assert.deepEqual(r.tables.transactions.slice(0,-1),before.transactions);
});
console.log(`${count} scénarios US-015 réussis, aucun réseau.`);
