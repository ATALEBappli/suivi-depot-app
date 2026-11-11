// Services Google exclusivement simulés : aucun réseau, aucun identifiant réel.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync('apps-script/src/Code.gs','utf8');
const fixtures=JSON.parse(readFileSync('fixtures/rec/sheets.json','utf8'));
const manifest=JSON.parse(readFileSync('apps-script/src/appsscript.json','utf8'));
assert.equal(manifest.webapp.access,'MYSELF');
function setup(properties={}, mutate=()=>{}) {
  const data=structuredClone(fixtures), writes=[], opens=[];
  mutate(data);
  const props={APP_ENV:'REC',SPREADSHEET_ID:'MOCK_REC',REC_SPREADSHEET_ID:'MOCK_REC',...properties};
  const sheets=Object.fromEntries(Object.entries(data).map(([name,rows])=>[name,{
    getLastRow:()=>rows.length, getLastColumn:()=>Math.max(0,...rows.map(r=>r.length)),
    getDataRange:()=>({getValues:()=>structuredClone(rows)}),
    getRange:(r,c,n,w)=>({getValues:()=>rows.slice(r-1,r-1+n).map(row=>row.slice(c-1,c-1+w)),setValues(values){
      assert.equal(values.length,n); values.forEach(row=>assert.equal(row.length,w));
      writes.push('setValues');values.forEach((row,i)=>{rows[r-1+i]=[...row];});
    }}),
    appendRow(row){assert.equal(row.length,11);writes.push('appendRow');rows.push([...row]);}
  }]));
  const book={getId:()=> 'MOCK_REC',getSheetByName:name=>sheets[name]};
  const api=vm.createContext({PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]})},
    SpreadsheetApp:{openById(id){opens.push(id);return book;}},
    ContentService:{MimeType:{JSON:'json',JAVASCRIPT:'js',TEXT:'text'},createTextOutput:text=>({text,setMimeType(mime){this.mime=mime;return this;}})}});
  vm.runInContext(source,api);
  const get=p=>api.doGet({parameter:p});
  const post=b=>api.doPost({postData:{contents:JSON.stringify(b)}});
  return {api,get,post,data,writes,opens,book,sheets};
}
const json=o=>JSON.parse(o.text);
let count=0;
function test(name,fn){fn();count++;console.log('OK',name);}
const transaction={type:'Entrée',date:'2026-02-28',montant:0,description:'REC fictif'};
test('lectures et ping sans mutations',()=>{const t=setup(); const before=JSON.stringify(t.data);assert.equal(t.get({ping:'1'}).text,'pong');assert.equal(t.opens.length,0);assert.equal(json(t.get({})).rows.length,4);assert.equal(json(t.get({action:'config',what:'all'})).config.hedam.length,1);assert.equal(JSON.stringify(t.data),before);assert.deepEqual(t.writes,[]);});
for(const props of [{APP_ENV:''},{APP_ENV:'PROD'},{SPREADSHEET_ID:null},{SPREADSHEET_ID:''},{SPREADSHEET_ID:' OTHER'},{REC_SPREADSHEET_ID:'OTHER'}])test('configuration refusée '+JSON.stringify(props),()=>{const t=setup(props);assert.equal(json(t.get({})).ok,false);assert.equal(json(t.post(transaction)).ok,false);assert.equal(t.opens.length,0);assert.equal(t.writes.length,0);});
test('identité réelle du classeur contrôlée',()=>{const t=setup();t.book.getId=()=> 'OTHER';assert.equal(json(t.get({})).ok,false);assert.equal(t.writes.length,0);});
for(const name of Object.keys(fixtures))for(const defect of ['missing','empty','order','extra','duplicate'])test(name+' '+defect,()=>{const t=setup({},d=>{if(defect==='missing')delete d[name];else if(defect==='empty')d[name]=[];else if(defect==='order')d[name][0].reverse();else if(defect==='extra')d[name][0].push('extra');else d[name][0][1]=d[name][0][0];});assert.equal(json(t.get({})).ok,false);assert.equal(json(t.post(transaction)).ok,false);assert.equal(t.writes.length,0);});
test('ajout POST et GET : ordre, zéros, dates et accents',()=>{const t=setup();assert.equal(json(t.post(transaction)).ok,true);assert.equal(json(t.get({...transaction,montant:'12.50',action:'add'})).ok,true);assert.deepEqual(t.data.transactions.at(-2),['Entrée','2026-02-28',0,'','REC fictif','','','','','','']);assert.equal(t.data.transactions.at(-1)[2],12.5);assert.equal(t.writes.length,2);});
const invalid=[null,[],{}, {...transaction,montant:null}, {...transaction,montant:''}, {...transaction,montant:true}, {...transaction,montant:'NaN'}, {...transaction,montant:'1e3'}, {...transaction,montant:-1}, {...transaction,montant:0.001}, {...transaction,montant:1e10}, {...transaction,date:'2026-02-30'}, {...transaction,date:'28/02/2026'}, {...transaction,date:null}, {...transaction,type:''}, {...transaction,description:null}, {...transaction,description:{}}, {...transaction,extra:'x'}];
for(const [i,value] of invalid.entries())test('entrée invalide '+i,()=>{const t=setup();assert.equal(json(t.post(value)).ok,false);assert.equal(t.writes.length,0);});
for(const value of ['=SUM(1,2)',' +cmd','\t@x','-1','\n=1'])for(const field of ['description','locataire','personne'])test('formule '+field+JSON.stringify(value),()=>{const t=setup();assert.equal(json(t.post({...transaction,[field]:value})).ok,false);assert.equal(t.writes.length,0);});
test('JSON malformé et corps absent refusés',()=>{const t=setup();for(const e of [{},{postData:{contents:'{'}},{postData:{contents:'null'}}])assert.equal(json(t.api.doPost(e)).ok,false);assert.equal(t.writes.length,0);});
for(const [save,rows] of Object.entries({logements:[{num:'REC',type:'F2',locataire:'Fictif',loyer:0}],locaux:[{code:'REC',nom:'Fictif',locataire:'',loyer:'12.50'}],hedam:[{code:'REC',nom:'Maçon'}]})){
 test('configuration '+save+' validation complète avant écriture',()=>{const t=setup();const original=JSON.stringify(t.data);const call=payload=>json(t.get({action:'config',save,payload:encodeURIComponent(JSON.stringify(payload))}));for(const bad of [null,{},[...rows,{...rows[0],nom:'=1'}],[...rows,...rows]]){assert.equal(call(bad).ok,false);assert.equal(JSON.stringify(t.data),original);}assert.equal(call(rows).ok,true);assert.equal(t.writes.length,1);assert.equal(call([]).ok,true);assert.equal(t.data['config_'+save][1].join(''),'');});
 test('payload absent '+save,()=>{const t=setup();assert.equal(json(t.get({action:'config',save})).ok,false);assert.equal(t.writes.length,0);});
}
test('JSONP strict et debug sans écho',()=>{const t=setup();assert.ok(t.get({callback:'cb_1'}).text.startsWith('cb_1({'));assert.equal(json(t.get({callback:'cb!'})).error,'INVALID_CALLBACK');assert.equal(json(t.get({action:'config',debug:'1',secret:'PRIVATE'})).error,'DEBUG_DISABLED');});
test('erreurs sensibles masquées',()=>{const t=setup();t.book.getSheetByName=()=>{throw new Error('PRIVATE_ID_TOKEN');};for(const out of [t.get({}),t.post(transaction),t.get({...transaction,action:'add'}),t.get({action:'config',what:'all'})]){assert.equal(json(out).ok,false);assert.ok(!out.text.includes('PRIVATE'));}});

