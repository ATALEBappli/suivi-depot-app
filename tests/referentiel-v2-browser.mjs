import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdirSync} from 'node:fs';
const {chromium}=createRequire(import.meta.url)('playwright');
const server=spawn(process.execPath,['scripts/serve-referentiel-v2.mjs'],{env:{...process.env,V2_PORT:'4176'},stdio:['ignore','pipe','pipe']});
await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',code=>reject(Error('Server exit '+code)));});
let browser;
try {
 browser=await chromium.launch({headless:true,...(process.env.DEMO_CHROMIUM_PATH?{executablePath:process.env.DEMO_CHROMIUM_PATH}:{})});
 for(const width of [1440,390]) {
  const page=await browser.newPage({viewport:{width,height:900}});const errors=[],external=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{if(new URL(route.request().url()).origin!=='http://127.0.0.1:4176'){external.push(route.request().url());return route.abort();}return route.continue();});
  await page.goto('http://127.0.0.1:4176');await page.getByText('Référentiel chargé.',{exact:true}).waitFor();
  const num=width===1440?'05':'06';
  const log=page.locator('#logement-form');await log.locator('[name=numero]').fill(num);await log.locator('[name=type]').fill('F3');await log.locator('[name=etage]').fill('1er');await log.getByRole('button',{name:'Enregistrer le logement',exact:true}).click();await page.getByText('Modification enregistrée.',{exact:false}).waitFor();
  const tenant=page.locator('#locataire-form');await tenant.locator('[name=nom]').fill(`Locataire fictif ${num}`);await tenant.getByRole('button').click();await page.waitForFunction(n=>document.querySelector('#tenant-edit').textContent.includes(n),`Locataire fictif ${num}`);
  const bail=page.locator('#bail-form');await bail.locator('[name=logementId]').selectOption({label:num});await bail.locator('[name=locataireId]').selectOption({label:`Locataire fictif ${num}`});await bail.locator('[name=loyer]').fill('17000');await bail.getByRole('button',{name:'Enregistrer le bail',exact:true}).click();
  await page.waitForFunction(n=>document.querySelector('#logements').textContent.includes(n),`Locataire fictif ${num}`);
  await page.locator('#bail-filter').selectOption({label:`${num} — F3`});await page.locator('#baux').getByRole('button').click();
  await page.waitForFunction(()=>document.querySelector('#bail-form [name=loyer]').disabled);
  assert.equal(await bail.locator('[name=logementId]').isDisabled(),true);
  await bail.locator('[name=arrivee]').fill('2020-01-01');await bail.locator('[name=suiviFinancierDepuis]').fill('2026-11-01');await bail.locator('[name=cautionPrevue]').fill('0');await bail.getByRole('button',{name:'Enregistrer le bail',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#baux').textContent.includes('2026-11-01'));
  const rent=page.locator('#loyer-form');await rent.locator('[name=bailId]').selectOption({label:`${num} — Locataire fictif ${num}`});await rent.locator('[name=montant]').fill('18000');await rent.locator('[name=effet]').fill('2099-01-01');await rent.getByRole('button').click();await page.waitForFunction(()=>document.querySelector('#baux').textContent.includes('18000'));
  await page.locator('#import-file').setInputFiles({name:'fictif.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify([{num:'REC-IMPORT-'+num,type:'F2',etage:'Toit',locataire:'Import fictif',loyer:15000}]))});
  const before=await page.request.post('http://127.0.0.1:4176/api/v2',{data:{action:'v2.read'}}).then(r=>r.json());
  await page.getByRole('button',{name:'Simuler',exact:true}).click();await page.getByText('Simulation terminée : aucune écriture.',{exact:true}).waitFor();
  const after=await page.request.post('http://127.0.0.1:4176/api/v2',{data:{action:'v2.read'}}).then(r=>r.json());assert.equal(after.revision,before.revision);
  page.once('dialog',d=>d.accept());await page.locator('#import-apply').click();await page.getByText('Import enregistré ; aucune transaction créée.',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  mkdirSync('work/us-015-screenshots',{recursive:true});await page.screenshot({path:`work/us-015-screenshots/${width}.png`,fullPage:true});await page.close();console.log(`OK parcours navigateur ${width}px : logement, locataire, bail, dates, caution zéro, loyer, simulation sans écriture, import.`);
 }
}finally{await browser?.close();server.kill();}
