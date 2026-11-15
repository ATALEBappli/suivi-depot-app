import test from 'node:test';
import assert from 'node:assert/strict';
import {operate} from '../../scripts/rec-automation/core.mjs';
import {Refusal,digest,contentHash} from '../../scripts/rec-automation/validation.mjs';
import {setup,policy,request,candidate,deployment,clone,manifest} from './helpers.mjs';
const go=(t,r,p=policy)=>operate({...t,request:r,policy:p});
const refuses=(fn,code)=>assert.rejects(fn,e=>{assert.equal(e.code,code);return true;});

test('inspect lit identité, permissions, HEAD et déploiements, sans mutation',async()=>{
 const t=setup(),r=await go(t,{operation:'inspect'});
 assert.equal(r.headHash,t.headHash());assert.deepEqual(t.writes,[]);assert.equal(t.records.size,0);assert.ok(!JSON.stringify(r).includes(policy.scriptId));assert.ok(!JSON.stringify(r).includes(policy.email));
});
for(const [label,change,code] of [
 ['compte incorrect',t=>{t.api.identity=async()=>({email:'other@example.invalid',email_verified:true,sub:'x'});},'WRONG_GOOGLE_ACCOUNT'],
 ['compte non vérifié',t=>{t.api.identity=async()=>({email:policy.email,email_verified:false,sub:'x'});},'WRONG_GOOGLE_ACCOUNT'],
 ['projet renommé',t=>{t.api.project=async()=>({scriptId:policy.scriptId,title:'AUTRE'});},'WRONG_PROJECT'],
 ['projet lié',t=>{t.api.project=async()=>({scriptId:policy.scriptId,title:policy.pins.title,parentId:'fictif'});},'WRONG_PROJECT'],
 ['mauvaise identité classeur',t=>{t.api.fileMetadata=async()=>({});},'INVALID_FILE_PERMISSIONS'],
 ['permissions indisponibles',t=>{const old=t.api.fileMetadata;t.api.fileMetadata=async id=>({...await old(id),permissions:undefined});},'PERMISSIONS_UNAVAILABLE'],
 ['éditeur inconnu',t=>{const old=t.api.fileMetadata;t.api.fileMetadata=async id=>{const m=await old(id);m.permissions.push({type:'user',role:'writer',emailAddress:'other@example.invalid'});return m;};},'UNEXPECTED_SHARING'],
 ['compte non déclaré éditeur',t=>{const old=t.api.fileMetadata;t.api.fileMetadata=async id=>{const m=await old(id);m.permissions=m.permissions.slice(0,1);return m;};},'ACCOUNT_NOT_EDITOR'],
 ['propriétaire incorrect',t=>{const old=t.api.fileMetadata;t.api.fileMetadata=async id=>({...await old(id),owners:[{emailAddress:'other@example.invalid'}]});},'WRONG_RESOURCE_OWNER'],
 ['identité content incorrecte',t=>{const old=t.api.getContent;t.api.getContent=async v=>({...await old(v),scriptId:'AUTRE'});},'WRONG_CONTENT_TARGET']
])test('refus précoce : '+label,async()=>{const t=setup();change(t);await refuses(()=>go(t,request(t)),code);assert.deepEqual(t.writes,[]);assert.equal(t.records.size,0);});

