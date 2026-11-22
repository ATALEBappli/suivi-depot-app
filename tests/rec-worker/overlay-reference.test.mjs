import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {hex} from '../../rec-server/security.mjs';
import {overlayReference} from '../../rec-worker/overlay-reference.mjs';
import {fileURLToPath} from 'node:url';
const repo=fileURLToPath(new URL('../../',import.meta.url));

const paths=['index.html','transport.js','referentiel-v2-model.js','referentiel-v2-import.js','referentiel-v2.js','referentiel-v2.css'].map(name=>'referentiel/'+name);
test('le bundle REC remplace le référentiel figé par la V2 migrable, sans toucher aux autres assets',()=>{
 assert.match(readFileSync(repo+'/rec-worker/prepare.mjs','utf8'),/overlayReference\(out\)/);
 assert.match(readFileSync(repo+'/.github/workflows/rec-worker-manual.yml','utf8'),/node rec-worker\/prepare\.mjs/);
 const dir=mkdtempSync(tmpdir()+'/rec-v2-overlay-');
 try{
  mkdirSync(dir+'/referentiel');writeFileSync(dir+'/app.mjs','application finance inchangée');
  const manifest={schema:1,repository:'ATALEBappli/suivi-depot-demo',sourceSha:'a'.repeat(40),files:[{path:'app.mjs',sha256:hex('application finance inchangée')},...paths.map(path=>({path,sha256:'0'.repeat(64)}))]};
  writeFileSync(dir+'/manifest.json',JSON.stringify(manifest));
  assert.deepEqual(overlayReference(dir),{files:6,migrationPreview:true});
  const after=JSON.parse(readFileSync(dir+'/manifest.json','utf8'));
  assert.equal(readFileSync(dir+'/app.mjs','utf8'),'application finance inchangée');
  assert.deepEqual(after.files[0],manifest.files[0]);
  for(const path of paths)assert.equal(after.files.find(f=>f.path===path).sha256,hex(readFileSync(dir+'/'+path)));
  const html=readFileSync(dir+'/referentiel/index.html','utf8'),js=readFileSync(dir+'/referentiel/referentiel-v2.js','utf8');
  assert.ok(html.indexOf('<h2>Locataires</h2>')<html.indexOf('<h2>Logements</h2>'));
  assert.match(html,/id="migration-preview"/);assert.match(html,/id="migration-confirm"/);
  assert.match(js,/action:'v2.simulate'/);assert.match(js,/action:'v2.import'/);
  writeFileSync(dir+'/referentiel/index.html','<h2>Ancien référentiel</h2>');
  assert.throws(()=>overlayReference(dir,{generate:false}),/V2_MIGRATION_UI_MISSING/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
