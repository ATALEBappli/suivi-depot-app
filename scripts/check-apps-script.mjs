// Contrats historiques, uniquement en mémoire : aucun service Google ni réseau.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../apps-script/src/Code.gs', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../apps-script/src/appsscript.json', import.meta.url)));
assert.deepEqual(manifest, { timeZone: 'Europe/Paris', dependencies: {}, webapp: { access: 'ANYONE_ANONYMOUS', executeAs: 'USER_DEPLOYING' }, exceptionLogging: 'STACKDRIVER', runtimeVersion: 'V8' });
function setup(property) {
  const sheets = new Map(), calls = [];
  const book = {
    getSheetByName: name => sheets.get(name),
    insertSheet(name) {
      const sheet = {
        rows: [],
        getLastRow() { return this.rows.length; },
        appendRow(row) { this.rows.push([...row]); },
        clearContents() { this.rows = []; },
        getDataRange() { return { getValues: () => this.rows.map(r => [...r]) }; },
        getRange(row, col, count, width) { return { setValues: data => {
          assert.equal(data.length, count);
          data.forEach((r, i) => { assert.equal(r.length, width); this.rows[row - 1 + i] = [...r]; });
          assert.equal(col, 1);
        } }; }
      };
      sheets.set(name, sheet); return sheet;
    }
  };
  const context = vm.createContext({
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => { assert.equal(key, 'SPREADSHEET_ID'); return property; } }) },
    SpreadsheetApp: {
      openById: id => { assert.equal(id, property); calls.push('openById'); return book; },
      getActiveSpreadsheet: () => { calls.push('active'); return book; }
    },
    ContentService: {
      MimeType: { JSON: 'json', JAVASCRIPT: 'javascript', TEXT: 'text' },
      createTextOutput: text => ({ text, setMimeType(mime) { this.mime = mime; return this; } })
    }
  });
  vm.runInContext(source, context);
  return { context, sheets, calls };
}
const { context: api, sheets, calls } = setup('CLASSEUR_FICTIF');
const get = parameter => api.doGet({ parameter });
const json = output => { assert.equal(output.mime, 'json'); return JSON.parse(output.text); };
assert.equal(get({ ping: '1' }).text, 'pong');
assert.equal(get({ ping: '1', callback: 'cb' }).text, 'cb("pong")');
assert.equal(calls.length, 0);
assert.deepEqual(json(get({})), { ok: true, rows: [] });
const fields = ['type','date','montant','sous_bloc','description','local','locataire','fournisseur','periode','moyen','personne'];
const row = Object.fromEntries(fields.map((f, i) => [f, `fictif-${i}`]));
assert.deepEqual(json(get({ action: 'add', ...row })), { ok: true });
assert.deepEqual(json(api.doPost({ postData: { contents: JSON.stringify(row) } })), { ok: true });
assert.deepEqual(json(get({})).rows, [row, row]);
assert.deepEqual(sheets.get('transactions').rows[0], fields);
const jp = get({ callback: 'cb!' });
assert.equal(jp.mime, 'javascript');
assert.ok(jp.text.startsWith('cb({"ok":true,"rows":'));
const configs = {
  logements: [{ num: 'F1', type: 'test', locataire: 'Fictif', loyer: 10 }],
  locaux: [{ code: 'F2', nom: 'Test', locataire: 'Fictif', loyer: 20 }],
  hedam: [{ code: 'TEST', nom: 'Fictif' }]
};
assert.equal(json(get({ action: 'config', what: 'all' })).config.hedam.length, 9);
for (const [save, rows] of Object.entries(configs)) {
  assert.deepEqual(json(get({ action: 'config', save, payload: encodeURIComponent(JSON.stringify(rows)) })), { ok: true });
}
assert.deepEqual(json(get({ action: 'config', what: 'all' })), { ok: true, config: configs });
for (const save of Object.keys(configs)) {
  json(get({ action: 'config', save }));
  assert.deepEqual(json(get({ action: 'config', what: 'all' })).config[save], []);
}
assert.equal(json(get({ action: 'config', save: 'hedam', payload: '%' })).ok, false);
assert.equal(json(get({ action: 'config' })).error, 'config: action inconnue');
assert.deepEqual(json(get({ action: 'config', debug: '1' })).received, { action: 'config', debug: '1' });
assert.equal(json(api.doPost({ postData: { contents: 'null' } })).ok, false);
// Comportements historiques conservés : JSON malformé accepté en ligne vide,
// zéro numérique converti en chaîne vide, action inconnue traitée comme lecture.
assert.equal(json(api.doPost({ postData: { contents: '{' } })).ok, true);
json(api.doPost({ postData: { contents: '{"montant":0}' } }));
assert.equal(sheets.get('transactions').rows.at(-1)[2], '');
assert.equal(json(get({ action: 'inconnue' })).ok, true);
for (const property of [null, '']) {
  const test = setup(property);
  test.context.doGet({ parameter: {} });
  assert.deepEqual(test.calls, ['active']);
}
api._getSheet = () => { throw new Error('Erreur fictive'); };
assert.equal(json(get({})).ok, false);
assert.equal(json(api.doPost({})).ok, false);
assert.throws(() => get({ action: 'add' }), /Erreur fictive/);
console.log('OK : manifeste et contrats Apps Script sur doublures en mémoire, sans accès Google.');
