import {Refusal,requireThat,isTag,isHash,checkFile,canonical,digest,rememberDeploymentProject} from './validation.mjs';

export const SCOPES=Object.freeze([
  'openid','https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/script.projects',
  'https://www.googleapis.com/auth/script.deployments',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
  'https://www.googleapis.com/auth/drive.file'
]);
const META='id,mimeType,trashed,driveId,owners(emailAddress),permissions(type,role,emailAddress),capabilities(canEdit),appProperties';

// Endpoints fixes, pas de retries automatiques ni de suivi de redirections OAuth.
export class Google {
  constructor({policy,fetcher=fetch,mask=()=>{}}) {this.policy=policy;this.fetcher=fetcher;this.mask=mask;this.token=null;this.expiresAt=0;}
  async authenticate(credentials) {
    requireThat(credentials && ['client_id','client_secret','refresh_token'].every(k=>typeof credentials[k]==='string' && credentials[k].length>0),'MISSING_OAUTH_CREDENTIALS');
    for(const k of ['client_id','client_secret','refresh_token'])this.mask(credentials[k]);
    let response;
    try {response=await this.fetcher('https://oauth2.googleapis.com/token',{
      method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),
      headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({client_id:credentials.client_id,client_secret:credentials.client_secret,
        refresh_token:credentials.refresh_token,grant_type:'refresh_token'})
    });}catch{throw new Refusal('OAUTH_CONNECTION_FAILED');}
    let data;try{data=await response.json();}catch{throw new Refusal('INVALID_OAUTH_RESPONSE');}
    requireThat(response.ok && typeof data.access_token==='string' && data.token_type?.toLowerCase()==='bearer','OAUTH_REFRESH_FAILED');
    this.mask(data.access_token);if(data.id_token)this.mask(data.id_token);
    requireThat(Number.isFinite(data.expires_in) && data.expires_in>=300,'OAUTH_TOKEN_TOO_SHORT');
    // scope est facultatif dans une réponse OAuth. Les API vérifient ensuite les
    // droits effectifs ; s'il est fourni, vérifier les portées de gestion/Drive.
    if(data.scope) {
      const scopes=new Set(data.scope.split(' '));
      for(const scope of SCOPES.filter(s=>s!=='openid' && !s.endsWith('userinfo.email')))requireThat(scopes.has(scope),'MISSING_OAUTH_SCOPE');
    }
    this.token=data.access_token;this.expiresAt=Date.now()+data.expires_in*1000;
  }
  async request(method,url,body,headers={}) {
    requireThat(this.token && Date.now()+60000<this.expiresAt,'OAUTH_TOKEN_EXPIRED');
    const parsed=new URL(url);
    requireThat(parsed.protocol==='https:' && !parsed.port && !parsed.username && !parsed.password && !parsed.hash &&
      ['script.googleapis.com','www.googleapis.com','openidconnect.googleapis.com'].includes(parsed.hostname),'UNEXPECTED_GOOGLE_HOST');
    let response;
    try {response=await this.fetcher(url,{method,redirect:'error',signal:AbortSignal.timeout(30000),
      headers:{Authorization:'Bearer '+this.token,...(body!==undefined?{'Content-Type':'application/json'}:{}),...headers},
      body:body===undefined?undefined:typeof body==='string'?body:JSON.stringify(body)});
    }catch{throw new Refusal(method==='GET'?'GOOGLE_READ_INTERRUPTED':'GOOGLE_WRITE_UNCERTAIN',method!=='GET');}
    if(!response.ok)throw new Refusal(method==='GET'?'GOOGLE_READ_FAILED':'GOOGLE_WRITE_FAILED',method!=='GET');
    try {return await response.json();}catch{throw new Refusal(method==='GET'?'INVALID_GOOGLE_RESPONSE':'GOOGLE_WRITE_UNCERTAIN',method!=='GET');}
  }
  identity(){return this.request('GET','https://openidconnect.googleapis.com/v1/userinfo');}
  project(){return this.request('GET',this.projectUrl());}
  projectUrl(){return 'https://script.googleapis.com/v1/projects/'+encodeURIComponent(this.policy.scriptId);}
  getContent(version) {
    requireThat(version===undefined || (Number.isInteger(version) && version>0),'INVALID_VERSION');
    return this.request('GET',this.projectUrl()+'/content'+(version===undefined?'':'?versionNumber='+version));
  }
  updateContent(content){return this.request('PUT',this.projectUrl()+'/content',content);}
  createVersion(description){return this.request('POST',this.projectUrl()+'/versions',{description});}
  async deployments() {
    const all=[];let token;
    for(let page=0;page<5;page++) {
      const q=new URLSearchParams({pageSize:'50'});if(token)q.set('pageToken',token);
      const data=await this.request('GET',this.projectUrl()+'/deployments?'+q);
      requireThat(!data.deployments || Array.isArray(data.deployments),'INVALID_DEPLOYMENTS');all.push(...(data.deployments || []).map(d=>rememberDeploymentProject(d,this.policy.scriptId)));
      if(!data.nextPageToken)return all;token=data.nextPageToken;
    }
    throw new Refusal('TOO_MANY_DEPLOYMENTS');
  }
  createDeployment(version,description){return this.request('POST',this.projectUrl()+'/deployments',{versionNumber:version,manifestFileName:'appsscript',description});}
  updateDeployment(id,version,description) {
    requireThat(this.policy.deploymentId && id===this.policy.deploymentId,'UNEXPECTED_DEPLOYMENT_ID');
    return this.updateKnownDeployment(id,version,description);
  }
  async updateKnownDeployment(id,version,description) {
    requireThat(this.policy.deploymentId && id===this.policy.deploymentId,'UNEXPECTED_DEPLOYMENT_ID');
    const result=await this.request('PUT',this.projectUrl()+'/deployments/'+encodeURIComponent(id),{deploymentConfig:{scriptId:this.policy.scriptId,versionNumber:version,manifestFileName:'appsscript',description}});
    if(result?.deploymentId!==id)throw new Refusal('UNEXPECTED_DEPLOYMENT_ID',true);
    return rememberDeploymentProject(result,this.policy.scriptId);
  }
  fileMetadata(id) {
    requireThat(id===this.policy.scriptId || id===this.policy.sheetId,'UNEXPECTED_METADATA_TARGET');
    return this.request('GET','https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(id)+'?fields='+encodeURIComponent(META));
  }
}

