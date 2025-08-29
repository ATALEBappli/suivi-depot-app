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
  // Mois
  const moisSet = new Set(RAW.map(r => r._mois).filter(Boolean));
  const moisSel = document.querySelector("#mois");
  moisSel.innerHTML = `<option value="">(Tous)</option>` +
    [...moisSet].sort().reverse().map(m=>`<option>${m}</option>`).join("");

  // Sous-bloc
  const sbSet = new Set(RAW.map(r => r.sous_bloc).filter(Boolean));
  const sbSel = document.querySelector("#sous_bloc");
  sbSel.innerHTML = `<option value="">(Tous)</option>` +
    [...sbSet].sort().map(m=>`<option>${m}</option>`).join("");
}

function applyFilters(){
  const m = document.querySelector("#mois").value;
  const t = document.querySelector("#type").value;
  const s = document.querySelector("#sous_bloc").value;

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

function renderTable(){
  const tb = document.querySelector("#table tbody");
  tb.innerHTML = DF
    .sort((a,b)=>(a.date||"").localeCompare(b.date||"")).reverse()
    .map(r => `
      <tr>
        <td>${(r.date||"").slice(0,10)}</td>
        <td>${r.type||""}</td>
        <td>${r.sous_bloc||""}</td>
        <td class="num">${fmt(r.montant)}</td>
        <td>${r.description||""}</td>
      </tr>
    `).join("");

  renderKPIs(DF);   // <– ça met à jour la synthèse
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