test('attestation manuelle et HEAD exact obligatoires',async()=>{
 const t=setup();await refuses(()=>go(t,request(t,'install',{auditConfirmed:false})),'MANUAL_AUDIT_REQUIRED');
 await refuses(()=>go(t,request(t,'install',{expectedHeadHash:'0'.repeat(64)})),'HEAD_CHANGED');assert.equal(t.records.size,0);
});
test('installation : sauvegarde relue et verrou persistant avant PUT, puis reçu privé',async()=>{
 const t=setup(),before=t.getContent(),r=request(t);const result=await go(t,r);
 assert.equal(t.headHash(),r.candidate.contentHash);assert.deepEqual(t.writes,['content']);
 const backup=await t.store.read('backup',result.backupTag);assert.equal(contentHash(backup.value.content),contentHash(before));assert.equal(digest(backup.value),result.backupHash);
 const put=t.calls.findIndex(c=>c.name==='updateContent');assert.ok(t.calls.slice(0,put).filter(c=>c.name==='readRecord').length>=3);
 assert.equal((await t.store.pending()).length,0);
 assert.equal((await go(t,r)).replayed,true);assert.deepEqual(t.writes,['content']);
});
test('une requête réutilisée avec un autre corps est refusée',async()=>{
 const t=setup(),r=request(t);await go(t,r);await refuses(()=>go(t,{...r,candidate:candidate('function autre(){}')}),'REQUEST_REPLAY_CONFLICT');
});
test('sauvegarde corrompue : aucun PUT',async()=>{
 const t=setup();const old=t.store.read;t.store.read=async(k,tag)=>{const r=await old(k,tag);if(r && k==='backup')r.value.account='other@example.invalid';return r;};
 await refuses(()=>go(t,request(t)),'BACKUP_VERIFICATION_FAILED');assert.deepEqual(t.writes,[]);
});
test('échec du stockage des sauvegardes : aucune installation',async()=>{
 const t=setup();t.store.create=async()=>{throw Error('PRIVATE_ERROR');};await assert.rejects(()=>go(t,request(t)));assert.deepEqual(t.writes,[]);
});
test('édition concurrente après sauvegarde : arrêt et pending conservé',async()=>{
 const t=setup({hooks:{afterRecord(kind){if(kind==='operation')t.setContent({files:candidate('function editionManuelle(){}').files});}}});
 await refuses(()=>go(t,request(t)),'HEAD_CHANGED');assert.deepEqual(t.writes,[]);assert.equal((await t.store.pending()).length,1);
});
test('réponse perdue après PUT : aucune relance aveugle, reprise explicite seulement',async()=>{
 let interrupted=true;const t=setup({hooks:{afterContent(){if(interrupted)throw new Refusal('GOOGLE_WRITE_UNCERTAIN',true);}}});
 const original=t.headHash(),r=request(t);await refuses(()=>go(t,r),'GOOGLE_WRITE_UNCERTAIN');assert.equal(t.writes.length,1);
 await refuses(()=>go(t,{...r,requestTag:'operation-fictif-002',expectedHeadHash:t.headHash()}),'PENDING_OPERATION');
 const report=await go(t,{operation:'inspect'});assert.equal(report.pending.length,1);interrupted=false;
 const p=report.pending[0];await go(t,request(t,'restore',{requestTag:'recovery-fictif-002',candidate:undefined,backupTag:p.backupTag,backupHash:p.backupHash,recoveryTag:p.requestTag}));
 assert.equal(t.headHash(),original);assert.equal((await t.store.pending()).length,0);assert.deepEqual(t.writes,['content','content']);
 await refuses(()=>go(t,r),'REQUEST_REPLAY_CONFLICT');
});
test('interruption avant PUT : journal pending et aucune écriture Apps Script',async()=>{
 const t=setup({hooks:{afterRecord(kind){if(kind==='operation')throw Error('STOP');}}});await assert.rejects(()=>go(t,request(t)));assert.deepEqual(t.writes,[]);assert.equal((await t.store.pending()).length,1);
});
test('reprise incorrecte ne ferme pas le verrou',async()=>{
 const t=setup({hooks:{afterContent(){throw Error('STOP');}}});await assert.rejects(()=>go(t,request(t)));
 const p=(await go(t,{operation:'inspect'})).pending[0];
 await refuses(()=>go(t,request(t,'restore',{requestTag:'recovery-fictif-003',candidate:undefined,recoveryTag:p.requestTag,backupTag:'backup-autre-001',backupHash:'0'.repeat(64)})),'WRONG_RECOVERY_CHECKPOINT');
 assert.equal((await t.store.pending()).length,1);
});
test('interruption pendant une restauration : le checkpoint original reste sélectionné',async()=>{
 let fail=true;const t=setup({hooks:{afterContent(){if(fail)throw Error('STOP');}}}),original=t.headHash();
 await assert.rejects(()=>go(t,request(t)));let p=(await go(t,{operation:'inspect'})).pending[0];
 const restore=request(t,'restore',{requestTag:'recovery-fictif-004',candidate:undefined,recoveryTag:p.requestTag,backupTag:p.backupTag,backupHash:p.backupHash});
 await assert.rejects(()=>go(t,restore));const again=(await go(t,{operation:'inspect'})).pending[0];assert.equal(again.backupTag,p.backupTag);
 fail=false;await go(t,{...restore,requestTag:'recovery-fictif-005',expectedHeadHash:t.headHash()});assert.equal(t.headHash(),original);assert.equal((await t.store.pending()).length,0);
});
test('candidat public et bundle incomplet refusés avant sauvegarde',async()=>{
 for(const defect of ['public','missing','corrupt']){
 const t=setup(),c=candidate();if(defect==='public'){c.files.find(f=>f.name==='appsscript').source=JSON.stringify({...manifest,webapp:{access:'ANYONE_ANONYMOUS',executeAs:'USER_DEPLOYING'}});c.contentHash=contentHash(c);}
 if(defect==='missing'){c.files.pop();}if(defect==='corrupt')c.contentHash='0'.repeat(64);
 await assert.rejects(()=>go(t,request(t,'install',{candidate:c})));assert.equal(t.records.size,0);assert.deepEqual(t.writes,[]);
 }
});
test('baseline publique non restaurable : installation arrêtée avant remplacement',async()=>{
 const c=candidate();c.files.find(f=>f.name==='appsscript').source=JSON.stringify({...manifest,webapp:{access:'ANYONE_ANONYMOUS',executeAs:'USER_DEPLOYING'}});
 const t=setup({head:c});await refuses(()=>go(t,request(t)),'UNSAFE_MANIFEST');assert.deepEqual(t.writes,[]);
});
test('deploy ne fait jamais install implicitement',async()=>{
 const t=setup();await refuses(()=>go(t,request(t,'deploy')),'INSTALL_REQUIRED');assert.deepEqual(t.writes,[]);
});
test('premier déploiement privé d’une version relue, sans exécution de fonctions',async()=>{
 const t=setup({head:candidate()}),r=request(t,'deploy'),result=await go(t,r);
 assert.deepEqual(t.writes,['version','deployment']);assert.equal(result.versionNumber,11);
 const receipt=await t.store.read('operation',r.requestTag);assert.match(receipt.value.deployment.entryPoints[0].webApp.url,/script.google.com/);
 assert.ok(!JSON.stringify(result).includes('https:'));assert.equal((await go(t,r)).replayed,true);
});
test('déploiement public existant refusé ; inspect reste possible',async()=>{
 const d=deployment();d.entryPoints[0].webApp.entryPointConfig.access='ANYONE';const t=setup({deployments:[d]});
 assert.equal((await go(t,{operation:'inspect'})).versionedDeployments,1);await refuses(()=>go(t,request(t)),'PUBLIC_DEPLOYMENT_REFUSED');assert.equal(t.records.size,0);
});
test('déploiement non configuré refusé, sans choix de destination arbitraire',async()=>{
 const t=setup({head:candidate(),deployments:[deployment()]});await refuses(()=>go(t,request(t,'deploy')),'UNEXPECTED_EXISTING_DEPLOYMENT');assert.deepEqual(t.writes,[]);
});
test('mise à jour du seul déploiement privé configuré',async()=>{
 const d=deployment(),t=setup({head:candidate(),deployments:[d]}),p={...policy,deploymentId:d.deploymentId};
 await go(t,request(t,'deploy'),p);assert.equal(t.getDeployments().length,1);assert.equal(t.getDeployments()[0].deploymentId,d.deploymentId);
});
test('version distante différente : aucune publication',async()=>{
 const t=setup({head:candidate()});const old=t.api.getContent;t.api.getContent=async v=>v?{scriptId:policy.scriptId,files:candidate('function race(){}').files}:old(v);
 await refuses(()=>go(t,request(t,'deploy')),'VERSION_CONTENT_CHANGED');assert.deepEqual(t.writes,['version']);assert.equal((await t.store.pending()).length,1);
});
test('réponse perdue après création de déploiement : pas de deuxième URL',async()=>{
 const t=setup({head:candidate(),hooks:{afterDeployment(){throw new Refusal('GOOGLE_WRITE_UNCERTAIN',true);}}});
 await refuses(()=>go(t,request(t,'deploy')),'GOOGLE_WRITE_UNCERTAIN');assert.deepEqual(t.writes,['version','deployment']);
 const p=(await go(t,{operation:'inspect'})).pending[0];
 // La configuration doit d'abord reconnaître l'ID créé ; aucune adoption automatique.
 await refuses(()=>go(t,request(t,'restore',{requestTag:'recovery-deploy-001',candidate:undefined,recoveryTag:p.requestTag,backupTag:p.backupTag,backupHash:p.backupHash})),'UNEXPECTED_EXISTING_DEPLOYMENT');
 assert.equal(t.writes.length,2);
});
test('réponse publique inattendue : arrêt et reçu pending',async()=>{
 const t=setup({head:candidate()});const old=t.api.createDeployment;t.api.createDeployment=async v=>{const d=await old(v);d.entryPoints[0].webApp.entryPointConfig.access='ANYONE';return d;};
 await refuses(()=>go(t,request(t,'deploy')),'PUBLIC_DEPLOYMENT_REFUSED');assert.equal((await t.store.pending()).length,1);
});
test('échec du reçu après succès : inspect permet de connaître l’état sans rejouer',async()=>{
 const t=setup({hooks:{afterRecordUpdate(v){if(v.status==='done')throw Error('LOST_RECEIPT_RESPONSE');}}});const r=request(t);
 await assert.rejects(()=>go(t,r));assert.equal(t.headHash(),r.candidate.contentHash);assert.equal((await go(t,{operation:'inspect'})).pending.length,0);
 assert.equal((await go(t,r)).replayed,true);assert.equal(t.writes.length,1);
});
test('restauration sources conservant le déploiement, option explicite pour sa version',async()=>{
 const d=deployment(),p={...policy,deploymentId:d.deploymentId},t=setup({deployments:[d]});t.versions.set(1,{files:candidate('function ancienneVersion(){}').files});
 const result=await go(t,request(t),p);const restored=await go(t,request(t,'restore',{requestTag:'restore-fictif-001',candidate:undefined,backupTag:result.backupTag,backupHash:result.backupHash,restoreDeployment:true}),p);
 assert.equal(t.headHash(),(await t.store.read('backup',result.backupTag)).value.headHash);assert.equal(restored.versionNumber,1);assert.deepEqual(t.writes,['content','content','deployment']);
});
test('première installation : aucune ancienne URL à restaurer',async()=>{
 const t=setup(),result=await go(t,request(t));const before=t.writes.length;
 await refuses(()=>go(t,request(t,'restore',{requestTag:'restore-fictif-002',candidate:undefined,backupTag:result.backupTag,backupHash:result.backupHash,restoreDeployment:true})),'NO_PREVIOUS_PRIVATE_DEPLOYMENT');assert.equal(t.writes.length,before);
});
test('backup falsifié, autre compte ou cible : restauration refusée',async()=>{
 for(const defect of ['hash','account','target']){
  const t=setup(),result=await go(t,request(t)),backup=t.records.get('backup:'+result.backupTag);
  if(defect==='account')backup.account='other@example.invalid';if(defect==='target')backup.targetHash='0'.repeat(64);
  const h=defect==='hash'?'0'.repeat(64):digest(backup);
  await assert.rejects(()=>go(t,request(t,'restore',{requestTag:'restore-fictif-003',candidate:undefined,backupTag:result.backupTag,backupHash:h})));assert.equal(t.writes.length,1);
 }
});

test('installation refuse de supprimer silencieusement un fichier distant inconnu',async()=>{
 const c=candidate();c.files.push({name:'DiagnosticFictif',type:'SERVER_JS',source:'function diagnostic(){}'});
 const t=setup({head:c});await refuses(()=>go(t,request(t)),'REMOTE_FILE_REMOVAL_REFUSED');assert.deepEqual(t.writes,[]);assert.equal(t.records.size,0);
});
test('première installation depuis une baseline V8 sans webapp : sauvegarde et restauration possibles',async()=>{
 const c=candidate();c.files=c.files.filter(f=>['Code','appsscript'].includes(f.name));c.files.find(f=>f.name==='appsscript').source=JSON.stringify({runtimeVersion:'V8',timeZone:'Europe/Paris'});
 const t=setup({head:c}),original=t.headHash(),result=await go(t,request(t));
 await go(t,request(t,'restore',{requestTag:'restore-baseline-001',candidate:undefined,backupTag:result.backupTag,backupHash:result.backupHash}));assert.equal(t.headHash(),original);
});
