import { activities } from "./finance-data.mjs";

export function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) &&
    new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
}
// L’ordre métier avant/après comptage ne dépend jamais de l’heure de saisie.
function afterControl(tx, control) {
  return tx.operationDate > control.date ||
    (tx.operationDate === control.date && tx.controlId === control.id && tx.countSide === "after");
}
export function totals(transactions) {
  const result = { incoming: 0, outgoing: 0, net: 0, byNature: {} };
  for (const tx of transactions) {
    const key = tx.direction === "in" ? "incoming" : "outgoing";
    result[key] += tx.amount;
    result.byNature[tx.nature] ??= { incoming: 0, outgoing: 0 };
    result.byNature[tx.nature][key] += tx.amount;
  }
  result.net = result.incoming - result.outgoing;
  return result;
}
export function cashCycles(data) {
  return data.controls.map((opening, index) => ({
    id: opening.id,
    opening,
    closing: data.controls[index + 1] || null,
    start: opening.date,
    end: data.controls[index + 1]?.date || data.today,
    label: index === data.controls.length - 1 ? "Cycle de caisse en cours" : "Cycle clôturé",
  })).reverse();
}
// Présentation seulement : aucune suppression ni modification des contrôles.
export function quickCashCycles(data) {
  const labels = ["Cycle en cours", "Cycle précédent", "Avant-dernier cycle"];
  return cashCycles(data).slice(0, 3).map((cycle, index) => ({ ...cycle, label: labels[index] }));
}
export function historicalCashCycles(data, { month = "", year = "" } = {}) {
  let start, end;
  if (month) ({ start, end } = monthRange(month));
  else if (year) {
    start = `${year}-01-01`; end = `${year}-12-31`;
    if (!validDate(start) || !validDate(end)) throw Error("Année invalide.");
  }
  // Inclure un cycle qui chevauche le mois/l’année, même s’il a commencé avant.
  return cashCycles(data).slice(3).filter(cycle => !start || (cycle.start <= end && cycle.end >= start));
}
export function cashSituation(data, cycleId = "current") {
  const cycles = cashCycles(data);
  const cycle = cycleId === "current" ? cycles[0] : cycles.find(c => c.id === cycleId);
  if (!cycle) throw Error("Cycle de caisse inconnu.");
  const transactions = data.transactions.filter(tx => tx.payment === "cash" &&
    tx.operationDate <= data.today && afterControl(tx, cycle.opening) &&
    (!cycle.closing || !afterControl(tx, cycle.closing)));
  const flows = totals(transactions);
  const theoretical = cycle.opening.counted + flows.net;
  return { ...cycle, ...flows, transactions, theoretical,
    historical: !!cycle.closing,
    lastControl: cycle.closing || cycle.opening,
    // Aucun écart du cycle actif sans véritable comptage de clôture.
    discrepancy: cycle.closing ? cycle.closing.counted - theoretical : null,
  };
}
function monthRange(month) {
  const start = `${month}-01`;
  if (!validDate(start)) throw Error("Mois invalide.");
  const d = new Date(`${start}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1, 0);
  return { start, end: d.toISOString().slice(0, 10) };
}
export function analyze(data, selection = { kind: "current" }) {
  let start, end, opening, label;
  const year = Number(data.today.slice(0, 4));
  switch (selection.kind) {
    case "current":
      opening = data.controls.at(-1); start = opening.date; end = data.today;
      label = "Cycle en cours"; break;
    case "currentMonth":
    case "previousMonth":
    case "month": {
      let month = selection.month;
      if (selection.kind === "currentMonth") month = data.today.slice(0, 7);
      if (selection.kind === "previousMonth") {
        const d = new Date(`${data.today.slice(0, 7)}-01T12:00:00Z`);
        d.setUTCMonth(d.getUTCMonth() - 1);
        month = d.toISOString().slice(0, 7);
      }
      ({ start, end } = monthRange(month));
      label = selection.kind === "currentMonth" ? "Mois en cours" : selection.kind === "previousMonth" ? "Mois précédent" : "Mois sélectionné";
      break;
    }
    case "currentYear":
    case "previousYear":
    case "year": {
      const selected = selection.kind === "currentYear" ? year : selection.kind === "previousYear" ? year - 1 : selection.year;
      start = `${selected}-01-01`; end = `${selected}-12-31`;
      label = selection.kind === "currentYear" ? "Année en cours" : selection.kind === "previousYear" ? "Année précédente" : "Année sélectionnée";
      break;
    }
    case "custom":
      start = selection.start; end = selection.end; label = "Période personnalisée"; break;
    default: throw Error("Période d’analyse inconnue.");
  }
  if (!validDate(start) || !validDate(end) || start > end)
    throw Error("Choisissez deux dates valides dans l’ordre chronologique.");
  const transactions = data.transactions.filter(tx => tx.operationDate >= start &&
    tx.operationDate <= end && tx.operationDate <= data.today && (!opening || afterControl(tx, opening)));
  return { start, end, label, transactions, ...totals(transactions),
    activities: activities.map(([id, name]) => ({ id, name, ...totals(transactions.filter(tx => tx.activity === id)) })),
  };
}
// Une instance par ouverture de l’écran. Chaque modification ne touche qu’un filtre.
export function createFinanceState(data) {
  let cycleId = "current", analysisSelection = { kind: "current" };
  return {
    snapshot() {
      return { cycleId, analysisSelection: { ...analysisSelection },
        cash: cashSituation(data, cycleId), analysis: analyze(data, analysisSelection) };
    },
    selectCycle(id) {
      cashSituation(data, id);
      cycleId = id;
    },
    selectAnalysis(selection) {
      analyze(data, selection);
      analysisSelection = { ...selection };
    },
  };
}
