/******************** Onglets (Synthèse / Saisie / Paramétrage) ********************/
function openTab(id, btn) {
  document.querySelectorAll('.tabcontent').forEach(sec => (sec.style.display = 'none'));
  const el = document.getElementById(id);
  if (el) el.style.display = 'block';

  // Si on ouvre Saisie : rafraîchir les sous-blocs + blocs APP/LOC/HEDAM/Élec
  if (id === 'saisie') {
    if (typeof populateFormSousBloc === 'function') populateFormSousBloc();
    if (typeof toggleAppExtra === 'function')   toggleAppExtra();
    if (typeof toggleLocExtra === 'function')   toggleLocExtra();
    if (typeof toggleHedamExtra === 'function') toggleHedamExtra();
    if (typeof toggleElecExtra === 'function')  toggleElecExtra();
  }

  document.querySelectorAll('.tablink').forEach(b => b.classList.remove('active'));
  (btn || document.querySelector(`.tablink[data-tab="${id}"]`))?.classList.add('active');
}


document.addEventListener('DOMContentLoaded', () => {
  const defaultBtn = document.querySelector('.tablink[data-tab="synthese"]');
  openTab('synthese', defaultBtn);
});

/******** Loader overlay ********/
function setBusy(on, msg) {
  const el = document.getElementById('busy');
  if (!el) return;
  const p = document.getElementById('busy-msg');
  if (p && msg) p.textContent = msg;
  el.hidden = !on;
}

/* ===== Toast utilitaire ===== */
function showToast(message, type = 'info', duration = 4200) {
  const wrap = document.getElementById('toast');
  if (!wrap) return alert(message); // fallback si pas de div

  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.role = 'status';
  el.textContent = message;

  // clic pour fermer
  el.addEventListener('click', () => el.remove());

  wrap.appendChild(el);
  // auto-remove après la durée d’anim (CSS toast-out = démarre à 4.2s)
  setTimeout(() => el.remove(), duration + 400);
}

/****************************** Utilitaires ******************************/
function jsonp(url, { timeoutMs = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    const cb = 'cb_' + Math.random().toString(36).slice(2);
    const s  = document.createElement('script');
    const where = document.head || document.body || document.documentElement;

    let done = false;
    const finish = (fn, val) => {
      if (done) return;
      done = true;
      try { delete window[cb]; } catch {}
      if (s && s.parentNode) s.parentNode.removeChild(s);
      clearTimeout(tid);
      fn(val);
    };

    window[cb] = data => finish(resolve, data);
    s.onerror   = ()  => finish(reject, new Error('JSONP error'));

    const sep = url.includes('?') ? '&' : '?';
    s.src = `${url}${sep}callback=${cb}`;

    // Sécurité: timeout
    const tid = setTimeout(() => finish(reject, new Error('JSONP timeout')), timeoutMs);

    where.appendChild(s);
  });
}


const fmt = n =>
  Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

let RAW = []; // toutes les lignes
let DF = [];  // lignes filtrées

function computeMois(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(+d)) return '';
  return d.toISOString().slice(0, 7); // YYYY-MM
}

/****************************** Synthèse ******************************/
function refreshKpis() {
  const totalIn = DF.filter(r => r.type === 'Entrée').reduce((s, r) => s + Number(r.montant || 0), 0);
  const totalOut = DF.filter(r => r.type === 'Sortie').reduce((s, r) => s + Number(r.montant || 0), 0);
  const solde = totalIn - totalOut;
  const kpis = document.querySelector('#kpis');
  if (kpis) kpis.textContent = `Entrées: ${fmt(totalIn)}  |  Sorties: ${fmt(totalOut)}  |  Solde: ${fmt(solde)}`;
}

function fillFilters() {
  const moisSel = document.querySelector('#mois');
  if (moisSel) {
    const moisSet = new Set(RAW.map(r => r._mois).filter(Boolean));
    moisSel.innerHTML =
      `<option value="">(Tous)</option>` +
      [...moisSet].sort().reverse().map(m => `<option>${m}</option>`).join('');
  }

  const sbSel = document.querySelector('#sous_bloc');
  if (sbSel) {
    const sbSet = new Set(RAW.map(r => r.sous_bloc).filter(Boolean));
    sbSel.innerHTML =
      `<option value="">(Tous)</option>` + [...sbSet].sort().map(m => `<option>${m}</option>`).join('');
  }
}

