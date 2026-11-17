// Lit le commit applicatif comme données ; n'exécute jamais ses scripts de build.
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
import {candidateOf,contentHash,isSha,requireThat} from './validation.mjs';
export function packageCommit(sha, git=(...args)=>execFileSync('git',args,{encoding:'utf8',maxBuffer:3000000}),{gatewayTransport=false}={}) {
  requireThat(isSha(sha),'INVALID_SOURCE_SHA');
  requireThat(git('rev-parse',sha+'^{commit}').trim()===sha,'SOURCE_COMMIT_NOT_FOUND');
  function read(path) {
    const entry=git('ls-tree',sha,'--',path).trim();
    requireThat(entry.startsWith('100644 blob ') && entry.endsWith('\t'+path),'UNSAFE_SOURCE_FILE');
    return git('show',sha+':'+path);
  }
  const files=['Code','ReferentielV2','ReferentielV2Api'].map(name=>({name,type:'SERVER_JS',source:read('apps-script/src/'+name+'.gs')}));
  for(const f of files)new vm.Script(f.source,{filename:f.name});
  new vm.Script(files.map(f=>f.source).join('\n'),{filename:'REC-server-bundle'});
  let html=read('referentiel-v2.html');const css=read('referentiel-v2.css'),js=read('referentiel-v2.js');
  new vm.Script(js);requireThat(!/<\/script/i.test(js) && !/<\/style/i.test(css),'UNSAFE_INLINE_ASSET');
  const style='<link rel="stylesheet" href="referentiel-v2.css">',script='<script src="referentiel-v2.js"></script>';
  requireThat(html.split(style).length===2 && html.split(script).length===2,'UNEXPECTED_HTML_TEMPLATE');
  html=html.replace(style,()=>'<style>'+css+'</style>').replace(script,()=>'<script>'+js+'</script>');
  for(const [asset,path] of [['referentiel-v2-model.js','apps-script/src/ReferentielV2.gs'],['referentiel-v2-import.js','referentiel-v2-import.js']]) {
    const tag='<script src="'+asset+'"></script>';
    if(html.includes(tag)) {
      requireThat(html.split(tag).length===2,'UNEXPECTED_HTML_TEMPLATE');
      const source=read(path);new vm.Script(source);requireThat(!/<\/script/i.test(source),'UNSAFE_INLINE_ASSET');
      html=html.replace(tag,()=>'<script>'+source+'</script>');
    }
  }
  requireThat(!/<script[^>]+src=|<link[^>]+href=/i.test(html),'EXTERNAL_ASSETS');
  files.push({name:'ParametrageV2',type:'HTML',source:html},{name:'appsscript',type:'JSON',source:read('apps-script/src/appsscript.json')});
  if(gatewayTransport){
    requireThat(files[0].source.includes("if(body?.action==='rec.gateway')return _recGateway_(body);") && files[0].source.includes("function doGet(e) {\n  try{_recLegacyActor_();}catch{return _json_({ok:false,error:'FORBIDDEN'});}") && files[0].source.split("try{_recLegacyActor_();}catch{return _json_({ok:false,error:'FORBIDDEN'});}").length===3 && files[2].source.includes('function _recGateway_(body)') && files[2].source.includes("p.getProperty('REC_GATEWAY_KEY')"),'GATEWAY_GUARDS_MISSING');
    requireThat(files[0].source.split('const REC_SIGNED_TRANSPORT = false;').length===2 && files[0].source.includes("if(REC_SIGNED_TRANSPORT)throw new Error('AUTH_REQUIRED');") && files[2].source.includes("if(REC_SIGNED_TRANSPORT)throw new Error('FORBIDDEN');"),'GATEWAY_GUARDS_MISSING');
    files[0].source=files[0].source.replace('const REC_SIGNED_TRANSPORT = false;','const REC_SIGNED_TRANSPORT = true;');
    const f=files.find(f=>f.name==='appsscript'),m=JSON.parse(f.source);m.webapp={access:'ANYONE_ANONYMOUS',executeAs:'USER_DEPLOYING'};f.source=JSON.stringify(m,null,2)+'\n';
  }
  const candidate={schema:1,sourceSha:sha,files,contentHash:contentHash({files})};
  return candidateOf(candidate,{gatewayTransport});
}
