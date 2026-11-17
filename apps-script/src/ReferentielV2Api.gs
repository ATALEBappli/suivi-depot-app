/* REC uniquement. Un commit = une ligne append-only contenant le delta des six entités. */
const V2_JOURNAL = 'v2_referentiel_commits';
const V2_HEADER = ['revision','request_id','request_json','delta_json'];
function _v2Today_() { return Utilities.formatDate(new Date(), 'Europe/Paris', 'yyyy-MM-dd'); }
function _v2Enabled_() { return PropertiesService.getScriptProperties().getProperty('REFERENTIEL_V2') === '1'; }
function _v2Book_() {
  _checkedSheets_();
  const p=PropertiesService.getScriptProperties();
  const target=p.getProperty('REC_SPREADSHEET_ID');
  if(_recVerifiedActor_ && target!==_recVerifiedActor_.targetId)throw new Error('INVALID_ENVIRONMENT');
  return SpreadsheetApp.openById(target);
}
function _v2Load_() {
  const sh=_v2Book_().getSheetByName(V2_JOURNAL);
  if(!sh)return {state:ReferentielV2.empty(),revision:0,requests:[],sheet:null};
  const rows=sh.getDataRange().getValues();
  if(sh.getLastColumn()!==4 || JSON.stringify(rows.shift())!==JSON.stringify(V2_HEADER))throw new Error('INVALID_V2_SCHEMA');
  let state=ReferentielV2.empty(), revision=0;const requests=[];
  for(const row of rows) {
    if(row[0]!==revision+1 || typeof row[1]!=='string' || requests.some(r=>r.id===row[1]))throw new Error('INVALID_V2_JOURNAL');
    state=ReferentielV2.replay(state,JSON.parse(row[3]));revision++;
    requests.push({id:row[1],request:row[2],revision});
  }
  return {state,revision,requests,sheet:sh};
}
var _recVerifiedActor_=null;
function _v2Actor_() {
  if(_recVerifiedActor_)return _recVerifiedActor_.email;
  const actor=Session.getActiveUser().getEmail();
  const owner=PropertiesService.getScriptProperties().getProperty('V2_ADMIN_EMAIL');
  if(!owner || !actor || actor!==owner)throw new Error('FORBIDDEN');return actor;
}
function _v2Read_() {
  _v2Actor_();const loaded=_v2Load_();return {ok:true,active:_v2Enabled_(),canWrite:_v2Enabled_() && (!_recVerifiedActor_ || _recVerifiedActor_.role==='admin'),revision:loaded.revision,state:loaded.state};
}
function _v2Preview_(revision, rows) {
  const source=JSON.stringify({revision,source:ReferentielV2.fingerprint(rows)});
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, source, Utilities.Charset.UTF_8));
}
function _v2Simulate_(rows) {
  _v2Actor_();const l=_v2Load_();
  return {ok:true,revision:l.revision,preview:_v2Preview_(l.revision,rows),report:ReferentielV2.simulate(l.state,rows,_v2Today_())};
}
function _v2Write_(body) {
  _object_(body,['action','requestId','expectedRevision','command','rows','preview']);
  const actor=_v2Actor_();
  if(!_v2Enabled_())throw new Error('V2_DISABLED');
  if(typeof body.requestId!=='string' || !/^[A-Za-z0-9_-]{8,100}$/.test(body.requestId) || !Number.isInteger(body.expectedRevision) || body.expectedRevision<0)throw new Error('INVALID_REQUEST');
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try {
    const l=_v2Load_(), serialized=JSON.stringify(body), prior=l.requests.find(r=>r.id===body.requestId);
    if(prior){if(prior.request!==serialized)throw new Error('IDEMPOTENCY_CONFLICT');return {ok:true,revision:prior.revision,replayed:true};}
    if(l.revision!==body.expectedRevision)throw new Error('STALE_REVISION');
    const ctx={actor,now:new Date().toISOString(),today:_v2Today_(),id:()=>Utilities.getUuid()};
    let next;
    if(body.action==='v2.import') {
      if(body.command!==undefined)throw new Error('INVALID_REQUEST');
      if(body.preview!==_v2Preview_(l.revision,body.rows))throw new Error('IMPORT_PREVIEW_CHANGED');
      next=ReferentielV2.importRows(l.state,body.rows,ctx);
    } else if(body.action==='v2.write') {
      if(body.rows!==undefined || body.preview!==undefined)throw new Error('INVALID_REQUEST');
      next=ReferentielV2.apply(l.state,body.command,ctx);
    } else throw new Error('INVALID_ACTION');
    const patch=JSON.stringify(ReferentielV2.delta(l.state,next));
    // Limite par cellule Sheets : refuser avant toute création ou écriture.
    if(serialized.length>45000 || patch.length>45000)throw new Error('COMMIT_TOO_LARGE');
    let sh=l.sheet;
    if(!sh){sh=_v2Book_().insertSheet(V2_JOURNAL);sh.appendRow(V2_HEADER);}
    sh.appendRow([l.revision+1,body.requestId,serialized,patch]);
    return {ok:true,revision:l.revision+1};
  } finally {lock.releaseLock();}
}
function _v2Error_(err) {
  const allowed=['INVALID_IMPORT','AMBIGUOUS_TENANT','DUPLICATE_TENANT','DUPLICATE_REFERENCE','INACTIVE_OR_UNKNOWN_REFERENCE','REFERENCE_IN_USE','INVALID_REFERENCE','INVALID_LOGEMENT','DUPLICATE_NUMBER','INVALID_TEXT','INVALID_AMOUNT','INVALID_DATE','INVALID_FIELDS','FORBIDDEN','V2_DISABLED','STALE_REVISION','IDEMPOTENCY_CONFLICT','COMMIT_TOO_LARGE','OVERLAPPING_BAILS','INVALID_RENT_EFFECT','IMPORT_CONFLICT','IMPORT_PREVIEW_CHANGED','INVALID_FINANCIAL_START','IMMUTABLE_BAIL_PARTIES','RENT_OUTSIDE_BAIL'];
  return {ok:false,error:allowed.includes(err.message)?err.message:'V2_REQUEST_FAILED'};
}
// Pont HtmlService privé : les mêmes contrôles serveur s'appliquent aux appels directs.
function v2Client(body) {
  try {
    if(!body || typeof body!=='object' || Array.isArray(body))throw new Error('INVALID_REQUEST');
    if(body.action==='v2.read')return _v2Read_();
    if(body.action==='v2.simulate')return _v2Simulate_(body.rows);
    return _v2Write_(body);
  } catch(err) {return _v2Error_(err);}
}