function applyFilters() {
  const m = (document.querySelector('#mois')?.value || '');
  const t = (document.querySelector('#type')?.value || '');
  const s = (document.querySelector('#sous_bloc')?.value || '');

  DF = RAW.filter(r => (!m || r._mois === m) && (!t || r.type === t) && (!s || r.sous_bloc === s));
  renderTable();
  refreshKpis();
}

function renderTable() {
  const tb = document.querySelector('#table tbody');
  if (!tb) return;

  tb.innerHTML = DF
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    .reverse()
    .map(
      r => `
      <tr>
        <td>${(r.date || '').slice(0, 10)}</td>
        <td>${r.type || ''}</td>
        <td>${r.sous_bloc || ''}</td>
        <td class="num">${fmt(r.montant)}</td>
        <td>${r.description || ''}</td>
      </tr>`
    )
    .join('');
}

async function load() {
  try {
    setBusy(true, 'Chargement des données…');
    const data = await jsonp(window.API_URL);
    if (!data || !data.ok) throw new Error((data && data.error) || 'Réponse invalide');

    RAW = (data.rows || []).map(r => ({
      ...r,
      montant: Number(String(r.montant || '').replace(',', '.').replace(/\s/g, '')) || 0,
      _mois: computeMois(r.date)
    }));

    fillFilters();
    applyFilters();
  } catch (e) {
    const k = document.querySelector('#kpis');
    if (k) k.textContent = 'Erreur de chargement : ' + e.message;
  } finally {
    setBusy(false);
  }
}

['#mois', '#type', '#sous_bloc'].forEach(sel => {
  document.addEventListener('change', ev => {
    if (ev.target.matches(sel)) applyFilters();
  });
});

document.addEventListener('DOMContentLoaded', () => {
  // Vérifie que l’URL API est bien définie
  if (!window.API_URL) {
    console.warn('API_URL manquante');
    const k = document.querySelector('#kpis');
    if (k) k.textContent = 'Erreur: API_URL non définie';
    return;
  }
  // Lance le chargement après que le DOM est prêt
  load().catch(err => {
    console.error(err);
    const k = document.querySelector('#kpis');
    if (k) k.textContent = 'Erreur de chargement : ' + err.message;
  });
});

/***load(); ****/ 

/**************** Paramétrage : Appartements + Locaux via API Google Sheets ****************/
let APARTS = [];
let LOCAUX  = [];
let HEDAM = []; 

// lit toute la config: {logements, locaux}
async function apiReadConfigAll() {
  const url = window.API_URL + (window.API_URL.includes('?') ? '&' : '?') + 'action=config&what=all';
  const res = await jsonp(url);
  if (!res || !res.ok) throw new Error((res && res.error) || 'config read failed');
  window.REFERENTIEL_V2_ACTIVE = res.referentielV2 === true;
  return res.config || { logements: [], locaux: [] };
}

async function apiSaveAparts(rows) {
  const payload = encodeURIComponent(JSON.stringify(rows || []));
  const url = window.API_URL + (window.API_URL.includes('?') ? '&' : '?') + 'action=config&save=logements&payload=' + payload;
  const res = await jsonp(url);
  if (!res || !res.ok) throw new Error((res && res.error) || 'config save failed');
}

async function apiSaveLocaux(rows) {
  const payload = encodeURIComponent(JSON.stringify(rows || []));
  const url = window.API_URL + (window.API_URL.includes('?') ? '&' : '?') + 'action=config&save=locaux&payload=' + payload;
  const res = await jsonp(url);
  if (!res || !res.ok) throw new Error((res && res.error) || 'config save failed');
}


async function apiSaveHedam(rows) {
  const payload = encodeURIComponent(JSON.stringify(rows || []));
  const url = window.API_URL + (window.API_URL.includes('?') ? '&' : '?') +
              'action=config&save=hedam&payload=' + payload;
  const res = await jsonp(url);
  if (!res || !res.ok) throw new Error((res && res.error) || 'hedam save failed');
}

