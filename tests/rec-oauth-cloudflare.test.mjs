import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { allowedPages, validatePages, prepareRecOauthCloudflare } from '../scripts/prepare-rec-oauth-cloudflare.mjs';

const root = new URL('../docs/rec/oauth-public/', import.meta.url).pathname;

test('seules trois pages HTML statiques REC sont autorisées', () => {
  assert.deepEqual(validatePages(root).map(({ name }) => name), allowedPages);
});

test('le paquet reste marqué non publiable et ne contient ni secrets ni Worker', () => {
  const temp = mkdtempSync(join(tmpdir(), 'rec-oauth-static-'));
  const target = join(temp, 'output');
  const report = prepareRecOauthCloudflare({ source: root, target });
  assert.equal(report.length, 3);
  assert.deepEqual(readdirSync(target).sort(), [...allowedPages, 'PREPARATION_NON_PUBLIABLE.txt'].sort());
  assert.match(readFileSync(join(target, 'PREPARATION_NON_PUBLIABLE.txt'), 'utf8'), /NON PUBLIABLE|Ne pas publier/i);
  assert.throws(() => prepareRecOauthCloudflare({ source: root, target }), /EEXIST/);
});

test('refuse un script injecté et une page supplémentaire', () => {
  const temp = mkdtempSync(join(tmpdir(), 'rec-oauth-invalid-'));
  for (const name of allowedPages) writeFileSync(join(temp, name), readFileSync(join(root, name)));
  writeFileSync(join(temp, 'index.html'), readFileSync(join(temp, 'index.html'), 'utf8') + '<script>alert(1)</script>');
  assert.throws(() => validatePages(temp), /non conforme/);
  writeFileSync(join(temp, 'extra.html'), '<h1>extra</h1>');
  assert.throws(() => validatePages(temp), /liste autorisée/);
});