// Transport serveur signé : aucune clé n'est fournie au navigateur.
function _recHex_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,value,Utilities.Charset.UTF_8).map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('');
}
function _recMac_(payload,key) {return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(payload,key,Utilities.Charset.UTF_8)).replace(/=+$/,'');}
function _recEqual_(a,b) {if(typeof a!=='string' || typeof b!=='string' || a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
function _recGateway_(body) {
  let verified=false,request,key;
  try {
    const p=PropertiesService.getScriptProperties();
    key=p.getProperty('REC_GATEWAY_KEY');
    if(!key || !/^[a-f0-9]{64}$/.test(key) || typeof body.payload!=='string' || body.payload.length>600000 || !_recEqual_(body.mac,_recMac_(body.payload,key)))throw Error('FORBIDDEN');
    request=JSON.parse(body.payload);
    if(request.version!==1 || !Number.isFinite(request.timestamp) || Math.abs(Date.now()-request.timestamp)>120000 || typeof request.nonce!=='string' || !/^[A-Za-z0-9_-]{43}$/.test(request.nonce))throw Error('FORBIDDEN');
    const targetId=p.getProperty('REC_SPREADSHEET_ID') || '',scriptHash=_recHex_(ScriptApp.getScriptId()),sheetHash=_recHex_(targetId);
    if(p.getProperty('APP_ENV')!=='REC' || scriptHash!=='78e98c211f7c0a055fd26ef132598d27e4e91d6fac2adacf9e3c71f7015d0d71' || sheetHash!=='defa8602371f49e0c1f118047af17a5c72c06f858d436884c3f1d902a98cce95')throw Error('FORBIDDEN');
    const users=JSON.parse(p.getProperty('REC_USER_ALLOWLIST') || '[]');
    const actor=request.actor;
    const user=Array.isArray(users) && users.find(u=>u.email===actor?.email && u.sub===actor?.sub && ['reader','admin'].includes(u.role));
    if(!user)throw Error('FORBIDDEN');
    const action=request.request?.action;
    if(!['rec.status','v2.read','v2.simulate','v2.write','v2.import'].includes(action))throw Error('FORBIDDEN');
    if(['v2.write','v2.import'].includes(action) && user.role!=='admin')throw Error('FORBIDDEN');
    _recVerifiedActor_={email:user.email,sub:user.sub,role:user.role,targetId};
    _checkedSheets_();
    const lock=LockService.getScriptLock();lock.waitLock(10000);
    try {
      const cache=CacheService.getScriptCache(),nonceKey='rec:'+request.nonce;
      if(cache.get(nonceKey))throw Error('FORBIDDEN');cache.put(nonceKey,'1',300);
    } finally {lock.releaseLock();}
    verified=true;
    const response=action==='rec.status'?{ok:true,environment:'REC',scriptHash,sheetHash,active:_v2Enabled_(),canWrite:_v2Enabled_() && user.role==='admin'}:v2Client(request.request);
    const payload=JSON.stringify({nonce:request.nonce,response});return _json({payload,mac:_recMac_(payload,key)});
  }catch {
    if(verified){const payload=JSON.stringify({nonce:request.nonce,response:{ok:false,error:'REC_REQUEST_FAILED'}});return _json({payload,mac:_recMac_(payload,key)});}
    return _json({ok:false,error:'FORBIDDEN'});
  }finally{_recVerifiedActor_=null;}
}