test('calendrier bissextile, limites et dates impossibles',()=>{const t=setup();assert.equal(json(t.post({...transaction,date:'2024-02-29',montant:1000000000})).ok,true);for(const date of ['2025-02-29','2026-13-01','2026-01-00','2026-04-31'])assert.equal(json(t.post({...transaction,date})).ok,false);assert.equal(t.writes.length,1);});
test('erreur pendant écriture masquée, aucun nouvel essai automatique',()=>{const t=setup();let attempts=0;t.sheets.transactions.appendRow=()=>{attempts++;throw new Error('PRIVATE_WRITE');};const out=t.post(transaction);assert.equal(json(out).ok,false);assert.ok(!out.text.includes('PRIVATE'));assert.equal(attempts,1);});
test('échec setValues ne vide pas préalablement la configuration',()=>{const t=setup();const before=JSON.stringify(t.data);let attempts=0;t.sheets.config_hedam.getRange=(r)=>r===1?{getValues:()=>[fixtures.config_hedam[0]]}:{setValues(){attempts++;throw new Error('PRIVATE_WRITE');}};assert.equal(json(t.get({action:'config',save:'hedam',payload:encodeURIComponent('[{"code":"REC","nom":"Fictif"}]')})).ok,false);assert.equal(attempts,1);assert.equal(JSON.stringify(t.data),before);});
// Bornes comptables observées : aucun changement des règles Mission 8.
for (const [label, amount, accepted] of [
  ['zéro', 0, true], ['centime', '0.01', true], ['centime sous plafond', '999999999.99', true],
  ['plafond inclus', '1000000000.00', true], ['centime au-dessus', '1000000000.01', false],
  ['négatif', '-0.01', false], ['trois décimales', '12.345', false],
  ['virgule française', '12,50', false], ['infini', Infinity, false], ['NaN', NaN, false]
]) test('bornes montant et loyers : '+label, () => {
  const t=setup();
  if (accepted) assert.equal(t.api._amount_(amount), Number(amount));
  else assert.throws(() => t.api._amount_(amount));
  assert.equal(json(t.post({...transaction,montant:amount})).ok,accepted);
  for(const [save, row] of [['logements',{num:'REC',type:'F2',locataire:'Fictif',loyer:amount}],
    ['locaux',{code:'REC',nom:'Fictif',locataire:'',loyer:amount}]]) {
    assert.equal(json(t.get({action:'config',save,payload:encodeURIComponent(JSON.stringify([row]))})).ok,accepted);
  }
  assert.equal(t.writes.length,accepted?3:0);
  if(accepted) assert.equal(t.data.transactions.at(-1)[2],Number(amount));
});
console.log(`Total final : ${count} scénarios backend réussis.`);
