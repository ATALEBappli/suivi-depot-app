/* Lecture locale uniquement : aucun téléversement, aucune dépendance distante. */
var V2Import = (() => {
  'use strict';
  const fail=message=>{throw Error(message);};
  const key=x=>String(x).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/\s+/g,' ');
  const aliases={appartement:'num',numero:'num',num:'num','n° appartement':'num',etage:'etage',type:'type',locataire:'locataire','loyer da':'loyer','loyer mensuel (da)':'loyer',loyer:'loyer','statut information':'_info',commentaire:'_comment'};
  function matrix(input) {
    const required=['num','type','etage','locataire','loyer'];
    const candidates=input.map((row,index)=>({row,index,headers:row.map(h=>aliases[key(h)])})).filter(r=>required.every(k=>r.headers.filter(h=>h===k).length===1));
    if(candidates.length!==1)fail('Une ligne unique de colonnes est requise : Appartement, Étage, Type, Locataire, Loyer DA.');
    const {index:start,headers}=candidates[0];if(start>20)fail('En-tête trop éloigné du début du fichier.');
    if(input[start].formulas?.length)fail('Formule dans les en-têtes refusée.');
    if(input.slice(0,start).some(r=>r.formulas?.length))fail('Formule dans les titres refusée.');
    const result=[];let ignored=input.slice(0,start).filter(r=>r.some(v=>String(v).trim())).length,metadata=false;
    for(let i=start+1;i<input.length;i++) {
      const r=input[i];if(!r.some(v=>String(v).trim()))continue;
      const num=String(r[headers.indexOf('num')] || '').trim(),tenant=String(r[headers.indexOf('locataire')] || '').trim();
      const isTotal=!num && !tenant && !String(r[headers.indexOf('type')] || '').trim() &&
        r.some(v=>/^total des loyers mensuels$/i.test(String(v).trim()));
      if(isTotal) {
        if(r.some((v,j)=>String(v).trim() && j!==headers.indexOf('etage') && j!==headers.indexOf('loyer')))fail('Ligne total ambiguë.');
        if((r.formulas || []).some(f=>f.col!==headers.indexOf('loyer') || !/^SUM\([A-Z]+\d+:[A-Z]+\d+\)$/i.test(f.source)))fail('Formule de total inattendue.');
        ignored++;continue;
      }
      if(r.formulas?.length)fail('Formule Excel refusée. Remplacer par des valeurs.');
      if(r.some((v,j)=>String(v).trim() && !headers[j]))fail('Colonne supplémentaire renseignée, ligne '+(i+1)+'. Aucun champ ne sera ignoré silencieusement.');
      if(r.some((v,j)=>String(v).trim() && ['_info','_comment'].includes(headers[j])))metadata=true;
      const out=Object.fromEntries(required.map(k=>[k,String(r[headers.indexOf(k)] ?? '')]));
      out.loyer=out.loyer.trim().replace(/\s/g,'').replace(',','.');result.push(out);
    }
    if(!result.length || result.length>5000)fail('Le fichier doit contenir entre 1 et 5 000 logements.');
    result.ignoredSourceRows=ignored;result.metadataExcluded=metadata;return result;
  }
  function csv(text) {
    text=text.replace(/^\uFEFF/,'');const sample=text.split(/\r?\n/).slice(0,21);
    const score=sep=>Math.max(...sample.map(line=>line.split(sep).length));
    const separator=[';','\t',','].sort((a,b)=>score(b)-score(a))[0];
    const rows=[];let row=[],value='',quoted=false,closed=false;
    for(let i=0;i<text.length;i++) {
      const c=text[i];
      if(quoted){if(c==='"'){if(text[i+1]==='"'){value+='"';i++;}else{quoted=false;closed=true;}}else value+=c;continue;}
      if(c==='"'){if(value || closed)fail('CSV : guillemet inattendu.');quoted=true;continue;}
      if(c===separator || c==='\n' || c==='\r'){
        row.push(value);value='';closed=false;
        if(c!==separator){if(c==='\r' && text[i+1]==='\n')i++;rows.push(row);row=[];}
      }else {if(closed)fail('CSV : caractères après guillemet.');value+=c;}
    }
    if(quoted)fail('CSV : guillemets non fermés.');if(value || row.length || closed){row.push(value);rows.push(row);}return matrix(rows);
  }
  async function unzip(buffer) {
    const bytes=new Uint8Array(buffer),v=new DataView(buffer),files=new Map();
    if(bytes.length<22)fail('XLSX invalide.');let end=-1;
    for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(v.getUint32(i,true)===0x06054b50){end=i;break;}
    if(end<0 || v.getUint16(end+4,true)!==0 || v.getUint16(end+6,true)!==0)fail('Archive XLSX non prise en charge.');
    const count=v.getUint16(end+10,true);if(count>300)fail('Trop de fichiers dans le XLSX.');
    let pos=v.getUint32(end+16,true),total=0;
    for(let i=0;i<count;i++) {
      if(pos+46>bytes.length || v.getUint32(pos,true)!==0x02014b50)fail('Index XLSX invalide.');
      const flags=v.getUint16(pos+8,true),method=v.getUint16(pos+10,true),size=v.getUint32(pos+20,true),plain=v.getUint32(pos+24,true);
      const len=v.getUint16(pos+28,true),extra=v.getUint16(pos+30,true),comment=v.getUint16(pos+32,true),offset=v.getUint32(pos+42,true);
      const name=new TextDecoder().decode(bytes.slice(pos+46,pos+46+len));pos+=46+len+extra+comment;
      if(flags&1 || plain>8000000 || (total+=plain)>20000000 || files.has(name))fail('Archive XLSX chiffrée, trop volumineuse ou ambiguë.');
      if(!name.startsWith('xl/') || !name.endsWith('.xml') && !name.endsWith('.rels'))continue;
      if(offset+30>bytes.length || v.getUint32(offset,true)!==0x04034b50)fail('Entrée XLSX invalide.');
      const start=offset+30+v.getUint16(offset+26,true)+v.getUint16(offset+28,true);
      if(start+size>bytes.length)fail('Entrée XLSX tronquée.');
      let data=bytes.slice(start,start+size);
      if(method===8) {
        if(typeof DecompressionStream==='undefined')fail('Ce navigateur ne peut pas lire XLSX. Exporter en CSV UTF-8.');
        let stream;try{stream=new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));}catch{fail('Lecture XLSX indisponible : exporter en CSV UTF-8.');}
        const chunks=[],reader=stream.getReader();let n=0;
        while(true){const r=await reader.read();if(r.done)break;n+=r.value.length;if(n>plain || n>8000000){await reader.cancel();fail('Décompression excessive.');}chunks.push(r.value);}
        data=new Uint8Array(n);let at=0;for(const c of chunks){data.set(c,at);at+=c.length;}
      }else if(method!==0)fail('Compression XLSX non prise en charge.');
      if(data.length!==plain)fail('Taille XLSX incohérente.');files.set(name,new TextDecoder('utf-8',{fatal:true}).decode(data));
    }
    return files;
  }
  function xml(text) {
    if(!text || /<!DOCTYPE|<!ENTITY/i.test(text))fail('XML XLSX invalide.');
    const d=new DOMParser().parseFromString(text,'application/xml');if(d.getElementsByTagName('parsererror').length)fail('XML XLSX illisible.');return d;
  }
  const tags=(node,name)=>Array.from(node.getElementsByTagNameNS('*',name));
  function workbook(files) {
    const sheet=tags(xml(files.get('xl/workbook.xml')),'sheet')[0];if(!sheet)fail('Classeur sans feuille.');
    const rid=sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id');
    const rels=tags(xml(files.get('xl/_rels/workbook.xml.rels')),'Relationship').filter(r=>r.getAttribute('Id')===rid);
    if(rels.length!==1 || rels[0].getAttribute('TargetMode')==='External')fail('Feuille XLSX ambiguë.');
    let path=rels[0].getAttribute('Target');path=path.startsWith('/')?path.slice(1):'xl/'+path;
    if(path.includes('..') || !path.startsWith('xl/worksheets/'))fail('Chemin de feuille XLSX refusé.');
    const shared=files.has('xl/sharedStrings.xml')?tags(xml(files.get('xl/sharedStrings.xml')),'si').map(si=>tags(si,'t').map(t=>t.textContent).join('')):[];
    const rows=tags(xml(files.get(path)),'row').map(row=>{
      const values=[],formulas=[];
      for(const cell of tags(row,'c')) {
        const ref=cell.getAttribute('r')?.match(/^([A-Z]+)\d+$/);if(!ref)fail('Adresse de cellule invalide.');
        let index=0;for(const c of ref[1])index=index*26+c.charCodeAt(0)-64;if(index>100)fail('Trop de colonnes.');
        for(const f of tags(cell,'f'))formulas.push({col:index-1,source:f.textContent});
        const kind=cell.getAttribute('t'),raw=tags(cell,'v')[0]?.textContent || '';
        if(['b','e'].includes(kind))fail('Cellule booléenne ou erreur refusée.');
        let value=kind==='s'?shared[Number(raw)]:kind==='inlineStr'?tags(cell,'t').map(t=>t.textContent).join(''):raw;
        if(value===undefined)fail('Texte partagé manquant.');values[index-1]=value;
      }
      const result=Array.from({length:values.length},(_,i)=>values[i] || '');result.formulas=formulas;return result;
    });
    const data=matrix(rows);return {rows:data,sheetName:sheet.getAttribute('name'),ignoredSourceRows:data.ignoredSourceRows,metadataExcluded:data.metadataExcluded};
  }
  async function read(file) {
    if(file.size>5000000)fail('Fichier limité à 5 Mo.');
    const extension=file.name.split('.').at(-1).toLowerCase();
    if(extension==='xlsx')return workbook(await unzip(await file.arrayBuffer()));
    const text=await file.text();if(extension==='csv'){const rows=csv(text);return {rows,sheetName:null,ignoredSourceRows:rows.ignoredSourceRows,metadataExcluded:rows.metadataExcluded};}
    if(extension==='json')return {rows:JSON.parse(text.replace(/^\uFEFF/,'')),sheetName:null};
    fail('Choisir un fichier .xlsx, .csv ou .json.');
  }
  return {read,csv,matrix,workbook};
})();
