/**************** Suivi Dépôt — garde-fous REC et accès authentifiés ****************/
// Valeurs privées dans les propriétés du projet uniquement. Aucun repli.
const REC_SIGNED_TRANSPORT = false;
const SCHEMAS = {
  transactions: ['type','date','montant','sous_bloc','description','local','locataire','fournisseur','periode','moyen','personne'],
  config_logements: ['num','type','locataire','loyer'],
  config_locaux: ['code','nom','locataire','loyer'],
  config_hedam: ['code','nom']
};
function _checkedSheets_() {
  const p = PropertiesService.getScriptProperties();
  const id = p.getProperty('SPREADSHEET_ID');
  const allowed = p.getProperty('REC_SPREADSHEET_ID');
  if(typeof _recVerifiedActor_!=='undefined' && _recVerifiedActor_ && id!==_recVerifiedActor_.targetId)throw new Error('INVALID_ENVIRONMENT');
  if (p.getProperty('APP_ENV') !== 'REC' || !id || id.trim() !== id || id !== allowed) throw new Error('INVALID_ENVIRONMENT');
  const ss = SpreadsheetApp.openById(id);
  if (!ss || ss.getId() !== allowed) throw new Error('INVALID_ENVIRONMENT');
  const sheets = {};
  Object.keys(SCHEMAS).forEach(name => {
    const sh = ss.getSheetByName(name);
    const fields = SCHEMAS[name];
    if (!sh || sh.getLastRow() < 1 || sh.getLastColumn() !== fields.length) throw new Error('INVALID_SCHEMA');
    const header = sh.getRange(1,1,1,fields.length).getValues()[0];
    if (!header || header.length !== fields.length || fields.some((f,i) => header[i] !== f)) throw new Error('INVALID_SCHEMA');
    sheets[name] = sh;
  });
  return sheets;
}
function _getSheet_() { return _checkedSheets_().transactions; }
function _object_(value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !fields.includes(k))) throw new Error('INVALID_INPUT');
}
function _text_(value, required) {
  if (value === undefined) value = '';
  if (typeof value !== 'string' || value.length > 2000 || (required && !value.trim())) throw new Error('INVALID_INPUT');
  // Refus plutôt qu'altération silencieuse ; couvre aussi les espaces/contrôles initiaux.
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(value) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new Error('INVALID_INPUT');
  return value;
}
function _amount_(value) {
  if (typeof value !== 'number' && typeof value !== 'string') throw new Error('INVALID_INPUT');
  if (typeof value === 'string' && !/^\d+(?:\.\d{1,2})?$/.test(value)) throw new Error('INVALID_INPUT');
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1000000000 || Math.abs(n*100-Math.round(n*100)) > 0.00001) throw new Error('INVALID_INPUT');
  return n;
}
function _date_(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('INVALID_INPUT');
  const d = new Date(value+'T00:00:00.000Z');
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0,10) !== value) throw new Error('INVALID_INPUT');
  return value;
}
function _transactionRow_(body) {
  const fields = SCHEMAS.transactions;
  // GET historique comporte action/callback ; POST conserve les onze champs métier.
  _object_(body, fields.concat(['action','callback']));
  return fields.map(f => f === 'montant' ? _amount_(body[f]) : f === 'date' ? _date_(body[f]) : _text_(body[f], f === 'type'));
}
function _replaceConfig_(name, rows) {
  if (!Array.isArray(rows) || rows.length > 5000) throw new Error('INVALID_INPUT');
  const fields = SCHEMAS[name];
  const data = rows.map(row => {
    _object_(row, fields);
    return fields.map((f,i) => f === 'loyer' ? _amount_(row[f]) : _text_(row[f], i === 0));
  });
  const identifiers = data.map(row => row[0]);
  if (new Set(identifiers).size !== identifiers.length) throw new Error('INVALID_INPUT');
  const sh = _checkedSheets_()[name];
  // Une seule écriture rectangulaire, incluant les anciennes lignes à vider.
  const count = Math.max(sh.getLastRow()-1, data.length);
  if (count) {
    while (data.length < count) data.push(fields.map(() => ''));
    sh.getRange(2,1,count,fields.length).setValues(data);
  }
}
/** Construit un TextOutput JSON (ou JSONP si callback fourni) */
function _json_(obj, callback) {
  const payload = JSON.stringify(obj);
  if (callback) {
    const safe = String(callback);
    return ContentService
      .createTextOutput(`${safe}(${payload})`)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(payload)
    .setMimeType(ContentService.MimeType.JSON);
}
// Les anciens points d'entrée restent privés même si le transport Web est ouvert
// ultérieurement pour la passerelle authentifiée. Aucun accès anonyme aux lectures.
function _recLegacyActor_() {
  if(REC_SIGNED_TRANSPORT)throw new Error('AUTH_REQUIRED');
  const p=PropertiesService.getScriptProperties();
  if(p.getProperty('APP_ENV')!=='REC')throw new Error('AUTH_REQUIRED');
  const email=typeof Session!=='undefined'?Session.getActiveUser().getEmail():'';
  if(!email || email!==p.getProperty('V2_ADMIN_EMAIL'))throw new Error('AUTH_REQUIRED');
  return email;
}
/** POST JSON => ajoute une ligne */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) throw new Error('INVALID_INPUT');
    const body = JSON.parse(e.postData.contents);
    if(body?.action==='rec.gateway')return _recGateway_(body);
    try{_recLegacyActor_();}catch{return _json_({ok:false,error:'FORBIDDEN'});}
    if (typeof body?.action === 'string' && body.action.startsWith('v2.')) {
      try { return _json_(_v2Write_(body)); } catch(err) { return _json_(_v2Error_(err)); }
    }
    const row = _transactionRow_(body);
    const sh = _getSheet_();
    sh.appendRow(row);
    return _json_({ ok: true });
  } catch (err) {
    return _json_({ ok: false, error: 'REQUEST_FAILED' });
  }
}
/*************** CONFIG PERSISTANTE – LOGEMENTS ***************/
function _getCfgLogementsSheet_() { return _checkedSheets_()['config_logements']; }
function _readConfigLogements_() {
  if (typeof _v2Enabled_ === 'function' && _v2Enabled_()) {
    return ReferentielV2.legacy(_v2Load_().state, _v2Today_());
  }
  const sh = _getCfgLogementsSheet_();
  const values = sh.getDataRange().getValues();
  const header = values.shift() || [];
  const idx = Object.fromEntries(header.map((h,i)=>[h,i]));
  return values
    .filter(r => r.join('').trim() !== '')
    .map(r => ({
      num:        String(r[idx.num] || ''),
      type:       String(r[idx.type] || ''),
      locataire:  String(r[idx.locataire] || ''),
      loyer:      Number(r[idx.loyer] || 0)
    }));
}
function _writeConfigLogements_(rows) {
  if (typeof _v2Enabled_ === 'function' && _v2Enabled_()) throw new Error('V2_LEGACY_WRITE_BLOCKED');
  _replaceConfig_('config_logements', rows);
}
/*************** CONFIG PERSISTANTE – LOCAUX ***************/
function _getCfgLocauxSheet_() { return _checkedSheets_()['config_locaux']; }
function _readConfigLocaux_() {
  const sh = _getCfgLocauxSheet_();
  const values = sh.getDataRange().getValues();
  const header = values.shift() || [];
  const idx = Object.fromEntries(header.map((h,i)=>[h,i]));
  return values
    .filter(r => r.join('').trim() !== '')
    .map(r => ({
      code:      String(r[idx.code] || ''),
      nom:       String(r[idx.nom] || ''),
      locataire: String(r[idx.locataire] || ''),
      loyer:     Number(r[idx.loyer] || 0)
    }));
}
function _writeConfigLocaux_(rows) { _replaceConfig_('config_locaux', rows); }
/*************** CONFIG PERSISTANTE – HEDAM ***************/
function _getCfgHedamSheet_() { return _checkedSheets_()['config_hedam']; }
function _readConfigHedam_() {
  const sh = _getCfgHedamSheet_();
  const values = sh.getDataRange().getValues();
  const header = values.shift() || [];
  const idx = Object.fromEntries(header.map((h,i)=>[h,i]));
  return values
    .filter(r => (r[idx.code]||'').toString().trim() || (r[idx.nom]||'').toString().trim())
    .map(r => ({
      code: String(r[idx.code] || ''),
      nom:  String(r[idx.nom]  || '')
    }));
}
function _writeConfigHedam_(rows) { _replaceConfig_('config_hedam', rows); }
/*************** doGet: CONFIG + ADD + LECTURE ***************/
function doGet(e) {
  try{_recLegacyActor_();}catch{return _json_({ok:false,error:'FORBIDDEN'});}
  const cb = (e && e.parameter && e.parameter.callback)
    ? String(e.parameter.callback)
    : null;
  if (cb && !/^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/.test(cb)) return _json_({ok:false,error:'INVALID_CALLBACK'});
  const action = (e && e.parameter && e.parameter.action) || '';
  if (action.startsWith('v2.')) {
    try {
      if (action === 'v2.ui') { _v2Actor_(); _v2Book_(); return HtmlService.createHtmlOutputFromFile('ParametrageV2').setTitle('Paramétrage V2 — REC'); }
      if (action === 'v2.read') return _json_(_v2Read_(), cb);
      if (action === 'v2.simulate') return _json_(_v2Simulate_(JSON.parse(e.parameter.rows)), cb);
      return _json_({ok:false,error:'POST_REQUIRED'}, cb);
    } catch(err) { return _json_(_v2Error_(err), cb); }
  }
  // PING
  if (e && e.parameter && e.parameter.ping === '1') {
    const out = ContentService.createTextOutput('pong').setMimeType(ContentService.MimeType.TEXT);
    return cb
      ? ContentService.createTextOutput(`${cb}("pong")`).setMimeType(ContentService.MimeType.JAVASCRIPT)
      : out;
  }
  // CONFIG
  if (action === 'config') {
    try {
      if (e && e.parameter && e.parameter.debug === '1') {
        return _json_({ ok:false, error:'DEBUG_DISABLED' }, cb);
      }
      if (e.parameter.what === 'all') {
        const config = {
          logements: _readConfigLogements_(),
          locaux: _readConfigLocaux_(),
          hedam: _readConfigHedam_()
        };
        return _json_({ ok:true, config, referentielV2: typeof _v2Enabled_ === 'function' && _v2Enabled_() }, cb);
      }
      if (e.parameter.save === 'logements') {
        if (!e.parameter.payload) throw new Error('INVALID_INPUT');
        const rows = JSON.parse(decodeURIComponent(e.parameter.payload));
        _writeConfigLogements_(rows);
        return _json_({ ok:true }, cb);
      }
      if (e.parameter.save === 'locaux') {
        if (!e.parameter.payload) throw new Error('INVALID_INPUT');
        const rows = JSON.parse(decodeURIComponent(e.parameter.payload));
        _writeConfigLocaux_(rows);
        return _json_({ ok:true }, cb);
      }
      if (e.parameter.save === 'hedam') {
        if (!e.parameter.payload) throw new Error('INVALID_INPUT');
        const rows = JSON.parse(decodeURIComponent(e.parameter.payload));
        _writeConfigHedam_(rows);
        return _json_({ ok:true }, cb);
      }
      return _json_({ ok:false, error:'INVALID_ACTION' }, cb);
    } catch (err) {
      return _json_({ ok:false, error:'REQUEST_FAILED' }, cb);
    }
  }
  // AJOUT
  if (action === 'add') {
    try {
      const row = _transactionRow_(e.parameter);
      _getSheet_().appendRow(row);
      return _json_({ ok:true }, cb);
    } catch (_) { return _json_({ ok:false, error:'REQUEST_FAILED' }, cb); }
  }
  // LECTURE
  try {
    const sh   = _getSheet_();
    const data = sh.getDataRange().getValues();
    const head = data.shift() || [];
    const rows = data.map(r => Object.fromEntries(head.map((h, i) => [h, r[i]])));
    return _json_({ ok: true, rows }, cb);
  } catch (err) {
    return _json_({ ok: false, error: 'REQUEST_FAILED' }, cb);
  }
}
