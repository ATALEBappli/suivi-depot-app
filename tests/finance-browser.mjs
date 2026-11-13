import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { financeFixture, demoToday } from "../demo/finance-data.mjs";
import { analyze } from "../demo/finance-model.mjs";
const { chromium, webkit } = createRequire(import.meta.url)("playwright");
const base = (process.env.DEMO_TEST_URL || "http://127.0.0.1:4173").replace(/\/$/, "");
const data = financeFixture(demoToday());
const compact = s => s.replace(/\s/g, "");
mkdirSync("work/finance-screenshots", { recursive: true });
const configurations = [
  [chromium, 1440, 1000], ...[320, 375, 390, 430].map(width => [chromium, width, 844]),
  ...(process.env.DEMO_WEBKIT === "1" ? [320, 375, 390, 430].map(width => [webkit, width, 844]) : []),
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
        assert(box.y >= 0 && box.y + box.height <= page.viewportSize().height + 1);
        assert(await modal.evaluate(el => el.scrollWidth <= el.clientWidth));
        assert.equal(await modal.locator("select").count(), 0);
        assert(await modal.evaluate(el => el.contains(document.activeElement)));
        for (const input of await modal.locator('label.field input:visible').all()) {
          const dimensions = await input.evaluate(el => {
            const field = el.getBoundingClientRect(), label = el.closest("label").getBoundingClientRect();
            return { left: field.left - label.left, right: label.right - field.right, width: field.width, max: label.width };
          });
          assert(dimensions.width <= dimensions.max + 1);
          assert(Math.abs(dimensions.left - dimensions.right) <= 1, "marges symétriques du champ");
        }
      }
    };
    const choose = async (target, value, fields = {}) => {
      await (target === "cash" ? cashButton : analysisButton).click();
      await modal.waitFor();
      await noOverflow();
      await modal.locator(`input[type="radio"][value="${value}"]`).check();
      if (target === "analysis") {
        for (const period of ["month", "year", "custom"]) {
          assert.equal(await modal.locator(`[data-period="${period}"]`).isVisible(), period === value);
          for (const input of await modal.locator(`[data-period="${period}"] input`).all())
            assert.equal(await input.isDisabled(), period !== value);
        }
      }
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
    await cashButton.click();
    assert.equal(await modal.locator('input[type="radio"]').count(), 3);
    await modal.getByRole("radio", { name: /^Cycle en cours/ }).waitFor();
    await modal.getByRole("radio", { name: /^Cycle précédent/ }).waitFor();
    await modal.getByRole("radio", { name: /^Avant-dernier cycle/ }).waitFor();
    await modal.getByRole("button", { name: "Annuler", exact: true }).click();
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
    if (width < 700) {
      await page.setViewportSize({ width, height: 460 });
      await modal.getByLabel("Date de fin", { exact: true }).focus();
      await noOverflow();
      await page.setViewportSize({ width, height });
    }
    await modal.getByLabel("Date de fin", { exact: true }).fill("2020-03-01");
    await page.screenshot({ path: `work/finance-screenshots/${engine.name()}-${width}-date-fields.png` });
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
    // Le catalogue complet n’est chargé que dans le panneau secondaire.
    await cashButton.click();
    await modal.getByRole("button", { name: "Consulter l’historique des cycles", exact: true }).click();
    await modal.getByRole("heading", { name: "Historique des cycles", exact: true }).waitFor();
    assert(await modal.getByRole("heading", { name: "Historique des cycles", exact: true }).evaluate(el => el === document.activeElement));
    await page.screenshot({ path: `work/finance-screenshots/${engine.name()}-${width}-history.png` });
    assert.deepEqual(await modal.locator('[name="historyCycle"]').evaluateAll(items => items.map(el => el.value)), ["h3", "h2", "h1", "h0"]);
    await noOverflow();
    await modal.getByLabel("Année de l’historique", { exact: true }).fill("2020");
    await modal.getByText("Aucun cycle historique pour cette période.").waitFor();
    assert(await modal.getByRole("button", { name: "Valider", exact: true }).isDisabled());
    await modal.getByLabel("Année de l’historique", { exact: true }).fill("26");
    await modal.getByText("Année invalide.", { exact: true }).waitFor();
    await modal.getByRole("button", { name: "Retour aux cycles rapides", exact: true }).click();
    assert(await modal.getByLabel("Année de l’historique", { exact: true }).isDisabled());
    await modal.getByRole("button", { name: "Consulter l’historique des cycles", exact: true }).click();
    await modal.getByRole("button", { name: "Effacer les filtres", exact: true }).click();
    await modal.getByLabel("Mois de l’historique", { exact: true }).fill(data.controls[2].date.slice(0, 7));
    assert(await modal.locator('[name="historyCycle"]').count() > 0);
    await noOverflow();
    await modal.getByLabel("Année de l’historique", { exact: true }).fill(data.controls[0].date.slice(0, 4));
    assert.equal(await modal.getByLabel("Mois de l’historique", { exact: true }).inputValue(), "");
    await modal.locator('input[name="historyCycle"][value="h0"]').check();
    await modal.getByRole("button", { name: "Retour aux cycles rapides", exact: true }).click();
    await modal.getByText("Cycle historique sélectionné :", { exact: false }).waitFor();
    await modal.getByRole("button", { name: "Valider", exact: true }).click();
    assert.equal(await amount("cash"), "60000DA");
    assert.equal(await summary("analysis"), customAnalysis);
    // Réouverture d’une archive, sélection conservée et annulation sans changement.
    await cashButton.click();
    assert.equal(await modal.locator('input[type="radio"]:visible').count(), 3);
    await modal.getByRole("button", { name: "Consulter l’historique des cycles", exact: true }).click();
    assert(await modal.locator('input[name="historyCycle"][value="h0"]').isChecked());
    await modal.locator('input[name="historyCycle"][value="h3"]').check();
    await page.keyboard.press("Escape");
    await modal.waitFor({ state: "hidden" });
    assert.equal(await amount("cash"), "60000DA");
    assert.equal(await summary("analysis"), customAnalysis);
    await choose("analysis", "current");
    assert.equal(await amount("cash"), "60000DA");
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
    if (width === 1440) {
      // Fixture navigateur seulement : un grand historique ne surcharge pas les choix rapides.
      const moduleSource = readFileSync(new URL("../demo/finance-data.mjs", import.meta.url), "utf8")
        .replace("  const controls = [", `  const controls = [
          ...Array.from({ length: 24 }, (_, index) => ({ id: "extra-" + index,
            date: date(-2000 + index * 30), counted: 60000, theoretical: 60000 })),`);
      await page.route("**/finance-data.mjs", route => route.fulfill({ contentType: "text/javascript", body: moduleSource }));
      await page.reload();
      await page.getByLabel("Identifiant fictif").fill("ahmed.admin");
      await page.getByLabel("Code PIN (6 chiffres)").fill("123456");
      await page.getByRole("button", { name: "Se connecter", exact: true }).click();
      await page.getByRole("button", { name: "Synthèse", exact: true }).click();
      await cashButton.click();
      assert.equal(await modal.locator('input[type="radio"]').count(), 3);
      await modal.getByRole("button", { name: "Consulter l’historique des cycles", exact: true }).click();
      assert.equal(await modal.locator('[name="historyCycle"]').count(), 20);
      await modal.getByRole("button", { name: "Afficher les cycles suivants", exact: true }).click();
      assert.equal(await modal.locator('[name="historyCycle"]').count(), 28);
      assert(await modal.locator('[name="historyCycle"]').nth(20).evaluate(el => el === document.activeElement));
      await modal.locator('input[value="extra-0"]').check();
      await modal.getByRole("button", { name: "Valider", exact: true }).click();
      assert.equal(await amount("cash"), "60000DA");
      assert.equal(await amount("net"), "+225000DA");
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    console.log(`OK ${engine.name()} ${width}px : filtres indépendants, cycles, périodes, annulation, focus, clavier, réouverture et responsive ; zéro erreur/appel externe`);
  } finally { await browser.close(); }
}
