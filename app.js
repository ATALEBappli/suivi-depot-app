/******************** Onglets (Synthèse / Saisie / Paramétrage) ********************/
function openTab(id, btn) {
  document.querySelectorAll('.tabcontent').forEach(sec => (sec.style.display = 'none'));
  const el = document.getElementById(id);
  if (el) el.style.display = 'block';

  // Si on ouvre Saisie : rafraîchir les sous-blocs + bloc APP
  if (id === 'saisie') {
    if (typeof populateFormSousBloc === 'function') populateFormSousBloc();
    if (typeof toggleAppExtra === 'function') toggleAppExtra();
  }

  document.querySelectorAll('.tablink').forEach(b => b.classList.remove('active'));
  (btn || document.querySelector(`.tablink[data-tab="${id}"]`))?.classList.add('active');
}

document.addEventListener('DOMContentLoaded', () => {
  const defaultBtn = document.querySelector('.tablink[data-tab="synthese"]');
  openTab('synthese', defaultBtn);
});

/****************************** Utilitaires ******************************/
function jsonp(url) {
  return new Promise((resolve, reject) => {
    const cb = 'cb_' + Math.random().toString(36).slice(2);
    const s = document.createElement('script');
    const clean = () => {
      try { delete window[cb]; } catch {}
      s.remove();
    };
    window[cb] = data => { clean(); resolve(data); };
    s.onerror = () => { clean(); reject(new Error('JSONP error')); };
    s.src = url + (url.includes('?') ? '&' : '?') + 'callback=' + cb;
    document.body.appendChild(s);
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
  }
}

['#mois', '#type', '#sous_bloc'].forEach(sel => {
  document.addEventListener('change', ev => {
    if (ev.target.matches(sel)) applyFilters();
  });
});

load();

/****************************** Saisie ******************************/
(function () {
  const form = document.getElementById('saisieForm');
  if (!form) return;

  form.addEventListener('submit', async ev => {
    ev.preventDefault();

    // 1) Récupérer les valeurs
    const type = document.getElementById('form_type').value.trim();
    const sbSel = document.getElementById('form_sous_bloc').value;
    const sbOther = (document.getElementById('form_sous_bloc_other')?.value || '').trim();
    const sous_bloc = sbSel === '__autre__' ? sbOther : sbSel;

    let date = document.getElementById('form_date').value; // yyyy-mm-dd
    const montantStr = document.getElementById('form_montant').value;
    let description = document.getElementById('form_description').value.trim();

    // Champs spécifiques APP
    let local = '';
    let locataire = '';

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

    // 2) Validations
    if (!type || !date || !montantStr) {
      alert('Merci de renseigner au moins : Type, Date et Montant.');
      return;
    }
    if (sbSel === '__autre__' && !sbOther) {
      alert("Merci de préciser le sous-bloc (champ 'Autre…').");
      return;
    }

    // Montant final (unique source = #form_montant)
    const montant = Number(String(montantStr).replace(',', '.'));
    if (Number.isNaN(montant)) {
      alert("Le montant n'est pas un nombre valide.");
      return;
    }

    const finalDescription =
      description || (type === 'Entrée' && sous_bloc === 'APP' ? `Loyer ${date.slice(0, 7)}` : '');

    // 3) Appel API (JSONP)
    const params = new URLSearchParams({
      action: 'add',
      type,
      sous_bloc,
      date,
      montant: String(montant),
      description: finalDescription,
      local,
      locataire
    });

    try {
      const url = window.API_URL + (window.API_URL.includes('?') ? '&' : '?') + params.toString();
      const res = await jsonp(url);
      if (!res || !res.ok) throw new Error((res && res.error) || "Réponse d'ajout invalide");

      // 4) Reset + fermeture bloc APP + date du jour
      form.reset();
      toggleAppExtra(false);
      document.getElementById('form_date').value = new Date().toISOString().slice(0, 10);

      // 5) MAJ locale
      const newRow = {
        type,
        sous_bloc,
        date,
        montant,
        description: finalDescription,
        local,
        locataire,
        _mois: date.slice(0, 7)
      };
      RAW.push(newRow);
      fillFilters();
      applyFilters();

      // 6) Retour synthèse
      openTab('synthese', document.querySelector('.tablink[data-tab="synthese"]'));
      alert('✅ Opération enregistrée !');
    } catch (e) {
      alert("❌ Erreur d'enregistrement : " + e.message);
    }
  });
})();

/******** Sous-blocs dynamiques (Saisie) ********/
const FORM_SB_OPTIONS = {
  Entrée: ['Locaux', 'APP', 'Consigne', 'Entrées divers'],
  Sortie: ['Salaire', 'Maintenance', 'Impôts et assurance', 'Électricité, Eau et Téléphone', 'Donation, Famille et divers', 'Hadem']
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

function populateFormSousBloc() {
  const type = document.getElementById('form_type')?.value || 'Entrée';
  const sel = document.getElementById('form_sous_bloc');
  if (!sel) return;

  const opts = FORM_SB_OPTIONS[type] || [];
  sel.innerHTML = opts.map(v => `<option value="${v}">${v}</option>`).join('') + `<option value="__autre__">Autre…</option>`;
  sel.value = opts[0] || '__autre__';
  toggleOther(false);
  toggleAppExtra(); // afficher/cacher le bloc APP si besoin
}

function toggleAppExtra(force) {
  const type = document.getElementById('form_type')?.value;
  const sous = document.getElementById('form_sous_bloc')?.value;
  const extra = document.getElementById('app-extra');
  if (!extra) return;

  const show = force !== undefined ? force : (type === 'Entrée' && sous === 'APP');
  extra.style.display = show ? 'block' : 'none';

  if (show) {
    buildAppNumList();
    onAppNumChange();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('form_type')) {
    populateFormSousBloc();
    document.getElementById('form_type').addEventListener('change', populateFormSousBloc);
  }
  if (document.getElementById('form_sous_bloc')) {
    document.getElementById('form_sous_bloc').addEventListener('change', () => {
      toggleOther();
      toggleAppExtra();
    });
  }
});

window.populateFormSousBloc = populateFormSousBloc;

/**************** Paramétrage : Appartements (localStorage) ****************/
const APARTS_KEY = 'suividepot_aparts_v1';

function loadAparts() {
  try {
    const raw = localStorage.getItem(APARTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.warn('loadAparts error:', e);
    return [];
  }
}

function saveAparts(rows) {
  try {
    localStorage.setItem(APARTS_KEY, JSON.stringify(rows));
  } catch (e) {
    alert('Erreur de sauvegarde (localStorage).');
    console.error(e);
  }
}

function renderApartsTable() {
  const tbody = document.querySelector('#cfg-log-table tbody');
  if (!tbody) return;

  const rows = loadAparts();
  tbody.innerHTML = rows
    .map(
      (r, i) => `
      <tr data-i="${i}">
        <td><input name="num"   type="text"  value="${r.num ?? ''}" placeholder="ex: 06"        style="width:80px"></td>
        <td><input name="type"  type="text"  value="${r.type ?? ''}" placeholder="F2/F3/F4"     style="width:100px"></td>
        <td><input name="loc"   type="text"  value="${r.loc ?? ''}"  placeholder="Locataire"     style="min-width:220px"></td>
        <td><input name="loyer" type="number" step="0.01" value="${r.loyer ?? ''}" placeholder="€" style="width:120px"></td>
        <td><button type="button" class="rm">✖</button></td>
      </tr>`
    )
    .join('');
}

function collectApartsFromDOM() {
  const rows = [];
  document.querySelectorAll('#cfg-log-table tbody tr').forEach(tr => {
    const num = tr.querySelector('input[name="num"]')?.value.trim() || '';
    const type = tr.querySelector('input[name="type"]')?.value.trim() || '';
    const loc = tr.querySelector('input[name="loc"]')?.value.trim() || '';
    const loyer = tr.querySelector('input[name="loyer"]')?.value || '';
    rows.push({
      num,
      type,
      loc,
      loyer: Number(String(loyer).replace(',', '.')) || 0
    });
  });
  return rows;
}

function addApartRow() {
  const tbody = document.querySelector('#cfg-log-table tbody');
  if (!tbody) return;
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input name="num"   type="text"  placeholder="ex: 06"      style="width:80px"></td>
    <td><input name="type"  type="text"  placeholder="F2/F3/F4"     style="width:100px"></td>
    <td><input name="loc"   type="text"  placeholder="Locataire"    style="min-width:220px"></td>
    <td><input name="loyer" type="number" step="0.01" placeholder="€" style="width:120px"></td>
    <td><button type="button" class="rm">✖</button></td>`;
  tbody.appendChild(tr);
}

function attachParamHandlers() {
  const addBtn = document.getElementById('cfg-log-add');
  if (addBtn) addBtn.addEventListener('click', addApartRow);

  const saveBtn = document.getElementById('cfg-log-save');
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      const msg = document.getElementById('cfg-log-msg');
      const rows = collectApartsFromDOM();
      const cleaned = rows.filter(r => r.num || r.type || r.loc || r.loyer);
      saveAparts(cleaned);
      if (msg) {
        msg.textContent = 'Sauvegardé ✅';
        setTimeout(() => (msg.textContent = ''), 2000);
      }
      renderApartsTable(); // re-render depuis le storage
    });
  }

  const tbody = document.querySelector('#cfg-log-table tbody');
  if (tbody) {
    tbody.addEventListener('click', e => {
      if (!(e.target instanceof Element)) return;
      if (e.target.classList.contains('rm')) {
        e.preventDefault();
        e.target.closest('tr')?.remove();
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('cfg-log-table')) {
    renderApartsTable();
    attachParamHandlers();
  }
});

/******************* Saisie : Appartements (auto-remplissage) *******************/
function buildAppNumList() {
  const sel = document.getElementById('form_app_num');
  if (!sel) return;
  const aparts = loadAparts();
  sel.innerHTML = aparts.map(r => `<option value="${r.num}">${r.num}</option>`).join('');
  if (aparts.length > 0) {
    sel.value = aparts[0].num;
    onAppNumChange();
  }
}

function onAppNumChange() {
  const sel = document.getElementById('form_app_num');
  if (!sel) return;
  const num = sel.value;
  const aparts = loadAparts();
  const found = aparts.find(r => r.num === num);
  if (found) {
    document.getElementById('app-type').value = found.type || '';
    document.getElementById('form_locataire').value = found.loc || '';
    document.getElementById('form_montant').value = found.loyer || '';
    document.getElementById('form_date').value = new Date().toISOString().slice(0, 10);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const sel = document.getElementById('form_app_num');
  if (sel) {
    sel.addEventListener('change', onAppNumChange);
    buildAppNumList();
  }
});