export class PrivateDrive {
  constructor(api) {this.api=api;this.policy=api.policy;}
  checkMetadata(meta,kind,tag) {
    checkFile(meta,{owner:this.policy.email,allowed:[this.policy.email],mime:'application/json',privateOnly:true});
    requireThat(meta.appProperties?.recTarget===this.policy.pins.scriptHash && meta.appProperties.recKind===kind && meta.appProperties.recTag===tag,'INVALID_PRIVATE_RECORD');
  }
  async locate(kind,tag,{pending=false}={}) {
    requireThat(['backup','operation'].includes(kind) && (pending || isTag(tag)),'INVALID_PRIVATE_REFERENCE');
    const clauses=["trashed = false",`appProperties has { key='recTarget' and value='${this.policy.pins.scriptHash}' }`,
      `appProperties has { key='recKind' and value='${kind}' }`];
    clauses.push(pending?"appProperties has { key='recState' and value='pending' }":`appProperties has { key='recTag' and value='${tag}' }`);
    const q=new URLSearchParams({q:clauses.join(' and '),pageSize:pending?'100':'2',fields:`nextPageToken,files(${META})`});
    const data=await this.api.request('GET','https://www.googleapis.com/drive/v3/files?'+q);
    requireThat(Array.isArray(data.files) && !data.nextPageToken && (pending || data.files.length<=1),'AMBIGUOUS_PRIVATE_RECORD');
    return data.files;
  }
  async readFile(meta,kind,tag) {
    this.checkMetadata(meta,kind,tag);
    const value=await this.api.request('GET','https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(meta.id)+'?alt=media');
    requireThat(value?.schema===1 && isTag(tag) && value.kind===kind && value.tag===tag && value.targetHash===this.policy.pins.scriptHash && value.account===this.policy.email,'INVALID_PRIVATE_RECORD');
    if(kind==='operation')requireThat(value.status===meta.appProperties.recState && ['pending','done'].includes(value.status) && isTag(value.checkpoint?.tag) && isHash(value.checkpoint?.hash) && isHash(value.intentHash),'INVALID_OPERATION_STATE');
    return {id:meta.id,value};
  }
  async read(kind,tag) {const files=await this.locate(kind,tag);return files.length?this.readFile(files[0],kind,tag):null;}
  async pending() {
    const files=await this.locate('operation','',{pending:true});
    const records=[];for(const meta of files)records.push(await this.readFile(meta,'operation',meta.appProperties.recTag));
    return records;
  }
  async write(method,id,kind,tag,value) {
    requireThat(['backup','operation'].includes(kind) && isTag(tag) && value.kind===kind && value.tag===tag,'INVALID_PRIVATE_RECORD');
    requireThat(value.schema===1 && value.targetHash===this.policy.pins.scriptHash && value.account===this.policy.email,'INVALID_PRIVATE_RECORD');
    const metadata={name:`REC-${kind}-${tag}.json`,mimeType:'application/json',appProperties:{
      recTarget:this.policy.pins.scriptHash,recKind:kind,recTag:tag,recState:kind==='operation'?value.status:'saved'}};
    if(method==='POST')metadata.parents=['root'];
    const boundary='rec_'+digest(value).slice(0,24);
    const body=`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${canonical(value)}\r\n--${boundary}--\r\n`;
    const url='https://www.googleapis.com/upload/drive/v3/files'+(id?'/'+encodeURIComponent(id):'')+'?uploadType=multipart&fields='+encodeURIComponent(META);
    const result=await this.api.request(method,url,body,{'Content-Type':'multipart/related; boundary='+boundary});
    this.checkMetadata(result,kind,tag);
    const reread=await this.readFile(result,kind,tag);
    requireThat(digest(reread.value)===digest(value),'PRIVATE_WRITE_VERIFICATION_FAILED');
    return reread;
  }
  async create(kind,tag,value) {
    requireThat(!await this.read(kind,tag),'PRIVATE_REFERENCE_ALREADY_EXISTS');
    return this.write('POST',null,kind,tag,value);
  }
  async update(record,value) {
    requireThat(record?.id && record.value?.kind==='operation' && value.kind==='operation' && value.tag===record.value.tag,'INVALID_OPERATION_UPDATE');
    const current=await this.read('operation',record.value.tag);
    requireThat(current && current.id===record.id && digest(current.value)===digest(record.value),'OPERATION_CHANGED');
    return this.write('PATCH',record.id,'operation',value.tag,value);
  }
}
