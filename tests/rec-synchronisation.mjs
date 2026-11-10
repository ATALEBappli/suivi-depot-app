// Services exclusivement fictifs : aucun client HTTP ni accès Google/GitHub.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const source = readFileSync(new URL('../apps-script/rec-synchronisation/Synchroniseur.gs', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../apps-script/src/appsscript.json', import.meta.url)));
const syncManifest = JSON.parse(readFileSync(new URL('../apps-script/rec-synchronisation/appsscript.json', import.meta.url)));
assert.deepEqual(syncManifest.oauthScopes, [
  'https://www.googleapis.com/auth/script.projects', 'https://www.googleapis.com/auth/script.external_request',
  'https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/userinfo.email'
]);
assert(!('webapp' in syncManifest));
const id = 'FICTIF_REC_DESTINATION_UNIQUE_123456789';
const email = 'compte-fictif@example.invalid';
const sha = 'a'.repeat(40), treeSha = 'b'.repeat(40);
const copy = value => JSON.parse(JSON.stringify(value));
const makeFiles = text => [{ name: 'Code', type: 'SERVER_JS', source: text },
  { name: 'appsscript', type: 'JSON', source: JSON.stringify(manifest) }];
const old = makeFiles('function ancienne() {}');
let count = 0;
function setup(personalized = true) {
  const properties = new Map([['GITHUB_READ_TOKEN', 'SECRET_FICTIF_NE_PAS_JOURNALISER'], ['CANDIDATE_SHA', sha]]);
  const calls = [], logs = [], drive = new Map();
  const state = { files: copy(old), title: 'SuiviDepotAPI-REC', email, candidate: makeFiles('function nouvelle() {}'),
    treeExtra: null, truncated: false, backupFailure: false, corruptBackup: false,
    corruptBlob: false, writeFailure: false, wrongReadback: false, held: false, now: 1000000, puts: 0 };
  const blobMap = new Map();
  const hex = (alg, value) => createHash(alg).update(value).digest();
  const response = (value, code = 200) => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(value) });
  function fetch(url, options) {
    calls.push({ url, method: options.method });
    assert.equal(options.followRedirects, false);
    if (url.startsWith('https://api.github.com/repos/ATALEBappli/suivi-depot-app/git/')) {
      assert.equal(options.method, 'get');
      assert.equal(options.headers.Authorization, 'Bearer SECRET_FICTIF_NE_PAS_JOURNALISER');
      if (url.includes('/commits/')) return response({ sha, tree: { sha: treeSha } });
      if (url.includes('/trees/')) {
        blobMap.clear();
        const tree = state.candidate.map(f => {
          const buffer = Buffer.from(f.source);
          const digest = hex('sha1', Buffer.concat([Buffer.from(`blob ${buffer.length}\0`), buffer])).toString('hex');
          blobMap.set(digest, { sha: digest, size: buffer.length, encoding: 'base64', content: buffer.toString('base64') });
          return { path: `apps-script/src/${f.name === 'Code' ? 'Code.gs' : f.name + '.json'}`,
            sha: digest, type: 'blob', mode: '100644' };
        });
        tree.push({ path: 'apps-script/src/README.md', type: 'blob', mode: '100644' });
        if (state.treeExtra) tree.push(state.treeExtra);
        return response({ sha: treeSha, truncated: state.truncated, tree });
      }
      const blob = copy(blobMap.get(url.split('/').at(-1)));
      if (state.corruptBlob) blob.content = Buffer.from('corruption').toString('base64');
      return response(blob);
    }
    if (url.startsWith('https://script.googleapis.com/')) {
      assert.equal(options.headers.Authorization, 'Bearer GOOGLE_FICTIF');
      assert(url === `https://script.googleapis.com/v1/projects/${id}` ||
        url === `https://script.googleapis.com/v1/projects/${id}/content`);
      if (options.method === 'put') {
        state.puts++;
        assert(properties.has('IN_FLIGHT')); assert(!properties.has('APPROVAL'));
        assert(drive.size > 0); // Une sauvegarde doit précéder l'écriture.
        state.files = JSON.parse(options.payload).files;
        if (state.writeFailure) throw new Error('Erreur contenant SECRET_FICTIF_NE_PAS_JOURNALISER');
        return response({});
      }
      if (url.endsWith('/content')) return response({ scriptId: id,
        files: state.puts && state.wrongReadback ? old : state.files });
      return response({ scriptId: state.wrongId ? 'AUTRE_CIBLE_FICTIVE' : id,
        title: state.title, ...(state.bound ? { parentId: 'CLASSEUR_FICTIF' } : {}) });
    }
    if (url.startsWith('https://www.googleapis.com/drive/v3/files')) {
      if (state.backupFailure) return response({}, 403);
      if (options.method === 'post') { const key = 'backup' + (drive.size + 1); drive.set(key, null); return response({ id: key }); }
      if (url.includes('?fields=')) return response({ id: url.split('/').at(-1).split('?')[0],
        permissions: [{ type: state.sharedBackup ? 'anyone' : 'user', role: 'owner', emailAddress: email }] });
      const record = copy(drive.get(url.split('/').at(-1).split('?')[0]));
      if (state.corruptBackup) record.hash = 'corrompu';
      return response(record);
    }
    if (url.startsWith('https://www.googleapis.com/upload/drive/v3/files/')) {
      assert.equal(options.method, 'patch');
      drive.set(url.split('/').at(-1).split('?')[0], JSON.parse(options.payload)); return response({});
    }
    assert.fail('Hôte ou route non prévu dans les mocks');
  }
  const context = vm.createContext({
    console: { log: text => logs.push(text) }, Date: class extends Date { static now() { return state.now; } },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => properties.get(k) ?? null,
      setProperty: (k, v) => properties.set(k, v), deleteProperty: k => properties.delete(k) }) },
    Session: { getEffectiveUser: () => ({ getEmail: () => state.email }) },
    ScriptApp: { getScriptId: () => 'SYNCHRONISEUR_FICTIF', getOAuthToken: () => 'GOOGLE_FICTIF' },
    LockService: { getScriptLock: () => ({ tryLock: () => !state.held, releaseLock() {} }) },
    UrlFetchApp: { fetch },
    Utilities: {
      DigestAlgorithm: { SHA_1: 'sha1', SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      base64Decode: value => [...Buffer.from(value, 'base64')],
      computeDigest: (alg, value) => [...hex(alg, typeof value === 'string' ? value : Buffer.from(value))],
      newBlob: value => ({ getBytes: () => [...Buffer.from(value)], getDataAsString: () => Buffer.from(value).toString('utf8') })
    }
  });
  vm.runInContext(personalized ? source.replace("scriptId: 'A_PERSONNALISER_HORS_GIT'", `scriptId: '${id}'`)
    .replace("accountEmail: 'A_PERSONNALISER_HORS_GIT'", `accountEmail: '${email}'`) : source, context);
  const call = name => copy(context[name]());
  const approve = () => { assert.notEqual(call('simulerSynchronisation').etat, 'REFUSE');
    assert.equal(call('approuverSimulation').etat, 'APPROUVE_POUR_UN_ESSAI'); };
  return { context, state, properties, calls, logs, drive, call, approve };
}
function test(name, fn) { fn(); count++; console.log('OK ' + name); }
test('Installation livrée inactive et aucun réseau avant personnalisation', () => {
  const x = setup(false); assert.equal(x.call('verifierConfiguration').etat, 'REFUSE'); assert.equal(x.calls.length, 0);
});
test('Configuration et simulation sans PUT ni sauvegarde Drive', () => {
  const x = setup(); assert.equal(x.call('verifierConfiguration').etat, 'CONFIGURATION_VERIFIEE');
  assert.equal(x.call('simulerSynchronisation').changement, true);
  assert(x.calls.every(c => c.method === 'get')); assert.equal(x.drive.size, 0);
});
test('Sauvegarde relue, PUT unique, vérification et non-rejeu', () => {
  const x = setup(); x.approve(); assert.equal(x.call('synchroniserCommitApprouve').etat, 'SYNCHRONISATION_VERIFIEE');
  assert.deepEqual([...x.drive.values()][0].files, old);
  assert.equal(x.call('verifierResultat').etat, 'RESULTAT_CONFORME');
  assert.equal(x.call('synchroniserCommitApprouve').etat, 'REFUSE'); assert.equal(x.state.puts, 1);
  assert(!x.logs.join(' ').includes('SECRET')); assert(!x.logs.join(' ').includes(id));
});
for (const [label, mutate] of [
  ['mauvais compte', x => { x.state.email = 'autre@example.invalid'; }],
  ['identité Google différente', x => { x.state.wrongId = true; }],
  ['titre incorrect', x => { x.state.title = 'Autre'; }],
  ['projet lié à un classeur', x => { x.state.bound = true; }],
  ['SHA de branche', x => { x.properties.set('CANDIDATE_SHA', 'main'); }],
  ['arbre tronqué', x => { x.state.truncated = true; }],
  ['fichier supplémentaire', x => { x.state.treeExtra = { path: 'apps-script/src/Intrus.gs', type: 'blob', mode: '100644' }; }],
  ['lien symbolique', x => { x.state.treeExtra = { path: 'apps-script/src/Code.gs', type: 'blob', mode: '120000' }; }],
  ['blob corrompu', x => { x.state.corruptBlob = true; }],
  ['manifeste invalide', x => { x.state.candidate[1].source = '{'; }],
  ['portée manifeste ajoutée', x => { x.state.candidate[1].source = JSON.stringify({ ...manifest, oauthScopes: ['inattendu'] }); }],
  ['source manquante', x => { x.state.candidate = [x.state.candidate[1]]; }]
]) test('Refus ' + label, () => {
  const x = setup(); mutate(x); assert.equal(x.call('simulerSynchronisation').etat, 'REFUSE'); assert.equal(x.state.puts, 0);
});
for (const [label, mutate] of [
  ['sans approbation', x => x.properties.delete('APPROVAL')],
  ['plan expiré', x => { x.state.now += 30 * 60 * 1000; }],
  ['SHA changé', x => x.properties.set('CANDIDATE_SHA', 'c'.repeat(40))],
  ['contenu candidat changé', x => { x.state.candidate[0].source = 'contenu différent'; }],
  ['REC modifié', x => { x.state.files[0].source = 'changement concurrent'; }],
  ['sauvegarde refusée', x => { x.state.backupFailure = true; }],
  ['sauvegarde corrompue', x => { x.state.corruptBackup = true; }],
  ['sauvegarde partagée', x => { x.state.sharedBackup = true; }],
  ['fichier distant non prévu', x => { x.state.files.push({ name: 'Supplement', type: 'HTML', source: 'contenu' });
    x.approve(); }],
  ['verrou occupé', x => { x.state.held = true; }]
]) test('Aucun PUT ' + label, () => {
  const x = setup(); x.approve(); mutate(x); assert.equal(x.call('synchroniserCommitApprouve').etat, 'REFUSE');
  assert.equal(x.state.puts, 0);
});
test('PUT incertain : consommation approbation, blocage et résolution par relecture', () => {
  const x = setup(); x.approve(); x.state.writeFailure = true;
  assert.equal(x.call('synchroniserCommitApprouve').etat, 'REFUSE'); assert(x.properties.has('IN_FLIGHT'));
  assert.equal(x.call('simulerSynchronisation').etat, 'REFUSE'); assert.equal(x.state.puts, 1);
  assert.equal(x.call('verifierResultat').etat, 'RESULTAT_CONFORME'); assert(!x.properties.has('IN_FLIGHT'));
  assert(!x.logs.join(' ').includes('SECRET'));
});
test('Relecture post-écriture divergente bloque la suite', () => {
  const x = setup(); x.approve(); x.state.wrongReadback = true;
  assert.equal(x.call('synchroniserCommitApprouve').etat, 'REFUSE');
  assert.equal(x.call('verifierResultat').etat, 'REFUSE'); assert(x.properties.has('IN_FLIGHT'));
});
test('Restauration approuvée : sauvegarde préalable de l’état remplacé', () => {
  const x = setup(); x.approve(); x.call('synchroniserCommitApprouve');
  x.properties.set('RESTORE_BACKUP_KEY', '1');
  assert.equal(x.call('simulerRestauration').etat, 'RESTAURATION_SIMULEE');
  assert.equal(x.call('restaurerSauvegardeApprouvee').etat, 'REFUSE');
  x.call('approuverSimulation');
  assert.equal(x.call('restaurerSauvegardeApprouvee').etat, 'RESTAURATION_VERIFIEE');
  assert.deepEqual(x.state.files, old); assert.equal(x.drive.size, 2); assert.equal(x.state.puts, 2);
});
test('Sauvegarde altérée refusée et absence de permission Sheets', () => {
  const x = setup(); x.call('sauvegarderSources'); x.state.corruptBackup = true;
  assert.equal(x.call('simulerRestauration').etat, 'REFUSE');
  assert(!syncManifest.oauthScopes.some(s => /spreadsheets|drive$/.test(s)));
  assert(!source.includes('SpreadsheetApp')); assert(!source.includes('newTrigger'));
});
test('Routes alternatives refusées, aucune requête', () => {
  const x = setup(); assert.throws(() => x.context.recGoogle_('put', '/v1/projects/AUTRE/content', {}));
  assert.equal(x.calls.length, 0);
});
test('Aucun changement : pas de PUT ni sauvegarde inutile', () => {
  const x = setup(); x.state.files = copy(x.state.candidate); x.approve();
  assert.equal(x.call('synchroniserCommitApprouve').etat, 'AUCUN_CHANGEMENT'); assert.equal(x.state.puts, 0);
});
test('Changement après sauvegarde détecté avant PUT', () => {
  const x = setup(); x.approve();
  const original = x.context.recBackup_;
  x.context.recBackup_ = files => { original(files); x.state.files[0].source = 'édition concurrente'; };
  assert.equal(x.call('synchroniserCommitApprouve').etat, 'REFUSE');
  assert.equal(x.state.puts, 0); assert.equal(x.drive.size, 1);
});
test('Index plein : aucun PUT et aucune purge des sauvegardes', () => {
  const x = setup(); x.approve(); x.properties.set('BACKUPS', JSON.stringify(Array.from({ length: 20 }, (_, i) => ({ key: String(i + 1) }))));
  assert.equal(x.call('synchroniserCommitApprouve').etat, 'REFUSE');
  assert.equal(x.state.puts, 0); assert.equal(x.drive.size, 0);
});
test('Nouvelle simulation invalide l’approbation ; plan altéré refusé', () => {
  const x = setup(); x.approve(); x.call('simulerSynchronisation');
  assert.equal(x.call('synchroniserCommitApprouve').etat, 'REFUSE');
  x.call('approuverSimulation');
  const plan = JSON.parse(x.properties.get('PLAN')); plan.after = 'empreinte altérée';
  x.properties.set('PLAN', JSON.stringify(plan));
  assert.equal(x.call('synchroniserCommitApprouve').etat, 'REFUSE'); assert.equal(x.state.puts, 0);
});
test('Restauration : sélection et contenu modifiés après approbation refusés', () => {
  const x = setup(); x.call('sauvegarderSources'); x.call('sauvegarderSources');
  x.properties.set('RESTORE_BACKUP_KEY', '1'); x.call('simulerRestauration'); x.call('approuverSimulation');
  x.properties.set('RESTORE_BACKUP_KEY', '2');
  assert.equal(x.call('restaurerSauvegardeApprouvee').etat, 'REFUSE');
  x.properties.set('RESTORE_BACKUP_KEY', '1'); x.state.corruptBackup = true;
  assert.equal(x.call('restaurerSauvegardeApprouvee').etat, 'REFUSE'); assert.equal(x.state.puts, 0);
});
test('Changement de compte avant écriture et logs sans informations privées', () => {
  const x = setup(); x.approve(); x.state.email = 'autre@example.invalid';
  assert.equal(x.call('synchroniserCommitApprouve').etat, 'REFUSE');
  const text = x.logs.join('\n');
  for (const privateValue of [id, email, 'GOOGLE_FICTIF', 'SECRET_FICTIF_NE_PAS_JOURNALISER', old[0].source]) {
    assert(!text.includes(privateValue));
  }
  assert.equal(x.state.puts, 0);
});
console.log(`${count} scénarios hors réseau réussis.`);
