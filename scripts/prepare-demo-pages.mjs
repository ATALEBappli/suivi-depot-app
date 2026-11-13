// Préparation locale/CI seulement : aucune publication, aucun appel réseau.
import { createHash } from "node:crypto";
import {
  lstatSync,
  readdirSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
export const publishedFiles = Object.freeze([
  ".nojekyll",
  "index.html",
  "styles.css",
  "app.mjs",
  "model.mjs",
  "finance-data.mjs",
  "finance-model.mjs",
  "finance-view.mjs",
  "assets/logo.svg",
  "assets/inter-latin.woff2",
  "assets/jakarta-latin.woff2",
  "assets/inter-LICENSE.txt",
  "assets/jakarta-LICENSE.txt",
  "assets/README.md",
]);

export function inventory(directory, prefix = "") {
  if (
    !lstatSync(directory).isDirectory() ||
    lstatSync(directory).isSymbolicLink()
  ) {
    throw Error("Le dossier doit être un répertoire ordinaire.");
  }
  return readdirSync(directory)
    .flatMap((name) => {
      const relative = prefix + name;
      const path = join(directory, name);
      const stat = lstatSync(path);
      if (stat.isSymbolicLink())
        throw Error("Lien symbolique interdit : " + relative);
      if (stat.isDirectory()) return inventory(path, relative + "/");
      if (!stat.isFile()) throw Error("Fichier non ordinaire : " + relative);
      return [relative];
    })
    .sort();
}

export function prepareDemoPages({
  source = resolve(root, "demo"),
  target = resolve(root, "work/pages-demo"),
} = {}) {
  const actual = inventory(source);
  if (JSON.stringify(actual) !== JSON.stringify([...publishedFiles].sort())) {
    throw Error(
      "Le contenu de demo/ diffère de la liste de publication autorisée.",
    );
  }
  const html = readFileSync(join(source, "index.html"), "utf8");
  for (const rule of [
    "default-src 'none'",
    "connect-src 'none'",
    "worker-src 'none'",
    "form-action 'none'",
    "script-src 'self'",
    "font-src 'self'",
  ]) {
    if (!html.includes(rule)) throw Error("CSP absente : " + rule);
  }
  if (!html.includes("DÉMONSTRATION") || !html.includes("Données fictives"))
    throw Error("Bandeau de démonstration absent.");
  if (readFileSync(join(source, ".nojekyll")).length !== 0)
    throw Error(".nojekyll doit rester vide.");
  const entries = publishedFiles.map((path) => ({
    path,
    bytes: readFileSync(join(source, path)),
  }));
  for (const { path, bytes } of entries) {
    if (/\.(html|css|mjs|svg)$/.test(path)) {
      // L’espace de noms XML SVG n’est pas une requête réseau.
      const text = bytes
        .toString("utf8")
        .replace('xmlns="http://www.w3.org/2000/svg"', "");
      if (
        /https?:\/\/|(?:src|href)\s*=\s*["']\s*\/\/|url\(\s*["']?\s*\/\//i.test(
          text,
        ) ||
        /fetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|serviceWorker|localStorage|sessionStorage|indexedDB|API_URL|google\.script/.test(
          text,
        )
      ) {
        throw Error("Ressource externe, stockage ou API interdit dans " + path);
      }
    }
  }
  // Ne remplace jamais un dossier existant ; évite tout écrasement involontaire.
  mkdirSync(target, { recursive: false });
  const report = [];
  for (const { path, bytes } of entries) {
    mkdirSync(dirname(join(target, path)), { recursive: true });
    writeFileSync(join(target, path), bytes, { flag: "wx" });
    report.push({
      path,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      size: bytes.length,
    });
  }
  return report;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  mkdirSync(resolve(root, "work"), { recursive: true });
  const report = prepareDemoPages();
  console.log("Prêt dans work/pages-demo/ — aucune publication effectuée.");
  console.log(JSON.stringify(report, null, 2));
}
