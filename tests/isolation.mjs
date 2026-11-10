import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import vm from 'node:vm';
import { build } from '../scripts/build-frontend.mjs';
const out = mkdtempSync(`${tmpdir()}/suivi-rec-`);
const historical = readFileSync('index.html', 'utf8').match(/window\.API_URL\s*=\s*"([^"]+)"/)[1];
const rec = 'https://script.google.com/macros/s/TEST_REC_FICTIF/exec';
try {
  for (const env of [{}, {APP_ENV:'preview'}, {APP_ENV:'PROD'}, {APP_ENV:'REC', REC_API_URL:historical},
    {APP_ENV:'REC', REC_API_URL:historical+'?action=add'}, {APP_ENV:'REC', REC_API_URL:'http://example.com'},
    {APP_ENV:'REC', REC_API_URL:rec+'#fragment'}]) assert.throws(() => build(env,out));
  for (const api of ['',rec]) {
    build({APP_ENV:'REC', REC_API_URL:api, PROD_API_URL:historical},out);
    const html = readFileSync(`${out}/index.html`,'utf8');
    assert.ok(!html.includes(historical));
    assert.ok(!/serviceWorker|sw\.js|rel="manifest"/.test(html));
    const app = readFileSync(`${out}/app.js`,'utf8');
    const sent = [];
    const context = vm.createContext({URL, window:{}, document:{addEventListener(){},
      createElement(){ return {}; }, head:{appendChild(s){sent.push(s.src);}}},
      setTimeout(){return 1;}, clearTimeout(){}});
    vm.runInContext(readFileSync(`${out}/environment.js`,'utf8'),context);
    // Exécute le vrai transport JSONP généré sans initialiser le reste de l'interface.
    vm.runInContext(app.slice(app.indexOf('function jsonp('),app.indexOf('const fmt =')),context);
    for (const suffix of ['', '?action=add', '?action=config&save=logements', '?action=config&save=locaux', '?action=config&save=hedam']) {
      await assert.rejects(vm.runInContext(`jsonp(${JSON.stringify(historical+suffix)})`,context));
      if (!api) await assert.rejects(vm.runInContext(`jsonp(${JSON.stringify(rec+suffix)})`,context));
      else {
        vm.runInContext(`jsonp(${JSON.stringify(rec+suffix)})`,context);
        assert.ok(sent.at(-1).startsWith(rec));
      }
    }
    assert.equal(sent.length,api ? 5 : 0);
    vm.runInContext(`window.API_URL = ${JSON.stringify(historical)}`,context);
    assert.equal(context.window.API_URL,api);
    assert.ok(!app.includes(historical));
  }
  build({APP_ENV:'PROD',PROD_API_URL:rec},out);
  assert.ok(readFileSync(`${out}/index.html`,'utf8').includes('serviceWorker'));
  const fixtures = JSON.parse(readFileSync('fixtures/rec/sheets.json','utf8'));
  const backend = readFileSync('apps-script/src/Code.gs','utf8');
  for (const [name, rows] of Object.entries(fixtures)) {
    assert.ok(backend.includes(name));
    for (const row of rows.slice(1)) assert.equal(row.length, rows[0].length);
    for (const header of rows[0]) assert.ok(backend.includes(header));
  }
  console.log('OK : isolation build/JSONP, absence de repli, configuration immuable, SW REC absent, fixtures compatibles. Aucun réseau.');
} finally {rmSync(out,{recursive:true,force:true});}
