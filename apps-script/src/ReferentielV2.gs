/* Modèle partagé Apps Script/Node/navigateur, sans I/O ni données personnelles. */
var ReferentielV2 = (() => {
  'use strict';
  const entities = ['logements','locataires','baux','loyers','historique','imports'];
  const fail = code => { throw new Error(code); };
  const copy = x => JSON.parse(JSON.stringify(x));
  const empty = () => Object.fromEntries(entities.map(k => [k, []]));
  function text(x, required = true) {
    if (typeof x !== 'string' || x.length > 2000 || (required && !x.trim()) || /^[\s\u0000-\u001f]*[=+@-]/.test(x) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(x)) fail('INVALID_TEXT');
    return x.trim().replace(/\s+/g,' ');
  }
  const key = x => text(x).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const numero = x => {const n=text(x).toUpperCase();return /^\d+$/.test(n)?n.replace(/^0+(?=\d)/,'').padStart(2,'0'):n;};
  const type = x => text(x).replace(/^f\s*(\d+)$/i,(_,n)=>'F'+Number(n)).replace(/^local$/i,'Local');
  function etage(x) {
    const v=text(x,false),k=v.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[ ._-]/g,'');
    if(['rdc','rezdechaussee','rezdechausse'].includes(k))return 'RDC';
    if(['toit','terrasse'].includes(k))return 'Toit';
    const n=k.match(/^(\d+)(?:er|ere|e|eme)?(?:etage)?$/);
    return n?Number(n[1])+(Number(n[1])===1?'er étage':'e étage'):v;
  }
  const nom = (x,preserve=false) => {const v=text(x);return preserve?v:v.toLocaleLowerCase('fr').replace(/(^|[\s'’\-])(\p{L})/gu,(_,sep,c)=>sep+c.toLocaleUpperCase('fr'));};
  const defaults={types:['F2','F3','F4','Local'],etages:['RDC','1er étage','2e étage','3e étage','Toit']};
  function references(s) {
    const out={};
    for(const category of ['types','etages']) {
      const normal=category==='types'?type:etage;
      const labels=defaults[category];
      out[category]=[...new Set(labels)].map(label=>({id:category+':'+key(label),label,actif:true}));
      for(const h of s.historique.filter(h=>h.entity==='references' && h.apres.category===category)) {
        const i=out[category].findIndex(r=>r.id===h.entityId);
        const row={id:h.entityId,label:h.apres.label,actif:h.apres.actif};
        if(i<0)out[category].push(row);else out[category][i]=row;
      }
      for(const l of s.logements){const label=normal(l[category==='types'?'type':'etage']);if(label && !out[category].some(r=>key(r.label)===key(label)))out[category].push({id:category+':'+key(label),label,actif:true});}
    }
    return out;
  }
  function allowedReference(s,category,value,previous) {
    if(!value && category==='etages')return;
    if(previous!==undefined && key(value)===key(previous))return;
    if(!references(s)[category].some(r=>r.actif && key(r.label)===key(value)))fail('INACTIVE_OR_UNKNOWN_REFERENCE');
  }
  function date(x) {
    if (x === null || x === '') return null;
    if (typeof x !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x)) fail('INVALID_DATE');
    const d = new Date(x + 'T00:00:00Z');
    if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0,10) !== x) fail('INVALID_DATE');
    return x;
  }
  function amount(x, optional = false) {
    if (optional && (x === null || x === '')) return null;
    if (!['string','number'].includes(typeof x) || (typeof x === 'string' && !/^\d+(\.\d{1,2})?$/.test(x))) fail('INVALID_AMOUNT');
    const n = Number(x);
    if (!Number.isFinite(n) || n < 0 || n > 1e9 || Math.abs(n*100-Math.round(n*100)) > .00001) fail('INVALID_AMOUNT');
    return n;
  }
  function object(x, fields) {
    if (!x || typeof x !== 'object' || Array.isArray(x) || Object.keys(x).some(k => !fields.includes(k))) fail('INVALID_FIELDS');
  }
  const find = (s,k,id) => s[k].find(r => r.id === id) || fail('NOT_FOUND');
  function validate(s) {
    object(s, entities);
    for (const k of entities) {
      if (!Array.isArray(s[k])) fail('INVALID_STATE');
      const ids = new Set();
      for (const row of s[k]) { text(row.id); if (ids.has(row.id)) fail('DUPLICATE_ID'); ids.add(row.id); }
    }
    const nums = new Set();
    s.logements.forEach(r => {
      object(r,['id','numero','type','etage','actif']); text(r.numero);text(r.type);text(r.etage,false);
      if (r.numero !== r.numero.trim() || nums.has(numero(r.numero)) || typeof r.actif !== 'boolean') fail('INVALID_LOGEMENT'); nums.add(numero(r.numero));
    });
    s.locataires.forEach(r => {object(r,['id','nom','complement','cassePersonnalisee']);text(r.nom);text(r.complement,false);});
    s.baux.forEach(b => {
      object(b,['id','logementId','locataireId','arrivee','depart','suiviFinancierDepuis','statut','cautionPrevue','devise']);
      find(s,'logements',b.logementId);find(s,'locataires',b.locataireId);
      date(b.arrivee);date(b.depart);date(b.suiviFinancierDepuis);amount(b.cautionPrevue,true);
      if (!['actif','termine'].includes(b.statut) || b.devise !== 'DZD' || (b.statut === 'termine' && !b.depart)) fail('INVALID_BAIL');
      if (b.arrivee && b.depart && b.depart <= b.arrivee) fail('INVALID_INTERVAL');
      if (b.suiviFinancierDepuis && ((b.arrivee && b.suiviFinancierDepuis < b.arrivee) || (b.depart && b.suiviFinancierDepuis >= b.depart))) fail('INVALID_FINANCIAL_START');
      if (!s.loyers.some(l => l.bailId === b.id)) fail('MISSING_RENT');
    });
    for (let i=0;i<s.baux.length;i++) for (let j=i+1;j<s.baux.length;j++) {
      const a=s.baux[i], b=s.baux[j];
      // Intervalles [arrivée, départ) ; une arrivée inconnue est une borne ouverte prudente.
      if (a.logementId === b.logementId && (a.arrivee || '0000') < (b.depart || '9999') && (b.arrivee || '0000') < (a.depart || '9999')) fail('OVERLAPPING_BAILS');
    }
    s.loyers.forEach(l => {
      object(l,['id','bailId','montant','effet']);find(s,'baux',l.bailId);amount(l.montant);date(l.effet);
      if (s.loyers.some(o => o.id !== l.id && o.bailId === l.bailId && o.effet === l.effet)) fail('DUPLICATE_RENT_DATE');
      const b=find(s,'baux',l.bailId);
      if (l.effet && ((b.arrivee && l.effet < b.arrivee) || (b.depart && l.effet >= b.depart))) fail('RENT_OUTSIDE_BAIL');
    });
    return s;
  }
  function rent(s,id,at) {
    return s.loyers.filter(l => l.bailId === id && (!l.effet || l.effet <= at)).sort((a,b)=>(b.effet || '').localeCompare(a.effet || ''))[0]?.montant ?? null;
  }
  function legacy(s,at) {
    return s.logements.filter(l=>l.actif).map(l=>{
      const b=s.baux.find(b=>b.logementId===l.id && (!b.arrivee || b.arrivee<=at) && (!b.depart || at<b.depart));
      return {num:l.numero,type:l.type,locataire:b?find(s,'locataires',b.locataireId).nom:'',loyer:b?rent(s,b.id,at) ?? 0:0};
    });
  }
  function financial(s,id,period) {
    const b=find(s,'baux',id);date(period);if(!period)fail('INVALID_DATE');
    return {bailId:id,statut:(b.arrivee && period<b.arrivee) || (b.depart && period>=b.depart)?'hors_bail':!b.suiviFinancierDepuis || period<b.suiviFinancierDepuis?'non_determine':'a_rapprocher',
      cautionPrevue:b.cautionPrevue,cautionEncaissee:null,restitutions:null,retenues:null,soldeARestituer:null};
  }
  function apply(state, command, ctx) {
    validate(state);object(command,['action','data']);
    const s=copy(state), d=command.data;
    text(ctx.actor);text(ctx.now);const id=()=>ctx.id();
    let entity, before=null, after;
    if(command.action==='reference') {
      object(d,['id','category','label','actif']);
      if(!['types','etages'].includes(d.category) || typeof d.actif!=='boolean')fail('INVALID_REFERENCE');
      const normal=d.category==='types'?type:etage,label=normal(d.label);text(label);
      const rows=references(s)[d.category],previous=d.id?rows.find(r=>r.id===d.id):null;
      if(d.id && !previous)fail('NOT_FOUND');
      if(rows.some(r=>r.id!==d.id && key(r.label)===key(label)))fail('DUPLICATE_REFERENCE');
      if(previous && key(label)!==key(previous.label) && s.logements.some(l=>key(normal(l[d.category==='types'?'type':'etage']))===key(previous.label)))fail('REFERENCE_IN_USE');
      const refId=previous?.id || id();
      s.historique.push({id:id(),entity:'references',entityId:refId,avant:previous,apres:{category:d.category,label,actif:d.actif},auteur:ctx.actor,date:ctx.now});
      return validate(s);
    }
    switch(command.action) {
      case 'logement':
        object(d,['id','numero','type','etage','actif']);
        entity='logements';if(d.id)before=copy(find(s,entity,d.id));
        after={id:d.id || id(),numero:numero(d.numero),type:type(d.type),etage:etage(d.etage ?? ''),actif:d.actif};
        allowedReference(s,'types',after.type,before?.type);allowedReference(s,'etages',after.etage,before?.etage);break;
      case 'locataire':
        object(d,['id','nom','complement','cassePersonnalisee']);entity='locataires';if(d.id)before=copy(find(s,entity,d.id));
        if(d.cassePersonnalisee!==undefined && typeof d.cassePersonnalisee!=='boolean')fail('INVALID_FIELDS');
        after={id:d.id || id(),nom:nom(d.nom,d.cassePersonnalisee===true),complement:text(d.complement ?? '',false)};
        if(d.cassePersonnalisee)after.cassePersonnalisee=true;
        if(s.locataires.some(t=>t.id!==after.id && key(t.nom)===key(after.nom)))fail('DUPLICATE_TENANT');break;
      case 'bail':
        object(d,['id','logementId','locataireId','arrivee','depart','suiviFinancierDepuis','statut','cautionPrevue','loyer']);entity='baux';
        if(d.id) {
          before=copy(find(s,entity,d.id));
          if (d.logementId !== before.logementId || d.locataireId !== before.locataireId || d.loyer !== undefined) fail('IMMUTABLE_BAIL_PARTIES');
        }
        after={id:d.id || id(),logementId:d.logementId,locataireId:d.locataireId,arrivee:date(d.arrivee ?? null),depart:date(d.depart ?? null),suiviFinancierDepuis:date(d.suiviFinancierDepuis ?? null),statut:d.statut,cautionPrevue:amount(d.cautionPrevue ?? null,true),devise:'DZD'};
        if(!before)s.loyers.push({id:id(),bailId:after.id,montant:amount(d.loyer),effet:null});
        break;
      case 'loyer': {
        object(d,['bailId','montant','effet']);const b=find(s,'baux',d.bailId);const effet=date(d.effet);
        if(!effet || b.statut!=='actif' || effet<(ctx.today || ctx.now.slice(0,10)) || s.loyers.some(l=>l.bailId===b.id && l.effet && l.effet>=effet))fail('INVALID_RENT_EFFECT');
        entity='loyers';after={id:id(),bailId:b.id,montant:amount(d.montant),effet};break;
      }
      default:fail('INVALID_ACTION');
    }
    const index=s[entity].findIndex(r=>r.id===after.id);
    if(index<0)s[entity].push(after);else s[entity][index]=after;
    s.historique.push({id:id(),entity,entityId:after.id,avant:before,apres:copy(after),auteur:ctx.actor,date:ctx.now});
    return validate(s);
  }
  function normalize(rows) {
    if(!Array.isArray(rows) || !rows.length || rows.length>5000)fail('INVALID_IMPORT');
    const nums=new Set();
    return rows.map(r=>{
      object(r,['num','type','etage','locataire','loyer']);text(r.num);text(r.type);text(r.etage,false);text(r.locataire);
      const num=numero(r.num);if(nums.has(num))fail('DUPLICATE_NUMBER');nums.add(num);
      return {num,type:type(r.type),etage:etage(r.etage),locataire:nom(r.locataire),loyer:amount(r.loyer)};
    }).sort((a,b)=>a.num.localeCompare(b.num));
  }
  // Identité déterministe du contenu ; ce n'est pas une signature d'autorisation.
  function fingerprint(rows) {return JSON.stringify(normalize(rows));}
  function simulate(s,rows,at) {
    validate(s);const source=normalize(rows);
    const items=source.map(r=>{
      const l=s.logements.find(l=>numero(l.numero)===r.num);
      if(!l){allowedReference(s,'types',r.type);allowedReference(s,'etages',r.etage);return {...r,decision:s.locataires.filter(t=>key(t.nom)===key(r.locataire)).length>1?'conflit':'creation'};}
      const b=s.baux.find(b=>b.logementId===l.id && (!b.arrivee || b.arrivee<=at) && (!b.depart || at<b.depart));
      const same=l.actif && type(l.type)===r.type && etage(l.etage)===r.etage && b && key(find(s,'locataires',b.locataireId).nom)===key(r.locataire) && rent(s,b.id,at)===r.loyer;
      return {...r,decision:same?'identique':'conflit'};
    });
    return {total:source.length,creations:items.filter(i=>i.decision==='creation').length,identiques:items.filter(i=>i.decision==='identique').length,conflits:items.filter(i=>i.decision==='conflit').length,misesAJour:0,ignorees:items.filter(i=>i.decision==='identique').length,totalMensuel:source.reduce((n,r)=>n+Math.round(r.loyer*100),0)/100,transactionsCreees:0,items};
  }
  function importRows(state,rows,ctx) {
    const report=simulate(state,rows,ctx.today || ctx.now.slice(0,10));if(report.conflits)fail('IMPORT_CONFLICT');let s=copy(state);
    for(const r of normalize(rows)) {
      if(s.logements.some(l=>numero(l.numero)===r.num))continue;
      s=apply(s,{action:'logement',data:{numero:r.num,type:r.type,etage:r.etage,actif:true}},ctx);const l=s.logements.at(-1);
      const matches=s.locataires.filter(t=>key(t.nom)===key(r.locataire));if(matches.length>1)fail('AMBIGUOUS_TENANT');
      let t=matches[0];if(!t){s=apply(s,{action:'locataire',data:{nom:r.locataire}},ctx);t=s.locataires.at(-1);}
      s=apply(s,{action:'bail',data:{logementId:l.id,locataireId:t.id,statut:'actif',loyer:r.loyer}},ctx);
    }
    if(report.creations)s.imports.push({id:ctx.id(),source:fingerprint(rows),date:ctx.now,auteur:ctx.actor,rapport:report});
    return validate(s);
  }
  function delta(a,b) {return Object.fromEntries(entities.map(k=>[k,b[k].filter(row=>JSON.stringify(a[k].find(r=>r.id===row.id))!==JSON.stringify(row))]));}
  function replay(s,patch) {
    const next=copy(s);object(patch,entities);
    for(const k of entities){if(!Array.isArray(patch[k]))fail('INVALID_PATCH');for(const row of patch[k]){const i=next[k].findIndex(r=>r.id===row.id);if(i<0)next[k].push(row);else next[k][i]=row;}}
    return validate(next);
  }
  return {normalizers:{numero,type,etage,nom},references,empty,validate,apply,legacy,rent,financial,normalize,fingerprint,simulate,importRows,delta,replay};
})();
