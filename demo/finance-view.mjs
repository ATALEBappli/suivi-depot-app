import { financeFixture } from "./finance-data.mjs";
import { summarize } from "./finance-model.mjs";
const data = financeFixture();
let selection = { kind: "current" };
const money = (value, signed = false) => `${value < 0 ? "−" : signed && value > 0 ? "+" : ""}${new Intl.NumberFormat("fr-FR").format(Math.abs(value))} DA`;
const date = value => value.split("-").reverse().join("/");
const flow = (label, value, cls = "", signed = false) => `<div class="finance-value ${cls}"><span>${label}</span><strong>${money(value, signed)}</strong></div>`;
export function renderFinance(main, { icon, showDialog, error }) {
  const s = summarize(data, selection), c = s.cash;
  main.innerHTML = `<div class="finance-page"><div class="page-top"><div><h1>Synthèse financière</h1><p>Vue consolidée des flux et contrôles</p></div><span class="badge">Données de démonstration</span></div>
    <section class="card period-card" aria-labelledby="period-title"><div><h2 id="period-title">${s.label}</h2><strong>Du ${date(s.start)} au ${date(s.end)}</strong><small>Dernier contrôle figé le ${date(data.controls.at(-1).date)}</small></div><button class="secondary" id="change-period">${icon("reset")}Changer de cycle / Période</button></section>
    <section class="card cash-card" aria-labelledby="cash-title"><div class="finance-heading"><h2 id="cash-title">${icon("transactions")} Situation de la caisse</h2><span class="badge">${c.historical ? "Cycle contrôlé et figé" : "Non vérifiée"}</span></div><div class="cash-grid"><div class="cash-total"><span>${c.historical ? "Caisse théorique à la fin du cycle précédent" : "Caisse théorique actuelle"}</span><strong data-finance="cash">${money(c.theoretical)}</strong><small>${money(c.opening.counted)} + ${money(c.incoming)} − ${money(c.outgoing)}</small></div><div class="cash-details">${flow(`Montant compté figé au ${date(c.opening.date)}`, c.opening.counted)}${flow("Entrées espèces depuis ce contrôle", c.incoming, "incoming", true)}${flow("Sorties espèces depuis ce contrôle", -c.outgoing, "outgoing", true)}</div></div><div class="cash-control"><span>Dernier contrôle ${c.historical ? "du cycle" : "figé"} : <b>${date(c.lastControl.date)}</b></span><span>Montant compté : <b>${money(c.lastControl.counted)}</b></span><span>Écart historique constaté : <b>${money(c.discrepancy, true)}</b></span></div><p class="cash-status">${c.historical ? "Cycle précédent contrôlé — écart du comptage : " + money(c.discrepancy, true) : "Cycle en cours — Aucun comptage physique effectué. Écart actuel indéterminé."}</p>${!c.historical ? '<button class="primary wide" id="cash-count">Effectuer un comptage de caisse</button>' : ""}${!["current", "previous"].includes(selection.kind) ? '<small class="hint">La caisse actuelle reste calculée depuis le dernier contrôle, indépendamment de la période analysée.</small>' : ""}</section>
    <section aria-labelledby="indicators-title"><div class="finance-heading"><h2 id="indicators-title">${icon("chart")} Indicateurs financiers</h2><small>${s.label}</small></div><div class="indicator-grid"><article class="card incoming"><span>Entrées</span><strong data-finance="incoming">${money(s.incoming, true)}</strong><small>Encaissements de la période</small></article><article class="card outgoing"><span>Sorties</span><strong data-finance="outgoing">${money(-s.outgoing, true)}</strong><small>Décaissements de la période</small></article><article class="card net-card"><span>Flux net</span><strong data-finance="net">${money(s.net, true)}</strong><small>Variation de trésorerie, sans assimilation à un bénéfice économique</small></article></div>${s.transactions.length ? "" : '<p class="empty" role="status">Aucune transaction sur cette période.</p>'}</section>
    <section aria-labelledby="activities-title"><div class="finance-heading"><h2 id="activities-title">${icon("housing")} Analyse par activité</h2><small>Consolidation</small></div><div class="activity-grid">${s.activities.map(a => `<article class="card activity-card ${a.id}" data-activity="${a.id}"><div class="activity-title"><h3><span class="activity-dot"></span>${a.name}</h3><strong class="${a.net < 0 ? "outgoing" : a.net > 0 ? "incoming" : ""}">Net : ${money(a.net, true)}</strong></div>${a.id === "common" ? '<small class="hint">Autonome, indépendant du dépôt</small>' : ""}<div class="activity-flows">${flow("Entrées", a.incoming, "incoming", true)}${flow("Sorties", -a.outgoing, "outgoing", true)}</div></article>`).join("")}</div><p class="hint">Une seule caisse physique commune aux quatre activités. Les prêts, remboursements, cautions et transferts internes sont des mouvements de trésorerie, pas des revenus ou charges définitifs.</p></section></div>`;
  main.querySelector("#cash-count")?.addEventListener("click", () => showDialog(`<form><h2 id="dialog-title">Comptage de caisse</h2><p>Ce module sera disponible dans une prochaine version. Aucun comptage, figement ou enregistrement n’est réalisé ici.</p><button class="primary wide" type="button" data-cancel>Fermer</button></form>`, e => e.preventDefault()));
  main.querySelector("#change-period").onclick = () => {
    showDialog(`<form><h2 id="dialog-title">Sélectionner une période</h2><div class="form-error" role="alert" tabindex="-1"></div><label class="field">Période<select name="kind" aria-label="Période">${[["current", "Cycle de caisse en cours"], ["previous", "Cycle précédent"], ["month", "Mois"], ["year", "Année"], ["custom", "Période personnalisée"]].map(([value, label]) => `<option value="${value}" ${value === selection.kind ? "selected" : ""}>${label}</option>`).join("")}</select></label><label class="field" data-period="month">Mois<input type="month" name="month" value="${selection.month || data.today.slice(0, 7)}" required></label><label class="field" data-period="year">Année<input type="number" name="year" min="1000" max="9999" value="${selection.year || data.today.slice(0, 4)}" required></label><div data-period="custom"><label class="field">Date de début<input type="date" name="start" value="${selection.start || data.today}" required></label><label class="field">Date de fin<input type="date" name="end" value="${selection.end || data.today}" required></label></div><div class="form-footer"><button type="button" class="secondary" data-cancel>Annuler</button><button class="primary">Valider la sélection</button></div></form>`, e => {
      e.preventDefault();
      try {
        const next = Object.fromEntries(new FormData(e.target));
        summarize(data, next);
        selection = next;
        e.target.closest("dialog").close();
        renderFinance(main, { icon, showDialog, error });
        main.querySelector("#change-period").focus();
      } catch (err) { error(e.target, err); }
    });
    const form = document.querySelector("dialog form");
    const sync = () => form.querySelectorAll("[data-period]").forEach(el => {
      el.hidden = el.dataset.period !== form.elements.kind.value;
      el.querySelectorAll("input").forEach(input => input.disabled = el.hidden);
    });
    form.elements.kind.onchange = sync;
    sync();
  };
}
