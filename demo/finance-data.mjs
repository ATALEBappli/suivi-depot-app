// Fixtures uniquement. Les dates d’opération et l’ordre métier du contrôle
// sont indépendants de toute date/heure de saisie.
export const activities = [
  ["rental", "Dépôt locatif"],
  ["headm", "HEADM — Construction"],
  ["common", "Charges communes"],
  ["family", "Famille / Divers"],
];
export function demoToday() {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
export function shiftDate(date, days) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function financeFixture(today = demoToday()) {
  const date = days => shiftDate(today, days);
  const controls = [
    // Archives fictives sans mouvement, pour tester le parcours historique.
    { id: "h0", date: date(-430), counted: 60000, theoretical: 60000 },
    { id: "h1", date: date(-370), counted: 60000, theoretical: 60000 },
    { id: "h2", date: date(-300), counted: 60000, theoretical: 60000 },
    { id: "h3", date: date(-150), counted: 60000, theoretical: 60000 },
    { id: "c0", date: date(-75), counted: 60000, theoretical: 60000 },
    { id: "c1", date: date(-40), counted: 70000, theoretical: 72000 },
    { id: "c2", date: date(-7), counted: 85000, theoretical: 87000 },
  ];
  const tx = (id, day, activity, direction, amount, nature, extra = {}) => ({
    id, operationDate: date(day), activity, direction, amount, nature, payment: "cash", ...extra,
  });
  return { today, controls, transactions: [
    tx("old-rent", -60, "rental", "in", 40000, "income"),
    tx("old-cost", -45, "headm", "out", 28000, "expense"),
    tx("previous-rent", -30, "rental", "in", 50000, "income"),
    tx("previous-loan", -20, "family", "out", 15000, "loan"),
    tx("before-count", -7, "common", "out", 18000, "expense", { controlId: "c2", countSide: "before" }),
    tx("after-count", -7, "rental", "in", 250000, "income", { controlId: "c2", countSide: "after" }),
    tx("deposit", -5, "rental", "in", 40000, "deposit"),
    tx("rental-cost", -4, "rental", "out", 28000, "expense"),
    tx("construction", -3, "headm", "out", 52000, "expense"),
    tx("repayment", -2, "common", "in", 50000, "repayment"),
    tx("common-cost", -1, "common", "out", 35000, "expense"),
  ] };
}
