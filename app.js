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
const type        = document.getElementById("form_type").value.trim();

const sbSel       = document.getElementById("form_sous_bloc").value;
const sbOther     = (document.getElementById("form_sous_bloc_other")?.value || "").trim();
const sous_bloc   = (sbSel === "__autre__" ? sbOther : sbSel);

let   date        = document.getElementById("form_date").value; // yyyy-mm-dd
const montantStr  = document.getElementById("form_montant").value;
let   description = document.getElementById("form_description").value.trim();

// 👉 Champs spécifiques APP (remplis seulement si Entrée → APP)
let local = "";
let locataire = "";

if (type === "Entrée" && sous_bloc === "APP") {
  const num = document.getElementById("form_app_num")?.value || "";
  locataire = (document.getElementById("form_locataire")?.value || "").trim();

  // "Local" = étiquette ; adapte si tu veux inclure un type
  local = num ? `APP ${num}` : "APP";

  // Date par défaut = aujourd’hui si vide
  if (!date) {
    const d = new Date();
    date = d.toISOString().slice(0, 10); // yyyy-mm-dd
  }
  // Description par défaut si vide
  if (!description) {
    const mois = (date || new Date().toISOString().slice(0,10)).slice(0,7);
    description = `Loyer ${mois}`;
  }
}

// 2) Validations simples
if (!type || !date || !montantStr) {
  alert("Merci de renseigner au moins : Type, Date et Montant.");
  return;
}
if (sbSel === "__autre__" && !sbOther) {
  alert("Merci de préciser le sous-bloc (champ 'Autre…').");
  return;
}

// Montant final (prend le loyer auto si présent, sinon la saisie)
let montant = Number(String(montantStr).replace(",", "."));
if (type === "Entrée" && sous_bloc === "APP") {
  const aLoyer = Number(document.getElementById("app-loyer")?.value || 0) || 0;
  if (aLoyer > 0) montant = aLoyer;
}
if (Number.isNaN(montant)) {
  alert("Le montant n'est pas un nombre valide.");
  return;
}



    // 3) Appeler l'API Apps Script en JSONP avec action=add
