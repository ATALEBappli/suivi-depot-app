/* Modèle partagé Apps Script/Node/navigateur, sans I/O ni données personnelles. */
var ReferentielV2 = (() => {
  'use strict';
  const entities = ['logements','locataires','baux','loyers','historique','imports'];
  const fail = code => { throw new Error(code); };
  const copy = x => JSON.parse(JSON.stringify(x));
  const empty = () => Object.fromEntries(entities.map(k => [k, []]));
  function text(x, required = true) {
    if (typeof x !== 'string' || x.length > 2000 || (required && !x.trim()) || /^[\s\u0000-\u001f]*[=+@-]/.test(x) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(x)) fail('INVALID_TEXT');
    return x;
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
      if (r.numero !== r.numero.trim() || nums.has(r.numero) || typeof r.actif !== 'boolean') fail('INVALID_LOGEMENT'); nums.add(r.numero);
    });
    s.locataires.forEach(r => {object(r,['id','nom','complement']);text(r.nom);text(r.complement,false);});
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
    switch(command.action) {
      case 'logement':
        object(d,['id','numero','type','etage','actif']);
        entity='logements';if(d.id)before=copy(find(s,entity,d.id));
        after={id:d.id || id(),numero:text(d.numero),type:text(d.type),etage:text(d.etage ?? '',false),actif:d.actif};break;
      case 'locataire':
        object(d,['id','nom','complement']);entity='locataires';if(d.id)before=copy(find(s,entity,d.id));
        after={id:d.id || id(),nom:text(d.nom),complement:text(d.complement ?? '',false)};break;
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
    if(!Array.isArray(rows) || rows.length>5000)fail('INVALID_IMPORT');
    const nums=new Set();
    return rows.map(r=>{
      object(r,['num','type','etage','locataire','loyer']);text(r.num);text(r.type);text(r.etage,false);text(r.locataire);
      if(r.num!==r.num.trim() || nums.has(r.num))fail('DUPLICATE_NUMBER');nums.add(r.num);
      return {num:r.num,type:r.type,etage:r.etage,locataire:r.locataire,loyer:amount(r.loyer)};
    }).sort((a,b)=>a.num.localeCompare(b.num));
  }
  // Identité déterministe du contenu ; ce n'est pas une signature d'autorisation.
  function fingerprint(rows) {return JSON.stringify(normalize(rows));}
  function simulate(s,rows,at) {
    validate(s);const source=normalize(rows);
    const items=source.map(r=>{
      const l=s.logements.find(l=>l.numero===r.num);
      if(!l)return {num:r.num,decision:'creation'};
      const b=s.baux.find(b=>b.logementId===l.id && (!b.arrivee || b.arrivee<=at) && (!b.depart || at<b.depart));
      const same=l.actif && l.type===r.type && l.etage===r.etage && b && find(s,'locataires',b.locataireId).nom===r.locataire && rent(s,b.id,at)===r.loyer;
      return {num:r.num,decision:same?'identique':'conflit'};
    });
    return {total:source.length,creations:items.filter(i=>i.decision==='creation').length,identiques:items.filter(i=>i.decision==='identique').length,conflits:items.filter(i=>i.decision==='conflit').length,transactionsCreees:0,items};
  }
  function importRows(state,rows,ctx) {
    const report=simulate(state,rows,ctx.today || ctx.now.slice(0,10));if(report.conflits)fail('IMPORT_CONFLICT');let s=copy(state);
    for(const r of normalize(rows)) {
      if(s.logements.some(l=>l.numero===r.num))continue;
      s=apply(s,{action:'logement',data:{numero:r.num,type:r.type,etage:r.etage,actif:true}},ctx);const l=s.logements.at(-1);
      s=apply(s,{action:'locataire',data:{nom:r.locataire}},ctx);const t=s.locataires.at(-1);
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
  return {empty,validate,apply,legacy,rent,financial,normalize,fingerprint,simulate,importRows,delta,replay};
})();
