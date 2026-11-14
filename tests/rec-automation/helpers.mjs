import {digest,contentHash,TARGET,policyFromEnv} from '../../scripts/rec-automation/validation.mjs';
export const SCRIPT='SCRIPT_REC_FICTIF_1234567890', SHEET='SHEET_REC_FICTIF_1234567890';
export const REC='rec@example.invalid',OWNER='owner@example.invalid';
export const policy=policyFromEnv({REC_SCRIPT_ID:SCRIPT,REC_SHEET_ID:SHEET,REC_GOOGLE_EMAIL:REC,REC_OWNER_EMAIL:OWNER},
  {...TARGET,scriptHash:digest(SCRIPT),sheetHash:digest(SHEET)});
export const clone=x=>JSON.parse(JSON.stringify(x));
export const manifest={timeZone:'Europe/Paris',runtimeVersion:'V8',webapp:{access:'MYSELF',executeAs:'USER_DEPLOYING'}};
export function candidate(source='function doGet(){ return 1; }') {
  const files=[{name:'Code',type:'SERVER_JS',source},{name:'ReferentielV2',type:'SERVER_JS',source:'var M = {};'},
    {name:'ReferentielV2Api',type:'SERVER_JS',source:'function v2Client(){}'},
    {name:'ParametrageV2',type:'HTML',source:'<!doctype html><p>Fictif</p>'},
    {name:'appsscript',type:'JSON',source:JSON.stringify(manifest)}];
  return {schema:1,sourceSha:'a'.repeat(40),files,contentHash:contentHash({files})};
}
export function deployment(version=1,id='DEPLOY_REC_FICTIF_1234567890') {
  return {deploymentId:id,deploymentConfig:{scriptId:SCRIPT,versionNumber:version,manifestFileName:'appsscript'},
    entryPoints:[{entryPointType:'WEB_APP',webApp:{url:'https://script.google.com/macros/s/DEPLOY_REC_FICTIF_1234567890/exec',entryPointConfig:{access:'MYSELF',executeAs:'USER_DEPLOYING'}}}]};
}
export function metadata(mime,owner=OWNER,privateOnly=false) {
  return {id:'FICTIF',mimeType:mime,trashed:false,capabilities:{canEdit:true},owners:[{emailAddress:owner}],
    permissions:privateOnly?[{type:'user',role:'owner',emailAddress:owner}]:[{type:'user',role:'owner',emailAddress:owner},{type:'user',role:'writer',emailAddress:REC}]};
}
export function setup({head=candidate('function doGet(){ return 0; }'),deployments=[],hooks={}}={}) {
  let content={files:clone(head.files)}, ds=clone(deployments), version=10;
  const versions=new Map(),records=new Map(),calls=[],writes=[];
  const mark=(name,args)=>{calls.push({name,args:clone(args || null)});hooks[name]?.();};
  const api={
    async identity(){mark('identity');return {email:REC,email_verified:true,sub:'fictif-google-user'};},
    async project(){mark('project');return {scriptId:SCRIPT,title:TARGET.title};},
    async fileMetadata(id){mark('fileMetadata',id);return metadata(id===SCRIPT?'application/vnd.google-apps.script':'application/vnd.google-apps.spreadsheet');},
    async getContent(v){mark('getContent',v);return {scriptId:SCRIPT,...clone(v?versions.get(v):content)};},
    async deployments(){mark('deployments');return clone(ds);},
    async updateContent(c){mark('updateContent',c);content=clone(c);writes.push('content');hooks.afterContent?.();return {scriptId:SCRIPT,...clone(content)};},
    async createVersion(description){mark('createVersion',description);const n=++version;versions.set(n,clone(content));writes.push('version');hooks.afterVersion?.();return {scriptId:SCRIPT,versionNumber:n};},
    async createDeployment(v){mark('createDeployment',v);const d=deployment(v);ds.push(d);writes.push('deployment');hooks.afterDeployment?.();return clone(d);},
    async updateDeployment(id,v){mark('updateDeployment',{id,v});const d=deployment(v,id);ds=ds.filter(x=>x.deploymentId!==id);ds.push(d);writes.push('deployment');hooks.afterDeployment?.();return clone(d);}
  };
  let seq=0;
  const store={
    async read(kind,tag){mark('readRecord',{kind,tag});const value=records.get(kind+':'+tag);return value?{id:kind+':'+tag,value:clone(value)}:null;},
    async pending(){mark('pending');return [...records.entries()].filter(([k,v])=>k.startsWith('operation:') && v.status==='pending').map(([id,value])=>({id,value:clone(value)}));},
    async create(kind,tag,value){mark('createRecord',{kind,tag});if(records.has(kind+':'+tag))throw Error('DUPLICATE');records.set(kind+':'+tag,clone(value));hooks.afterRecord?.(kind,value);return {id:kind+':'+tag,value:clone(value)};},
    async update(record,value){mark('updateRecord');records.set(record.id,clone(value));hooks.afterRecordUpdate?.(value);return {id:record.id,value:clone(value)};}
  };
  return {api,store,calls,writes,records,versions,uuid:()=>`backup-fictif-${++seq}`,now:()=> '2026-11-14T12:00:00Z',
    headHash:()=>contentHash(content),setContent:x=>{content=clone(x);},getContent:()=>clone(content),setDeployments:x=>{ds=clone(x);},getDeployments:()=>clone(ds)};
}
export function request(t,operation='install',extra={}) {
  return {operation,requestTag:'operation-fictif-001',expectedHeadHash:t.headHash(),auditConfirmed:true,candidate:candidate(),...extra};
}
