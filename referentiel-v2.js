/* Paramétrage partagé entre serveur local fictif et HtmlService privé REC. */
(() => {
  'use strict';
  const N=ReferentielV2.normalizers;
  const errors={INVALID_IMPORT:'Le fichier doit contenir entre 1 et 5 000 logements.',AMBIGUOUS_TENANT:'Plusieurs fiches correspondent à ce locataire. Vérifiez le référentiel avant import.',INVALID_TEXT:'Un champ obligatoire est vide ou contient une valeur interdite.',INVALID_AMOUNT:'Montant invalide : utiliser un nombre positif ou nul avec deux décimales maximum.',INVALID_DATE:'Date invalide.',OVERLAPPING_BAILS:'Une location existe déjà sur cette période. Renseignez son départ avant de créer la suivante.',INVALID_RENT_EFFECT:'La date du nouveau loyer doit être aujourd’hui ou ultérieure, après les versions existantes.',DUPLICATE_TENANT:'Ce locataire existe déjà.',INVALID_LOGEMENT:'Numéro déjà utilisé ou logement invalide.',INVALID_TENANT:'Fiche locataire invalide.',INACTIVE_ENTITY:'Le logement est indisponible ou le locataire est archivé.',ACTIVE_LEASE_CONFLICT:'Terminez le bail actif avant de mettre le logement en travaux ou d’archiver une fiche.',DUPLICATE_NUMBER:'Deux lignes portent le même numéro après normalisation.',INACTIVE_OR_UNKNOWN_REFERENCE:'Type ou étage absent des valeurs actives. Vérifiez le Paramétrage.',DUPLICATE_REFERENCE:'Cette valeur existe déjà.',REFERENCE_IN_USE:'Cette valeur est utilisée : elle peut être désactivée, mais pas renommée.',V2_DISABLED:'Les écritures V2 ne sont pas activées en REC.',STALE_REVISION:'Le référentiel a changé. Actualisez puis recommencez.',IMPORT_CONFLICT:'Import en conflit : aucune donnée remplacée.'};
  let loaded, pendingImport=null, pendingMigration=null, pendingWrite=null, busy=false, selectedTenant='', selectedHousing='';
  const writable=()=>!!loaded?.active && loaded?.canWrite!==false;
  const $=id=>document.getElementById(id), today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Paris'}).format(new Date());
  const message=t=>{$('message').textContent=t;};
  function api(body) {
    if(typeof window.recReferenceRequest==='function')return window.recReferenceRequest(body);
    if(window.google?.script?.run)return new Promise((resolve,reject)=>google.script.run.withSuccessHandler(resolve).withFailureHandler(()=>reject(Error('Appel REC interrompu ; actualisez avant de réessayer.'))).v2Client(body));
    // Le transport HTTP est réservé au serveur local ; aucune URL Google par défaut.
    if(!['localhost','127.0.0.1'].includes(location.hostname))return Promise.reject(Error('Ouvrir le Paramétrage depuis le backend REC privé (action=v2.ui).'));
    return fetch('/api/v2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(r=>r.json());
  }
  async function call(body) {const r=await api(body);if(!r.ok){const e=Error(errors[r.error] || r.error || 'Échec de la demande');e.authoritative=r.error!=='V2_REQUEST_FAILED';throw e;}return r;}
  async function guarded(fn) {
    if(busy)return;busy=true;document.querySelectorAll('button').forEach(b=>{b.disabled=true;});
    try{await fn();}catch(e){message(e.message);}finally{busy=false;document.querySelectorAll('button').forEach(b=>{b.disabled=false;});$('import-apply').disabled=!pendingImport || !writable();$('migration-confirm').disabled=!pendingMigration || !writable();document.querySelectorAll('form button').forEach(b=>{b.disabled=!writable();});}
  }
  const cell=(row,value)=>{const td=document.createElement('td');td.textContent=value;row.append(td);return td;};
  const button=(text,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.addEventListener('click',fn);return b;};
  function fill(form,data) {for(const [k,v] of Object.entries(data)){const e=form.elements.namedItem(k);if(!e)continue;if(e.type==='checkbox')e.checked=!!v;else e.value=v ?? '';}}
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
      const lines=[`${name} — ${b.statut} — ${b.id}`,`Arrivée : ${b.arrivee || 'inconnue'} ; départ : ${b.depart || 'inconnu'} ; suivi financier fiable depuis : ${b.suiviFinancierDepuis || 'non renseigné'}`,`Caution prévue : ${b.cautionPrevue === null?'inconnue':b.cautionPrevue+' DA'}. Encaissée, restitutions, retenues, solde : non déterminés, à rapprocher des opérations de caisse.`,...s.loyers.filter(l=>l.bailId===b.id).map(l=>`Loyer : ${l.montant} DA ; effet : ${l.effet || 'loyer mensuel initial'}`)];
      const p=document.createElement('p');p.textContent=lines.join('\n');p.style.whiteSpace='pre-line';item.append(p,button('Modifier les dates / caution',()=>setBailForm(b)));target.append(item);
    }
  }
  function editHousing(id='') {
    const l=loaded.state.logements.find(l=>l.id===id),f=$('logement-form');
    f.reset();queueMicrotask(()=>{
      fill(f,l?{...l,numero:N.numero(l.numero),type:N.type(l.type),etage:N.etage(l.etage)}:{id:'',numero:'',actif:true,disponibilite:'libre'});
      $('logement-edit').value=id;$('housing-title').textContent=l?'Modifier le logement / local':'Ajouter un logement / local';
      $('housing-save').textContent=l?'Enregistrer les modifications':'Ajouter le logement / local';
    });
  }
  function renderReferences() {
    const refs=ReferentielV2.references(loaded.state);
    for(const [field,category] of [['type','types'],['etage','etages']]) {
      const select=$('logement-form').elements[field],old=select.value;
      select.replaceChildren();if(field==='etage'){const o=document.createElement('option');o.value='';o.textContent='Non renseigné';select.append(o);}
      for(const r of refs[category]){const o=document.createElement('option');o.value=r.label;o.textContent=r.label+(r.actif?'':' (inactive)');o.disabled=!r.actif;select.append(o);}
      if([...select.options].some(o=>o.value===old))select.value=old;
    }
    const category=$('reference-category').value;
    options($('reference-edit'),[{id:'',label:'Ajouter une valeur'},...refs[category]],r=>r.label+(r.actif===false?' (inactive)':''));
  }
  function renderPreview(report,parsed) {
    $('import-summary').textContent=(parsed.sheetName?'Feuille : '+parsed.sheetName+' — ':'')+`${report.total} lignes ; créations : ${report.creations} ; mises à jour : ${report.misesAJour} ; ignorées (identiques) : ${report.ignorees} ; conflits : ${report.conflits}. Total mensuel : ${report.totalMensuel.toLocaleString('fr-FR')} DA.`+(parsed.ignoredSourceRows?` Lignes de titre/total exclues : ${parsed.ignoredSourceRows}.`:'')+(parsed.metadataExcluded?' Les colonnes Statut information et Commentaire ne sont pas importées.':'');
    $('import-preview').replaceChildren();
    for(const item of report.items){const tr=document.createElement('tr');[item.num,item.type,item.etage,item.locataire,item.loyer,{creation:'Création',identique:'Ignorée : identique',conflit:'Conflit'}[item.decision]].forEach(v=>cell(tr,v));$('import-preview').append(tr);}
  }
  function render() {
    renderReferences();
    const s=loaded.state;const tbody=$('logements'),people=$('locataires');tbody.replaceChildren();people.replaceChildren();
    let legend=$('v2-type-counts');if(!legend){legend=document.createElement('p');legend.id='v2-type-counts';legend.className='type-summary';tbody.closest('section').querySelector('.table-wrap').before(legend);}
    legend.replaceChildren();for(const type of ['F2','F3','F4']){const chip=document.createElement('span');chip.className='type-chip';chip.dataset.type=type;chip.textContent=type+' : '+s.logements.filter(l=>l.actif && l.type===type).length;legend.append(chip);}
    const at=today(), money=n=>n===null || n===undefined?'—':Number(n).toLocaleString('fr-FR');
    const active=b=>b.statut==='actif' && (!b.arrivee || b.arrivee<=at) && (!b.depart || at<b.depart);
    const leases=new Map(s.locataires.map(t=>[t.id,s.baux.find(b=>b.locataireId===t.id && active(b))]));
    for(const t of s.locataires.filter(t=>!t.archive)){
      const b=leases.get(t.id),l=b?s.logements.find(l=>l.id===b.logementId):null,amount=b?ReferentielV2.rent(s,b.id,at):null;
      const tr=document.createElement('tr');tr.dataset.id=t.id;tr.dataset.type=l?.type || '';tr.tabIndex=0;tr.setAttribute('aria-selected',String(selectedTenant===t.id));
      const caution=b?.cautionPrevue ?? (amount!==null?Math.max(0,amount-2000):null);
      [l?.numero || '—',t.nom,l?.type || '—',money(amount),b?.arrivee || '—',b?.depart || '—',money(caution)+(b && b.cautionPrevue===null && amount!==null?' *':''),b?'Actif':'Inactif'].forEach(v=>cell(tr,v));
      tr.addEventListener('click',()=>{selectedTenant=t.id;render();});tr.addEventListener('keydown',e=>{if(e.key==='Enter'){selectedTenant=t.id;render();}});people.append(tr);
    }
    for(const l of s.logements){
      if(!l.actif)continue;
      const b=s.baux.find(b=>b.logementId===l.id && active(b));
      const rent=b?s.loyers.filter(r=>r.bailId===b.id && (!r.effet || r.effet<=at)).sort((a,b)=>(b.effet || '').localeCompare(a.effet || ''))[0]?.montant:null;
      const tr=document.createElement('tr');tr.dataset.id=l.id;tr.dataset.type=l.type;tr.tabIndex=0;tr.setAttribute('aria-selected',String(selectedHousing===l.id));[l.numero,l.type,l.etage,money(l.loyerReference ?? rent),b?'Occupé':l.disponibilite==='travaux'?'Travaux':'Libre'].forEach(v=>cell(tr,v));
      tr.addEventListener('click',()=>{selectedHousing=l.id;render();});tr.addEventListener('keydown',e=>{if(e.key==='Enter'){selectedHousing=l.id;render();}});tbody.append(tr);
    }
    options($('bail-filter'),s.logements,l=>`${l.numero} — ${l.type}`);
    options($('bail-form').elements.logementId,s.logements,l=>l.numero);
    options($('bail-form').elements.locataireId,s.locataires,t=>t.nom);
    options($('loyer-form').elements.bailId,s.baux.filter(b=>b.statut==='actif'),b=>`${s.logements.find(l=>l.id===b.logementId).numero} — ${s.locataires.find(t=>t.id===b.locataireId).nom}`);
    options($('tenant-edit'),[{id:'',nom:'Nouveau locataire'},...s.locataires],t=>t.nom);
    options($('logement-edit'),[{id:'',numero:'Ajouter un nouveau logement / local'},...s.logements],l=>l.numero);
    $('numeros').replaceChildren();for(const n of new Set([...Array.from({length:20},(_,i)=>String(i+1).padStart(2,'0')),...s.logements.map(l=>N.numero(l.numero))])){const o=document.createElement('option');o.value=n;$('numeros').append(o);}
    $('history').textContent=JSON.stringify(s.historique,null,2);
    $('environment').textContent=`REC — révision ${loaded.revision} — V2 ${loaded.active?'active':'inactive (lecture/simulation uniquement)'}`;
    $('migration-section').hidden=!!s.logements.length;
    document.querySelectorAll('form button').forEach(b=>{b.disabled=!writable();});renderBaux();
  }
  async function load(){loaded=await call({action:'v2.read'});pendingImport=null;pendingMigration=null;pendingWrite=null;render();}
  async function write(command){
    if(!writable())throw Error('Écriture non autorisée : V2 inactive ou accès en lecture seule.');
    if(pendingWrite && JSON.stringify(pendingWrite.command)!==JSON.stringify(command))throw Error('Une écriture reste incertaine. Réessayez la même demande ou actualisez le référentiel.');
    pendingWrite ??= {action:'v2.write',requestId:crypto.randomUUID(),expectedRevision:loaded.revision,command};
    try{await call(pendingWrite);}catch(e){if(e.authoritative)pendingWrite=null;throw e;}
    await load();message('Modification enregistrée. Aucune opération financière créée.');
  }
  const values=form=>Object.fromEntries(new FormData(form));
  for(const action of ['logement','locataire','bail','loyer','reference']) {
    const form=$(action+'-form');form.addEventListener('submit',event=>{event.preventDefault();guarded(async()=>{
      const data=values(form);if(!data.id)delete data.id;
      if(action==='logement'){data.actif=form.elements.actif.checked;data.numero=N.numero(data.numero);data.type=N.type(form.elements.type.value);data.etage=N.etage(form.elements.etage.value);if(!data.loyerReference)data.loyerReference=null;}
      if(action==='locataire'){data.cassePersonnalisee=form.elements.cassePersonnalisee.checked;data.nom=N.nom(data.nom,data.cassePersonnalisee);}
      if(action==='reference')data.actif=form.elements.actif.checked;
      if(action==='bail') {
        data.logementId=form.elements.logementId.value;data.locataireId=form.elements.locataireId.value;
        for(const k of ['arrivee','depart','suiviFinancierDepuis','cautionPrevue'])if(!data[k])data[k]=null;
        if(data.id)delete data.loyer;
      }
      await write({action,data});form.reset();if(action==='bail')setBailForm();if(action==='logement')editHousing();
    });});
  }
  $('bail-form').addEventListener('reset',()=>{queueMicrotask(()=>{const f=$('bail-form');f.elements.id.value='';for(const k of ['logementId','locataireId','loyer'])f.elements[k].disabled=false;f.elements.loyer.required=true;$('initial-rent').hidden=false;});});
  $('logement-form').addEventListener('reset',()=>{queueMicrotask(()=>{$('logement-form').elements.id.value='';$('logement-edit').value='';$('housing-title').textContent='Ajouter un logement / local';$('housing-save').textContent='Ajouter le logement / local';});});
  $('locataire-form').addEventListener('reset',()=>{queueMicrotask(()=>{$('locataire-form').elements.id.value='';});});
  $('tenant-edit').addEventListener('change',()=>{const t=loaded.state.locataires.find(t=>t.id===$('tenant-edit').value);fill($('locataire-form'),t?{...t,cassePersonnalisee:!!t.cassePersonnalisee}: {id:'',nom:'',complement:'',cassePersonnalisee:false});});
  $('logement-edit').addEventListener('change',()=>editHousing($('logement-edit').value));
  $('reference-category').addEventListener('change',()=>{const f=$('reference-form');f.elements.id.value='';f.elements.label.value='';f.elements.actif.checked=true;renderReferences();});
  $('reference-edit').addEventListener('change',()=>{const f=$('reference-form'),r=ReferentielV2.references(loaded.state)[f.elements.category.value].find(r=>r.id===$('reference-edit').value);fill(f,r || {id:'',label:'',actif:true});});
  $('reference-form').addEventListener('reset',()=>queueMicrotask(()=>{const f=$('reference-form');f.elements.id.value='';renderReferences();$('reference-edit').value='';}));
  $('bail-filter').addEventListener('change',renderBaux);
  const focusForm=id=>$(id).scrollIntoView({behavior:'smooth',block:'start'});
  $('tenant-add').addEventListener('click',()=>{$('locataire-form').reset();$('tenant-edit').value='';focusForm('locataire-form');});
  $('tenant-modify').addEventListener('click',()=>{const t=loaded?.state.locataires.find(t=>t.id===selectedTenant);if(!t)return message('Sélectionnez un locataire dans le tableau.');fill($('locataire-form'),{...t,cassePersonnalisee:!!t.cassePersonnalisee});$('tenant-edit').value=t.id;focusForm('locataire-form');});
  $('tenant-modify').after(button('Modifier entrée / sortie / caution',()=>{const b=loaded?.state.baux.find(b=>b.locataireId===selectedTenant && b.statut==='actif');if(!b)return message('Sélectionnez un locataire ayant un bail actif.');$('bail-filter').value=b.logementId;renderBaux();setBailForm(b);focusForm('bail-form');}));
  $('tenant-delete').addEventListener('click',()=>guarded(async()=>{const t=loaded?.state.locataires.find(t=>t.id===selectedTenant);if(!t)throw Error('Sélectionnez un locataire.');if(loaded.state.baux.some(b=>b.locataireId===t.id && b.statut==='actif'))throw Error('Terminez d’abord le bail et renseignez sa date de sortie. Le locataire restera inactif et son historique sera conservé.');if(!confirm('Archiver '+t.nom+' ? Son historique restera conservé.'))return;await write({action:'archiver',data:{entity:'locataires',id:t.id}});selectedTenant='';}));
  $('housing-add').addEventListener('click',()=>{editHousing();focusForm('logement-form');});
  $('housing-modify').addEventListener('click',()=>{if(!selectedHousing)return message('Sélectionnez un logement dans le tableau.');editHousing(selectedHousing);focusForm('logement-form');});
  $('housing-delete').addEventListener('click',()=>guarded(async()=>{const l=loaded?.state.logements.find(l=>l.id===selectedHousing);if(!l)throw Error('Sélectionnez un logement.');if(loaded.state.baux.some(b=>b.logementId===l.id && b.statut==='actif'))throw Error('Terminez d’abord la location active ; aucune information ne sera supprimée.');if(!confirm('Archiver le logement '+l.numero+' ? Ses anciens baux resteront conservés.'))return;await write({action:'archiver',data:{entity:'logements',id:l.id}});selectedHousing='';}));
  $('migration-preview').addEventListener('click',()=>guarded(async()=>{
    pendingMigration=null;
    if(loaded.state.logements.length)throw Error('Le référentiel V2 contient déjà des logements. Migration refusée.');
    const legacy=await call({action:'rec.reference'}),units=legacy.units;
    const etage=num=>['05','06','09','10','11','12'].includes(num)?'1er étage':['15','16','18','19','20'].includes(num)?'2e étage':num==='21'?'Toit':null;
    if(!Array.isArray(units) || units.length!==12 || new Set(units.map(u=>N.numero(String(u.num)))).size!==12)throw Error('Le référentiel REC attendu de 12 logements est incomplet. Aucune migration possible.');
    const rows=units.map(u=>({num:N.numero(String(u.num)),type:String(u.type),etage:etage(N.numero(String(u.num))),locataire:String(u.locataire),loyer:Number(u.loyer)}));
    if(rows.some(r=>!r.etage))throw Error('Un étage reste inconnu. Migration bloquée.');
    const r=await call({action:'v2.simulate',rows});
    if(r.report.conflits || r.report.creations!==12 || r.report.transactionsCreees!==0)throw Error('Simulation non conforme. Aucune donnée importée.');
    $('migration-summary').textContent=`Aperçu : ${r.report.creations} logements et ${r.report.creations} affectations, total ${r.report.totalMensuel.toLocaleString('fr-FR')} DA/mois. Dates laissées vides. Aucune transaction importée.`;
    pendingMigration={rows,expectedRevision:r.revision,preview:r.preview,requestId:crypto.randomUUID()};
  }));
  $('migration-confirm').addEventListener('click',()=>guarded(async()=>{
    if(!pendingMigration)throw Error('Prévisualisez d’abord les 12 fiches.');
    if(!confirm('Confirmer une seule migration de 12 fiches vers V2 REC ? Les anciennes transactions et la configuration historique resteront inchangées.'))return;
    const p=pendingMigration;await call({action:'v2.import',...p});pendingMigration=null;await load();message('12 fiches migrées dans V2 REC. Aucune transaction historique importée.');
  }));
  $('bail-form').elements.loyer.addEventListener('input',()=>{const f=$('bail-form'),rent=Number(f.elements.loyer.value);if(!f.elements.cautionPrevue.value && f.elements.loyer.value && Number.isFinite(rent))f.elements.cautionPrevue.value=String(Math.max(0,rent-2000));});
  $('reload').addEventListener('click',()=>guarded(async()=>{await load();message('Référentiel actualisé.');}));
  $('import-file').addEventListener('change',()=>{pendingImport=null;$('import-apply').disabled=true;$('report').textContent='';$('import-summary').textContent='';$('import-preview').replaceChildren();});
  $('simulate').addEventListener('click',()=>guarded(async()=>{
    pendingImport=null;const file=$('import-file').files[0];if(!file)throw Error('Choisir un fichier Excel, CSV ou JSON.');
    const parsed=await V2Import.read(file),rows=ReferentielV2.normalize(parsed.rows);const r=await call({action:'v2.simulate',rows});renderPreview(r.report,parsed);$('report').textContent='Les conflits bloquent tout import. Aucune mise à jour automatique ; corriger les fiches depuis leurs formulaires.';
    if(!r.report.conflits)pendingImport={rows,revision:r.revision,preview:r.preview,requestId:crypto.randomUUID()};message('Simulation terminée : aucune écriture.');
  }));
  $('import-apply').addEventListener('click',()=>guarded(async()=>{
    if(!pendingImport)throw Error('Simuler avant application.');
    if(!window.confirm(`Confirmer l’import de ${pendingImport.rows.length} lignes dans REC ? Aucune transaction financière ne sera créée.`))return;
    await call({action:'v2.import',rows:pendingImport.rows,expectedRevision:pendingImport.revision,requestId:pendingImport.requestId,preview:pendingImport.preview});await load();message('Import enregistré ; aucune transaction créée.');
  }));
  guarded(async()=>{await load();message('Référentiel chargé.');});
})();