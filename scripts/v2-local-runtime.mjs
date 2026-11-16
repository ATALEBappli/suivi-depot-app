// Exécute les vrais handlers Apps Script avec services Google simulés en mémoire.
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
export function runtime({properties={}, data, failAppend, afterAppend}={}) {
  const tables=data || JSON.parse(readFileSync('fixtures/rec/sheets.json','utf8'));
  const props={APP_ENV:'REC',SPREADSHEET_ID:'MOCK_REC',REC_SPREADSHEET_ID:'MOCK_REC',REFERENTIEL_V2:'1',V2_ADMIN_EMAIL:'admin@example.invalid',...properties};
  const writes=[];let uuid=0,locked=false,actor='admin@example.invalid';
  const sheet=name=>({
    getLastRow:()=>tables[name].length,getLastColumn:()=>Math.max(0,...tables[name].map(r=>r.length)),
    getDataRange:()=>({getValues:()=>structuredClone(tables[name])}),
    getRange:(r,c,n,w)=>({getValues:()=>structuredClone(tables[name].slice(r-1,r-1+n).map(row=>row.slice(c-1,c-1+w))),setValues(values){writes.push(name);values.forEach((row,i)=>{tables[name][r-1+i]=[...row];});}}),
    appendRow(row){if(failAppend?.(name,row))throw Error('MOCK_FAILURE');writes.push(name);tables[name].push(structuredClone(row));afterAppend?.(name,row);}
  });
  const book={getId:()=>props.REC_SPREADSHEET_ID,getSheetByName:name=>tables[name]?sheet(name):null,
    insertSheet(name){if(tables[name])throw Error('EXISTS');writes.push('create:'+name);tables[name]=[];return sheet(name);}};
  const api=vm.createContext({console,PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]})},
    SpreadsheetApp:{openById:()=>book},Session:{getActiveUser:()=>({getEmail:()=>actor})},
    Utilities:{DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(algorithm,source)=>[...createHash(algorithm).update(source).digest()],base64EncodeWebSafe:bytes=>Buffer.from(bytes).toString('base64').replaceAll('+','-').replaceAll('/','_'),formatDate:d=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Paris'}).format(d),getUuid:()=>`uuid-${++uuid}`},LockService:{getScriptLock:()=>({waitLock(){if(locked)throw Error('LOCKED');locked=true;},releaseLock(){locked=false;}})},
    HtmlService:{createHtmlOutputFromFile:file=>({htmlFile:file,setTitle(title){this.title=title;return this;}})},
    ContentService:{MimeType:{JSON:'json',JAVASCRIPT:'js',TEXT:'text'},createTextOutput:text=>({text,setMimeType(){return this;}})}});
  for(const file of ['ReferentielV2.gs','ReferentielV2Api.gs','Code.gs'])vm.runInContext(readFileSync('apps-script/src/'+file,'utf8'),api,{filename:file});
  const get=params=>JSON.parse(api.doGet({parameter:params}).text);
  const post=body=>JSON.parse(api.doPost({postData:{contents:JSON.stringify(body)}}).text);
  return {api,get,post,tables,writes,props,setActor(value){actor=value;},model:vm.runInContext('ReferentielV2',api)};
}
