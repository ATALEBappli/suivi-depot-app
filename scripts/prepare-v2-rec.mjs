// Préparation locale uniquement, sans clasp, réseau ou identifiant Google.
import {mkdirSync,readFileSync,writeFileSync,copyFileSync} from 'node:fs';
const out='work/us-015-rec-candidate';mkdirSync(out,{recursive:true});
for(const file of ['Code.gs','ReferentielV2.gs','ReferentielV2Api.gs','appsscript.json'])copyFileSync('apps-script/src/'+file,out+'/'+file);
let html=readFileSync('referentiel-v2.html','utf8');
html=html.replace('<link rel="stylesheet" href="referentiel-v2.css">',()=>'<style>'+readFileSync('referentiel-v2.css','utf8')+'</style>');
html=html.replace('<script src="referentiel-v2.js"></script>',()=>'<script>'+readFileSync('referentiel-v2.js','utf8')+'</script>');
for(const [asset,path] of [['referentiel-v2-model.js','apps-script/src/ReferentielV2.gs'],['referentiel-v2-import.js','referentiel-v2-import.js']])html=html.replace('<script src="'+asset+'"></script>',()=>'<script>'+readFileSync(path,'utf8')+'</script>');
writeFileSync(out+'/ParametrageV2.html',html);
console.log('Candidat privé REC préparé localement dans '+out+'. Aucun envoi ni déploiement.');
