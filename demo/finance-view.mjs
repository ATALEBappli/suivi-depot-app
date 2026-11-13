import { financeFixture } from "./finance-data.mjs";
import { createFinanceState, cashCycles, quickCashCycles, historicalCashCycles } from "./finance-model.mjs";

const money = (value, signed = false) => `${value < 0 ? "−" : signed && value > 0 ? "+" : ""}${new Intl.NumberFormat("fr-FR").format(Math.abs(value))} DA`;
const date = value => value.split("-").reverse().join("/");
const flow = (label, value, cls = "", signed = false) => `<div class="finance-value ${cls}"><span>${label}</span><strong>${money(value, signed)}</strong></div>`;
export function renderFinance(main, { icon, showDialog, error }) {
  const data = financeFixture();
  const state = createFinanceState(data);
  function paint() {
    const snapshot = state.snapshot(), s = snapshot.analysis, c = snapshot.cash;
    main.innerHTML = `<div class="finance-page"><div class="page-top"><div><h1>Synthèse financière</h1><p>Vue consolidée des flux et contrôles</p></div><span class="badge">Données de démonstration</span></div>
      <section class="card cash-card" aria-labelledby="cash-title"><div class="finance-heading"><h2 id="cash-title">${icon("transactions")} Situation de la caisse</h2><button class="secondary" id="change-cycle">${icon("reset")}Changer de cycle de caisse</button><span class="badge">${c.historical ? "Cycle contrôlé et figé" : "Non vérifiée"}</span></div><div class="section-period" data-period-summary="cash"><strong>${c.label}</strong><span>Du ${date(c.start)} au ${date(c.end)}</span></div><div class="cash-grid"><div class="cash-total"><span>${c.historical ? "Caisse théorique à la fin du cycle clôturé" : "Caisse théorique actuelle"}</span><strong data-finance="cash">${money(c.theoretical)}</strong><small>${money(c.opening.counted)} + ${money(c.incoming)} − ${money(c.outgoing)}</small></div><div class="cash-details">${flow(`Montant compté figé au ${date(c.opening.date)}`, c.opening.counted)}${flow("Entrées espèces depuis ce contrôle", c.incoming, "incoming", true)}${flow("Sorties espèces depuis ce contrôle", -c.outgoing, "outgoing", true)}</div></div><div class="cash-control"><span>Dernier contrôle ${c.historical ? "du cycle" : "figé"} : <b>${date(c.lastControl.date)}</b></span><span>Montant compté : <b>${money(c.lastControl.counted)}</b></span>${c.historical ? `<span>Écart constaté à la clôture : <b>${money(c.discrepancy, true)}</b></span>` : ""}</div><p class="cash-status">${c.historical ? "Cycle clôturé — écart du comptage : " + money(c.discrepancy, true) : "Cycle en cours — Aucun comptage physique effectué. Écart actuel indéterminé."}</p>${!c.historical ? '<button class="primary wide" id="cash-count">Effectuer un comptage de caisse</button>' : ""}</section>
      <section aria-labelledby="indicators-title"><div class="finance-heading"><h2 id="indicators-title">${icon("chart")} Indicateurs financiers</h2><button class="secondary" id="change-analysis">${icon("reset")}Changer la période d’analyse</button></div><div class="section-period" data-period-summary="analysis"><strong>${s.label}</strong><span>Du ${date(s.start)} au ${date(s.end)}</span></div><div class="indicator-grid"><article class="card incoming"><span>Entrées</span><strong data-finance="incoming">${money(s.incoming, true)}</strong><small>Encaissements de la période</small></article><article class="card outgoing"><span>Sorties</span><strong data-finance="outgoing">${money(-s.outgoing, true)}</strong><small>Décaissements de la période</small></article><article class="card net-card"><span>Flux net</span><strong data-finance="net">${money(s.net, true)}</strong><small>Variation de trésorerie, sans assimilation à un bénéfice économique</small></article></div>${s.transactions.length ? "" : '<p class="empty" role="status">Aucune transaction sur cette période.</p>'}</section>
      <section aria-labelledby="activities-title"><div class="finance-heading"><h2 id="activities-title">${icon("housing")} Analyse par activité</h2><small>${s.label} · Du ${date(s.start)} au ${date(s.end)}</small></div><div class="activity-grid">${s.activities.map(a => `<article class="card activity-card ${a.id}" data-activity="${a.id}"><div class="activity-title"><h3><span class="activity-dot"></span>${a.name}</h3><strong class="${a.net < 0 ? "outgoing" : a.net > 0 ? "incoming" : ""}">Net : ${money(a.net, true)}</strong></div>${a.id === "common" ? '<small class="hint">Autonome, indépendant du dépôt</small>' : ""}<div class="activity-flows">${flow("Entrées", a.incoming, "incoming", true)}${flow("Sorties", -a.outgoing, "outgoing", true)}</div></article>`).join("")}</div><p class="hint">Une seule caisse physique commune aux quatre activités. Les prêts, remboursements, cautions et transferts internes sont des mouvements de trésorerie, pas des revenus ou charges définitifs.</p></section></div>`;
    main.querySelector("#cash-count")?.addEventListener("click", () => showDialog(`<form><h2 id="dialog-title">Comptage de caisse</h2><p>Ce module sera disponible dans une prochaine version. Aucun comptage, figement ou enregistrement n’est réalisé ici.</p><button class="primary wide" type="button" data-cancel>Fermer</button></form>`, e => e.preventDefault()));
    main.querySelector("#change-cycle").onclick = () => openPeriod("cash");
    main.querySelector("#change-analysis").onclick = () => openPeriod("analysis");
  }

  function openPeriod(target) {
    const snapshot = state.snapshot();
    const isCash = target === "cash";
    const selected = isCash ? (snapshot.cycleId === "current" ? data.controls.at(-1).id : snapshot.cycleId) : snapshot.analysisSelection.kind;
    let draftCycle = selected;
    let historyLimit = 20;
    const choices = isCash
      ? quickCashCycles(data).map(c => [c.id, `${c.label} · ${date(c.start)} — ${date(c.end)}`])
      : [
          ["current", "Cycle en cours"],
          ["currentMonth", "Mois en cours"],
          ["previousMonth", "Mois précédent"],
          ["currentYear", "Année en cours"],
          ["previousYear", "Année précédente"],
          ["month", "Choisir un mois"],
          ["year", "Choisir une année"],
          ["custom", "Période personnalisée"],
        ];
    const selection = snapshot.analysisSelection;
    const title = isCash ? "Sélectionner un cycle de caisse" : "Sélectionner la période d’analyse";
    showDialog(`<form class="period-form"><h2 id="dialog-title">${title}</h2>
      <p class="hint" id="period-help">${isCash ? "Seule la situation de la caisse sera modifiée. Les cycles sont délimités par les contrôles figés." : "Seuls les indicateurs et les quatre activités seront modifiés. Le cycle de caisse reste inchangé."}</p>
      <div class="form-error" role="alert" tabindex="-1"></div>
      <div data-quick-panel><fieldset class="period-choices" aria-describedby="period-help"><legend>${isCash ? "Cycle de caisse" : "Période d’analyse"}</legend>
        ${choices.map(([value, label]) => `<label class="period-choice"><input type="radio" name="kind" value="${value}" ${value === selected ? 'checked autofocus' : ""} ${isCash ? "" : "required"}><span>${label}</span><span class="choice-mark" aria-hidden="true">✓</span></label>`).join("")}
      </fieldset>
      ${isCash ? `<p class="hint" data-selected-history ${choices.some(([id]) => id === selected) ? "hidden" : ""}>Cycle historique sélectionné : ${date(snapshot.cash.start)} — ${date(snapshot.cash.end)}</p>` : ""}
      ${isCash && cashCycles(data).length > 3 ? '<button type="button" class="secondary wide" data-history-open>Consulter l’historique des cycles</button>' : ""}
      </div>
      ${isCash ? `<div data-history-panel hidden><button type="button" class="secondary" data-history-back>Retour aux cycles rapides</button>
        <h3 tabindex="-1" data-history-title>Historique des cycles</h3>
        <p class="hint">Cycles plus anciens, du plus récent au plus ancien. Choisissez un mois ou une année : les cycles qui chevauchent cette période seront affichés.</p>
        <label class="field">Mois de l’historique<input type="month" name="historyMonth" disabled></label>
        <label class="field">Année de l’historique<input type="number" name="historyYear" min="1000" max="9999" inputmode="numeric" disabled></label>
        <button type="button" class="secondary" data-history-clear>Effacer les filtres</button>
        <p class="hint" role="status" data-history-status></p>
        <fieldset class="period-choices"><legend>Cycles historiques</legend><div data-history-results></div></fieldset>
        <button type="button" class="secondary wide" data-history-more hidden>Afficher les cycles suivants</button></div>` : ""}
      ${isCash ? "" : `<label class="field" data-period="month" hidden>Mois<input type="month" name="month" value="${selection.month || data.today.slice(0, 7)}" required disabled></label>
      <label class="field" data-period="year" hidden>Année<input type="number" name="year" min="1000" max="9999" value="${selection.year || data.today.slice(0, 4)}" required disabled></label>
      <div data-period="custom" hidden><label class="field">Date de début<input type="date" name="start" value="${selection.start || data.today}" required disabled></label><label class="field">Date de fin<input type="date" name="end" value="${selection.end || data.today}" required disabled></label></div>`}
      <div class="form-footer"><button type="button" class="secondary" data-cancel>Annuler</button><button class="primary">Valider</button></div></form>`, e => {
      e.preventDefault();
      try {
        const next = Object.fromEntries(new FormData(e.target));
        if (isCash) state.selectCycle(draftCycle);
        else state.selectAnalysis(next);
        e.target.closest("dialog").close();
        paint();
        main.querySelector(isCash ? "#change-cycle" : "#change-analysis").focus();
      } catch (err) { error(e.target, err); }
    });
    const form = document.querySelector("dialog form");
    const sync = () => {
      const kind = new FormData(form).get("kind");
      form.querySelectorAll("[data-period]").forEach(el => {
        el.hidden = el.dataset.period !== kind;
        el.querySelectorAll("input").forEach(input => input.disabled = el.hidden);
      });
    };
    const modal = form.closest("dialog");
    const viewport = window.visualViewport;
    const resize = event => {
      modal.style.setProperty("--period-viewport-height", `${viewport?.height || window.innerHeight}px`);
      modal.style.setProperty("--period-viewport-top", `${viewport?.offsetTop || 0}px`);
      if (event?.type === "resize" && modal.contains(document.activeElement)) document.activeElement.scrollIntoView({ block: "nearest" });
    };
    viewport?.addEventListener("resize", resize);
    viewport?.addEventListener("scroll", resize);
    modal.addEventListener("close", () => {
      viewport?.removeEventListener("resize", resize);
      viewport?.removeEventListener("scroll", resize);
      modal.style.removeProperty("--period-viewport-height");
      modal.style.removeProperty("--period-viewport-top");
    }, { once: true });
    resize();

    if (isCash) {
      const quickPanel = form.querySelector("[data-quick-panel]");
      const historyPanel = form.querySelector("[data-history-panel]");
      const month = form.elements.historyMonth, year = form.elements.historyYear;
      const validate = form.querySelector('button:not([type="button"])');
      const drawHistory = () => {
        const results = form.querySelector("[data-history-results]");
        const status = form.querySelector("[data-history-status]");
        let cycles;
        try { cycles = historicalCashCycles(data, { month: month.value, year: year.value }); }
        catch (err) { results.innerHTML = ""; status.textContent = err.message; validate.disabled = true; form.querySelector("[data-history-more]").hidden = true; return; }
        results.innerHTML = cycles.slice(0, historyLimit).map(c => `<label class="period-choice"><input type="radio" name="historyCycle" value="${c.id}" ${c.id === draftCycle ? "checked" : ""}><span>Du ${date(c.start)} au ${date(c.end)}</span><span class="choice-mark" aria-hidden="true">✓</span></label>`).join("");
        validate.disabled = !cycles.slice(0, historyLimit).some(c => c.id === draftCycle);
        status.textContent = cycles.length ? `${Math.min(historyLimit, cycles.length)} sur ${cycles.length} cycles` : "Aucun cycle historique pour cette période.";
        form.querySelector("[data-history-more]").hidden = cycles.length <= historyLimit;
      };
      form.querySelector("[data-history-open]")?.addEventListener("click", () => {
        quickPanel.hidden = true; historyPanel.hidden = false;
        month.disabled = false; year.disabled = false;
        drawHistory();
        form.querySelector("[data-history-title]").focus();
      });
      form.querySelector("[data-history-back]")?.addEventListener("click", () => {
        quickPanel.hidden = false; historyPanel.hidden = true;
        month.disabled = true; year.disabled = true;
        validate.disabled = false;
        const hint = form.querySelector("[data-selected-history]");
        const archived = historicalCashCycles(data).find(c => c.id === draftCycle);
        hint.hidden = !archived;
        if (archived) hint.textContent = `Cycle historique sélectionné : ${date(archived.start)} — ${date(archived.end)}`;
        form.querySelectorAll('input[name="kind"]').forEach(input => input.checked = input.value === draftCycle);
        form.querySelector("[data-history-open]").focus();
      });
      form.addEventListener("change", e => {
        if (["kind", "historyCycle"].includes(e.target.name)) {
          draftCycle = e.target.value;
          validate.disabled = false;
        }
      });
      if (month && year) {
        for (const input of [month, year]) input.addEventListener("input", () => {
          (input === month ? year : month).value = "";
          historyLimit = 20; drawHistory();
        });
        form.querySelector("[data-history-clear]").onclick = () => {
          month.value = ""; year.value = ""; historyLimit = 20; drawHistory();
        };
        form.querySelector("[data-history-more]").onclick = () => {
          const previousLimit = historyLimit;
          historyLimit += 20; drawHistory();
          form.querySelectorAll('input[name="historyCycle"]')[previousLimit]?.focus();
        };
      }
    }
    form.addEventListener("keydown", e => {
      if (e.key !== "Tab") return;
      const focusable = [...form.querySelectorAll("input, button")].filter(el =>
        !el.disabled && el.getClientRects().length && (el.type !== "radio" || el.checked ||
          (![...form.querySelectorAll(`input[name="${el.name}"]`)].some(radio => radio.checked && radio.getClientRects().length) &&
            el === [...form.querySelectorAll(`input[name="${el.name}"]`)].find(radio => radio.getClientRects().length))));
      const first = focusable[0], last = focusable.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    });
    form.addEventListener("change", sync);
    sync();
  }
  paint();
}
