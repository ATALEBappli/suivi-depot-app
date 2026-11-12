import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  cpSync,
  readFileSync,
  writeFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  prepareDemoPages,
  inventory,
  publishedFiles,
} from "../scripts/prepare-demo-pages.mjs";
function fixture(fn) {
  const dir = mkdtempSync(join(tmpdir(), "demo-pages-"));
  const source = join(dir, "demo"),
    target = join(dir, "site");
  cpSync("demo", source, { recursive: true });
  try {
    fn({ dir, source, target });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
test("export Pages exact et identique octet par octet à demo/", () =>
  fixture(({ source, target }) => {
    const report = prepareDemoPages({ source, target });
    assert.deepEqual(inventory(target), [...publishedFiles].sort());
    assert.equal(report.length, 11);
    for (const path of publishedFiles)
      assert.deepEqual(
        readFileSync(join(target, path)),
        readFileSync(join(source, path)),
      );
    assert.throws(() => prepareDemoPages({ source, target }), /EEXIST/);
  }));
test("refus des fichiers supplémentaires, liens et fichiers manquants", () => {
  for (const name of [
    "CNAME",
    "sw.js",
    "manifest.json",
    "environment.js",
    ".env",
    "backend.gs",
  ])
    fixture(({ source, target }) => {
      writeFileSync(join(source, name), "interdit");
      assert.throws(
        () => prepareDemoPages({ source, target }),
        /liste de publication/,
      );
    });
  fixture(({ source, target }) => {
    rmSync(join(source, "styles.css"));
    assert.throws(
      () => prepareDemoPages({ source, target }),
      /liste de publication/,
    );
  });
  fixture(({ source, target }) => {
    rmSync(join(source, "styles.css"));
    symlinkSync(join(source, "app.mjs"), join(source, "styles.css"));
    assert.throws(() => prepareDemoPages({ source, target }), /symbolique/);
  });
});
test("refus d’une CSP affaiblie, d’un bandeau retiré ou d’un appel externe", () => {
  for (const [file, transform] of [
    ["index.html", (s) => s.replace("connect-src 'none'", "connect-src *")],
    ["index.html", (s) => s.replace("DÉMONSTRATION", "Production")],
    ["app.mjs", (s) => s + '\nfetch("https://example.invalid");'],
    [
      "index.html",
      (s) => s + '<script src="//example.invalid/code.js"></script>',
    ],
    ["styles.css", (s) => s + "body{background:url(//example.invalid/image)}"],
  ])
    fixture(({ source, target }) => {
      writeFileSync(
        join(source, file),
        transform(readFileSync(join(source, file), "utf8")),
      );
      assert.throws(() => prepareDemoPages({ source, target }));
    });
});
test("workflow de préparation manuel, sans droits ni action de déploiement", () => {
  const s = readFileSync(".github/workflows/prepare-demo-pages.yml", "utf8");
  assert.match(s, /workflow_dispatch:/);
  assert.match(s, /contents: read/);
  assert.match(s, /include-hidden-files: true/);
  assert.doesNotMatch(
    s,
    /^\s+(push|pull_request|schedule):|pages: write|id-token: write|deploy-pages@|configure-pages@|gh-pages|git push|secrets\./m,
  );
});
