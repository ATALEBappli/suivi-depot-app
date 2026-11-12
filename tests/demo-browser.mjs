// Dépendance de test uniquement : Playwright (aucune dépendance du prototype).
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
const { chromium, webkit } = createRequire(import.meta.url)('playwright');
const base = process.env.DEMO_TEST_URL || 'http://127.0.0.1:4173';
mkdirSync('work/demo-screenshots', {recursive:true});
for (const [engine, width, height] of [[chromium,1440,1000],[chromium,390,844],[chromium,320,720],...(process.env.DEMO_WEBKIT === '1' ? [[webkit,390,844],[webkit,320,720]] : [])]) {
  const browser=await engine.launch({headless:true, ...(engine === chromium && process.env.DEMO_CHROMIUM_PATH ? {executablePath:process.env.DEMO_CHROMIUM_PATH} : {})});
  try {
    const context=await browser.newContext({viewport:{width,height},isMobile:width<700,hasTouch:width<700});
    const page=await context.newPage(), errors=[], external=[], responses=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error') errors.push(m.text());});
    page.on('request',r=>{if(new URL(r.url()).origin!==new URL(base).origin)external.push(r.url());});
    page.on('response',r=>{if(r.status()>=400)responses.push(r.url());});
    const shot=async name=>{await page.screenshot({path:`work/demo-screenshots/${engine.name()}-${width}-${name}.png`,fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`débordement ${name}`);};
    const click=async (name,scope=page)=>scope.getByRole('button',{name,exact:true}).click();
    const card=id=>page.locator(`[data-user="${id}"]`);
    await page.goto(base+'/#permissions/2');await page.waitForURL('**/#connexion');await shot('connexion');
    await page.getByLabel('Identifiant fictif').fill('absent');await page.getByLabel('Code PIN (6 chiffres)').fill('123456');await click('Se connecter');await page.getByRole('alert').filter({hasText:'incorrect'}).waitFor();
    await page.getByLabel('Identifiant fictif').fill('ahmed.admin');await click('Se connecter');await page.waitForURL('**/#utilisateurs');await shot('utilisateurs');
    assert.equal(await card('1').getByRole('button',{name:'Désactiver verrouillé'}).isDisabled(),true);
    await page.getByRole('searchbox').fill('karim');assert.equal(await page.locator('[data-user]').count(),1);
    await click('Désactivés (1)');assert.equal(await page.locator('[data-user]').count(),0);
    await page.getByRole('searchbox').fill('');await click('Tous (3)');
    await click('Activer le compte',card('3'));await card('3').getByText('● Actif',{exact:true}).waitFor();await click('Désactiver',card('3'));
    await click('Ajouter un utilisateur');await page.waitForURL('**/#creation');await shot('creation');
    await page.getByLabel('Nom complet affiché').fill('Samira Amrani');await page.getByLabel('Identifiant de connexion').fill('samira.gestion');await page.getByLabel('Code PIN (6 chiffres)').fill('654321');await page.getByLabel('Confirmation du code PIN').fill('111111');await click('Créer l’utilisateur');await page.getByRole('alert').filter({hasText:'correspondent pas'}).waitFor();
    await page.getByLabel('Confirmation du code PIN').fill('654321');await page.getByRole('radio',{name:'Administrateur complet',exact:false}).check();await click('Créer l’utilisateur');await click('Annuler',page.getByRole('dialog'));assert.equal(new URL(page.url()).hash,'#creation');
    await click('Créer l’utilisateur');await click('Confirmer l’attribution',page.getByRole('dialog'));await page.waitForURL('**/#utilisateurs');await card('4').getByText('Administrateur',{exact:true}).waitFor();
    await click('Permissions',card('2'));await page.waitForURL('**/#permissions/2');await shot('permissions');
    const audit=page.getByRole('switch',{name:'Consulter le journal d’audit',exact:false});assert.equal(await audit.isChecked(),false);await audit.check();await click('Enregistrer les permissions');assert.equal(await audit.isChecked(),true);
    await click('Retour');await click('Permissions',card('2'));assert.equal(await audit.isChecked(),true);
    await click('Rétablir profil standard');await click('Enregistrer les permissions');assert.equal(await audit.isChecked(),false);
    await page.getByRole('radio',{name:'Administrateur',exact:true}).check();await click('Enregistrer les permissions');await click('Annuler',page.getByRole('dialog'));await click('Retour');await card('2').getByText('Utilisateur standard',{exact:true}).waitFor();
    await click('Réinit. PIN',card('2'));let modal=page.getByRole('dialog');await modal.getByLabel('Nouveau PIN fictif').fill('654321');await modal.getByLabel('Confirmer le PIN fictif').fill('654321');await click('Réinitialiser',modal);
    await click('Modifier',card('2'));modal=page.getByRole('dialog');await modal.getByLabel('Nom complet').fill('Karim Test');await click('Enregistrer',modal);await card('2').getByRole('heading',{name:'Karim Test'}).waitFor();
    await click('Permissions',card('1'));await page.goBack();await page.waitForURL('**/#utilisateurs');await page.goForward();await page.waitForURL('**/#permissions/1');
    await click('Quitter la démonstration');await page.getByLabel('Identifiant fictif').fill('karim.gestion');await page.getByLabel('Code PIN (6 chiffres)').fill('654321');await click('Se connecter');await page.waitForURL('**/#utilisateurs');
    await page.reload();await page.waitForURL('**/#connexion');await page.getByLabel('Identifiant fictif').fill('ahmed.admin');await page.getByLabel('Code PIN (6 chiffres)').fill('123456');await click('Se connecter');await page.waitForURL('**/#utilisateurs');await card('2').getByRole('heading',{name:'Karim Mansouri'}).waitFor();assert.equal(await page.locator('[data-user]').count(),3);
    for(const path of ['/../app.js','/app.js','/apps-script/src/Code.gs','/sw.js']){const r=await context.request.get(base+path);assert.equal(r.status(),404);}
    assert.deepEqual(external,[],'requêtes externes');assert.deepEqual(responses,[],'ressources en erreur');assert.deepEqual(errors,[],'erreurs JavaScript/console');
    console.log(`OK ${engine.name()} ${width}×${height} : parcours complets, responsive, aucun appel externe ni erreur JS.`);
  } finally {await browser.close();}
}
