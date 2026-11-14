import {createHash} from 'node:crypto';

// Empreintes des deux cibles REC confirmées par le propriétaire ; aucun ID en Git.
export const TARGET = Object.freeze({
  scriptHash:'78e98c211f7c0a055fd26ef132598d27e4e91d6fac2adacf9e3c71f7015d0d71',
  sheetHash:'defa8602371f49e0c1f118047af17a5c72c06f858d436884c3f1d902a98cce95',
  title:'SuiviDepotAPI-REC'
});
export class Refusal extends Error {
  constructor(code, uncertain=false) {super(code);this.name='Refusal';this.code=code;this.uncertain=uncertain;}
}
export function requireThat(value, code) {if(!value)throw new Refusal(code);}
export function canonical(value) {
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value && typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
  requireThat(value!==undefined && (typeof value!=='number' || Number.isFinite(value)),'INVALID_JSON');
  return JSON.stringify(value);
}
export const digest = value => createHash('sha256').update(typeof value==='string'?value:canonical(value)).digest('hex');
export const isHash = value => typeof value==='string' && /^[a-f0-9]{64}$/.test(value);
export const isSha = value => typeof value==='string' && /^[a-f0-9]{40}$/.test(value);
export const isTag = value => typeof value==='string' && /^[a-z0-9-]{8,100}$/.test(value);
const id = value => typeof value==='string' && /^[A-Za-z0-9_-]{20,200}$/.test(value);
const email = value => typeof value==='string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value===value.toLowerCase();

export function policyFromEnv(env, pins=TARGET) {
  const policy={scriptId:env.REC_SCRIPT_ID,sheetId:env.REC_SHEET_ID,email:env.REC_GOOGLE_EMAIL,
    ownerEmail:env.REC_OWNER_EMAIL,deploymentId:env.REC_DEPLOYMENT_ID || '',pins};
  requireThat(id(policy.scriptId) && digest(policy.scriptId)===pins.scriptHash,'WRONG_SCRIPT_TARGET');
  requireThat(id(policy.sheetId) && digest(policy.sheetId)===pins.sheetHash,'WRONG_SHEET_TARGET');
  requireThat(email(policy.email) && email(policy.ownerEmail),'INVALID_ACCOUNT_CONFIGURATION');
  requireThat(!policy.deploymentId || id(policy.deploymentId),'INVALID_DEPLOYMENT_CONFIGURATION');
  return Object.freeze({...policy,pins:Object.freeze({...pins})});
}

export function contentOf(response) {
  requireThat(response && Array.isArray(response.files) && response.files.length>0 && response.files.length<=100,'INVALID_CONTENT');
  const names=new Set();let bytes=0;
  const files=response.files.map(file=>{
    requireThat(file && typeof file.name==='string' && /^[A-Za-z0-9_/-]{1,150}$/.test(file.name) && !file.name.includes('..') && !names.has(file.name),'INVALID_FILE_NAME');
    requireThat(['SERVER_JS','HTML','JSON'].includes(file.type) && typeof file.source==='string','INVALID_FILE');
    names.add(file.name);bytes+=Buffer.byteLength(file.source);
    requireThat(Buffer.byteLength(file.source)<=500000 && !file.source.includes('\u0000'),'INVALID_FILE_SIZE');
    // Google peut normaliser les fins de ligne. Aucun autre blanc n'est neutralisé.
    return {name:file.name,type:file.type,source:file.source.replaceAll('\r\n','\n')};
  }).sort((a,b)=>a.name.localeCompare(b.name,'en'));
  requireThat(bytes<=2000000,'CONTENT_TOO_LARGE');
  requireThat(files.some(f=>f.name==='appsscript' && f.type==='JSON'),'MISSING_MANIFEST');
  let manifest;try{manifest=JSON.parse(files.find(f=>f.name==='appsscript').source);}catch{throw new Refusal('INVALID_MANIFEST');}
  requireThat(manifest && typeof manifest==='object' && !Array.isArray(manifest),'INVALID_MANIFEST');
  return {files,manifest};
}
export function contentHash(response) {return digest(contentOf(response).files);}
export function privateManifest(manifest, {baseline=false}={}) {
  requireThat(manifest.runtimeVersion==='V8' && !manifest.executionApi,'UNSAFE_MANIFEST');
  if(baseline && manifest.webapp===undefined)return;
  requireThat(manifest.webapp?.access==='MYSELF' && manifest.webapp?.executeAs==='USER_DEPLOYING','UNSAFE_MANIFEST');
  requireThat(Object.keys(manifest.webapp).every(k=>['access','executeAs'].includes(k)),'UNSAFE_MANIFEST');
}
export function candidateOf(candidate) {
  requireThat(candidate?.schema===1 && isSha(candidate.sourceSha),'INVALID_CANDIDATE');
  const result=contentOf(candidate);
  const expected={Code:'SERVER_JS',ReferentielV2:'SERVER_JS',ReferentielV2Api:'SERVER_JS',ParametrageV2:'HTML',appsscript:'JSON'};
  requireThat(result.files.length===5 && result.files.every(f=>expected[f.name]===f.type),'WRONG_BUNDLE');
  privateManifest(result.manifest);
  requireThat(candidate.contentHash===contentHash(result),'CANDIDATE_HASH_MISMATCH');
  return {...candidate,...result};
}

