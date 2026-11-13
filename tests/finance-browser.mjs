import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { financeFixture, demoToday } from "../demo/finance-data.mjs";
import { analyze } from "../demo/finance-model.mjs";
const { chromium, webkit } = createRequire(import.meta.url)("playwright");
const base = (process.env.DEMO_TEST_URL || "http://127.0.0.1:4173").replace(/\/$/, "");
const data = financeFixture(demoToday());
const compact = s => s.replace(/\s/g, "");
mkdirSync("work/finance-screenshots", { recursive: true });
const configurations = [
  [chromium, 1440, 1000], [chromium, 390, 844], [chromium, 320, 720],
  ...(process.env.DEMO_WEBKIT === "1" ? [[webkit, 390, 844], [webkit, 320, 720]] : []),
];
for (const [engine, width, height] of configurations) {
  const browser = await engine.launch({ headless: true,
    ...(engine === chromium ? { executablePath: process.env.DEMO_CHROMIUM_PATH || "/usr/bin/chromium" } : {}),
  });
  try {
    const page = await browser.newPage({ viewport: { width, height }, isMobile: width < 700, hasTouch: width < 700 });
    const errors = [], external = [];
    page.on("pageerror", e => errors.push(e.message));
    page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
    page.on("request", r => { if (new URL(r.url()).origin !== new URL(base).origin) external.push(r.url()); });
    page.on("response", r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
    await page.goto(base + "/");
    await page.getByLabel("Identifiant fictif").fill("ahmed.admin");
    await page.getByLabel("Code PIN (6 chiffres)").fill("123456");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await page.getByRole("button", { name: "Synthèse", exact: true }).click();
    await page.getByRole("heading", { name: "Synthèse financière", exact: true }).waitFor();
    const amount = async key => compact(await page.locator(`[data-finance="${key}"]`).innerText());
    const summary = async target => page.locator(`[data-period-summary="${target}"]`).innerText();
    const section = key => page.getByRole("region", { name: key, exact: true });
    const cashButton = page.getByRole("button", { name: "Changer de cycle de caisse", exact: true });
    const analysisButton = page.getByRole("button", { name: "Changer la période d’analyse", exact: true });
    const modal = page.getByRole("dialog");
    const noOverflow = async () => {
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      if (await modal.isVisible()) {
        const box = await modal.boundingBox();
        assert(box.x >= 0 && box.x + box.width <= width + 1);
        assert(box.y >= 0 && box.y + box.height <= height + 1);
        assert(await modal.evaluate(el => el.scrollWidth <= el.clientWidth));
        assert.equal(await modal.locator("select").count(), 0);
        assert(await modal.evaluate(el => el.contains(document.activeElement)));
      }
    };
    const choose = async (target, value, fields = {}) => {
      await (target === "cash" ? cashButton : analysisButton).click();
      await modal.waitFor();
      await noOverflow();
      await modal.locator(`input[type="radio"][value="${value}"]`).check();
      for (const [label, value] of Object.entries(fields)) await modal.getByLabel(label, { exact: true }).fill(value);
      await noOverflow();
      await modal.getByRole("button", { name: "Valider", exact: true }).click();
    };
    assert.equal(await amount("cash"), "310000DA");
    assert.equal(await amount("net"), "+225000DA");
    assert.equal((await summary("cash")).match(/Du .*/)[0], (await summary("analysis")).match(/Du .*/)[0]);
    const initialAnalysis = await section("Indicateurs financiers").innerText();
    const initialActivities = await section("Analyse par activité").innerText();
    // Première ouverture, ancienne clôture et réouverture conservant le choix.
    await choose("cash", "c1");
    assert.equal(await amount("cash"), "87000DA");
    assert.equal(await section("Indicateurs financiers").innerText(), initialAnalysis);
    assert.equal(await section("Analyse par activité").innerText(), initialActivities);
    await cashButton.click();
    assert(await modal.locator('input[value="c1"]').isChecked());
    assert.equal(await modal.locator('input[type="date"]').count(), 0);
    // Navigation clavier radio, annulation par Échap et retour du focus.
    await modal.locator('input[value="c1"]').focus();
    await page.keyboard.press("ArrowDown");
    assert(await modal.locator('input[value="c0"]').isChecked());
    await page.keyboard.press("Escape");
    await modal.waitFor({ state: "hidden" });
    assert(await cashButton.evaluate(el => el === document.activeElement));
    assert.equal(await amount("cash"), "87000DA");
    const cashBeforeAnalysis = await section("Situation de la caisse").innerText();
    for (const kind of ["currentMonth", "previousMonth", "currentYear", "previousYear"]) {
      await choose("analysis", kind);
      const expected = analyze(data, { kind }).net;
      assert.equal(await amount("net"), `${expected < 0 ? "−" : expected > 0 ? "+" : ""}${Math.abs(expected)}DA`);
      assert.equal(await section("Situation de la caisse").innerText(), cashBeforeAnalysis);
    }
    await choose("analysis", "month", { Mois: "2020-01" });
    assert.equal(await amount("net"), "0DA");
    await page.getByText("Aucune transaction sur cette période.").waitFor();
    await choose("analysis", "year", { Année: "2020" });
    assert.equal(await amount("net"), "0DA");
    await choose("analysis", "custom", { "Date de début": "2020-02-02", "Date de fin": "2020-01-01" });
    await modal.getByRole("alert").filter({ hasText: "ordre chronologique" }).waitFor();
    assert(await modal.getByRole("alert").evaluate(el => el === document.activeElement));
    await modal.getByLabel("Date de fin", { exact: true }).fill("2020-03-01");
    await modal.getByRole("button", { name: "Valider", exact: true }).click();
    const customAnalysis = await summary("analysis");
    await analysisButton.click();
    assert(await modal.locator('input[value="custom"]').isChecked());
    assert.equal(await modal.getByLabel("Date de fin", { exact: true }).inputValue(), "2020-03-01");
    await modal.locator('input[value="current"]').check();
    await modal.getByRole("button", { name: "Annuler", exact: true }).click();
    assert.equal(await summary("analysis"), customAnalysis);
    // Changer à nouveau la caisse ne réinitialise jamais l’analyse personnalisée.
    await choose("cash", "c0");
    assert.equal(await amount("cash"), "72000DA");
    assert.equal(await summary("analysis"), customAnalysis);
    await choose("analysis", "current");
    assert.equal(await amount("cash"), "72000DA");
    assert.equal(await amount("net"), "+225000DA");
    // Nouvelle ouverture de l’écran : réinitialisation simultanée, pas en cours d’usage.
    await page.getByRole("button", { name: "Utilisateurs", exact: true }).click();
    await page.locator("[data-user]").first().waitFor();
    await page.getByRole("button", { name: "Synthèse", exact: true }).click();
    assert.equal(await amount("cash"), "310000DA");
    assert.equal(await amount("net"), "+225000DA");
    await noOverflow();
    await page.screenshot({ path: `work/finance-screenshots/${engine.name()}-${width}-independent.png`, fullPage: true });
    // Focus piégé dans le dialogue et sélection visible lors de la réouverture.
    await analysisButton.click();
    await modal.locator('input[value="current"]').focus();
    assert(await modal.locator('input[value="current"]').isChecked());
    await page.keyboard.press("Shift+Tab");
    assert(await modal.getByRole("button", { name: "Valider", exact: true }).evaluate(el => el === document.activeElement));
    await noOverflow();
    await page.screenshot({ path: `work/finance-screenshots/${engine.name()}-${width}-dialog.png` });
    await modal.getByRole("button", { name: "Annuler", exact: true }).click();
    await page.getByRole("button", { name: "Effectuer un comptage de caisse" }).click();
    await page.getByText("Ce module sera disponible", { exact: false }).waitFor();
    await page.getByRole("button", { name: "Fermer", exact: true }).click();
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    console.log(`OK ${engine.name()} ${width}px : filtres indépendants, cycles, périodes, annulation, focus, clavier, réouverture et responsive ; zéro erreur/appel externe`);
  } finally { await browser.close(); }
}
