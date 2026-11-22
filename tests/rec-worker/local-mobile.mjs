// Interface mobile locale : vrais assets + vraie authentification SQLite ; stockage Google simulé.
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {localWorker} from './harness.mjs';
import {passwordRecord} from '../../rec-worker/passwords.mjs';
const {chromium}=createRequire(import.meta.url)('playwright');
const origin='https://rec-fictif.compte-fictif.workers.dev',password='Fictitious mobile password 2026!',env={APP_ENV:'REC',REC_SERVER_URL:origin,REC_AUTH_MODE:'local',REC_BACKEND_ENABLED:'false',REC_BOOTSTRAP_ADMIN:JSON.stringify({id:randomUUID(),username:'admin-mobile',role:'admin',password:await passwordRecord(password)})};
const w=await localWorker({cfg:{base:origin},site:new URL('../../rec-server/public',import.meta.url).pathname,productionEnv:env});
const browser=await chromium.launch({headless:true,executablePath:process.env.REC_CHROMIUM_PATH || '/usr/bin/chromium',args:['--no-sandbox']});
let business=false,revision=0;const transactions=[],units=Array.from({length:12},(_,i)=>({num:String(i+1).padStart(2,'0'),type:['F2','F3','F4'][i%3],locataire:'FICTIF '+(i+1),loyer:i===11?22000:18000})),categories=[{id:'loyer',activity:'depot',label:'Loyer',subcategories:[]},{id:'travaux',activity:'headm',label:'Travaux',subcategories:[]}];
try{for(const width of [390,320]){
 const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{const req=route.request();assert.equal(new URL(req.url()).origin,origin,'Aucun appel réseau externe');
  const opts={method:req.method(),headers:await req.allHeaders(),...(req.postData()?{body:req.postData()}:{} )};
  if(new URL(req.url()).pathname==='/local/api' && business){
   // D'abord vérifier le vrai cookie/CSRF dans le DO, puis simuler le backend explicitement.
   const auth=await w.mf.dispatchFetch(origin+'/local/api',{...opts,body:JSON.stringify({action:'rec.localStatus'})});const identity=await auth.json();if(!identity.ok)return route.fulfill({response:undefined,status:auth.status,body:JSON.stringify(identity),contentType:'application/json'});
   const body=JSON.parse(req.postData());let data;
   if(body.action==='rec.reference')data={ok:true,units};
   else if(body.action==='finance.read')data={ok:true,revision,categories,activities:[{id:'depot',label:'Dépôt locatif'},{id:'headm',label:'HEADM — Construction'},{id:'charges',label:'Charges communes'},{id:'famille',label:'Famille / Divers'}],transactions};
   else if(body.action==='finance.preview')data={ok:true,revision,previewHash:'FICTITIOUS_PREVIEW',transaction:{...body.transaction,tenant:units.find(u=>u.num===body.transaction.unit)?.locataire,testOnly:true}};
   else if(body.action==='finance.write'){transactions.push(body.transaction);data={ok:true,revision:++revision};}
   else data={ok:false,error:'REC_BACKEND_DISABLED'};
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  }
  const response=await w.mf.dispatchFetch(req.url(),opts);let data=await response.arrayBuffer();if(new URL(req.url()).pathname==='/local/session' && business){const state=JSON.parse(new TextDecoder().decode(data));state.backendEnabled=true;data=Buffer.from(JSON.stringify(state));}
  const headers=Object.fromEntries(response.headers);delete headers['content-length'];return route.fulfill({status:response.status,headers,body:Buffer.from(data)});
 });
 await page.goto(origin);await page.locator('[name=username]').fill('admin-mobile');await page.locator('[name=password]').fill(password);await page.getByRole('button',{name:'Se connecter',exact:true}).click();await page.locator('#workspace').waitFor({state:'visible'});await page.getByText('Le stockage REC est désactivé.',{exact:false}).first().waitFor();
 assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0);
 await page.getByRole('button',{name:'Paramétrage',exact:true}).click();await page.getByRole('heading',{name:'Utilisateurs',exact:true}).waitFor();
 business=true;await page.reload();await page.locator('table').first().waitFor();assert.match(await page.locator('#identity').textContent(),/admin-mobile/);
 await page.getByRole('button',{name:'Paramétrage',exact:true}).click();
 await page.locator('details.housing-current summary').click();
 await page.getByRole('heading',{name:'Liste actuelle des locataires',exact:true}).waitFor();
 await page.getByText('12 logement(s) et locataire(s)',{exact:true}).waitFor();
 assert.equal(await page.locator('.settings-panel[data-panel="housing"] .housing-current tbody tr').count(),12);
 assert.match(await page.locator('.housing-current').textContent(),/FICTIF 1/);
 assert.equal(await page.locator('.tenant-table th').count(),7);
 assert.equal(await page.locator('.tenant-table').evaluate(e=>getComputedStyle(e).display),'table');
 assert.equal(await page.locator('.tenant-table tbody tr').first().evaluate(e=>getComputedStyle(e).display),'table-row');
 assert.equal(await page.locator('.tenant-table-wrap').evaluate(e=>getComputedStyle(e).overflowX),'auto');

 assert.equal(await page.locator('.tenant-table tbody tr.type-f2').count(),4);
 assert.equal(await page.locator('.tenant-table tbody tr.type-f3').count(),4);
 assert.equal(await page.locator('.tenant-table tbody tr.type-f4').count(),4);
 assert.match(await page.locator('.tenant-legend').textContent(),/F2 : 4/);
 assert.match(await page.locator('.tenant-table tbody tr').first().locator('td').last().textContent(),/16\s000/);
 assert.equal(await page.locator('.tenant-table tbody tr').first().locator('td').nth(4).textContent(),'—');
 assert.equal(await page.locator('.tenant-table tbody tr').first().locator('td').nth(5).textContent(),'—');
 assert.equal(await page.locator('.tenant-table tbody tr').first().evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(230, 243, 255)');
 await page.getByRole('button',{name:'Saisie',exact:true}).click();await page.locator('[name=activity]').waitFor();assert.equal(await page.locator('[name=activity] option').count(),4);await page.locator('[name=operationDate]').fill('2026-11-20');await page.locator('[name=period]').fill('2026-11');await page.locator('[name=amount]').fill('18000');await page.getByRole('button',{name:'Prévisualiser',exact:true}).click();await page.getByRole('heading',{name:'Prévisualisation',exact:false}).waitFor();assert.match(await page.locator('#view').textContent(),/FICTIF 1/);await page.getByRole('button',{name:'Confirmer l’enregistrement de TEST',exact:true}).click();await page.getByText('Opération de test enregistrée',{exact:false}).waitFor();
 await page.getByRole('button',{name:'Synthèse',exact:true}).click();await page.getByText('Entrées :',{exact:false}).waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);
 await page.getByRole('button',{name:'Déconnexion',exact:true}).click();await page.locator('#login').waitFor({state:'visible'});await context.close();business=false;console.log('Mobile Chromium '+width+' px : connexion SQLite, backend OFF, formulaire, aperçu, journal simulé, synthèse, déconnexion OK.');
 }}finally{await browser.close();await w.close();}
