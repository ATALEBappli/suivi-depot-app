import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const app=readFileSync(new URL('../../rec-local/app.mjs',import.meta.url),'utf8');
const v2=readFileSync(new URL('../../referentiel-v2.js',import.meta.url),'utf8');
test('l’iframe du référentiel suit la hauteur réelle sans défilement vertical imbriqué',()=>{
 const source=app.slice(app.indexOf('let referenceFrameObserver=null;'),app.indexOf('const $=id=>'));
 assert.match(app,/frame\.addEventListener\('load',\(\)=>\{[^}]*expandReferenceFrame\(frame\)/);
 const observers=[];
 class MockObserver{constructor(callback){this.callback=callback;this.targets=[];observers.push(this);}observe(node){this.targets.push(node);}disconnect(){this.disconnected=true;}}
 const {expandReferenceFrame,disconnectReferenceFrame}=vm.runInNewContext(source+';({expandReferenceFrame,disconnectReferenceFrame})',{ResizeObserver:MockObserver});
 const frame={isConnected:true,style:{height:'80vh'},contentDocument:{body:{scrollHeight:1700},documentElement:{scrollHeight:1720}}};
 expandReferenceFrame(frame);
 assert.equal(frame.style.height,'1720px');
 assert.equal(observers[0].targets.length,2);
 frame.contentDocument.body.scrollHeight=2930;
 observers[0].callback();
 assert.equal(frame.style.height,'2930px');
 disconnectReferenceFrame();
 assert.equal(observers[0].disconnected,true);
});
test('l’aperçu V2 explique le bouton désactivé sans activer ni écrire le référentiel',()=>{
 assert.match(app,/node\('details',null,housing,\{class:'housing-current'\}\)/);
 assert.match(app,/Ancienne liste REC — lecture seule/);
 assert.match(v2,/Confirmation désactivée : la propriété Apps Script REC REFERENTIEL_V2 doit être égale à 1/);
 assert.match(v2,/Confirmation désactivée : droits administrateur requis/);
 assert.match(v2,/\$\('migration-confirm'\)\.disabled=!pendingMigration \|\| !writable\(\)/);
});
