import { test } from "node:test";
import assert from "node:assert/strict";
import { financeFixture } from "../demo/finance-data.mjs";
import { summarize, validDate } from "../demo/finance-model.mjs";
const data = financeFixture("2026-11-12");
function check(selection, incoming, outgoing) {
  const s = summarize(data, selection);
  assert.equal(s.incoming, incoming);
  assert.equal(s.outgoing, outgoing);
  assert.equal(s.net, incoming - outgoing);
  for (const key of ["incoming", "outgoing", "net"])
    assert.equal(s.activities.reduce((sum, a) => sum + a[key], 0), s[key]);
  return s;
}
test("cycle actif : caisse unique, quatre activités, nature des flux", () => {
  const s = check({ kind: "current" }, 340000, 115000);
  assert.equal(s.cash.theoretical, 310000);
  assert.equal(s.cash.discrepancy, -2000);
  assert.equal(s.cash.historical, false);
  assert.deepEqual(s.activities.map(a => a.net), [262000, -52000, 15000, 0]);
  assert.equal(s.byNature.deposit.incoming, 40000);
  assert.equal(s.byNature.repayment.incoming, 50000);
});
test("cycle précédent : avant/après contrôle, solde et écart historiques", () => {
  const s = check({ kind: "previous" }, 50000, 33000);
  assert.equal(s.cash.theoretical, 87000);
  assert.equal(s.cash.closing.counted, 85000);
  assert.equal(s.cash.discrepancy, -2000);
  assert.equal(s.cash.historical, true);
  assert(s.transactions.some(t => t.id === "before-count"));
  assert(!s.transactions.some(t => t.id === "after-count"));
});
test("mois sélectionné et mois historique", () => {
  check({ kind: "month", month: "2026-11" }, 340000, 133000);
  check({ kind: "month", month: "2026-10" }, 50000, 15000);
});
test("année et année sans données", () => {
  check({ kind: "year", year: "2026" }, 430000, 176000);
  check({ kind: "year", year: "2025" }, 0, 0);
});
test("période personnalisée inclusive : même jour de contrôle", () => {
  const s = check({ kind: "custom", start: "2026-11-05", end: "2026-11-05" }, 250000, 18000);
  assert.equal(s.cash.theoretical, 310000);
});
test("période vide : caisse actuelle conservée", () => {
  const s = check({ kind: "custom", start: "2020-01-01", end: "2020-01-31" }, 0, 0);
  assert.equal(s.transactions.length, 0);
  assert.equal(s.cash.theoretical, 310000);
});
test("bornes invalides et données futures exclues", () => {
  assert.equal(validDate("2026-02-30"), false);
  assert.throws(() => summarize(data, { kind: "custom", start: "2026-11-12", end: "2026-11-01" }));
  assert.throws(() => summarize(data, { kind: "month", month: "2026-13" }));
  const future = { ...data, transactions: [...data.transactions, { ...data.transactions[0], operationDate: "2026-12-01" }] };
  assert.equal(summarize(future, { kind: "year" }).incoming, 430000);
});
test("la caisse ne comprend que les espèces, les indicateurs tous les flux", () => {
  const d = { ...data, transactions: [...data.transactions, { ...data.transactions[0], operationDate: data.today, payment: "bank", amount: 10000 }] };
  const s = summarize(d);
  assert.equal(s.incoming, 350000);
  assert.equal(s.cash.theoretical, 310000);
});
