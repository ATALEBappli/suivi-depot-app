import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createRelease,verifyRelease,releaseErrorCode} from '../../rec-worker/release.mjs';
const repo=fileURLToPath(new URL('../../',import.meta.url)),sha='f'.repeat(40),publicDirectory=resolve(repo,'rec-server/public');
test('régression run 44275974989 : outdir relatif résolu par Wrangler depuis config, absolu commun au packager',()=>{
 const root=mkdtempSync(tmpdir()+'/rec-release-path-'),workspace=root+'/workspace avec espaces',configDir=workspace+'/config';mkdirSync(configDir,{recursive:true});mkdirSync(workspace+'/work');
 const config=JSON.parse(readFileSync(repo+'/rec-worker/wrangler.jsonc'));config.main=repo+'/rec-worker/worker.mjs';config.assets.directory=publicDirectory;
 const configFile=configDir+'/wrangler.jsonc';writeFileSync(configFile,JSON.stringify(config));
 const env={...process.env,CI:'true',WRANGLER_SEND_METRICS:'false',XDG_CONFIG_HOME:root+'/config-local'};
 for(const k of Object.keys(env))if(k.startsWith('CLOUDFLARE_') || k.startsWith('CF_API_'))delete env[k];
 const compile=outdir=>{const r=spawnSync(process.execPath,[repo+'/rec-worker/node_modules/wrangler/bin/wrangler.js','deploy','--config',configFile,'--dry-run','--outdir',outdir],{cwd:workspace,env,encoding:'utf8',maxBuffer:3000000});assert.equal(r.status,0,'La compilation locale dry-run doit réussir.');};
 try{
  compile('work/compiled');assert.equal(existsSync(workspace+'/work/compiled/worker.js'),false);assert.equal(existsSync(configDir+'/work/compiled/worker.js'),true);
  assert.throws(()=>createRelease({bundle:workspace+'/work/compiled',publicDirectory,output:workspace+'/work/release',sourceSha:sha}),/^Error: COMPILED_WORKER_MISSING$/);assert.equal(existsSync(workspace+'/work/release'),false);
  compile(workspace+'/work/compiled');
  const receipt=createRelease({bundle:workspace+'/work/compiled',publicDirectory,output:workspace+'/work/release',sourceSha:sha});assert.equal(verifyRelease(workspace+'/work/release',{sourceSha:sha,expectedHash:receipt.sha256}).sha256,receipt.sha256);
  const tampered=spawnSync(process.execPath,[repo+'/rec-worker/release.mjs','verify',workspace+'/work/release',sha,'0'.repeat(64)],{encoding:'utf8'});assert.equal(tampered.status,1);assert.equal(tampered.stderr,'REC_WORKER_STOP RELEASE_HASH_MISMATCH\n');
  const workflow=readFileSync(repo+'/.github/workflows/rec-worker-manual.yml','utf8');assert.match(workflow,/--outdir "\$GITHUB_WORKSPACE\/work\/rec-worker-compiled"/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('diagnostic CLI fermé : précise le bundle manquant, jamais un chemin, contenu ou secret',()=>{
 const root=mkdtempSync(tmpdir()+'/rec-release-error-');try{
  const sentinel='FAKE_SECRET_MUST_NOT_APPEAR',run=(...args)=>spawnSync(process.execPath,[repo+'/rec-worker/release.mjs',...args],{encoding:'utf8',env:{...process.env,CLOUDFLARE_API_TOKEN:sentinel}});
  let r=run('create',root+'/'+sentinel,publicDirectory,root+'/release',sha);assert.equal(r.status,1);assert.equal(r.stdout,'');assert.equal(r.stderr,'REC_WORKER_STOP COMPILED_WORKER_MISSING\n');assert.equal(r.stderr.includes(sentinel),false);assert.equal(r.stderr.includes(root),false);
  mkdirSync(root+'/compiled');writeFileSync(root+'/compiled/worker.js','too small');r=run('create',root+'/compiled',publicDirectory,root+'/release',sha);assert.equal(r.status,1);assert.equal(r.stderr,'REC_WORKER_STOP INVALID_COMPILED_WORKER\n');
  assert.equal(releaseErrorCode(Error(sentinel)),'RELEASE_NOT_VERIFIED');assert.equal(releaseErrorCode(Error('RELEASE_HASH_MISMATCH')),'RELEASE_HASH_MISMATCH');assert.equal(releaseErrorCode(Error('WRONG_RELEASE_TARGET_OR_FLAGS')),'WRONG_RELEASE_TARGET_OR_FLAGS');
 }finally{rmSync(root,{recursive:true,force:true});}
});
