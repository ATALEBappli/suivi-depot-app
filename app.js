// ---- Onglets: afficher/masquer + bouton actif ----
function openTab(id, btn) {
  // cacher toutes les sections
  document.querySelectorAll('.tabcontent').forEach(sec => sec.style.display = 'none');

  // afficher celle demandée
  const el = document.getElementById(id);
  if (el) el.style.display = 'block';

  // 👉 IMPORTANT : si on ouvre "Saisie", re-remplir la liste Sous-bloc
  if (id === 'saisie' && typeof populateFormSousBloc === 'function') {
    populateFormSousBloc();
  }

  // enlever l'état actif de tous les boutons
  document.querySelectorAll('.tablink').forEach(b => b.classList.remove('active'));
  // activer le bon bouton (celui cliqué, ou fallback via data-attr)
  (btn || document.querySelector(`.tablink[data-tab="${id}"]`))?.classList.add('active');
}

// ouvrir la Synthèse par défaut au chargement
document.addEventListener('DOMContentLoaded', () => {
  const defaultBtn = document.querySelector('.tablink[data-tab="synthese"]');
  openTab('synthese', defaultBtn);
});



// JSONP helper
function jsonp(url) {
  return new Promise((resolve, reject) => {
    const cb = "cb_" + Math.random().toString(36).slice(2);
    const s = document.createElement("script");
    const clean = () => { delete window[cb]; s.remove(); };
    window[cb] = (data) => { clean(); resolve(data); };
    s.onerror = () => { clean(); reject(new Error("JSONP error")); };
    s.src = url + (url.includes("?") ? "&" : "?") + "callback=" + cb;
    document.body.appendChild(s);
  });
}

