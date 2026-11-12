import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createDemo, standard, all, keys } from "../demo/model.mjs";
test("connexion fictive : actif, PIN exact, compte désactivé refusé", () => {
  const d = createDemo();
  assert.equal(d.enter("ahmed.admin", "123456").id, "1");
  for (const [u, p] of [
    ["ahmed.admin", "12345"],
    ["absent", "123456"],
    ["m.tazi", "123456"],
  ])
    assert.throws(() => d.enter(u, p));
});
test("recherche par nom/identifiant et filtres combinés", () => {
  const d = createDemo();
  assert.equal(d.list(" KARIM ", "active").length, 1);
  assert.equal(d.list("m.tazi", "active").length, 0);
  assert.equal(d.list("", "inactive").length, 1);
  assert.equal(d.list("inexistant").length, 0);
});
const data = {
  name: "Samira Amrani",
  username: "samira.gestion",
  pin: "654321",
  confirmation: "654321",
  active: true,
  role: "standard",
};
test("création, unicité normalisée, PIN et confirmation", () => {
  const d = createDemo();
  const u = d.create(data);
  assert.deepEqual(u.permissions, standard());
  assert.equal(d.enter(u.username, u.pin).id, u.id);
  for (const change of [
    { username: " SAMIRA.GESTION " },
    { username: "bad<script>" },
    { name: " " },
    { pin: "12345" },
    { pin: "abcdef" },
    { confirmation: "111111" },
  ])
    assert.throws(() => d.create({ ...data, username: "autre", ...change }));
  assert.equal(d.users.length, 4);
});
test("administrateur : confirmation obligatoire en création et promotion", () => {
  const d = createDemo();
  assert.throws(() => d.create({ ...data, role: "admin" }));
  const u = d.create({ ...data, role: "admin" }, true);
  assert.deepEqual(u.permissions, all());
  assert.throws(() => d.savePermissions("2", "admin", all()));
  assert.equal(d.get("2").role, "standard");
  d.savePermissions("2", "admin", all(), true);
  assert.deepEqual(d.get("2").permissions, all());
});
test("dernier administrateur actif protégé contre désactivation et rétrogradation", () => {
  const d = createDemo();
  assert.equal(d.lastAdmin("1"), true);
  assert.throws(() => d.toggle("1"));
  assert.throws(() => d.savePermissions("1", "standard", standard()));
  d.create({ ...data, active: false, role: "admin" }, true);
  assert.throws(() => d.toggle("1"));
  d.savePermissions("2", "admin", all(), true);
  d.toggle("1");
  assert.equal(d.lastAdmin("2"), true);
  assert.throws(() => d.toggle("2"));
});
test("personnalisation complète ne promeut jamais implicitement administrateur", () => {
  const d = createDemo();
  d.savePermissions("2", "standard", all());
  assert.equal(d.get("2").role, "standard");
  const p = standard();
  p.audit = true;
  d.savePermissions("2", "standard", p);
  p.summary = false;
  assert.equal(d.get("2").permissions.summary, true);
  assert.throws(() => d.savePermissions("2", "standard", {}));
  d.savePermissions("2", "standard", standard());
  assert.deepEqual(d.get("2").permissions, standard());
  assert.equal(keys.length, 12);
});
test("activation, réinitialisation, édition et rechargement jetable", () => {
  const d = createDemo();
  d.toggle("3");
  assert.equal(d.enter("m.tazi", "123456").active, true);
  assert.throws(() => d.resetPin("2", "654321", "111111"));
  d.resetPin("2", "654321", "654321");
  assert.throws(() => d.enter("karim.gestion", "123456"));
  assert.equal(d.enter("karim.gestion", "654321").id, "2");
  assert.throws(() => d.edit("2", "Karim", "ahmed.admin"));
  d.edit("2", "Karim Test", "karim.test");
  assert.equal(d.get("2").name, "Karim Test");
  assert.equal(createDemo().get("2").pin, "123456");
  assert.equal(createDemo().get("3").active, false);
});
test("isolation statique : CSP et aucune API, CDN, stockage ou code historique", () => {
  for (const file of readdirSync("demo").filter((f) =>
    /\.(html|mjs|css)$/.test(f),
  )) {
    const source = readFileSync("demo/" + file, "utf8");
    assert.doesNotMatch(
      source,
      /https?:\/\/|fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|google\.script|API_URL|localStorage|sessionStorage|indexedDB|serviceWorker|\.\.\/app\.js/,
    );
  }
  assert.match(readFileSync("demo/index.html", "utf8"), /connect-src 'none'/);
});