export function checkIdentity(identity, policy) {
  requireThat(identity?.email_verified===true && identity.email===policy.email && typeof identity.sub==='string' && identity.sub.length>0,'WRONG_GOOGLE_ACCOUNT');
}
export function checkFile(file, {owner, allowed, mime, editor, privateOnly=false}) {
  requireThat(file && !file.trashed && !file.driveId && file.mimeType===mime && file.capabilities?.canEdit===true,'INVALID_FILE_PERMISSIONS');
  requireThat(file.owners?.length===1 && file.owners[0].emailAddress===owner,'WRONG_RESOURCE_OWNER');
  requireThat(Array.isArray(file.permissions) && file.permissions.length>0,'PERMISSIONS_UNAVAILABLE');
  requireThat(file.permissions.every(p=>p.type==='user' && allowed.includes(p.emailAddress) && ['owner','writer'].includes(p.role)),'UNEXPECTED_SHARING');
  if(editor)requireThat(file.permissions.some(p=>p.emailAddress===editor && ['owner','writer'].includes(p.role)),'ACCOUNT_NOT_EDITOR');
  if(privateOnly)requireThat(file.permissions.length===1 && file.permissions[0].role==='owner' && file.permissions[0].emailAddress===owner,'BACKUP_NOT_PRIVATE');
}
export function checkDeployment(deployment, policy, expectedVersion) {
  requireThat(deployment?.deploymentConfig?.scriptId===policy.scriptId,'WRONG_DEPLOYMENT_TARGET');
  requireThat(Number.isInteger(deployment.deploymentConfig.versionNumber) && deployment.deploymentConfig.versionNumber>0,'INVALID_DEPLOYMENT_VERSION');
  if(expectedVersion!==undefined)requireThat(deployment.deploymentConfig.versionNumber===expectedVersion,'WRONG_DEPLOYMENT_VERSION');
  requireThat(typeof deployment.deploymentId==='string' && id(deployment.deploymentId),'INVALID_DEPLOYMENT_ID');
  requireThat(deployment.entryPoints?.length===1 && deployment.entryPoints[0].entryPointType==='WEB_APP','UNEXPECTED_ENTRY_POINTS');
  const web=deployment.entryPoints[0].webApp;
  requireThat(web?.entryPointConfig?.access==='MYSELF' && web.entryPointConfig.executeAs==='USER_DEPLOYING','PUBLIC_DEPLOYMENT_REFUSED');
  requireThat(typeof web.url==='string' && /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(web.url),'INVALID_WEB_APP_URL');
}
export function deploymentState(deployments, policy, {inspect=false}={}) {
  requireThat(Array.isArray(deployments) && deployments.length<=100,'INVALID_DEPLOYMENTS');
  const versioned=deployments.filter(d=>d.deploymentConfig?.versionNumber!==undefined);
  if(!inspect)for(const d of versioned)checkDeployment(d,policy);
  // Noms/URLs de déploiement ne sont pas nécessaires dans les résumés publics.
  return versioned.map(d=>({id:d.deploymentId,version:d.deploymentConfig?.versionNumber,
    entryPoints:d.entryPoints,scriptId:d.deploymentConfig?.scriptId})).sort((a,b)=>String(a.id).localeCompare(String(b.id),'en'));
}