const fmt = n => Number(n || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

let RAW = [];  // toutes les lignes
let DF  = [];  // filtrées

function computeMois(dateStr){
  // attend un ISO ou yyyy-mm-dd ; renvoie "YYYY-MM"
  if(!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(+d)) return "";
  return d.toISOString().slice(0,7);
}

function refreshKpis(){
  const totalIn  = DF.filter(r=>r.type==="Entrée").reduce((s,r)=>s+Number(r.montant||0),0);
  const totalOut = DF.filter(r=>r.type==="Sortie").reduce((s,r)=>s+Number(r.montant||0),0);
  const solde    = totalIn - totalOut;
  document.querySelector("#kpis").textContent =
    `Entrées: ${fmt(totalIn)}  |  Sorties: ${fmt(totalOut)}  |  Solde: ${fmt(solde)}`;
}

function fillFilters(){
  // Mois (facultatif si l’élément n’existe pas dans le HTML)
  const moisSet = new Set(RAW.map(r => r._mois).filter(Boolean));
  const moisSel = document.querySelector("#mois");
  if (moisSel) {
    moisSel.innerHTML = `<option value="">(Tous)</option>` +
      [...moisSet].sort().reverse().map(m=>`<option>${m}</option>`).join("");
  }

  // Sous-bloc
  const sbSet = new Set(RAW.map(r => r.sous_bloc).filter(Boolean));
  const sbSel = document.querySelector("#sous_bloc");
  if (sbSel) {
    sbSel.innerHTML = `<option value="">(Tous)</option>` +
      [...sbSet].sort().map(m=>`<option>${m}</option>`).join("");
  }
}



function applyFilters(){
  const m = (document.querySelector("#mois")?.value || "");
  const t = (document.querySelector("#type")?.value || "");
  const s = (document.querySelector("#sous_bloc")?.value || "");

  DF = RAW.filter(r =>
    (!m || r._mois===m) &&
    (!t || r.type===t) &&
    (!s || r.sous_bloc===s)
  );
  renderTable();
  refreshKpis();
}

function renderKPIs(rows) {
  let totalIn = 0, totalOut = 0;
  rows.forEach(r => {
    const m = parseFloat(r.montant || 0);
    if (r.type === "Entrée") totalIn += m;
    if (r.type === "Sortie") totalOut += m;
  });
  const solde = totalIn - totalOut;

  document.getElementById("kpis").innerText =
    `Entrées: ${totalIn.toLocaleString()} | Sorties: ${totalOut.toLocaleString()} | Solde: ${solde.toLocaleString()}`;
}

function renderTable() {
  const tb = document.querySelector("#table tbody"); // doit correspondre à <table id="table"><tbody>
  if (!tb) return;   // <= sécurité anti-erreur

  tb.innerHTML = DF
    .sort((a, b) => (a.date || "").localeCompare(b.date || "")).reverse()
    .map(r => `
      <tr>
        <td>${(r.date || "").slice(0,10)}</td>
        <td>${r.type || ""}</td>
        <td>${r.sous_bloc || ""}</td>
        <td class="num">${fmt(r.montant)}</td>
        <td>${r.description || ""}</td>
      </tr>
    `)
    .join("");
}


async function load(){
  try{
    const data = await jsonp(window.API_URL);
    if(!data || !data.ok) throw new Error(data && data.error || "Réponse invalide");

    RAW = (data.rows||[]).map(r => ({
      ...r,
      montant: Number((r.montant+"").replace(",",".").replace(/\s/g,"")),
      _mois: computeMois(r.date)
    }));
    fillFilters();
    applyFilters();
  }catch(e){
    document.querySelector("#kpis").textContent = "Erreur de chargement : "+e.message;
  }
}

["#mois","#type","#sous_bloc"].forEach(sel => {
  document.addEventListener("change", ev => {
    if(ev.target.matches(sel)) applyFilters();
  });
});

load();

// --- SUBMIT "Saisie" : ajout d'une ligne via JSONP, puis refresh ---
(function () {
  const form = document.getElementById("saisieForm");
  if (!form) return; // si le HTML n'est pas encore en place

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();

    // 1) Récupérer les valeurs
    const type       = document.getElementById("form_type").value.trim();

    const sbSel      = document.getElementById("form_sous_bloc").value;
    const sbOther    = (document.getElementById("form_sous_bloc_other")?.value || "").trim();
    const sous_bloc  = (sbSel === "__autre__" ? sbOther : sbSel);

    const date       = document.getElementById("form_date").value; // yyyy-mm-dd
    const montantStr = document.getElementById("form_montant").value;
    const description= document.getElementById("form_description").value.trim();

    // 2) Validations simples
    if (!type || !date || !montantStr) {
      alert("Merci de renseigner au moins : Type, Date et Montant.");
      return;
    }
    if (sbSel === "__autre__" && !sbOther) {
      alert("Merci de préciser le sous-bloc (champ 'Autre…').");
      return;
    }
    const montant = Number(String(montantStr).replace(",", "."));
    if (Number.isNaN(montant)) {
      alert("Le montant n'est pas un nombre valide.");
      return;
    }

    // 3) Appeler l'API Apps Script en JSONP avec action=add
    const params = new URLSearchParams({
      action: "add",
      type,
      sous_bloc,
      date,                      // yyyy-mm-dd
      montant: String(montant),  // en nombre
      description
    });

    try {
      // window.API_URL doit pointer sur ton WebApp /exec
      const url = window.API_URL + (window.API_URL.includes("?") ? "&" : "?") + params.toString();

      const res = await jsonp(url);   // on réutilise la fonction jsonp(url) déjà définie
      if (!res || !res.ok) {
        throw new Error(res && res.error ? res.error : "Réponse d'ajout invalide");
      }

      // 4) Remettre le formulaire à zéro
      form.reset();

      // 5) Mettre à jour l'UI localement et rafraîchir
      const newRow = {
        type,
        sous_bloc,
        date,
        montant,
        description,
        _mois: (function (dateStr) {
          if (!dateStr) return "";
          const d = new Date(dateStr);
          if (isNaN(+d)) return "";
          return d.toISOString().slice(0, 7);
        })(date)
      };
      RAW.push(newRow);
      fillFilters();
      applyFilters();

      // 6) Retour à la synthèse + message
      openTab('synthese', document.querySelector('.tablink[data-tab="synthese"]'));
      alert("✅ Opération enregistrée !");
    } catch (e) {
      alert("❌ Erreur d'enregistrement : " + e.message);
    }
  });
})();


// ==== Sous-blocs dynamiques (Saisie) — version finale ====
// === Sous-blocs dynamiques pour le formulaire de saisie ===
const FORM_SB_OPTIONS = {
  "Entrée": [
    "Locaux",
    "APP",
    "Consigne",
    "Entrées divers"
  ],
  "Sortie": [
    "Salaire",
    "Maintenance",
    "Impôts et assurance",
    "Électricité, Eau et Téléphone",
    "Donation, Famille et divers",
    "Hadem"
  ]
};


function toggleOther(forceShow) {
  const sel  = document.getElementById('form_sous_bloc');
  const wrap = document.getElementById('other_wrap');
  const show = forceShow ?? (sel && sel.value === "__autre__");
  if (wrap) wrap.style.display = show ? 'block' : 'none';
  if (!show) {
    const o = document.getElementById('form_sous_bloc_other');
    if (o) o.value = '';
  }
}

