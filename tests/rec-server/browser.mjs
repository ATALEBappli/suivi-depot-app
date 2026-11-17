// Parcours intégral local : OAuth Google intercepté, Apps Script et Sheets simulés.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {createRequire} from 'node:module';
import {createHmac} from 'node:crypto';
import {application} from '../../rec-server/server.mjs';
import {bridge} from '../../rec-server/bridge.mjs';
import {pins} from '../../rec-server/security.mjs';
import {runtime} from '../../scripts/v2-local-runtime.mjs';
import {fakeProvider} from './fake-provider.mjs';
const {chromium}=createRequire(import.meta.url)('playwright');
const root=resolve(process.env.REC_FRONT_DIR || '/workspace/suivi-depot-demo');
const google=runtime({properties:{REFERENTIEL_V2:'0',REC_GATEWAY_KEY:'a'.repeat(64),REC_USER_ALLOWLIST:JSON.stringify([{email:'hot-rec@example.invalid',sub:'subject-fictif',role:'admin'}])}});
const cache=new Map(),digest=google.api.Utilities.computeDigest;
google.api.ScriptApp={getScriptId:()=> 'SCRIPT_FICTIF'};
google.api.CacheService={getScriptCache:()=>({get:k=>cache.get(k),put:(k,v)=>cache.set(k,v)})};
google.api.Utilities.computeDigest=(a,s)=>s==='SCRIPT_FICTIF'?[...Buffer.from(pins.script,'hex')]:s==='MOCK_REC'?[...Buffer.from(pins.sheet,'hex')]:digest(a,s);
google.api.Utilities.computeHmacSha256Signature=(s,k)=>[...createHmac('sha256',k).update(s).digest()];google.setActor('');
const provider=fakeProvider(),cfg={base:'http://127.0.0.1:4180',front:'http://127.0.0.1:4179/',origin:'http://127.0.0.1:4179',clientId:'fake-client',clientSecret:'FAKE_SERVER_ONLY',allowed:[{email:'hot-rec@example.invalid',sub:'subject-fictif',role:'admin'}],endpoint:'https://script.google.com/macros/s/REC_FICTIF/exec',key:'a'.repeat(64)};
const call=bridge(cfg,{fetcher:async(url,o)=>({ok:true,status:200,json:async()=>google.post(JSON.parse(o.body))})});
const server=createServer(application(cfg,{fetcher:provider.fetcher,call}));
const pages=createServer(async(req,res)=>{try{
 const path=decodeURIComponent(new URL(req.url,cfg.front).pathname),file=resolve(root,'.'+(path==='/'?'/index.html':path));if(!file.startsWith(root+'/'))throw Error();
 let body=await readFile(file);if(path==='/rec-config.mjs')body=Buffer.from('export default {apiBase:"'+cfg.base+'"};');
 if(path==='/index.html' || path==='/')body=Buffer.from(body.toString().replace("connect-src 'none'","connect-src "+cfg.base));
 res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2'})[extname(file)] || 'application/octet-stream'});res.end(body);
}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(4180,'127.0.0.1',r));await new Promise(r=>pages.listen(4179,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.DEMO_CHROMIUM_PATH || '/usr/bin/chromium'});
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[],external=[];
  page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',async route=>{
   const u=new URL(route.request().url());
   if(u.origin==='https://accounts.google.com'){
    const code='fixture-code-'+width;provider.grants.set(code,{nonce:u.searchParams.get('nonce'),challenge:u.searchParams.get('code_challenge')});
    await route.fulfill({status:303,headers:{Location:cfg.base+'/oauth/callback?code='+code+'&state='+u.searchParams.get('state')}});return;
   }
   if([cfg.base,cfg.origin].includes(u.origin)){await route.continue();return;}
   external.push(u.origin);await route.abort();
  });
  await page.goto(cfg.front+'#parametrage');await page.getByRole('button',{name:'Connexion sécurisée REC',exact:true}).click();
  await page.locator('.rec-reference-frame').waitFor();assert.match(await page.locator('#rec-state').textContent(),/REC authentifiée/);
  const frame=page.frameLocator('.rec-reference-frame');await frame.getByText('Référentiel chargé.',{exact:true}).waitFor();
  assert.equal(await frame.locator('#housing-save').isDisabled(),width===1440);
  const rows=Array.from({length:12},(_,i)=>({num:String(i+1).padStart(2,'0'),type:'F3',etage:i<6?'1er':'2e',locataire:'LOCATAIRE FICTIF '+(i+1),loyer:i===11?22000:18000}));
  await frame.locator('#import-file').setInputFiles({name:'fictif.csv',mimeType:'text/csv',buffer:Buffer.from('Appartement;Étage;Type;Locataire;Loyer DA\n'+rows.map(r=>[r.num,r.etage,r.type,r.locataire,r.loyer].join(';')).join('\n'))});
  await frame.locator('#simulate').click();await frame.getByText('Simulation terminée : aucune écriture.',{exact:true}).waitFor();assert.equal(await frame.locator('#import-preview tr').count(),12);assert.match(await frame.locator('#import-summary').textContent(),/220\s*000/);
  assert.equal(google.tables.transactions.length,5); // fixture historique seulement
  if(width===1440){assert.equal(await frame.locator('#import-apply').isDisabled(),true);google.props.REFERENTIEL_V2='1';await frame.locator('#reload').click();await frame.locator('#simulate').click();await frame.getByText('Simulation terminée : aucune écriture.',{exact:true}).waitFor();page.once('dialog',d=>d.accept());await frame.locator('#import-apply').click();await frame.getByText('Import enregistré ; aucune transaction créée.',{exact:true}).waitFor();}
  else assert.match(await frame.locator('#import-summary').textContent(),/ignorées \(identiques\) : 12/);
  await page.reload();await page.getByRole('button',{name:'Connexion sécurisée REC',exact:true}).waitFor(); // jeton en mémoire, pas de persistance implicite
  assert.equal(await page.evaluate(()=>localStorage.length),0);
  await page.getByRole('button',{name:'Connexion sécurisée REC',exact:true}).click();await page.frameLocator('.rec-reference-frame').getByText('Référentiel chargé.',{exact:true}).waitFor();
  assert.equal(await page.frameLocator('.rec-reference-frame').locator('#logements tr').count(),12);
  await page.getByRole('button',{name:'Synthèse',exact:true}).click();await page.waitForURL('**/#synthese');assert.ok((await page.locator('main').textContent()).includes('Synthèse'));
  await page.getByRole('button',{name:'Paramétrage',exact:true}).click();await page.getByRole('button',{name:'Déconnecter REC',exact:true}).click();await page.getByRole('button',{name:'Connexion sécurisée REC',exact:true}).waitFor();
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);await context.close();console.log('OK REC intégrée '+width+'px : OAuth/PKCE, droits, simulation 12/220000, import fictif, persistance, navigation Synthèse, déconnexion.');
 }
 if(process.env.US015_REFERENCE_XLSX){
  const page=await browser.newPage();await page.route('**/*',route=>new URL(route.request().url()).origin===cfg.origin?route.continue():route.abort());
  await page.goto(cfg.front+'referentiel/index.html');
  const summary=await page.evaluate(async bytes=>{const parsed=await V2Import.read(new File([Uint8Array.from(bytes)],'reference.xlsx'));const rows=ReferentielV2.normalize(parsed.rows),r=ReferentielV2.simulate(ReferentielV2.empty(),rows,'2026-11-17');return {count:r.total,total:r.totalMensuel,conflicts:r.conflits,created:r.creations};},[...await readFile(process.env.US015_REFERENCE_XLSX)]);
  assert.deepEqual(summary,{count:12,total:220000,conflicts:0,created:12});console.log('OK Excel définitif : simulation locale, 12 lignes, 220000 DA, aucun doublon/conflit sur modèle vide ; aucune donnée créée.');await page.close();
 }
}finally{await browser?.close();await new Promise(r=>pages.close(r));await new Promise(r=>server.close(r));}
