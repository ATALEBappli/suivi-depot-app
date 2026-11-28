// Test du paquet à son futur sous-chemin Pages, sans en-têtes CSP ajoutés par le serveur.
// Option DEMO_PUBLISHED_URL : contrôle du site de démo après publication autorisée.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { resolve, join, extname } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import {
  prepareDemoPages,
  publishedFiles,
} from "../scripts/prepare-demo-pages.mjs";
const { chromium } = createRequire(import.meta.url)("playwright");
const folder = mkdtempSync(resolve("work/pages-browser-"));
const output = join(folder, "site");
prepareDemoPages({ target: output });
const mount = "/suivi-depot-demo";
const mime = {
  ".html": "text/html; charset=utf-8",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
};
const worker =
  "self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));";
const server = createServer((req, res) => {
  const path = new URL(req.url, "http://localhost").pathname;
  if (path === "/suivi-depot-app/sw.js") {
    res.setHeader("Content-Type", "text/javascript");
    res.end(worker);
    return;
  }
  if (path === "/suivi-depot-app/test.html") {
    res.setHeader("Content-Type", "text/html");
    res.end("<!doctype html><title>PWA fictive de test</title>");
    return;
  }
  const relative =
    path === mount + "/" ? "index.html" : path.slice(mount.length + 1);
  if (!path.startsWith(mount + "/") || !publishedFiles.includes(relative)) {
    res.writeHead(404);
    res.end("Introuvable");
    return;
  }
  res.setHeader("Content-Type", mime[extname(relative)] || "text/plain");
  res.end(readFileSync(join(output, relative)));
});
let browser;
try {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;
  const base =
    process.env.DEMO_PUBLISHED_URL?.replace(/\/$/, "") || origin + mount;
  if (process.env.DEMO_PUBLISHED_URL) {
    const u = new URL(base);
    assert.equal(u.protocol, "https:");
    assert.equal(u.hostname, "atalebappli.github.io");
    assert.equal(u.pathname, mount);
  }
  browser = await chromium.launch({
    headless: true,
    ...(process.env.DEMO_CHROMIUM_PATH
      ? { executablePath: process.env.DEMO_CHROMIUM_PATH }
      : {}),
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  // Fixture PWA du même domaine, au chemin de l’application historique ; aucun code PROD exécuté.
  if (!process.env.DEMO_PUBLISHED_URL) {
    await page.goto(origin + "/suivi-depot-app/test.html");
    await page.evaluate(async () => {
      await navigator.serviceWorker.register("./sw.js");
      await navigator.serviceWorker.ready;
      localStorage.setItem("pwa-test", "conserver");
      const cache = await caches.open("pwa-test");
      await cache.put("/pwa-test-sentinel", new Response("conserver"));
    });
    await page.reload();
    assert.equal(
      await page.evaluate(() => !!navigator.serviceWorker.controller),
      true,
    );
  }
  const requests = [],
    external = [],
    errors = [];
  page.on("request", (r) => requests.push(r.url()));
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (
      url.origin !== new URL(base).origin ||
      !url.pathname.startsWith(mount + "/")
    ) {
      external.push(url.href);
      return route.abort();
    }
    return route.continue();
  });
  await page.goto(base + "/");
  await page
    .getByRole("heading", { name: "Bienvenue sur Suivi Dépôt" })
    .waitFor();
  assert.equal(
    await page.evaluate(() => navigator.serviceWorker.controller === null),
    true,
  );
  await page
    .getByText("DÉMONSTRATION · Données fictives", { exact: false })
    .waitFor();
  await page.getByLabel("Identifiant fictif").fill("ahmed.admin");
  await page.getByLabel("Code PIN (6 chiffres)").fill("123456");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page
    .getByRole("heading", { name: "Gestion des utilisateurs" })
    .waitFor();
  await page
    .getByRole("button", { name: "Ajouter un utilisateur", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Créer un utilisateur", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Retour", exact: true }).click();
  await page
    .locator('[data-user="2"]')
    .getByRole("button", { name: "Permissions", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Permissions utilisateur" })
    .waitFor();
  await page.screenshot({ path: "work/demo-pages-iphone.png", fullPage: true });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  // Vérifie le contenu réellement servi (et le MIME des modules) sans réclamer d’autre site.
  for (const path of publishedFiles.filter(
    (path) => !process.env.DEMO_PUBLISHED_URL || path !== ".nojekyll",
  )) {
    const r = await context.request.get(base + "/" + path, { maxRedirects: 0 });
    assert.equal(r.status(), 200, path);
    assert.deepEqual(
      await r.body(),
      readFileSync(join(output, path)),
      path + " différent de demo/",
    );
    if (path.endsWith(".mjs"))
      assert.match(r.headers()["content-type"], /(javascript|ecmascript)/);
  }
  if (!process.env.DEMO_PUBLISHED_URL) {
    const state = await page.evaluate(async () => ({
      scopes: (await navigator.serviceWorker.getRegistrations()).map(
        (r) => new URL(r.scope).pathname,
      ),
      saved: localStorage.getItem("pwa-test"),
      cache: await (
        await (await caches.open("pwa-test")).match("/pwa-test-sentinel")
      ).text(),
    }));
    assert.deepEqual(state, {
      scopes: ["/suivi-depot-app/"],
      saved: "conserver",
      cache: "conserver",
    });
    for (const testFile of ["tests/demo-browser.mjs", "tests/finance-browser.mjs"]) {
      const child = spawn(process.execPath, [testFile], {
        env: { ...process.env, DEMO_TEST_URL: base },
        stdio: "inherit",
      });
      const [code] = await once(child, "exit");
      assert.equal(code, 0, testFile);
    }
  }
  assert.deepEqual(external, []);
  assert.deepEqual(errors, []);
  assert(
    requests.every((url) => new URL(url).pathname.startsWith(mount + "/")),
  );
  console.log(
    `OK ${process.env.DEMO_PUBLISHED_URL ? "HTTPS publié" : "paquet local simulant Pages"} : quatre écrans, fichiers identiques, MIME modules, zéro requête externe, zéro erreur JS, aucun service worker sur la démo.`,
  );
  if (!process.env.DEMO_PUBLISHED_URL)
    console.log(
      "OK PWA voisine conservée : worker, cache et stockage inchangés.",
    );
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
  rmSync(folder, { recursive: true, force: true });
}
