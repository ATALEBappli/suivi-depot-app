/******************* Suivi Depot – API Google Sheets *******************/
// Laissez SPREADSHEET_ID vide si le script est LIÉ au Sheet (Extensions > Apps Script).
// Sinon, renseignez cette propriété du script hors Git.
const SHEET_ID = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
const SHEET_NAME = "transactions";  // nom de l’onglet
function _getSpreadsheet_() {
  if (!SHEET_ID) return SpreadsheetApp.getActiveSpreadsheet();
  return SpreadsheetApp.openById(SHEET_ID);
}
/** Retourne l'objet Sheet ciblé et initialise l’en-tête si la feuille est vide */
function _getSheet() {
  const ss = _getSpreadsheet_();
  if (!ss) throw new Error("Impossible d’ouvrir le Spreadsheet.");
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) sh = ss.insertSheet(SHEET_NAME);
  if (sh.getLastRow() === 0) {
    sh.appendRow([
      "type", "date", "montant", "sous_bloc", "description",
      "local", "locataire", "fournisseur", "periode", "moyen", "personne"
    ]);
  }
  return sh;
}
/** Construit un TextOutput JSON (ou JSONP si callback fourni) */
function _json(obj, callback) {
  const payload = JSON.stringify(obj);
  if (callback) {
    const safe = String(callback).replace(/[^\w$.]/g, "");
    return ContentService
      .createTextOutput(`${safe}(${payload})`)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(payload)
    .setMimeType(ContentService.MimeType.JSON);
}
/** Transforme un tableau 2D en liste d’objets {colonne: valeur} */
function _toObjects(values) {
  if (!values || values.length === 0) return [];
  const headers = values[0];
  const rows    = values.slice(1);
  return rows.map(r => {
    const o = {};
    headers.forEach((h, i) => o[h] = r[i]);
    return o;
  });
}
/** POST JSON => ajoute une ligne */
function doPost(e) {
  try {
    let body = {};
    if (e && e.postData && e.postData.contents) {
      try { body = JSON.parse(e.postData.contents); } catch (_) {}
    }
    if (!body || typeof body !== "object") {
      return _json({ ok: false, error: "Corps JSON invalide" });
    }
    const sh = _getSheet();
    const row = [
      body.type || "",
      body.date || "",
      body.montant || "",
      body.sous_bloc || "",
      body.description || "",
      body.local || "",
      body.locataire || "",
      body.fournisseur || "",
      body.periode || "",
      body.moyen || "",
      body.personne || ""
    ];
    sh.appendRow(row);
    return _json({ ok: true });
  } catch (err) {
    return _json({ ok: false, error: String(err) });
  }
}
/*************** CONFIG PERSISTANTE – LOGEMENTS ***************/
function _getCfgLogementsSheet_() {
  const ss = _getSpreadsheet_();
  let sh = ss.getSheetByName('config_logements');
  if (!sh) {
    sh = ss.insertSheet('config_logements');
    sh.appendRow(['num','type','locataire','loyer']);
  }
  return sh;
}
function _readConfigLogements_() {
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
  const sh = _getCfgLogementsSheet_();
  sh.clearContents();
  sh.appendRow(['num','type','locataire','loyer']);
  if (rows && rows.length) {
    const data = rows.map(r => [r.num||'', r.type||'', r.locataire||'', Number(r.loyer||0)]);
    sh.getRange(2,1,data.length,4).setValues(data);
  }
}
/*************** CONFIG PERSISTANTE – LOCAUX ***************/
function _getCfgLocauxSheet_() {
  const ss = _getSpreadsheet_();
  let sh = ss.getSheetByName('config_locaux');
  if (!sh) {
    sh = ss.insertSheet('config_locaux');
    sh.appendRow(['code','nom','locataire','loyer']);
  }
  return sh;
}
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
function _writeConfigLocaux_(rows) {
  const sh = _getCfgLocauxSheet_();
  sh.clearContents();
  sh.appendRow(['code','nom','locataire','loyer']);
  if (rows && rows.length) {
    const data = rows.map(r => [r.code||'', r.nom||'', r.locataire||'', Number(r.loyer||0)]);
    sh.getRange(2,1,data.length,4).setValues(data);
  }
}
/*************** CONFIG PERSISTANTE – HEDAM ***************/
function _getCfgHedamSheet_() {
  const ss = _getSpreadsheet_();
  let sh = ss.getSheetByName('config_hedam');
  if (!sh) {
    sh = ss.insertSheet('config_hedam');
    sh.appendRow(['code','nom']);
    const seed = [
      ['PLOM', 'Plombie'],
      ['DEM',  'Demolition'],
      ['ELEC', 'Electricien'],
      ['BOUC', 'Bouchareb'],
      ['BET',  'Beton'],
      ['MAC',  'Maçon'],
      ['MENU', 'Menuisier'],
      ['DIV',  'Divers'],
      ['FOND', 'Fondation']
    ];
    sh.getRange(2,1,seed.length,2).setValues(seed);
  }
  return sh;
}
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
function _writeConfigHedam_(rows) {
  const sh = _getCfgHedamSheet_();
  sh.clearContents();
  sh.appendRow(['code','nom']);
  if (rows && rows.length) {
    const data = rows.map(r => [r.code||'', r.nom||'']);
    sh.getRange(2,1,data.length,2).setValues(data);
  }
}
/*************** doGet: CONFIG + ADD + LECTURE ***************/
function doGet(e) {
  const cb = (e && e.parameter && e.parameter.callback)
    ? String(e.parameter.callback).replace(/[^\w$.]/g, '')
    : null;
  const action = (e && e.parameter && e.parameter.action) || '';
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
        return _json({ ok:true, received:e.parameter }, cb);
      }
      if (e.parameter.what === 'all') {
        const config = {
          logements: _readConfigLogements_(),
          locaux: _readConfigLocaux_(),
          hedam: _readConfigHedam_()
        };
        return _json({ ok:true, config }, cb);
      }
      if (e.parameter.save === 'logements') {
        const rows = JSON.parse((e.parameter.payload ? decodeURIComponent(e.parameter.payload) : '[]') || '[]');
        _writeConfigLogements_(rows);
        return _json({ ok:true }, cb);
      }
      if (e.parameter.save === 'locaux') {
        const rows = JSON.parse((e.parameter.payload ? decodeURIComponent(e.parameter.payload) : '[]') || '[]');
        _writeConfigLocaux_(rows);
        return _json({ ok:true }, cb);
      }
      if (e.parameter.save === 'hedam') {
        const rows = JSON.parse((e.parameter.payload ? decodeURIComponent(e.parameter.payload) : '[]') || '[]');
        _writeConfigHedam_(rows);
        return _json({ ok:true }, cb);
      }
      return _json({ ok:false, error:'config: action inconnue', received:e && e.parameter }, cb);
    } catch (err) {
      return _json({ ok:false, error:String(err) }, cb);
    }
  }
  // AJOUT
  if (action === 'add') {
    const sh = _getSheet();
    sh.appendRow([
      e.parameter.type || '',
      e.parameter.date || '',
      e.parameter.montant || '',
      e.parameter.sous_bloc || '',
      e.parameter.description || '',
      e.parameter.local || '',
      e.parameter.locataire || '',
      e.parameter.fournisseur || '',
      e.parameter.periode || '',
      e.parameter.moyen || '',
      e.parameter.personne || ''
    ]);
    return _json({ ok: true }, cb);
  }
  // LECTURE
  try {
    const sh   = _getSheet();
    const data = sh.getDataRange().getValues();
    const head = data.shift() || [];
    const rows = data.map(r => Object.fromEntries(head.map((h, i) => [h, r[i]])));
    return _json({ ok: true, rows }, cb);
  } catch (err) {
    return _json({ ok: false, error: String(err) }, cb);
  }
}