/*** Paramétrage Appartements ***/
function renderApartsTable() {
  const tbody = document.querySelector('#cfg-log-table tbody');
  if (!tbody) return;
  const rows = APARTS;
  tbody.innerHTML = rows.map((r, i) => `
    <tr data-i="${i}">
      <td><input name="num"   type="text"  value="${r.num ?? ''}"            placeholder="ex: 06"        style="width:80px"></td>
      <td><input name="type"  type="text"  value="${r.type ?? ''}"           placeholder="F2/F3/F4"      style="width:100px"></td>
      <td><input name="loc"   type="text"  value="${r.locataire ?? ''}"      placeholder="Locataire"     style="min-width:220px"></td>
      <td><input name="loyer" type="number" step="0.01" value="${r.loyer ?? ''}" placeholder="€"         style="width:120px"></td>
      <td><button type="button" class="rm">✖</button></td>
    </tr>
  `).join('');
}

function collectApartsFromDOM() {
  const rows = [];
  document.querySelectorAll('#cfg-log-table tbody tr').forEach(tr => {
    const num   = tr.querySelector('input[name="num"]')?.value.trim() || '';
    const type  = tr.querySelector('input[name="type"]')?.value.trim() || '';
    const loc   = tr.querySelector('input[name="loc"]')?.value.trim() || '';
    const loyer = tr.querySelector('input[name="loyer"]')?.value || '';
    rows.push({
      num,
      type,
      locataire: loc,
      loyer: Number(String(loyer).replace(',', '.')) || 0,
    });
  });
  return rows;
}

function addApartRow() {
  const tbody = document.querySelector('#cfg-log-table tbody');
  if (!tbody) return;
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input name="num"   type="text"  placeholder="ex: 06"       style="width:80px"></td>
    <td><input name="type"  type="text"  placeholder="F2/F3/F4"     style="width:100px"></td>
    <td><input name="loc"   type="text"  placeholder="Locataire"    style="min-width:220px"></td>
    <td><input name="loyer" type="number" step="0.01" placeholder="€" style="width:120px"></td>
    <td><button type="button" class="rm">✖</button></td>`;
  tbody.appendChild(tr);
}

/*** Paramétrage Locaux ***/
function renderLocauxTable() {
  const tbody = document.querySelector('#cfg-loc-table tbody');
  if (!tbody) return;
  const rows = LOCAUX;
  tbody.innerHTML = rows.map((r, i) => `
    <tr data-i="${i}">
      <td><input name="code"  type="text"  value="${r.code ?? ''}"        placeholder="L1"          style="width:80px"></td>
      <td><input name="nom"   type="text"  value="${r.nom ?? ''}"         placeholder="Local RDC"   style="min-width:200px"></td>
      <td><input name="loc"   type="text"  value="${r.locataire ?? ''}"   placeholder="Locataire"   style="min-width:200px"></td>
      <td><input name="loyer" type="number" step="0.01" value="${r.loyer ?? ''}" placeholder="€"   style="width:120px"></td>
      <td><button type="button" class="rm">✖</button></td>
    </tr>
  `).join('');
}

function collectLocauxFromDOM() {
  const rows = [];
  document.querySelectorAll('#cfg-loc-table tbody tr').forEach(tr => {
    const code  = tr.querySelector('input[name="code"]')?.value.trim() || '';
    const nom   = tr.querySelector('input[name="nom"]')?.value.trim() || '';
    const loc   = tr.querySelector('input[name="loc"]')?.value.trim() || '';
    const loyer = tr.querySelector('input[name="loyer"]')?.value || '';
    rows.push({
      code,
      nom,
      locataire: loc,
      loyer: Number(String(loyer).replace(',', '.')) || 0,
    });
  });
  return rows;
}

function addLocRow() {
  const tbody = document.querySelector('#cfg-loc-table tbody');
  if (!tbody) return;
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input name="code"  type="text"  placeholder="L1"          style="width:80px"></td>
    <td><input name="nom"   type="text"  placeholder="Local RDC"   style="min-width:200px"></td>
    <td><input name="loc"   type="text"  placeholder="Locataire"   style="min-width:200px"></td>
    <td><input name="loyer" type="number" step="0.01" placeholder="€" style="width:120px"></td>
    <td><button type="button" class="rm">✖</button></td>`;
  tbody.appendChild(tr);
}

