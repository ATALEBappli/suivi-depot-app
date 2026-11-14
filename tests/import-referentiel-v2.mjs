import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {runtime} from '../scripts/v2-local-runtime.mjs';
const dir=mkdtempSync(tmpdir()+'/us015-import-');
const parse=path=>{const r=spawnSync('python3',['scripts/read-referentiel.py',path],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);};
try {
 const nums=['05','06','09','10','11','12','15','16','18','19','20','21'];
 const rows=nums.map((num,i)=>({num,etage:i<6?'1er':i===11?'Toit':'2e',type:i%2?'F3':'F2',locataire:`Locataire fictif ${i+1}`,loyer:15000+i*100}));
 const csv=dir+'/source.csv';writeFileSync(csv,'Appartement;Étage;Type;Locataire;Loyer DA\n'+rows.map(r=>[r.num,r.etage,r.type,r.locataire,r.loyer].join(';')).join('\n'));
 const parsed=parse(csv);assert.equal(parsed[0].num,'05');assert.equal(parsed.length,12);
 const t=runtime(),m=t.model;let id=0;const ctx={actor:'fictif@example.invalid',now:'2026-11-14T12:00:00Z',id:()=>`id-${++id}`};
 const before=JSON.stringify(t.tables);const sim=m.simulate(m.empty(),parsed,'2026-11-14');assert.equal(sim.creations,12);assert.equal(sim.transactionsCreees,0);assert.equal(JSON.stringify(t.tables),before);
 const state=m.importRows(m.empty(),parsed,ctx);assert.equal(state.baux.length,12);assert.equal(state.loyers.length,12);assert.ok(state.baux.every(b=>b.arrivee===null && b.depart===null && b.suiviFinancierDepuis===null && b.cautionPrevue===null));
 assert.equal(m.simulate(state,parsed,'2026-11-14').identiques,12);assert.equal(m.importRows(state,parsed,ctx).historique.length,state.historique.length);
 console.log('OK 12 logements fictifs, CSV, zéros initiaux, simulation sans écriture, baux/loyers, réimport.');
 const xlsx=dir+'/source.xlsx';
 const builder=spawnSync('python3',['-c',`import zipfile,sys
from xml.sax.saxutils import escape
p=sys.argv[1]
ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main'
headers=['Appartement','Étage','Type','Locataire','Loyer DA']
row=['05','1er','F4','Locataire fictif XLSX','25000']
def cells(values,n):
 return '<row r="%s">'%n+''.join('<c r="%s%s" t="inlineStr"><is><t>%s</t></is></c>'%(chr(65+i),n,escape(v)) for i,v in enumerate(values))+'</row>'
with zipfile.ZipFile(p,'w') as z:
 z.writestr('xl/workbook.xml','<workbook xmlns="'+ns+'" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Fictif" sheetId="1" r:id="rId1"/></sheets></workbook>')
 z.writestr('xl/_rels/workbook.xml.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>')
 z.writestr('xl/worksheets/sheet1.xml','<worksheet xmlns="'+ns+'"><sheetData>'+cells(headers,1)+cells(row,2)+'</sheetData></worksheet>')
`,xlsx],{encoding:'utf8'});assert.equal(builder.status,0,builder.stderr);
 assert.equal(parse(xlsx)[0].num,'05');
 const edit=code=>{const p=spawnSync('python3',['-c',`import zipfile,sys
p=sys.argv[1]
with zipfile.ZipFile(p) as z: files={n:z.read(n) for n in z.namelist()}
${code}
with zipfile.ZipFile(p,'w') as z:
 for n,c in files.items(): z.writestr(n,c)
`,xlsx],{encoding:'utf8'});assert.equal(p.status,0,p.stderr);};
 edit(`files['xl/worksheets/sheet1.xml']=files['xl/worksheets/sheet1.xml'].replace(b'<c r="A2" t="inlineStr"><is><t>05</t></is></c>',b'<c r="A2"><v>5</v></c>')`);
 assert.equal(spawnSync('python3',['scripts/read-referentiel.py',xlsx]).status,1);
 edit(`files['xl/styles.xml']=b'<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="00"/></numFmts><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="164"/></cellXfs></styleSheet>'
files['xl/worksheets/sheet1.xml']=files['xl/worksheets/sheet1.xml'].replace(b'<c r="A2">',b'<c r="A2" s="1">')`);
 assert.equal(parse(xlsx)[0].num,'05');
 edit(`files['xl/worksheets/sheet1.xml']=files['xl/worksheets/sheet1.xml'].replace(b'<v>5</v>',b'<f>1+4</f><v>5</v>')`);
 assert.equal(spawnSync('python3',['scripts/read-referentiel.py',xlsx]).status,1);
 console.log('OK XLSX texte, refus numéro numérique ambigu, format 00 et refus des formules.');
 const formula=dir+'/formula.csv';writeFileSync(formula,'Appartement;Étage;Type;Locataire;Loyer DA\n05;1er;F4;=CMD;25000');assert.throws(()=>m.normalize(parse(formula)));
 const unsafe=spawnSync(process.execPath,['scripts/prepare-referentiel-v2.mjs',csv,'/tmp/unsafe-output'],{encoding:'utf8'});assert.notEqual(unsafe.status,0);
 console.log('OK protection formules et sorties privées hors Git.');
}finally{rmSync(dir,{recursive:true,force:true});}
