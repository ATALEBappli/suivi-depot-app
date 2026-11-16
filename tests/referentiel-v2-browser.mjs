// Navigateur local fictif. Toutes les destinations externes sont bloquées.
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {mkdirSync,readFileSync} from 'node:fs';
const {chromium}=createRequire(import.meta.url)('playwright');
const server=spawn(process.execPath,['scripts/serve-referentiel-v2.mjs'],{env:{...process.env,V2_PORT:'4176'},stdio:['ignore','pipe','pipe']});
await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',code=>reject(Error('Server exit '+code)));});
let browser;
const rows=Array.from({length:12},(_,i)=>({num:String(i+30),type:'f 3',etage:i<6?'1er':'2e',locataire:`LOCATAIRE FICTIF ${i+30}`,loyer:i===11?22000:18000}));
const xlsx=(formula=false)=>execFileSync('python3',['-c',`
import io,zipfile,sys,json
from xml.sax.saxutils import escape
rows=json.loads(sys.argv[1]); out=io.BytesIO()
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
 z.writestr('xl/workbook.xml','<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Fictif" sheetId="1" r:id="rId1"/></sheets></workbook>')
 z.writestr('xl/_rels/workbook.xml.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>')
 matrix=[['Appartement','Étage','Type','Locataire','Loyer DA']]+[[r['num'],r['etage'],r['type'],r['locataire'],str(r['loyer'])] for r in rows]
 data=''
 for i,row in enumerate(matrix,1):
  data+='<row r="%s">'%i
  for j,v in enumerate(row):
   data+='<c r="%s%s" t="inlineStr">'%(chr(65+j),i)+('<f>1+1</f>' if sys.argv[2]=='yes' and i==2 and j==4 else '')+'<is><t>'+escape(v)+'</t></is></c>'
  data+='</row>'
 z.writestr('xl/worksheets/sheet1.xml','<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'+data+'</sheetData></worksheet>')
sys.stdout.buffer.write(out.getvalue())
`,JSON.stringify(rows),formula?'yes':'no']);
try {
 browser=await chromium.launch({headless:true,...(process.env.DEMO_CHROMIUM_PATH?{executablePath:process.env.DEMO_CHROMIUM_PATH}:{})});
 for(const width of [1440,390]) {
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[],external=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{if(new URL(route.request().url()).origin!=='http://127.0.0.1:4176'){external.push(route.request().url());return route.abort();}return route.continue();});
  const read=()=>page.request.post('http://127.0.0.1:4176/api/v2',{data:{action:'v2.read'}}).then(r=>r.json());
  await page.goto('http://127.0.0.1:4176');await page.getByText('Référentiel chargé.',{exact:true}).waitFor();
  assert.equal(await page.locator('#numeros option[value="01"]').count(),1);
  const num=width===1440?'21':'22',f=page.locator('#logement-form');
  await f.locator('[name=numero]').fill(num);await f.locator('[name=type]').selectOption('F3');await f.locator('[name=etage]').selectOption('1er étage');
  await page.locator('#housing-save').click();await page.getByText('Modification enregistrée.',{exact:false}).waitFor();
  const housing=(await read()).state.logements.find(l=>l.numero===num);
  await f.locator('[name=numero]').fill('00'+num);await page.locator('#housing-save').click();await page.getByText('Numéro déjà utilisé ou logement invalide.',{exact:true}).waitFor();
  await page.locator('#logement-edit').selectOption(housing.id);await page.waitForFunction(id=>document.querySelector('#logement-form [name=id]').value===id,housing.id);
  await f.locator('[name=type]').selectOption('F4');await page.locator('#housing-save').click();await page.getByText('Modification enregistrée.',{exact:false}).waitFor();
  assert.equal((await read()).state.logements.filter(l=>l.numero===num).length,1);
  const tenant=page.locator('#locataire-form');await tenant.locator('[name=nom]').fill('  MOHAMED  FICTIF-'+num);await tenant.locator('button[type=reset]').click();
  await tenant.locator('[name=nom]').fill('  MOHAMED  FICTIF-'+num);await tenant.locator('button:not([type=reset])').click();
  const name='Mohamed Fictif-'+num;await page.waitForFunction(n=>document.querySelector('#tenant-edit').textContent.includes(n),name);
  const t=(await read()).state.locataires.find(t=>t.nom===name);
  const lease=page.locator('#bail-form');await lease.locator('[name=logementId]').selectOption(housing.id);await lease.locator('[name=locataireId]').selectOption(t.id);await lease.locator('[name=loyer]').fill('17000');await lease.locator('button:not([type=reset])').click();
  await page.waitForFunction(n=>document.querySelector('#logements').textContent.includes(n),name);
  const b=(await read()).state.baux.find(b=>b.logementId===housing.id);
  const rent=page.locator('#loyer-form');await rent.locator('[name=bailId]').selectOption(b.id);await rent.locator('[name=montant]').fill('18000');await rent.locator('[name=effet]').fill('2099-01-01');await rent.locator('button').click();
  await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('Modification enregistrée.'));
  assert.equal((await read()).state.loyers.filter(l=>l.bailId===b.id).length,2);
  const ref=page.locator('#reference-form');await ref.locator('[name=label]').fill(width===1440?'F5':'F7');await ref.locator('button:not([type=reset])').click();
  await page.waitForFunction(label=>[...document.querySelectorAll('#logement-form [name=type] option')].some(o=>o.value===label),width===1440?'F5':'F7');
  const before=await read();
  await page.locator('#import-file').setInputFiles({name:'fictif.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:xlsx()});
  await page.locator('#simulate').click();await page.getByText('Simulation terminée : aucune écriture.',{exact:true}).waitFor();
  assert.equal((await read()).revision,before.revision);assert.equal(await page.locator('#import-preview tr').count(),12);assert.match(await page.locator('#import-summary').textContent(),/220\s*000/);
  if(width===1440){page.once('dialog',d=>d.accept());await page.locator('#import-apply').click();await page.getByText('Import enregistré ; aucune transaction créée.',{exact:true}).waitFor();}
  await page.locator('#simulate').click();await page.getByText('Simulation terminée : aucune écriture.',{exact:true}).waitFor();assert.match(await page.locator('#import-summary').textContent(),/ignorées \(identiques\) : 12/);
  const stable=await read();page.once('dialog',d=>d.accept());await page.locator('#import-apply').click();await page.getByText('Import enregistré ; aucune transaction créée.',{exact:true}).waitFor();assert.equal((await read()).state.logements.length,stable.state.logements.length);
  await page.locator('#import-file').setInputFiles({name:'formule.xlsx',mimeType:'application/octet-stream',buffer:xlsx(true)});await page.locator('#simulate').click();await page.getByText('Formule Excel refusée. Remplacer par des valeurs.',{exact:true}).waitFor();assert.equal(await page.locator('#import-apply').isDisabled(),true);
  await page.reload();await page.getByText('Référentiel chargé.',{exact:true}).waitFor();const after=await read();assert.equal(after.state.logements.find(l=>l.id===housing.id).type,'F4');assert.ok(after.state.locataires.some(t=>t.nom===name));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  mkdirSync('work/us-015-screenshots',{recursive:true});await page.screenshot({path:`work/us-015-screenshots/${width}.png`,fullPage:true});await page.close();console.log(`OK navigateur ${width}px : ajout/modification, doublons, noms, location, loyer, référence, XLSX 12 fictifs/220000 DA, réimport, erreurs, persistance.`);
 }
 // Contrôle privé optionnel : lecture/simulation seulement ; aucun nom dans les logs ou captures.
 if(process.env.US015_REFERENCE_XLSX){
  const page=await browser.newPage();await page.route('**/*',r=>new URL(r.request().url()).origin==='http://127.0.0.1:4176'?r.continue():r.abort());await page.goto('http://127.0.0.1:4176');await page.getByText('Référentiel chargé.',{exact:true}).waitFor();
  const result=await page.evaluate(async bytes=>{const f=new File([Uint8Array.from(bytes)],'reference.xlsx');const parsed=await V2Import.read(f),rows=ReferentielV2.normalize(parsed.rows);const report=ReferentielV2.simulate(ReferentielV2.empty(),rows,'2026-11-16');let seq=0;const state=ReferentielV2.importRows(ReferentielV2.empty(),rows,{actor:'test@example.invalid',now:'2026-11-16T00:00:00Z',id:()=>`private-${++seq}`});if(state.baux.some(b=>b.arrivee!==null || b.depart!==null || b.cautionPrevue!==null))throw Error('Dates ou cautions inventées');return {lignes:rows.length,total:report.totalMensuel,etages:[...new Set(rows.map(r=>r.etage))]};},[...readFileSync(process.env.US015_REFERENCE_XLSX)]);
  assert.equal(result.lignes,12);assert.equal(result.total,220000);console.log('OK Excel définitif : 12 lignes, total 220000 DA, lecture privée locale uniquement.');await page.close();
 }
}finally{await browser?.close();server.kill();}