function renderHedamTable() {
  const tbody = document.querySelector('#cfg-hedam-table tbody');
  if (!tbody) return;
  const rows = HEDAM;
  tbody.innerHTML = rows.map((r, i) => `
    <tr data-i="${i}">
      <td><input name="code" type="text"  value="${r.code ?? ''}" placeholder="ex: PLO" style="width:90px"></td>
      <td><input name="nom"  type="text"  value="${r.nom  ?? ''}" placeholder="ex: Plombie" style="min-width:220px"></td>
      <td><button type="button" class="rm">✖</button></td>
    </tr>
  `).join('');
}

function collectHedamFromDOM() {
  const rows = [];
  document.querySelectorAll('#cfg-hedam-table tbody tr').forEach(tr => {
    const code = tr.querySelector('input[name="code"]')?.value.trim() || '';
    const nom  = tr.querySelector('input[name="nom"]') ?.value.trim() || '';
    if (code || nom) rows.push({ code, nom });
  });
  return rows;
}

function addHedamRow() {
  const tbody = document.querySelector('#cfg-hedam-table tbody');
  if (!tbody) return;
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input name="code" type="text" placeholder="ex: PLO" style="width:90px"></td>
    <td><input name="nom"  type="text" placeholder="ex: Plombie" style="min-width:220px"></td>
    <td><button type="button" class="rm">✖</button></td>`;
  tbody.appendChild(tr);
}


/*** Attache les handlers Paramétrage ***/
function attachParamHandlers() {
  // Appartements
  const addBtn = document.getElementById('cfg-log-add');
  if (addBtn) addBtn.addEventListener('click', addApartRow);

  const saveBtn = document.getElementById('cfg-log-save');
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const msg = document.getElementById('cfg-log-msg');
      try {
        setBusy(true, 'Sauvegarde du paramétrage…');
        const rows = collectApartsFromDOM().filter(r => r.num || r.type || r.locataire || r.loyer);
        await apiSaveAparts(rows);
        const all = await apiReadConfigAll();
        APARTS = all.logements || [];
        renderApartsTable();
        if (msg) { msg.textContent = 'Sauvegardé ✅'; setTimeout(() => (msg.textContent = ''), 2000); }
      } catch (e) {
        if (msg) msg.textContent = 'Erreur: ' + e.message;
      } finally {
        setBusy(false);
      }
    });
  }

  const tbodyA = document.querySelector('#cfg-log-table tbody');
  if (tbodyA) {
    tbodyA.addEventListener('click', e => {
      if (e.target instanceof Element && e.target.classList.contains('rm')) {
        e.preventDefault();
        e.target.closest('tr')?.remove();
      }
    });
  }

  // Locaux
  const addLoc = document.getElementById('cfg-loc-add');
  if (addLoc) addLoc.addEventListener('click', addLocRow);

  const saveLoc = document.getElementById('cfg-loc-save');
  if (saveLoc) {
    saveLoc.addEventListener('click', async () => {
      const msg = document.getElementById('cfg-loc-msg');
      try {
        setBusy(true, 'Sauvegarde des locaux…');
        const rows = collectLocauxFromDOM().filter(r => r.code || r.nom || r.locataire || r.loyer);
        await apiSaveLocaux(rows);
        const all = await apiReadConfigAll();
        LOCAUX = all.locaux || [];
        renderLocauxTable();
        if (msg) { msg.textContent = 'Sauvegardé ✅'; setTimeout(() => (msg.textContent = ''), 2000); }
      } catch (e) {
        if (msg) msg.textContent = 'Erreur: ' + e.message;
      } finally {
        setBusy(false);
      }
    });
  }

  const tbodyL = document.querySelector('#cfg-loc-table tbody');
  if (tbodyL) {
    tbodyL.addEventListener('click', e => {
      if (e.target instanceof Element && e.target.classList.contains('rm')) {
        e.preventDefault();
        e.target.closest('tr')?.remove();
      }
    });
  }

  // HÉDAM : bouton Ajouter
  const addHedam = document.getElementById('cfg-hedam-add');
  if (addHedam) addHedam.addEventListener('click', addHedamRow);

  // HÉDAM : bouton Sauvegarder
  const saveHedam = document.getElementById('cfg-hedam-save');
  if (saveHedam) {
    saveHedam.addEventListener('click', async () => {
      const msg = document.getElementById('cfg-hedam-msg');
      try {
        setBusy(true, 'Sauvegarde Hédam…');
        const rows = collectHedamFromDOM();
        await apiSaveHedam(rows);
        const all = await apiReadConfigAll();
        HEDAM = all.hedam || all.hadam || []; // selon la clé renvoyée par ton doGet
        renderHedamTable();
        if (msg) { msg.textContent = 'Sauvegardé ✅'; setTimeout(() => (msg.textContent = ''), 2000); }
      } catch (e) {
        if (msg) msg.textContent = 'Erreur: ' + e.message;
      } finally {
        setBusy(false);
      }
    });
  }

  // HÉDAM : supprimer ligne
  const tbodyH = document.querySelector('#cfg-hedam-table tbody');
  if (tbodyH) {
    tbodyH.addEventListener('click', e => {
      if (e.target instanceof Element && e.target.classList.contains('rm')) {
        e.preventDefault();
        e.target.closest('tr')?.remove();
      }
    });
  }
}

// ⚠️ PAS d’accolade en trop ici !

document.addEventListener('DOMContentLoaded', async () => {
  if (document.getElementById('cfg-log-table') ||
      document.getElementById('cfg-loc-table') ||
      document.getElementById('cfg-hedam-table')) {
    try {
      const all = await apiReadConfigAll();
      APARTS = all.logements || [];
      LOCAUX = all.locaux || [];
      HEDAM  = all.hedam || all.hadam || [];
    } catch (e) {
      console.warn('Chargement config:', e);
      APARTS = []; LOCAUX = []; HEDAM = [];
    }
    renderApartsTable();
    if (window.REFERENTIEL_V2_ACTIVE) {
      document.getElementById('cfg-log-table')?.closest('article')?.setAttribute('hidden','');
      const status = document.getElementById('cfg-v2-status');
      if (status) status.textContent = 'Référentiel V2 actif : la modification de la liste historique est désactivée.';
      const link = document.getElementById('cfg-v2-link');
      if (link) { link.href = window.API_URL + (window.API_URL.includes('?') ? '&' : '?') + 'action=v2.ui'; link.hidden = false; }
    }
    renderLocauxTable();
    renderHedamTable();
    attachParamHandlers();
    buildHedamList();
  }
});

/******************* Saisie : auto-remplissages *******************/
function buildAppNumList() {
  const sel = document.getElementById('form_app_num');
  if (!sel) return;
  sel.innerHTML = APARTS.map(r => `<option value="${r.num}">${r.num}</option>`).join('');
  if (APARTS.length > 0) {
    sel.value = APARTS[0].num;
    onAppNumChange();
  }
}
function onAppNumChange() {
  const sel = document.getElementById('form_app_num');
  if (!sel) return;
  const num = sel.value;
  const found = APARTS.find(r => r.num === num);
  if (found) {
    document.getElementById('app-type').value = found.type || '';
    document.getElementById('form_locataire').value = found.locataire || '';
    document.getElementById('form_montant').value = found.loyer || '';
    document.getElementById('form_date').value = new Date().toISOString().slice(0, 10);
  }
}

function buildLocList() {
  const sel = document.getElementById('form_loc_code');
  if (!sel) return;
  sel.innerHTML = LOCAUX.map(r => `<option value="${r.code}">${r.code}</option>`).join('');
  if (LOCAUX.length > 0) {
    sel.value = LOCAUX[0].code;
    onLocChange();
  }
}
function onLocChange() {
  const sel = document.getElementById('form_loc_code');
  if (!sel) return;
  const code = sel.value;
  const found = LOCAUX.find(r => r.code === code);
  if (found) {
    document.getElementById('loc-nom').value = found.nom || '';
    document.getElementById('form_locataire_loc').value = found.locataire || '';
    document.getElementById('form_montant').value = found.loyer || '';
    document.getElementById('form_date').value = new Date().toISOString().slice(0, 10);
  }
}

// === HÉDAM : auto-remplissage du sous-bloc (code + nom) ===
function buildHedamList() {
  const sel = document.getElementById('form_hedam_code');
  if (!sel) return;

  // 🔹 Affiche le NOM dans la liste, garde le CODE en interne
  sel.innerHTML = HEDAM
    .map(r => `<option value="${r.code}">${r.nom}</option>`)
    .join('');

  if (HEDAM.length > 0) {
    sel.value = HEDAM[0].code;
    onHedamChange(); // même si onHedamChange ne fait plus rien, ce n'est pas grave
  }
}

function onHedamChange() {
  // Tu peux laisser vide ou supprimer complètement la fonction
}

// Affiche / cache le bloc Hédam dans l’onglet Saisie
function toggleElecExtra(force) {
  const type = document.getElementById('form_type')?.value;
  const sous = document.getElementById('form_sous_bloc')?.value;
  const extra = document.getElementById('elec-extra');
  if (!extra) return;

  // On affiche uniquement pour Sortie + "Électricité, Eau et Téléphone"
  const show = force !== undefined
    ? force
    : (type === 'Sortie' && sous === 'Électricité, Eau et Téléphone');

  extra.style.display = show ? 'block' : 'none';

  if (show) {
    // Date du jour si vide
    const dateEl = document.getElementById('form_date');
    if (dateEl && !dateEl.value) {
      dateEl.value = new Date().toISOString().slice(0, 10);
    }
    // On vide description et montant
    const descEl = document.getElementById('form_description');
    if (descEl) descEl.value = '';
    const mntEl = document.getElementById('form_montant');
    if (mntEl) mntEl.value = '';
  }
}





document.addEventListener('DOMContentLoaded', () => {
  const selApp = document.getElementById('form_app_num');
  if (selApp) {
    selApp.addEventListener('change', onAppNumChange);
    buildAppNumList();
  }

  const selLoc = document.getElementById('form_loc_code');
  if (selLoc) {
    selLoc.addEventListener('change', onLocChange);
    buildLocList();
  }

  // HÉDAM : juste l’évènement change (la liste sera remplie plus loin)
  const selHedam = document.getElementById('form_hedam_code');
  if (selHedam) {
    selHedam.addEventListener('change', onHedamChange);
  }
});


/******** Sous-blocs dynamiques (Saisie) ********/
const FORM_SB_OPTIONS = {
  Entrée: ['Locaux', 'APP', 'Consigne', 'Entrées divers'],
  Sortie: ['Salaire', 'Maintenance', 'Impôts et assurance', 'Électricité, Eau et Téléphone', 'Donation, Famille et divers', 'Hedam']
};

function toggleOther(forceShow) {
  const sel = document.getElementById('form_sous_bloc');
  const wrap = document.getElementById('other_wrap');
  const show = forceShow ?? (sel && sel.value === '__autre__');
  if (wrap) wrap.style.display = show ? 'block' : 'none';
  if (!show) {
    const o = document.getElementById('form_sous_bloc_other');
    if (o) o.value = '';
  }
}

function toggleAppExtra(force) {
  const type = document.getElementById('form_type')?.value;
  const sous = document.getElementById('form_sous_bloc')?.value;
  const extra = document.getElementById('app-extra');
  if (!extra) return;
  const show = force !== undefined ? force : (type === 'Entrée' && sous === 'APP');
  extra.style.display = show ? 'block' : 'none';
  if (show) { buildAppNumList(); onAppNumChange(); }
}

function toggleLocExtra(force) {
  const type = document.getElementById('form_type')?.value;
  const sous = document.getElementById('form_sous_bloc')?.value;
  const extra = document.getElementById('loc-extra');
  if (!extra) return;
  const show = force !== undefined ? force : (type === 'Entrée' && sous === 'Locaux');
  extra.style.display = show ? 'block' : 'none';
  if (show) { buildLocList(); onLocChange(); }
}

/************** Saisie : Description intelligente (aperçu + auto-fill) **************/

function computeSuggestedDescription() {
  const type = document.getElementById('form_type')?.value || '';
  const sous = document.getElementById('form_sous_bloc')?.value || '';
  const date = document.getElementById('form_date')?.value || new Date().toISOString().slice(0,10);
  const mois = (date || '').slice(0,7);

  // Cas particuliers : on ne propose rien pour Électricité/Eau/Téléphone
  if (type === 'Sortie' && sous === 'Électricité, Eau et Téléphone') {
    return '';
  }

  // Cas traités : Entrée → APP / Locaux
  if (type === 'Entrée' && (sous === 'APP' || sous === 'Locaux')) {
    return `Loyer ${mois}`;
  }

  // Fallback simple
  return sous ? `${sous} ${mois}`.trim() : mois;
}

function updateDescHint() {
  const hint = document.getElementById('desc-hint');
  if (!hint) return;
  const suggestion = computeSuggestedDescription();
  hint.textContent = suggestion ? `💡 Suggestion : ${suggestion}` : '';
}

function maybeAutoFillDescription() {
  const input = document.getElementById('form_description');
  if (!input) return;
  // Si l’utilisateur n’a rien saisi, on propose automatiquement
  if (!input.value.trim()) {
    input.value = computeSuggestedDescription() || '';
  }
}

function populateFormSousBloc() {
  const type = document.getElementById('form_type')?.value || 'Entrée';
  const sel = document.getElementById('form_sous_bloc');
  if (!sel) return;

  const opts = FORM_SB_OPTIONS[type] || [];
  sel.innerHTML =
    opts.map(v => `<option value="${v}">${v}</option>`).join('') +
    `<option value="__autre__">Autre…</option>`;
  sel.value = opts[0] || '__autre__';

  toggleOther(false);
  toggleAppExtra();
  toggleLocExtra();
  toggleHedamExtra();
  toggleElecExtra();
}



document.addEventListener('DOMContentLoaded', () => {
  // Initialisation des listes déroulantes et des sous-blocs
  if (document.getElementById('form_type')) {
    populateFormSousBloc();
    document.getElementById('form_type').addEventListener('change', populateFormSousBloc);
  }

 if (document.getElementById('form_sous_bloc')) {
  document.getElementById('form_sous_bloc').addEventListener('change', () => {
    toggleOther();
    toggleAppExtra();
    toggleLocExtra();
    toggleHedamExtra();
    toggleElecExtra();
    updateDescHint(); // 💡 mise à jour auto de la suggestion
  });
}



  // — Aperçu dynamique de la description —
  ['form_type','form_sous_bloc','form_date','form_app_num','form_loc_code']
    .forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', updateDescHint);
    });

  // Quand le champ Description perd le focus : auto-remplir s’il est vide
  const desc = document.getElementById('form_description');
  if (desc) desc.addEventListener('blur', maybeAutoFillDescription);

  // Premier affichage de la suggestion au chargement
  updateDescHint();
});



window.populateFormSousBloc = populateFormSousBloc;

/****************************** Saisie : submit ******************************/
/* ===== Remplacement complet du submit handler (toasts + loader) ===== */
(function () {
  const form = document.getElementById('saisieForm');
  if (!form) return;

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();

    // 1) Récupérer les valeurs
    const type = document.getElementById('form_type').value.trim();
    const sbSel = document.getElementById('form_sous_bloc').value;
    const sbOther = (document.getElementById('form_sous_bloc_other')?.value || '').trim();
    const sous_bloc = sbSel === '__autre__' ? sbOther : sbSel;

    let date = document.getElementById('form_date').value; // yyyy-mm-dd
    const montantStr = document.getElementById('form_montant').value;
    let description = document.getElementById('form_description').value.trim();

    // Champs spécifiques
    let local = '';
    let locataire = '';
    let fournisseur = ''; // Catégorie : Sonalgaz / EPEOR / Téléphone
    let periode = '';     // Trimestre : T1..T4
    let personne = '';    // Sous-catégorie : Dépôt / Appartement / Hedam / Cité Peret


    // APP (Entrée → APP)
    if (type === 'Entrée' && sous_bloc === 'APP') {
      const num = document.getElementById('form_app_num')?.value || '';
      const appType = document.getElementById('app-type')?.value || '';
      locataire = (document.getElementById('form_locataire')?.value || '').trim();
      local = num ? `APP ${num} ${appType}`.trim() : 'APP';
      if (!date) date = new Date().toISOString().slice(0, 10);
      if (!description) {
        const mois = (date || new Date().toISOString().slice(0, 10)).slice(0, 7);
        description = `Loyer ${mois}`;
      }
    }

    // LOCAUX (Entrée → Locaux) — si tu as déjà ajouté ce bloc
    if (type === 'Entrée' && sous_bloc === 'Locaux') {
      const code = document.getElementById('form_loc_code')?.value || '';
      const nom  = document.getElementById('loc-nom')?.value || '';
      locataire  = (document.getElementById('form_locataire_loc')?.value || '').trim();
      local = (code || nom) ? `LOC ${code} ${nom}`.trim() : 'Locaux';
      if (!date) date = new Date().toISOString().slice(0, 10);
      if (!description) {
        const mois = (date || new Date().toISOString().slice(0, 10)).slice(0, 7);
        description = `Loyer ${mois}`;
      }
    }

    // HÉDAM (Sortie → Hedam)
if (type === 'Sortie' && sous_bloc === 'Hedam') {
  const code = document.getElementById('form_hedam_code')?.value || '';
  const found = HEDAM.find(h => h.code === code);
  const nom   = found?.nom || '';
  // On réutilise le champ "local" pour stocker l'info
  local = code ? `HEDAM ${code} ${nom}`.trim() : 'Hédam';
  if (!date) date = new Date().toISOString().slice(0, 10);
  if (!description) {
    const mois = (date || new Date().toISOString().slice(0,10)).slice(0,7);
    description = `${nom || code || 'Hédam'} ${mois}`;
  }
}

    // ÉLECTRICITÉ / EAU / TÉLÉPHONE (Sortie → Électricité, Eau et Téléphone)
    if (type === 'Sortie' && sous_bloc === 'Électricité, Eau et Téléphone') {
      fournisseur = document.getElementById('form_elec_categorie')?.value || '';
      personne    = document.getElementById('form_elec_souscat')?.value || '';
      periode     = document.getElementById('form_elec_trimestre')?.value || '';

      if (!date) {
        date = new Date().toISOString().slice(0, 10);
      }
      // Ici on laisse la description vide (ou saisie manuellement), pas d'auto-texte.
    }

    
    // 2) Validations → toasts
    if (!type || !date || !montantStr) {
      showToast('Merci de renseigner au moins : Type, Date et Montant.', 'error');
      (document.getElementById('form_montant') || document.getElementById('form_date'))?.focus();
      return;
    }
    if (sbSel === '__autre__' && !sbOther) {
      showToast("Merci de préciser le sous-bloc (champ 'Autre…').", 'error');
      document.getElementById('form_sous_bloc_other')?.focus();
      return;
    }

    const montant = Number(String(montantStr).replace(',', '.'));
    if (Number.isNaN(montant)) {
      showToast("Le montant n'est pas un nombre valide.", 'error');
      document.getElementById('form_montant')?.focus();
      return;
    }

    const finalDescription =
      description || (type === 'Entrée' && (sous_bloc === 'APP' || sous_bloc === 'Locaux') ? `Loyer ${date.slice(0, 7)}` : '');

    // 3) Appel API (JSONP)
       const params = new URLSearchParams({
      action: 'add',
      type,
      sous_bloc,
      date,
      montant: String(montant),
      description: finalDescription,
      local,
      locataire,
      fournisseur,
      periode,
      personne
    });


    const submitBtn = form.querySelector('button[type="submit"]');

    try {
      // Loader + anti double-clic
      submitBtn?.setAttribute('disabled', 'disabled');
      setBusy(true, 'Enregistrement en cours…');

      const url = window.API_URL + (window.API_URL.includes('?') ? '&' : '?') + params.toString();
      const res = await jsonp(url);
      if (!res || !res.ok) throw new Error((res && res.error) || "Réponse d'ajout invalide");

      // 4) Reset + refermer les blocs spécifiques + date du jour
      form.reset();
      if (typeof toggleAppExtra === 'function') toggleAppExtra(false);
      if (typeof toggleLocExtra === 'function') toggleLocExtra(false);
      document.getElementById('form_date').value = new Date().toISOString().slice(0, 10);

      // 5) MAJ locale (réafficher direct dans la synthèse)
      const newRow = { type, sous_bloc, date, montant, description: finalDescription, local, locataire, _mois: date.slice(0, 7) };
      RAW.push(newRow);
      fillFilters();
      applyFilters();

      // 6) Retour synthèse + toast succès
      openTab('synthese', document.querySelector('.tablink[data-tab="synthese"]'));
      showToast('✅ Opération enregistrée !', 'success');
    } catch (e) {
      showToast('❌ Erreur d\'enregistrement : ' + e.message, 'error');
    } finally {
      setBusy(false);
      submitBtn?.removeAttribute('disabled');
    }
  });
})();