function populateFormSousBloc() {
  const type = document.getElementById('form_type')?.value || "Entrée";
  const sel  = document.getElementById('form_sous_bloc');
  if (!sel) return; // l'onglet Saisie n'est peut-être pas dans le DOM

  const opts = FORM_SB_OPTIONS[type] || [];
  sel.innerHTML =
    opts.map(v => `<option value="${v}">${v}</option>`).join('') +
    `<option value="__autre__">Autre…</option>`;

  sel.value = opts[0] || "__autre__";
  toggleOther(false);
}

// 1) Initialisation au chargement (même si Saisie est caché)
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('form_type')) {
    populateFormSousBloc();
    document.getElementById('form_type').addEventListener('change', populateFormSousBloc);
  }
  if (document.getElementById('form_sous_bloc')) {
    document.getElementById('form_sous_bloc').addEventListener('change', () => toggleOther());
  }
});

// 2) Rendez la fonction accessible à openTab() (index.html)
window.populateFormSousBloc = populateFormSousBloc;


// ====== CONFIG APP ======
let CONFIG = {
  logements: [] // [{num:"06", type:"F3", locataire:"BRAZAOUI", loyer:15000}, ...]
};

// -- Appelle l'API pour charger toute la config (logements, etc.)
async function loadConfig() {
  try {
    const res = await jsonp(`${window.API_URL}?action=config&what=all`);
    if (!res || !res.ok) throw new Error(res && res.error || "Réponse config invalide");
    CONFIG = Object.assign({ logements: [] }, res.config || {});
    renderConfig();
  } catch(e) {
    console.warn("Config load error:", e.message);
  }
}

// -- Rendu global de la page Paramétrage (on a pour l’instant que 'logements')
function renderConfig() {
  renderLogementsTable();
  // 🔜 plus tard : renderLocauxTable(), renderImpotsTable(), etc.
}

// ========= BLOC 'APPARTEMENTS' =========
function renderLogementsTable() {
  const tb = document.querySelector('#cfg-log-table tbody');
  if (!tb) return;
  tb.innerHTML = (CONFIG.logements || []).map((r, i) => `
    <tr data-i="${i}">
      <td><input value="${r.num || ''}"        size="4"   /></td>
      <td><input value="${r.type || ''}"       size="4"   placeholder="F2/F3/F4"/></td>
      <td><input value="${r.locataire || ''}"  size="18"  /></td>
      <td><input value="${r.loyer || ''}"      size="8"   type="number" step="0.01"/></td>
      <td><button class="row-del">🗑️</button></td>
    </tr>
  `).join('');
}

// Ajouter / Supprimer / Sauver
document.addEventListener('click', (e) => {
  // bouton Ajouter
  if (e.target.id === 'cfg-log-add') {
    CONFIG.logements.push({ num:'', type:'F3', locataire:'', loyer:'' });
    renderLogementsTable();
  }
  // bouton supprimer ligne
  if (e.target.classList.contains('row-del')) {
    const tr = e.target.closest('tr');
    const i = Number(tr?.dataset?.i ?? -1);
    if (i >= 0) {
      CONFIG.logements.splice(i,1);
      renderLogementsTable();
    }
  }
  // bouton Sauvegarder
  if (e.target.id === 'cfg-log-save') {
    // relire les inputs visibles => met à jour CONFIG.logements
    const rows = Array.from(document.querySelectorAll('#cfg-log-table tbody tr'));
    CONFIG.logements = rows.map(tr => {
      const [numEl, typeEl, locEl, loyEl] = tr.querySelectorAll('input');
      return {
        num: (numEl.value || '').trim(),
        type: (typeEl.value || '').trim(),
        locataire: (locEl.value || '').trim(),
        loyer: Number((loyEl.value || '0').replace(',', '.')) || 0
      };
    });
    saveLogements();
  }
});

async function saveLogements() {
  const msg = document.getElementById('cfg-log-msg');
  try {
    msg && (msg.textContent = 'Enregistrement…');
    // JSONP GET => encoder le JSON
    const payload = encodeURIComponent(JSON.stringify(CONFIG.logements||[]));
    const url = `${window.API_URL}?action=config&save=logements&payload=${payload}`;
    const res = await jsonp(url);
    if (!res || !res.ok) throw new Error(res && res.error || "save invalide");
    msg && (msg.textContent = '✅ Sauvegardé');
    // recharger pour lisser les écarts
    await loadConfig();
  } catch(e) {
    msg && (msg.textContent = '❌ ' + e.message);
  } finally {
    setTimeout(()=>{ msg && (msg.textContent = ''); }, 2000);
  }
}

// Charge la config au démarrage
document.addEventListener('DOMContentLoaded', loadConfig);











