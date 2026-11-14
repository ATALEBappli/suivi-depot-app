// Lit le commit applicatif comme données ; n'exécute jamais ses scripts de build.
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
import {candidateOf,contentHash,isSha,requireThat} from './validation.mjs';
export function packageCommit(sha, git=(...args)=>execFileSync('git',args,{encoding:'utf8',maxBuffer:3000000})) {
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
  requireThat(!/<script[^>]+src=|<link[^>]+href=/i.test(html),'EXTERNAL_ASSETS');
  files.push({name:'ParametrageV2',type:'HTML',source:html},{name:'appsscript',type:'JSON',source:read('apps-script/src/appsscript.json')});
  const candidate={schema:1,sourceSha:sha,files,contentHash:contentHash({files})};
  return candidateOf(candidate);
}
