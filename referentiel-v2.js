/* Paramétrage partagé entre serveur local fictif et HtmlService privé REC. */
(() => {
  'use strict';
  let loaded, pendingImport=null, pendingWrite=null, busy=false;
  const $=id=>document.getElementById(id), today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Paris'}).format(new Date());
  const message=t=>{$('message').textContent=t;};
  function api(body) {
    if(window.google?.script?.run)return new Promise((resolve,reject)=>google.script.run.withSuccessHandler(resolve).withFailureHandler(()=>reject(Error('Appel REC interrompu ; actualisez avant de réessayer.'))).v2Client(body));
    // Le transport HTTP est réservé au serveur local ; aucune URL Google par défaut.
    if(!['localhost','127.0.0.1'].includes(location.hostname))return Promise.reject(Error('Ouvrir le Paramétrage depuis le backend REC privé (action=v2.ui).'));
    return fetch('/api/v2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(r=>r.json());
  }
  async function call(body) {const r=await api(body);if(!r.ok)throw Error(r.error || 'Échec de la demande');return r;}
  async function guarded(fn) {
    if(busy)return;busy=true;document.querySelectorAll('button').forEach(b=>{b.disabled=true;});
    try{await fn();}catch(e){message(e.message);}finally{busy=false;document.querySelectorAll('button').forEach(b=>{b.disabled=false;});$('import-apply').disabled=!pendingImport || !loaded?.active;document.querySelectorAll('form button').forEach(b=>{b.disabled=!loaded?.active;});}
  }
  const cell=(row,value)=>{const td=document.createElement('td');td.textContent=value;row.append(td);return td;};
  const button=(text,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.addEventListener('click',fn);return b;};
  function fill(form,data) {for(const [k,v] of Object.entries(data)){const e=form.elements.namedItem(k);if(!e)continue;if(e.type==='checkbox')e.checked=v;else e.value=v ?? '';}}
  function options(select,rows,label) {const old=select.value;select.replaceChildren();for(const r of rows){const o=document.createElement('option');o.value=r.id;o.textContent=label(r);select.append(o);}if(rows.some(r=>r.id===old))select.value=old;}
  function setBailForm(b) {
    const f=$('bail-form');f.reset();
    queueMicrotask(()=>{
      fill(f,b || {id:'',logementId:$('bail-filter').value});
      for(const k of ['logementId','locataireId'])f.elements[k].disabled=!!b;
      f.elements.loyer.disabled=!!b;f.elements.loyer.required=!b;$('initial-rent').hidden=!!b;
    });
  }
  function renderBaux() {
    const s=loaded.state;const target=$('baux');target.replaceChildren();
    for(const b of s.baux.filter(b=>b.logementId===$('bail-filter').value)) {
      const item=document.createElement('div');item.className='bail';
      const name=s.locataires.find(t=>t.id===b.locataireId)?.nom;
      const lines=[`${name} — ${b.statut} — ${b.id}`,`Arrivée : ${b.arrivee || 'inconnue'} ; départ : ${b.depart || 'inconnu'} ; suivi financier fiable depuis : ${b.suiviFinancierDepuis || 'non renseigné'}`,`Caution prévue : ${b.cautionPrevue === null?'inconnue':b.cautionPrevue+' DA'}. Encaissée, restitutions, retenues, solde : non déterminés, à rapprocher des opérations de caisse.`,...s.loyers.filter(l=>l.bailId===b.id).map(l=>`Loyer : ${l.montant} DA ; effet : ${l.effet || 'loyer initial du bail'}`)];
      const p=document.createElement('p');p.textContent=lines.join('\n');p.style.whiteSpace='pre-line';item.append(p,button('Modifier les dates / caution',()=>setBailForm(b)));target.append(item);
    }
  }
  function render() {
    const s=loaded.state;const tbody=$('logements');tbody.replaceChildren();
    for(const l of s.logements){
      const at=today(), b=s.baux.find(b=>b.logementId===l.id && (!b.arrivee || b.arrivee<=at) && (!b.depart || b.depart>at));
      const rent=b?s.loyers.filter(r=>r.bailId===b.id && (!r.effet || r.effet<=at)).sort((a,b)=>(b.effet || '').localeCompare(a.effet || ''))[0]?.montant:null;
      const tr=document.createElement('tr');[l.numero,l.type,l.etage,l.actif?'Actif':'Inactif',b?s.locataires.find(t=>t.id===b.locataireId).nom:'—',rent ?? '—'].forEach(v=>cell(tr,v));
      cell(tr,'').append(button('Modifier',()=>fill($('logement-form'),l)),button('Baux',()=>{$('bail-filter').value=l.id;renderBaux();setBailForm();}));tbody.append(tr);
    }
    options($('bail-filter'),s.logements,l=>`${l.numero} — ${l.type}`);
    options($('bail-form').elements.logementId,s.logements,l=>l.numero);
    options($('bail-form').elements.locataireId,s.locataires,t=>t.nom);
    options($('loyer-form').elements.bailId,s.baux.filter(b=>b.statut==='actif'),b=>`${s.logements.find(l=>l.id===b.logementId).numero} — ${s.locataires.find(t=>t.id===b.locataireId).nom}`);
    options($('tenant-edit'),[{id:'',nom:'Nouveau locataire'},...s.locataires],t=>t.nom);
    $('history').textContent=JSON.stringify(s.historique,null,2);
    $('environment').textContent=`REC${window.google?.script?' privé':' local fictif — données en mémoire'} — révision ${loaded.revision} — V2 ${loaded.active?'active':'inactive (lecture/simulation uniquement)'}`;
    document.querySelectorAll('form button').forEach(b=>{b.disabled=!loaded.active;});renderBaux();
  }
  async function load(){loaded=await call({action:'v2.read'});pendingImport=null;pendingWrite=null;render();}
  async function write(command){
    if(!loaded.active)throw Error('Référentiel V2 inactif.');
    if(pendingWrite && JSON.stringify(pendingWrite.command)!==JSON.stringify(command))throw Error('Une écriture reste incertaine. Réessayez la même demande ou actualisez le référentiel.');
    pendingWrite ??= {action:'v2.write',requestId:crypto.randomUUID(),expectedRevision:loaded.revision,command};
    await call(pendingWrite);
    await load();message('Modification enregistrée. Aucune opération financière créée.');
  }
  const values=form=>Object.fromEntries(new FormData(form));
  for(const action of ['logement','locataire','bail','loyer']) {
    const form=$(action+'-form');form.addEventListener('submit',event=>{event.preventDefault();guarded(async()=>{
      const data=values(form);if(!data.id)delete data.id;
      if(action==='logement')data.actif=form.elements.actif.checked;
      if(action==='bail') {
        data.logementId=form.elements.logementId.value;data.locataireId=form.elements.locataireId.value;
        for(const k of ['arrivee','depart','suiviFinancierDepuis','cautionPrevue'])if(!data[k])data[k]=null;
        if(data.id)delete data.loyer;
      }
      await write({action,data});form.reset();if(action==='bail')setBailForm();
    });});
  }
  $('bail-form').addEventListener('reset',()=>{queueMicrotask(()=>{const f=$('bail-form');f.elements.id.value='';for(const k of ['logementId','locataireId','loyer'])f.elements[k].disabled=false;f.elements.loyer.required=true;$('initial-rent').hidden=false;});});
  $('logement-form').addEventListener('reset',()=>{queueMicrotask(()=>{$('logement-form').elements.id.value='';});});
  $('locataire-form').addEventListener('reset',()=>{queueMicrotask(()=>{$('locataire-form').elements.id.value='';});});
  $('tenant-edit').addEventListener('change',()=>{const t=loaded.state.locataires.find(t=>t.id===$('tenant-edit').value);fill($('locataire-form'),t || {id:'',nom:'',complement:''});});
  $('bail-filter').addEventListener('change',renderBaux);
  $('reload').addEventListener('click',()=>guarded(async()=>{await load();message('Référentiel actualisé.');}));
  $('import-file').addEventListener('change',()=>{pendingImport=null;$('import-apply').disabled=true;$('report').textContent='';});
  $('simulate').addEventListener('click',()=>guarded(async()=>{
    pendingImport=null;const file=$('import-file').files[0];if(!file)throw Error('Choisir un fichier JSON.');
    const rows=JSON.parse(await file.text());const r=await call({action:'v2.simulate',rows});$('report').textContent=JSON.stringify(r.report,null,2);
    if(!r.report.conflits)pendingImport={rows,revision:r.revision,preview:r.preview,requestId:crypto.randomUUID()};message('Simulation terminée : aucune écriture.');
  }));
  $('import-apply').addEventListener('click',()=>guarded(async()=>{
    if(!pendingImport)throw Error('Simuler avant application.');
    if(!window.confirm('Appliquer cet import au référentiel REC actif ?'))return;
    await call({action:'v2.import',rows:pendingImport.rows,expectedRevision:pendingImport.revision,requestId:pendingImport.requestId,preview:pendingImport.preview});await load();message('Import enregistré ; aucune transaction créée.');
  }));
  guarded(async()=>{await load();message('Référentiel chargé.');});
})();
