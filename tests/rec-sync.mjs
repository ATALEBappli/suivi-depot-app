// Aucun accès réseau : les réponses API sont des fixtures locales fictives.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, chmodSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { prepare } from '../scripts/prepare-rec-sync.mjs';
const temp = mkdtempSync(join(tmpdir(), 'rec-sync-'));
try {
  const repo = join(temp, 'repo'), priv = join(temp, 'private');
  mkdirSync(join(repo, 'apps-script/src'), { recursive: true });
  mkdirSync(priv, { mode: 0o700 });
  const src = join(repo, 'apps-script/src');
  for (const [n, text] of Object.entries({ 'Code.gs': 'function doGet() {}', 'README.md': 'Documentation', 'appsscript.json': '{"runtimeVersion":"V8"}' })) writeFileSync(join(src, n), text);
  const id = 'FICTIF_REC_AUCUNE_CIBLE_REELLE';
  let seq = 0;
  const run = (change = () => {}) => {
    const out = join(priv, `review-${seq++}`);
    const data = {
      policy: { environment: 'REC', scriptId: id, title: 'SuiviDepotAPI-REC' },
      binding: { scriptId: id, rootDir: join(out, 'src') },
      metadata: { scriptId: id, title: 'SuiviDepotAPI-REC' },
      backup: { scriptId: id, files: [{ name: 'appsscript', type: 'JSON', source: '{"runtimeVersion":"V8"}' }] }
    };
    change(data);
    const options = { out };
    for (const [key, value] of Object.entries(data)) {
      options[key] = join(priv, `${key}.json`);
      writeFileSync(options[key], JSON.stringify(value), { mode: 0o600 });
    }
    return { options, execute: () => prepare(options, repo) };
  };
  const good = run(), report = good.execute();
  assert.equal(report.state, 'STOP_BEFORE_PUSH');
  assert.equal(readFileSync(join(good.options.out, 'src/Code.gs'), 'utf8'), 'function doGet() {}');
  assert.ok(existsSync(join(good.options.out, 'remote-backup.json')));
  assert.equal(existsSync(join(good.options.out, 'src/README.md')), false);
  assert.throws(good.execute); // aucune réutilisation ni écrasement de sauvegarde
  for (const change of [
    d => { d.policy.environment = 'PROD'; },
    d => { d.binding.scriptId = 'FICTIF_AUTRE_CIBLE'; },
    d => { d.metadata.scriptId = 'FICTIF_AUTRE_CIBLE'; },
    d => { d.metadata.title = 'Autre'; },
    d => { d.metadata.parentId = 'FICTIF_CLASSEUR_LIE'; },
    d => { d.backup.scriptId = 'FICTIF_AUTRE_CIBLE'; },
    d => { d.backup.files = []; },
    d => { d.backup.files.push(d.backup.files[0]); },
    d => { d.backup.files[0].source = 'invalid'; },
    d => { d.binding.rootDir = src; },
    d => { d.policy.extra = 'refus'; }
  ]) {
    const test = run(change); assert.throws(test.execute); assert.equal(existsSync(test.options.out), false);
  }
  const permissions = run(); chmodSync(permissions.options.policy, 0o644); assert.throws(permissions.execute); chmodSync(permissions.options.policy, 0o600);
  const missing = run(); rmSync(missing.options.backup); assert.throws(missing.execute);
  const inRepo = run(); inRepo.options.out = join(repo, 'review'); assert.throws(inRepo.execute);
  const symlink = run(); const link = join(priv, 'link.json'); symlinkSync(symlink.options.policy, link); symlink.options.policy = link; assert.throws(symlink.execute);
  writeFileSync(join(src, 'Unexpected.gs'), ''); assert.throws(run().execute); rmSync(join(src, 'Unexpected.gs'));
  writeFileSync(join(src, 'Code.gs'), ''); assert.throws(run().execute);
  console.log('OK : cible REC, sauvegarde obligatoire, chemins privés, sources, refus et arrêt avant envoi ; hors réseau.');
} finally { rmSync(temp, { recursive: true, force: true }); }
