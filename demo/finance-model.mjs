import { activities } from "./finance-data.mjs";
export function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) &&
    new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
}
// Une opération du jour du comptage appartient explicitement à l’avant/après.
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
export function summarize(data, selection = { kind: "current" }) {
  const last = data.controls.at(-1), previous = data.controls.at(-2);
  let start, end, label, opening, closing;
  switch (selection.kind) {
    case "current": start = last.date; end = data.today; label = "Cycle de caisse en cours"; opening = last; break;
    case "previous": start = previous.date; end = last.date; label = "Cycle précédent — contrôlé et figé"; opening = previous; closing = last; break;
    case "month": {
      const month = selection.month || data.today.slice(0, 7);
      start = `${month}-01`;
      if (!validDate(start)) throw Error("Mois invalide.");
      const d = new Date(`${start}T12:00:00Z`);
      d.setUTCMonth(d.getUTCMonth() + 1, 0);
      end = d.toISOString().slice(0, 10); label = "Mois sélectionné"; break;
    }
    case "year": start = `${selection.year || data.today.slice(0, 4)}-01-01`; end = `${start.slice(0, 4)}-12-31`; label = "Année sélectionnée"; break;
    case "custom": start = selection.start; end = selection.end; label = "Période personnalisée"; break;
    default: throw Error("Période inconnue.");
  }
  if (!validDate(start) || !validDate(end) || start > end) throw Error("Choisissez deux dates valides dans l’ordre chronologique.");
  const transactions = data.transactions.filter(tx =>
    tx.operationDate >= start && tx.operationDate <= end && tx.operationDate <= data.today &&
    (!opening || afterControl(tx, opening)) && (!closing || !afterControl(tx, closing)));
  // La caisse actuelle reste indépendante du filtre calendaire.
  const cashOpening = closing ? previous : last;
  const cashTransactions = closing ? transactions : data.transactions.filter(tx =>
    tx.operationDate <= data.today && afterControl(tx, last));
  const cashFlows = totals(cashTransactions.filter(tx => tx.payment === "cash"));
  return { start, end, label, transactions, ...totals(transactions),
    activities: activities.map(([id, name]) => ({ id, name, ...totals(transactions.filter(tx => tx.activity === id)) })),
    cash: { historical: !!closing, opening: cashOpening, closing,
      ...cashFlows, theoretical: cashOpening.counted + cashFlows.net,
      lastControl: closing || last,
      discrepancy: (closing || last).counted - (closing || last).theoretical },
  };
}