const params = new URLSearchParams({
  action: "add",
  type,
  sous_bloc,
  date,                       // yyyy-mm-dd
  montant: String(montant),   // nombre
  description,
  local,                      // <-- NOUVEAU
  locataire                   // <-- NOUVEAU
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

      // --- Nettoyage optionnel du bloc APP après enregistrement ---
document.getElementById("form_app_num")?.value = "";
document.getElementById("app-type")?.value    = "";
document.getElementById("form_locataire")?.value = "";
document.getElementById("app-loyer")?.value   = "";

// si le loyer a été copié dans le champ Montant, on l’efface aussi
document.getElementById("form_montant")?.value = "";

// refermer le bloc APP
toggleAppExtra(false);

// remettre la date du jour
document.getElementById("form_date").value = new Date().toISOString().slice(0, 10);


      // 5) Mettre à jour l'UI localement et rafraîchir
     const newRow = {
  type,
  sous_bloc,
  date,
  montant,
  description,
  local,          // <-- NOUVEAU
  locataire,      // <-- NOUVEAU
  _mois: date.slice(0, 7)  // "YYYY-MM"
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
   // 👉 Ajoute cette ligne
  toggleAppExtra();
}
function toggleAppExtra() {
  const type = document.getElementById('form_type')?.value;
  const sous = document.getElementById('form_sous_bloc')?.value;
  const extra = document.getElementById('app-extra');

  if (extra) {
    extra.style.display = (type === "Entrée" && sous === "APP") ? "block" : "none";
  }
}

// branche l’événement
document.addEventListener('DOMContentLoaded', () => {
  const formType = document.getElementById('form_type');
  const formSB   = document.getElementById('form_sous_bloc');
  if (formType) formType.addEventListener('change', toggleAppExtra);
  if (formSB)   formSB.addEventListener('change', toggleAppExtra);
});

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


/* ================== Paramétrage : Appartements ================== */
const APARTS_KEY = "suividepot_aparts_v1";

function loadAparts() {
  try {
    const raw = localStorage.getItem(APARTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.warn("loadAparts error:", e);
    return [];
  }
}

function saveAparts(rows) {
  try {
    localStorage.setItem(APARTS_KEY, JSON.stringify(rows));
  } catch (e) {
    alert("Erreur de sauvegarde (localStorage).");
    console.error(e);
  }
}

function renderApartsTable() {
  const tbody = document.querySelector("#cfg-log-table tbody");
  if (!tbody) return;

  const rows = loadAparts();
  tbody.innerHTML = rows
    .map(
      (r, i) => `
      <tr data-i="${i}">
        <td><input name="num"    type="text"  value="${r.num ?? ""}"       placeholder="ex: 06" style="width:80px"></td>
        <td><input name="type"   type="text"  value="${r.type ?? ""}"      placeholder="F2/F3/F4" style="width:100px"></td>
        <td><input name="loc"    type="text"  value="${r.loc ?? ""}"       placeholder="Nom du locataire" style="min-width:220px"></td>
        <td><input name="loyer"  type="number" step="0.01" value="${r.loyer ?? ""}" placeholder="€" style="width:120px"></td>
        <td><button type="button" class="rm">✖</button></td>
      </tr>`
    )
    .join("");
}

function collectApartsFromDOM() {
  const rows = [];
  document.querySelectorAll("#cfg-log-table tbody tr").forEach((tr) => {
    const num   = tr.querySelector('input[name="num"]')?.value.trim()  || "";
    const type  = tr.querySelector('input[name="type"]')?.value.trim() || "";
    const loc   = tr.querySelector('input[name="loc"]')?.value.trim()  || "";
    const loyer = tr.querySelector('input[name="loyer"]')?.value || "";

    rows.push({
      num,
      type,
      loc,
      loyer: Number(String(loyer).replace(",", ".")) || 0,
    });
  });
  return rows;
}

function addApartRow() {
  const tbody = document.querySelector("#cfg-log-table tbody");
  if (!tbody) return;

  // on ajoute visuellement une ligne vide (pas de sauvegarde tout de suite)
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td><input name="num"   type="text"  placeholder="ex: 06" style="width:80px"></td>
    <td><input name="type"  type="text"  placeholder="F2/F3/F4" style="width:100px"></td>
    <td><input name="loc"   type="text"  placeholder="Nom du locataire" style="min-width:220px"></td>
    <td><input name="loyer" type="number" step="0.01" placeholder="€" style="width:120px"></td>
    <td><button type="button" class="rm">✖</button></td>
  `;
  tbody.appendChild(tr);
}

function attachParamHandlers() {
  // Bouton Ajouter
  const addBtn = document.getElementById("cfg-log-add");
  if (addBtn) {
    addBtn.addEventListener("click", () => {
      addApartRow();
    });
  }

  // Bouton Sauvegarder
  const saveBtn = document.getElementById("cfg-log-save");
  if (saveBtn) {
    saveBtn.addEventListener("click", () => {
      const msg = document.getElementById("cfg-log-msg");
      const rows = collectApartsFromDOM();

      // (optionnel) petite validation : on enlève les lignes totalement vides
      const cleaned = rows.filter(
        (r) => r.num || r.type || r.loc || r.loyer
      );

      saveAparts(cleaned);
      if (msg) {
        msg.textContent = "Sauvegardé ✅";
        setTimeout(() => (msg.textContent = ""), 2000);
      }

      // on re-render depuis le storage pour être sûr d’être à jour
      renderApartsTable();
    });
  }

  // Supprimer une ligne (delegation)
  const tbody = document.querySelector("#cfg-log-table tbody");
  if (tbody) {
    tbody.addEventListener("click", (e) => {
      if (!(e.target instanceof Element)) return;
      if (e.target.classList.contains("rm")) {
        e.preventDefault();
        const tr = e.target.closest("tr");
        if (!tr) return;

        // on enlève la ligne du DOM (sans sauvegarde auto)
        tr.remove();
      }
    });
  }
}

// Initialisation Paramétrage au chargement
document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("cfg-log-table")) {
    renderApartsTable();
    attachParamHandlers();
  }
});
/* ================== /Paramétrage : Appartements ================== */


// ==================== Gestion Appartements (Saisie) ====================

// Remplit la liste des numéros d'appartements à partir du paramétrage
function buildAppNumList() {
  const sel = document.getElementById("app-num");
  if (!sel) return;

  const aparts = loadAparts(); // récupère depuis le localStorage
  sel.innerHTML = aparts
    .map(r => `<option value="${r.num}">${r.num}</option>`)
    .join("");

  if (aparts.length > 0) {
    sel.value = aparts[0].num; // sélectionne le premier par défaut
    onAppNumChange();
  }
}

// Quand on change de numéro → remplit automatiquement type, locataire, loyer
function onAppNumChange() {
  const sel = document.getElementById("app-num");
  if (!sel) return;

  const num = sel.value;
  const aparts = loadAparts();
  const found = aparts.find(r => r.num === num);

  if (found) {
    document.getElementById("app-type").value     = found.type || "";
    document.getElementById("app-loc").value      = found.loc || "";
    document.getElementById("app-loyer").value    = found.loyer || "";
    document.getElementById("form_montant").value = found.loyer || "";
    document.getElementById("form_date").value    = new Date().toISOString().slice(0,10); // date du jour
  }
}

// Brancher les événements
document.addEventListener("DOMContentLoaded", () => {
  const sel = document.getElementById("app-num");
  if (sel) {
    sel.addEventListener("change", onAppNumChange);
    buildAppNumList();
  }
});















