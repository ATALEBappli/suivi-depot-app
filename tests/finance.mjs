import { test } from "node:test";
import assert from "node:assert/strict";
import { financeFixture } from "../demo/finance-data.mjs";
import { analyze, cashSituation, cashCycles, createFinanceState, validDate, quickCashCycles, historicalCashCycles } from "../demo/finance-model.mjs";
const data = financeFixture("2026-11-12");
function check(selection, incoming, outgoing) {
  const s = analyze(data, selection);
  assert.equal(s.incoming, incoming);
  assert.equal(s.outgoing, outgoing);
  assert.equal(s.net, incoming - outgoing);
  for (const key of ["incoming", "outgoing", "net"])
    assert.equal(s.activities.reduce((sum, a) => sum + a[key], 0), s[key]);
  return s;
}
test("initialisation : les deux filtres ont les mêmes dates et flux", () => {
  const { cash, analysis } = createFinanceState(data).snapshot();
  assert.equal(cash.start, analysis.start);
  assert.equal(cash.end, analysis.end);
  assert.equal(cash.theoretical, 310000);
  assert.equal(cash.discrepancy, null);
  assert.equal(cash.historical, false);
  assert.equal(analysis.net, 225000);
});
test("cycle actif : quatre activités et natures distinctes", () => {
  const s = check({ kind: "current" }, 340000, 115000);
  assert.deepEqual(s.activities.map(a => a.net), [262000, -52000, 15000, 0]);
  assert.equal(s.byNature.deposit.incoming, 40000);
  assert.equal(s.byNature.repayment.incoming, 50000);
});
test("tous les anciens cycles, leurs comptages et écarts", () => {
  assert.deepEqual(cashCycles(data).slice(0, 3).map(c => c.id), ["c2", "c1", "c0"]);
  const c = cashSituation(data, "c1");
  assert.equal(c.incoming, 50000);
  assert.equal(c.outgoing, 33000);
  assert.equal(c.theoretical, 87000);
  assert.equal(c.closing.counted, 85000);
  assert.equal(c.discrepancy, -2000);
  assert.equal(cashSituation(data, "c0").theoretical, 72000);
  assert.equal(cashSituation(data, "c0").discrepancy, -2000);
  assert.throws(() => cashSituation(data, "2026-11-01"));
});
test("avant/après comptage le même jour : aucun double comptage", () => {
  const current = cashSituation(data), previous = cashSituation(data, "c1");
  assert(previous.transactions.some(t => t.id === "before-count"));
  assert(!previous.transactions.some(t => t.id === "after-count"));
  assert(current.transactions.some(t => t.id === "after-count"));
  assert(!current.transactions.some(t => t.id === "before-count"));
});
test("modifier la caisse conserve intégralement l’analyse, et inversement", () => {
  const state = createFinanceState(data);
  const initial = state.snapshot();
  state.selectCycle("c1");
  assert.deepEqual(state.snapshot().analysis, initial.analysis);
  const cash = state.snapshot().cash;
  state.selectAnalysis({ kind: "previousMonth" });
  assert.deepEqual(state.snapshot().cash, cash);
  const analysis = state.snapshot().analysis;
  state.selectCycle("c0");
  assert.deepEqual(state.snapshot().analysis, analysis);
  const reopened = createFinanceState(data).snapshot();
  assert.deepEqual(reopened, initial);
});
test("sélection invalide : aucun état ne change et snapshots sans alias", () => {
  const state = createFinanceState(data), before = state.snapshot();
  assert.throws(() => state.selectAnalysis({ kind: "custom", start: "2026-02-30", end: "2026-11-12" }));
  assert.throws(() => state.selectCycle("absent"));
  assert.deepEqual(state.snapshot(), before);
  const selection = { kind: "previousYear" };
  state.selectAnalysis(selection);
  selection.kind = "current";
  const snapshot = state.snapshot();
  snapshot.analysisSelection.kind = "custom";
  assert.equal(state.snapshot().analysisSelection.kind, "previousYear");
});
test("mois courant, précédent et choix libre", () => {
  check({ kind: "currentMonth" }, 340000, 133000);
  check({ kind: "previousMonth" }, 50000, 15000);
  check({ kind: "month", month: "2026-09" }, 40000, 28000);
});
test("année courante, précédente et choix libre", () => {
  check({ kind: "currentYear" }, 430000, 176000);
  check({ kind: "previousYear" }, 0, 0);
  check({ kind: "year", year: "2026" }, 430000, 176000);
});
test("mois précédent de janvier, année précédente et année bissextile", () => {
  const jan = financeFixture("2027-01-15");
  const month = analyze(jan, { kind: "previousMonth" });
  assert.equal(month.start, "2026-12-01"); assert.equal(month.end, "2026-12-31");
  const year = analyze(jan, { kind: "previousYear" });
  assert.equal(year.start, "2026-01-01"); assert.equal(year.end, "2026-12-31");
  assert.equal(analyze(data, { kind: "month", month: "2024-02" }).end, "2024-02-29");
});
test("dates personnalisées inclusives et période vide", () => {
  check({ kind: "custom", start: "2026-11-05", end: "2026-11-05" }, 250000, 18000);
  assert.equal(check({ kind: "custom", start: "2020-01-01", end: "2020-01-31" }, 0, 0).transactions.length, 0);
});
test("bornes invalides et opérations futures exclues", () => {
  assert.equal(validDate("2026-02-30"), false);
  assert.throws(() => analyze(data, { kind: "custom", start: "2026-11-12", end: "2026-11-01" }));
  assert.throws(() => analyze(data, { kind: "month", month: "2026-13" }));
  assert.throws(() => analyze(data, { kind: "year", year: "26" }));
  const future = { ...data, transactions: [...data.transactions, { ...data.transactions[0], operationDate: "2026-12-01" }] };
  assert.equal(analyze(future, { kind: "currentYear" }).incoming, 430000);
  assert.equal(cashSituation(future).theoretical, 310000);
});
test("mouvements bancaires inclus dans les flux, exclus de tous les cycles physiques", () => {
  const d = { ...data, transactions: [...data.transactions,
    { ...data.transactions[0], operationDate: data.today, payment: "bank", amount: 10000, nature: "transfer" },
    { ...data.transactions[0], operationDate: "2026-10-12", payment: "bank", amount: 20000, nature: "loan" },
  ] };
  assert.equal(analyze(d).incoming, 350000);
  assert.equal(analyze(d).byNature.transfer.incoming, 10000);
  assert.equal(analyze(d, { kind: "previousMonth" }).byNature.loan.incoming, 20000);
  for (const cycle of cashCycles(d))
    assert.deepEqual(cashSituation(d, cycle.id), cashSituation(data, cycle.id));
});

