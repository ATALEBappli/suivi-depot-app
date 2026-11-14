/* REC uniquement. Un commit = une ligne append-only contenant le delta des six entités. */
const V2_JOURNAL = 'v2_referentiel_commits';
const V2_HEADER = ['revision','request_id','request_json','delta_json'];
function _v2Today_() { return Utilities.formatDate(new Date(), 'Europe/Paris', 'yyyy-MM-dd'); }
function _v2Enabled_() { return PropertiesService.getScriptProperties().getProperty('REFERENTIEL_V2') === '1'; }
function _v2Book_() {
  _checkedSheets_();
  const p=PropertiesService.getScriptProperties();
  return SpreadsheetApp.openById(p.getProperty('REC_SPREADSHEET_ID'));
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
function _v2Actor_() {
  const actor=Session.getActiveUser().getEmail();
  const owner=PropertiesService.getScriptProperties().getProperty('V2_ADMIN_EMAIL');
  if(!owner || !actor || actor!==owner)throw new Error('FORBIDDEN');return actor;
}
function _v2Read_() {
  _v2Actor_();const loaded=_v2Load_();return {ok:true,active:_v2Enabled_(),revision:loaded.revision,state:loaded.state};
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
  const allowed=['FORBIDDEN','V2_DISABLED','STALE_REVISION','IDEMPOTENCY_CONFLICT','COMMIT_TOO_LARGE','OVERLAPPING_BAILS','INVALID_RENT_EFFECT','IMPORT_CONFLICT','IMPORT_PREVIEW_CHANGED','INVALID_FINANCIAL_START','IMMUTABLE_BAIL_PARTIES','RENT_OUTSIDE_BAIL'];
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