test("trois cycles rapides maximum, sans perte d’archives", () => {
  const before = structuredClone(data);
  assert.deepEqual(quickCashCycles(data).map(c => c.label), ["Cycle en cours", "Cycle précédent", "Avant-dernier cycle"]);
  assert.equal(historicalCashCycles(data).length, 4);
  assert.deepEqual(historicalCashCycles(data).map(c => c.id), ["h3", "h2", "h1", "h0"]);
  for (const count of [1, 2, 3]) {
    const short = { ...data, controls: data.controls.slice(-count) };
    assert.equal(quickCashCycles(short).length, count);
    assert.equal(historicalCashCycles(short).length, 0);
  }
  assert.deepEqual(data, before);
});
test("historique : filtrage par chevauchement du mois ou de l’année", () => {
  const archived = historicalCashCycles(data);
  const month = archived[0].end.slice(0, 7);
  const filtered = historicalCashCycles(data, { month });
  assert(filtered.some(c => c.id === archived[0].id));
  assert(filtered.every(c => c.start <= month + "-31" && c.end >= month + "-01"));
  assert.deepEqual(historicalCashCycles(data, { year: "2025" }).map(c => c.id), ["h1", "h0"]);
  assert.equal(historicalCashCycles(data, { year: "2020" }).length, 0);
  assert.throws(() => historicalCashCycles(data, { month: "2026-13" }));
  assert.throws(() => historicalCashCycles(data, { year: "26" }));
});
test("choisir une archive ne change jamais l’analyse financière", () => {
  const state = createFinanceState(data);
  state.selectAnalysis({ kind: "previousMonth" });
  const analysis = state.snapshot().analysis;
  state.selectCycle("h1");
  assert.deepEqual(state.snapshot().analysis, analysis);
  assert.equal(state.snapshot().cash.theoretical, 60000);
  assert.equal(state.snapshot().cash.discrepancy, 0);
});
