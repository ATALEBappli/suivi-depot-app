// Contexte vm sans fetch/process/require/import : aucun transport réel.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
const source = readFileSync(new URL('../apps-script/rec-maintenance/Maintenance.gs', import.meta.url), 'utf8');
const parserSource = readFileSync(new URL('../apps-script/rec-maintenance/Acorn.gs', import.meta.url), 'utf8');
const syncSource = readFileSync(new URL('../apps-script/rec-synchronisation/Synchroniseur.gs', import.meta.url), 'utf8');
const historical = readFileSync(new URL('../fixtures/rec/mission-7-synchroniseur.gs', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../apps-script/rec-synchronisation/appsscript.json', import.meta.url)));
const ownManifest = JSON.parse(readFileSync(new URL('../apps-script/rec-maintenance/appsscript.json', import.meta.url)));
const id = 'FICTIF_SYNC_UNIQUE_12345678901234567890';
const backendId = 'FICTIF_BACKEND_UNIQUE_123456789012345';
const maintenanceId = 'FICTIF_MAINTENANCE_1234567890123456789';
const email = 'compte-fictif@example.invalid';
const sha = 'a'.repeat(40), treeSha = 'b'.repeat(40);
const copy = value => JSON.parse(JSON.stringify(value));
const personalize = text => text.replace("scriptId: 'A_PERSONNALISER_HORS_GIT'", `scriptId: '${backendId}'`)
  .replace("accountEmail: 'A_PERSONNALISER_HORS_GIT'", `accountEmail: '${email}'`);
const makeFiles = text => [{ name: 'Synchroniseur', type: 'SERVER_JS', source: text },
  { name: 'appsscript', type: 'JSON', source: JSON.stringify(manifest) }];
const old = makeFiles(personalize(historical));
const violations = [];
let count = 0;
function setup(personalized = true, initialized = true, withParser = true) {
  const properties = new Map([['GITHUB_READ_TOKEN', 'SECRET_FICTIF_NE_PAS_JOURNALISER'], ['CANDIDATE_SHA', sha]]);
  const calls = [], logs = [], drive = new Map(), propertyWrites = [];
  const state = { files: copy(old), title: 'REC-Synchronisation', email, candidate: makeFiles(syncSource),
    treeExtra: null, truncated: false, backupFailure: false, corruptBackup: false,
    corruptBlob: false, writeFailure: false, wrongReadback: false, held: false, now: 1000000, puts: 0 };
  const blobMap = new Map();
  const hex = (alg, value) => createHash(alg).update(value).digest();
  const response = (value, code = 200) => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(value) });
  function mockFetch(url, options) {
    calls.push({ url, method: options.method });
    if (state.diagnosticOnly) {
      assert.equal(options.method, 'get'); assert.equal(options.payload, undefined);
      assert(!url.includes(backendId)); assert(!url.includes(email));
      assert(url.startsWith('https://script.googleapis.com/v1/projects/' + id) ||
        ['03d9f37a52e8a635cf237352e8ae3930d7ce7e0a', '13c4498003e0c2dca38b9ec671d93c303be430a4'].some(
          blob => url === 'https://api.github.com/repos/ATALEBappli/suivi-depot-app/git/blobs/' + blob));
    }
    assert.equal(options.followRedirects, false);
    if (url.startsWith('https://api.github.com/repos/ATALEBappli/suivi-depot-app/git/')) {
      assert.equal(options.method, 'get');
      assert.equal(options.headers.Authorization, 'Bearer SECRET_FICTIF_NE_PAS_JOURNALISER');
      if (state.githubFailure) return response({}, 403);
      if (url.includes('/commits/')) return response({ sha, tree: { sha: treeSha } });
      if (url.includes('/trees/')) {
        assert(url.endsWith('?recursive=1'));
        blobMap.clear();
        const tree = state.candidate.map(f => {
          const buffer = Buffer.from(f.source);
          const digest = hex('sha1', Buffer.concat([Buffer.from(`blob ${buffer.length}\0`), buffer])).toString('hex');
          blobMap.set(digest, { sha: digest, size: buffer.length, encoding: 'base64', content: buffer.toString('base64') });
          return { path: `apps-script/rec-synchronisation/${f.name === 'Synchroniseur' ? 'Synchroniseur.gs' : f.name + '.json'}`,
            sha: digest, type: 'blob', mode: '100644' };
        });
        tree.push({ path: 'apps-script/rec-synchronisation/README.md', type: 'blob', mode: '100644' });
        if (state.treeExtra) tree.push(state.treeExtra);
        return response({ sha: treeSha, truncated: state.truncated, tree });
      }
      const requested = url.split('/').at(-1);
      const reference = { '03d9f37a52e8a635cf237352e8ae3930d7ce7e0a': historical,
        '13c4498003e0c2dca38b9ec671d93c303be430a4': syncSource }[requested];
      const blob = reference && state.diagnosticOnly ? { sha: requested, encoding: 'base64',
        size: Buffer.byteLength(reference), content: Buffer.from(reference).toString('base64') } : copy(blobMap.get(requested));
      if (state.badSize) blob.size++;
      if (state.badEncoding) blob.encoding = 'utf8';
      if (state.redirect) return response({}, 302);
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
        assert(drive.size > 0);
        assert.equal(state.backupReads > 0, true); // Une sauvegarde doit précéder l'écriture.
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
        permissions: [{ type: state.sharedBackup ? 'anyone' : 'user', role: 'owner', emailAddress: state.backupOwner || email }] });
      state.backupReads = (state.backupReads || 0) + 1;
      const record = copy(drive.get(url.split('/').at(-1).split('?')[0]));
      if (state.corruptBackup) record.hash = 'corrompu';
      return response(record);
    }
    if (url.startsWith('https://www.googleapis.com/upload/drive/v3/files/')) {
      assert.equal(options.method, 'patch');
      if (state.shareAfterUpload) state.sharedBackup = true;
      drive.set(url.split('/').at(-1).split('?')[0], JSON.parse(options.payload)); return response({});
    }
    assert.fail('Hôte ou route non prévu dans les mocks');
  }
  const context = vm.createContext({
    console: { log: text => logs.push(text) }, Date: class extends Date { static now() { return state.now; } },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => properties.get(k) ?? null,
      setProperty: (k, v) => { propertyWrites.push(k); return properties.set(k, v); },
      deleteProperty: k => { propertyWrites.push(k); return properties.delete(k); } }) },
    Session: { getEffectiveUser: () => ({ getEmail: () => state.email }) },
    ScriptApp: { getScriptId: () => state.selfId || maintenanceId, getOAuthToken: () => 'GOOGLE_FICTIF' },
    LockService: { getScriptLock: () => ({ tryLock: () => !state.held, releaseLock() {} }) },
    UrlFetchApp: { fetch(url, options) {
      try { return mockFetch(url, options); } catch (e) {
        if (e.code === 'ERR_ASSERTION') violations.push(e);
        throw e;
      }
    } },
    Utilities: {
      DigestAlgorithm: { SHA_1: 'sha1', SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      base64Decode: value => [...Buffer.from(value, 'base64')],
      computeDigest: (alg, value) => [...hex(alg, typeof value === 'string' ? value : Buffer.from(value))],
      newBlob: value => ({ getBytes: () => [...Buffer.from(value)], getDataAsString: () => Buffer.from(value).toString('utf8') })
    }
  }, { codeGeneration: { strings: false, wasm: false } });
  if (withParser) vm.runInContext(parserSource, context);
  vm.runInContext(personalized ? source.replace("scriptId: 'A_PERSONNALISER_HORS_GIT'", `scriptId: '${id}'`)
    : source, context);
  const call = name => copy(context[name]());
  const approve = () => { assert.notEqual(call('simulerSynchronisation').etat, 'REFUSE');
    assert.equal(call('approuverSimulation').etat, 'APPROUVE_POUR_UN_ESSAI'); };
  if (personalized && initialized) {
    assert.equal(call('initialiserMaintenance').etat, 'LIAISON_EXISTANTE_VERROUILLEE');
    calls.length = 0;
  }
  return { context, state, properties, calls, logs, drive, call, approve, propertyWrites };
}
function test(name, fn) { fn(); assert.deepEqual(violations, []); count++; console.log('OK ' + name); }
const refused = (x, operation = 'simulerSynchronisation') => {
  assert.equal(x.call(operation).etat, 'REFUSE'); assert.equal(x.state.puts, 0);
};
test('Marqueur livré bloquant, aucune requête', () => {
  const x = setup(false); refused(x, 'initialiserMaintenance'); refused(x, 'verifierConfiguration');
  assert.equal(x.calls.length, 0);
});
test('Portées exactes, aucun webapp ni déclencheur', () => {
  assert.deepEqual(ownManifest, manifest);
  assert.deepEqual(ownManifest.oauthScopes, ['https://www.googleapis.com/auth/script.projects',
    'https://www.googleapis.com/auth/script.external_request', 'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/userinfo.email']);
  assert(!('webapp' in ownManifest));
  assert(!/function (?:doGet|doPost)\b|newTrigger\(|SpreadsheetApp/.test(source));
});
test('Initialisation explicite Mission 7, uniquement GET, paramètres privés détectés', () => {
  const x = setup(true, false); refused(x); assert.equal(x.calls.length, 0);
  assert.equal(x.call('initialiserMaintenance').etat, 'LIAISON_EXISTANTE_VERROUILLEE');
  assert.deepEqual(JSON.parse(x.properties.get('ENROLLMENT')), { target: id, maintenance: maintenanceId,
    binding: { scriptId: backendId, accountEmail: email }, codeName: 'Synchroniseur' });
  assert(x.calls.every(c => c.method === 'get')); assert.equal(x.drive.size, 0);
  const before = x.properties.get('ENROLLMENT'); refused(x, 'initialiserMaintenance');
  assert.equal(x.properties.get('ENROLLMENT'), before);
});
test('Initialisation explicite Mission 9 reconnue également', () => {
  const x = setup(true, false); x.state.files = makeFiles(personalize(syncSource));
  assert.equal(x.call('initialiserMaintenance').etat, 'LIAISON_EXISTANTE_VERROUILLEE');
});
for (const [label, mutate] of [
  ['autre compte', x => { x.state.email = 'autre@example.invalid'; }],
  ['compte vide', x => { x.state.email = ''; }],
  ['mauvais titre', x => { x.state.title = 'SuiviDepotAPI-REC'; }],
  ['identifiant différent', x => { x.state.wrongId = true; }],
  ['projet lié', x => { x.state.bound = true; }],
  ['source initiale inconnue', x => { x.state.files[0].source += '\n// différence'; }],
  ['identifiant backend non personnalisé', x => { x.state.files[0].source = historical.replace("accountEmail: 'A_PERSONNALISER_HORS_GIT'", `accountEmail: '${email}'`); }],
  ['configuration absente', x => { x.state.files[0].source = historical; }],
  ['cible backend égale au synchroniseur', x => { x.state.files[0].source = personalize(historical).replace(backendId, id); }],
  ['cible backend égale à Maintenance', x => { x.state.files[0].source = personalize(historical).replace(backendId, maintenanceId); }],
  ['fichier distant en plus', x => { x.state.files.push({ name: 'Intrus', type: 'HTML', source: 'x' }); }]
]) test('Initialisation refusée : ' + label, () => {
  const x = setup(true, false); mutate(x); refused(x, 'initialiserMaintenance');
  assert(!x.properties.has('ENROLLMENT')); assert.equal(x.drive.size, 0);
});
test('Simulation sans sauvegarde/PUT ; candidat privé exact sans modifier le dépôt', () => {
  const x = setup(); assert.equal(x.call('verifierConfiguration').etat, 'CONFIGURATION_VERIFIEE');
  assert.equal(x.call('simulerSynchronisation').changement, true);
  assert(x.calls.every(c => c.method === 'get')); assert.equal(x.drive.size, 0);
  assert(x.state.candidate[0].source.includes("scriptId: 'A_PERSONNALISER_HORS_GIT'"));
  const expected = makeFiles(personalize(syncSource));
  assert.equal(JSON.parse(x.properties.get('PLAN')).after, x.context.maintHash_(expected));
});
test('Cycle complet Mission 7 vers Mission 9 : sauvegarde relue, identité préservée, non-rejeu', () => {
  const x = setup(); x.approve();
  assert.equal(x.call('synchroniserCommitApprouve').etat, 'SYNCHRONISATION_VERIFIEE');
  assert.deepEqual(x.state.files, makeFiles(personalize(syncSource)));
  assert.deepEqual([...x.drive.values()][0].files, old);
  assert.equal(x.call('verifierResultat').etat, 'RESULTAT_CONFORME');
  assert.equal(x.call('synchroniserCommitApprouve').etat, 'REFUSE'); assert.equal(x.state.puts, 1);
  assert(!x.properties.has('APPROVAL')); assert(!x.properties.has('PLAN'));
});
for (const [label, mutate] of [
  ['branche', x => x.properties.set('CANDIDATE_SHA', 'main')],
  ['SHA court', x => x.properties.set('CANDIDATE_SHA', 'a'.repeat(39))],
  ['SHA majuscules', x => x.properties.set('CANDIDATE_SHA', 'A'.repeat(40))],
  ['arbre tronqué', x => { x.state.truncated = true; }],
  ['GitHub refusé', x => { x.state.githubFailure = true; }],
  ['taille blob incorrecte', x => { x.state.badSize = true; }],
  ['encodage incorrect', x => { x.state.badEncoding = true; }],
  ['JSON invalide', x => { x.state.candidate[1].source = '{'; }],
  ['blob altéré', x => { x.state.corruptBlob = true; }],
  ['redirection HTTP', x => { x.state.redirect = true; }],
  ['fichier manquant', x => { x.state.candidate.pop(); }],
  ['fichier supplémentaire', x => { x.state.treeExtra = { path: 'apps-script/rec-synchronisation/Intrus.gs', type: 'blob', mode: '100644' }; }],
  ['sous-répertoire', x => { x.state.treeExtra = { path: 'apps-script/rec-synchronisation/sub/Intrus.gs', type: 'blob', mode: '100644' }; }],
  ['symlink', x => { x.state.treeExtra = { path: 'apps-script/rec-synchronisation/Synchroniseur.gs', type: 'blob', mode: '120000' }; }],
  ['doublon', x => { x.state.treeExtra = { path: 'apps-script/rec-synchronisation/Synchroniseur.gs', type: 'blob', mode: '100644' }; }],
  ['configuration personnalisée distante', x => { x.state.candidate[0].source = personalize(syncSource); }],
  ['destination inscrite dans Git', x => { x.state.candidate[0].source = syncSource.replace("scriptId: 'A_PERSONNALISER_HORS_GIT'", "scriptId: 'PROD_FICTIF_12345678901234567890'"); }],
  ['compte inscrit dans Git', x => { x.state.candidate[0].source = syncSource.replace("accountEmail: 'A_PERSONNALISER_HORS_GIT'", "accountEmail: 'autre@example.invalid'"); }],
  ['configuration dupliquée', x => { x.state.candidate[0].source += '\nconst REC_DESTINATION = {};'; }],
  ['code trop volumineux', x => { x.state.candidate[0].source += ' '.repeat(500001); }]
]) test('Simulation refusée : ' + label, () => { const x = setup(); mutate(x); refused(x); assert.equal(x.drive.size, 0); });
for (const [label, mutate] of [
  ['portée ajoutée', m => m.oauthScopes.push('https://www.googleapis.com/auth/spreadsheets')],
  ['portée supprimée', m => m.oauthScopes.pop()],
  ['webapp', m => { m.webapp = { access: 'MYSELF', executeAs: 'USER_DEPLOYING' }; }],
  ['bibliothèque', m => { m.dependencies = { libraries: [{ libraryId: 'FICTIF' }] }; }],
  ['fuseau', m => { m.timeZone = 'UTC'; }],
  ['clé supplémentaire', m => { m.extra = true; }]
]) test('Manifeste fermé GitHub/distant/restauration : ' + label, () => {
  const x = setup(), bad = copy(manifest); mutate(bad);
  x.state.candidate[1].source = JSON.stringify(bad); refused(x);
  x.state.files[1].source = JSON.stringify(bad); refused(x, 'sauvegarderSources');
  assert.equal(x.drive.size, 0);
  const y = setup(); y.call('sauvegarderSources');
  const backup = [...y.drive.values()][0]; backup.files[1].source = JSON.stringify(bad); rehash(y, backup);
  refused(y, 'simulerRestauration');
});
for (const literal of ["REC_REPO = 'ATALEBappli/suivi-depot-app'", "REC_TITLE = 'SuiviDepotAPI-REC'",
  "REC_PREFIX = 'apps-script/src/'", 'function recConfig_()', 'function recMetadata_()', 'function recGoogle_(method, path, body)']) {
  test('Enveloppe de sécurité protégée : ' + literal.split(' ')[0], () => {
    const x = setup(); x.state.candidate[0].source = syncSource.replace(literal, literal + ' ');
    refused(x);
  });
}
for (const [label, mutate] of [
  ['sans approbation', x => x.properties.delete('APPROVAL')],
  ['expiration', x => { x.state.now += 30 * 60 * 1000; }],
  ['horloge reculée', x => { x.state.now--; }],
  ['SHA modifié', x => x.properties.set('CANDIDATE_SHA', 'c'.repeat(40))],
  ['candidat modifié', x => { x.state.candidate[0].source += '\n// nouveau'; }],
  ['source distante modifiée', x => { x.state.files[0].source += '\n// édition'; }],
  ['destination distante modifiée', x => { x.state.files[0].source = x.state.files[0].source.replace(backendId, 'PROD_FICTIF_12345678901234567890'); }],
  ['identité distante modifiée', x => { x.state.files[0].source = x.state.files[0].source.replace(email, 'autre@example.invalid'); }],
  ['compte changé', x => { x.state.email = 'autre@example.invalid'; }],
  ['identité du projet changée', x => { x.state.wrongId = true; }],
  ['Drive refusé', x => { x.state.backupFailure = true; }],
  ['sauvegarde corrompue', x => { x.state.corruptBackup = true; }],
  ['mauvais propriétaire sauvegarde', x => { x.state.backupOwner = 'autre@example.invalid'; }],
  ['sauvegarde partagée après upload', x => { x.state.shareAfterUpload = true; }],
  ['sauvegarde partagée', x => { x.state.sharedBackup = true; }],
  ['verrou occupé', x => { x.state.held = true; }],
  ['enregistrement modifié', x => { const e = JSON.parse(x.properties.get('ENROLLMENT')); e.binding.scriptId = 'AUTRE_FICTIF_12345678901234567890'; x.properties.set('ENROLLMENT', JSON.stringify(e)); }],
  ['plan vers backend direct', x => { const p = JSON.parse(x.properties.get('PLAN')); p.target = backendId; x.properties.set('PLAN', JSON.stringify(p)); x.properties.set('APPROVAL', x.context.maintHash_(p)); }]
]) test('Aucun PUT après approbation : ' + label, () => {
  const x = setup(); x.approve(); mutate(x); refused(x, 'synchroniserCommitApprouve');
});
function rehash(x, backup) {
  backup.hash = x.context.maintHash_(backup.files);
  const index = JSON.parse(x.properties.get('BACKUPS')); index[0].hash = x.context.maintHash_(backup);
  x.properties.set('BACKUPS', JSON.stringify(index));
}
test('Restauration : approbation propre, sauvegarde de l’état remplacé, identité conservée', () => {
  const x = setup(); x.approve(); x.call('synchroniserCommitApprouve');
  x.properties.set('RESTORE_BACKUP_KEY', '1');
  assert.equal(x.call('simulerRestauration').etat, 'RESTAURATION_SIMULEE');
  assert.equal(x.call('restaurerSauvegardeApprouvee').etat, 'REFUSE');
  assert.equal(x.call('approuverSimulation').etat, 'APPROUVE_POUR_UN_ESSAI');
  assert.equal(x.call('restaurerSauvegardeApprouvee').etat, 'RESTAURATION_VERIFIEE');
  assert.deepEqual(x.state.files, old); assert.equal(x.state.puts, 2); assert.equal(x.drive.size, 2);
  assert.deepEqual([...x.drive.values()][1].files, makeFiles(personalize(syncSource)));
  assert.equal(x.call('restaurerSauvegardeApprouvee').etat, 'REFUSE');
});
for (const [label, mutate] of [
  ['destination', b => { b.target = backendId; }],
  ['liaison backend', b => { b.files[0].source = b.files[0].source.replace(backendId, 'PROD_FICTIF_12345678901234567890'); }],
  ['identité', b => { b.files[0].source = b.files[0].source.replace(email, 'autre@example.invalid'); }],
  ['fichier', b => { b.files.push({name:'Intrus',type:'SERVER_JS',source:'x'}); }]
]) test('Sauvegarde intègre mais interdite : '+label, () => {
  const x = setup(); x.call('sauvegarderSources'); const backup = [...x.drive.values()][0];
  mutate(backup); rehash(x, backup); refused(x, 'simulerRestauration');
});
test('Restauration : sauvegarde devenue partagée refusée', () => {
  const x = setup(); x.call('sauvegarderSources'); x.state.sharedBackup = true; refused(x, 'simulerRestauration');
});
test('Restauration : changement de sélection après approbation refusé', () => {
  const x = setup(); x.call('sauvegarderSources'); x.call('sauvegarderSources');
  x.properties.set('RESTORE_BACKUP_KEY', '1'); x.call('simulerRestauration'); x.call('approuverSimulation');
  x.properties.set('RESTORE_BACKUP_KEY', '2'); refused(x, 'restaurerSauvegardeApprouvee');
});
test('PUT incertain : pas de rejeu, résolution par relecture', () => {
  const x = setup(); x.approve(); x.state.writeFailure = true;
  assert.equal(x.call('synchroniserCommitApprouve').etat, 'REFUSE'); assert.equal(x.state.puts, 1);
  assert(x.properties.has('IN_FLIGHT')); assert(!x.properties.has('APPROVAL'));
  assert.equal(x.call('simulerSynchronisation').etat, 'REFUSE');
  assert.equal(x.call('synchroniserCommitApprouve').etat, 'REFUSE'); assert.equal(x.state.puts, 1);
  assert.equal(x.call('verifierResultat').etat, 'RESULTAT_CONFORME'); assert(!x.properties.has('IN_FLIGHT'));
});
test('Relecture divergente puis restauration explicite du résultat incertain', () => {
  const x = setup(); x.approve(); x.state.wrongReadback = true;
  assert.equal(x.call('synchroniserCommitApprouve').etat, 'REFUSE');
  assert.equal(x.call('verifierResultat').etat, 'REFUSE'); assert(x.properties.has('IN_FLIGHT'));
  x.state.wrongReadback = false; x.state.files[0].source += '\n// divergence réelle';
  assert.equal(x.call('simulerRestauration').etat, 'RESTAURATION_SIMULEE'); x.call('approuverSimulation');
  assert.equal(x.call('restaurerSauvegardeApprouvee').etat, 'RESTAURATION_VERIFIEE');
  assert.deepEqual(x.state.files, old); assert(!x.properties.has('IN_FLIGHT'));
});
test('Édition concurrente pendant sauvegarde détectée avant PUT', () => {
  const x = setup(); x.approve(); const backup = x.context.maintBackup_;
  x.context.maintBackup_ = files => { backup(files); x.state.files[0].source += '\n// concurrent'; };
  refused(x, 'synchroniserCommitApprouve'); assert.equal(x.drive.size, 1);
});
test('Index plein : arrêt, aucune purge', () => {
  const x = setup(); x.approve(); x.properties.set('BACKUPS', JSON.stringify(Array.from({length:20}, (_,i)=>({key:String(i+1)}))));
  refused(x, 'synchroniserCommitApprouve'); assert.equal(x.drive.size, 0);
});
test('Aucun changement : aucune sauvegarde/PUT, approbation consommée', () => {
  const x = setup(); x.state.files = makeFiles(personalize(syncSource)); x.approve();
  assert.equal(x.call('synchroniserCommitApprouve').etat, 'AUCUN_CHANGEMENT');
  assert.equal(x.state.puts, 0); assert.equal(x.drive.size, 0); assert(!x.properties.has('APPROVAL'));
});
test('Nouvelle simulation échouée invalide le plan précédent', () => {
  const x = setup(); x.approve(); x.state.candidate.pop(); refused(x);
  assert(!x.properties.has('APPROVAL')); assert(!x.properties.has('PLAN'));
});
test('JSON ordre/indentation libres ; sources candidates jamais exécutées', () => {
  const x = setup(); x.state.candidate[1].source = JSON.stringify(Object.fromEntries(Object.entries(manifest).reverse()), null, 2);
  x.state.candidate[0].source += '\nthrow new Error("NE_PAS_EXECUTER");';
  x.approve(); assert.equal(x.call('synchroniserCommitApprouve').etat, 'SYNCHRONISATION_VERIFIEE');
});
test('Routes backend/PROD/soi/déploiement interdites et propriétés sans redirection', () => {
  const x = setup();
  for (const target of [backendId, maintenanceId, 'PROD_FICTIF_12345678901234567890']) {
    assert.throws(() => x.context.maintGoogle_('put', '/v1/projects/'+target+'/content', {}));
  }
  assert.throws(() => x.context.maintGoogle_('post', '/v1/projects/'+id+'/deployments', {}));
  assert.equal(x.calls.length, 0);
  for (const key of ['SCRIPT_ID','REC_SCRIPT_ID','DESTINATION','APP_ENV','SPREADSHEET_ID','REC_SPREADSHEET_ID']) x.properties.set(key, 'PROD_FICTIF');
  x.approve(); assert.equal(x.call('synchroniserCommitApprouve').etat, 'SYNCHRONISATION_VERIFIEE');
  assert(!JSON.stringify(x.calls).includes('PROD_FICTIF'));
});
test('Logs et retours sans valeurs privées, sources ou jetons', () => {
  const x = setup(); x.approve(); x.state.writeFailure = true;
  const out = x.call('synchroniserCommitApprouve');
  const text = JSON.stringify([x.logs,out]);
  for (const privateValue of [id,backendId,email,maintenanceId,'GOOGLE_FICTIF','SECRET_FICTIF_NE_PAS_JOURNALISER', historical.slice(0,80)]) assert(!text.includes(privateValue));
});
test('Auto-ciblage initial refusé sans requête', () => {
  const x = setup(true, false); x.state.selfId = id;
  refused(x, 'initialiserMaintenance'); assert.equal(x.calls.length, 0);
});
test('Expiration pendant sauvegarde : aucun PUT', () => {
  const x = setup(); x.approve(); const backup = x.context.maintBackup_;
  x.context.maintBackup_ = files => { backup(files); x.state.now += 30 * 60 * 1000; };
  refused(x, 'synchroniserCommitApprouve'); assert.equal(x.drive.size, 1);
});
test('Approbation supprimée pendant sauvegarde : aucun PUT', () => {
  const x = setup(); x.approve(); const backup = x.context.maintBackup_;
  x.context.maintBackup_ = files => { backup(files); x.properties.delete('APPROVAL'); };
  refused(x, 'synchroniserCommitApprouve');
});
test('Plan altéré sans empreinte d’approbation correspondante refusé', () => {
  const x = setup(); x.approve(); const p = JSON.parse(x.properties.get('PLAN')); p.after = 'altéré';
  x.properties.set('PLAN', JSON.stringify(p)); refused(x, 'synchroniserCommitApprouve');
});
test('Préservation des propriétés du synchroniseur : seuls fichiers transmis', () => {
  const x = setup(); x.properties.set('GITHUB_READ_TOKEN', 'SECRET_FICTIF_NE_PAS_JOURNALISER');
  const api = x.context.maintGoogle_;
  x.context.maintGoogle_ = (method, path, body) => {
    if (method === 'put') { assert.deepEqual(Object.keys(body), ['files']);
      assert(!JSON.stringify(body).includes('SECRET_FICTIF_NE_PAS_JOURNALISER')); }
    return api(method, path, body);
  };
  x.approve(); assert.equal(x.call('synchroniserCommitApprouve').etat, 'SYNCHRONISATION_VERIFIEE');
});
test('Restauration avec réponse PUT perdue : approbation consommée, vérification seule', () => {
  const x = setup(); x.approve(); x.call('synchroniserCommitApprouve');
  x.properties.set('RESTORE_BACKUP_KEY', '1'); x.call('simulerRestauration'); x.call('approuverSimulation');
  x.state.writeFailure = true;
  assert.equal(x.call('restaurerSauvegardeApprouvee').etat, 'REFUSE');
  assert.equal(x.state.puts, 2); assert(!x.properties.has('APPROVAL')); assert(x.properties.has('IN_FLIGHT'));
  assert.equal(x.call('restaurerSauvegardeApprouvee').etat, 'REFUSE'); assert.equal(x.state.puts, 2);
  assert.equal(x.call('verifierResultat').etat, 'RESULTAT_CONFORME'); assert.deepEqual(x.state.files, old);
});
test('Sauvegarde altérée sans nouvelle empreinte refusée', () => {
  const x = setup(); x.call('sauvegarderSources'); [...x.drive.values()][0].files[0].source += '\n// altéré';
  refused(x, 'simulerRestauration');
});
test('Approvals SYNC et RESTORE non interchangeables', () => {
  const x = setup(); x.call('sauvegarderSources'); x.approve();
  refused(x, 'restaurerSauvegardeApprouvee');
  x.call('simulerRestauration'); x.call('approuverSimulation'); refused(x, 'synchroniserCommitApprouve');
});
test('Sans PAT : aucune requête après initialisation', () => {
  const x = setup(); x.properties.delete('GITHUB_READ_TOKEN'); refused(x); assert.equal(x.calls.length, 0);
});
for (const version of [historical, syncSource]) test('Code.gs historique : cycle complet, sauvegarde et restauration exactes', () => {
  const x = setup(true, false), original = makeFiles(personalize(version)); original[0].name = 'Code';
  if (version === syncSource) x.state.candidate[0].source += '\n// Candidat public approuvé fictif';
  x.state.files = copy(original);
  assert.equal(x.call('diagnostiquerInstallation').etat, 'SOURCE_INITIALE_RECONNUE');
  assert(!x.properties.has('ENROLLMENT'));
  assert.equal(x.call('initialiserMaintenance').etat, 'LIAISON_EXISTANTE_VERROUILLEE');
  assert.equal(JSON.parse(x.properties.get('ENROLLMENT')).codeName, 'Code');
  x.approve(); assert.equal(x.call('synchroniserCommitApprouve').etat, 'SYNCHRONISATION_VERIFIEE');
  const expected = makeFiles(personalize(x.state.candidate[0].source)); expected[0].name = 'Code';
  assert.deepEqual(x.state.files, expected);
  assert.deepEqual([...x.drive.values()][0].files, original);
  x.properties.set('RESTORE_BACKUP_KEY', '1');
  assert.equal(x.call('simulerRestauration').etat, 'RESTAURATION_SIMULEE');
  x.call('approuverSimulation');
  assert.equal(x.call('restaurerSauvegardeApprouvee').etat, 'RESTAURATION_VERIFIEE');
  assert.deepEqual(x.state.files, original);
});
for (const extra of ['\nfunction diagnosticDrive() { return "DIAGNOSTIC_PRIVE_FICTIF"; }',
  '\nfunction recGoogle_() {}', '\nthrow new Error("NE_PAS_EXECUTER");']) {
  test('Code.gs avec ajouts manuels : diagnostic seul, aucune acceptation permissive', () => {
    const x = setup(true, false); x.state.files[0].name = 'Code'; x.state.files[0].source += extra;
    const before = copy([...x.properties]);
    const result = x.call('diagnostiquerInstallation');
    assert(['REVUE_PRIVEE_REQUISE', 'REFUSE'].includes(result.etat));
    assert.deepEqual([...x.properties], before);
    refused(x, 'initialiserMaintenance'); assert(!x.properties.has('ENROLLMENT'));
    assert(x.calls.every(c => c.method === 'get')); assert.equal(x.drive.size, 0);
    const output = JSON.stringify([x.logs, result]);
    for (const privateValue of [id, backendId, email, maintenanceId, 'DIAGNOSTIC_PRIVE_FICTIF', extra]) assert(!output.includes(privateValue));
  });
}
for (const mutate of [
  x => { x.state.files.push({ ...x.state.files[0], name: 'Code' }); },
  x => { x.state.files[0].name = 'Autre'; },
  x => { x.state.files[0].name = 'Code.gs'; },
  x => { x.state.files[0].name = 'Code'; x.state.files[1].source = '{}'; },
  x => { x.state.files[0].name = 'Code'; x.state.email = 'autre@example.invalid'; },
  x => { x.state.files[0].name = 'Code'; x.state.bound = true; }
]) test('Installation historique ambiguë ou identité/manifeste incorrect : refus fermé', () => {
  const x = setup(true, false); mutate(x);
  refused(x, 'diagnostiquerInstallation'); refused(x, 'initialiserMaintenance');
  assert(!x.properties.has('ENROLLMENT')); assert.equal(x.drive.size, 0);
});
test('Nom enrôlé verrouillé après initialisation historique', () => {
  const x = setup(true, false); x.state.files[0].name = 'Code'; x.call('initialiserMaintenance');
  x.approve(); x.state.files[0].name = 'Synchroniseur'; refused(x, 'synchroniserCommitApprouve');
  assert.equal(x.drive.size, 0);
});
test('Diagnostic inconnu : résumé précis et propriétés existantes inchangées', () => {
  const x = setup(); x.approve(); x.state.files[0].source += '\nfunction diagnosticDrive() {}';
  const before = copy([...x.properties]); x.calls.length = 0;
  assert.deepEqual(x.call('diagnostiquerInstallation'), { etat: 'REVUE_PRIVEE_REQUISE',
    nomHistoriqueCode: false, sourceCompleteConnue: false });
  assert.deepEqual([...x.properties], before); assert.equal(x.calls.length, 2);
  assert(x.calls.every(c => c.method === 'get')); assert.equal(x.drive.size, 0);
});
test('Ancien enrôlement sans codeName : compatibilité limitée à Synchroniseur', () => {
  const x = setup(), e = JSON.parse(x.properties.get('ENROLLMENT')); delete e.codeName;
  x.properties.set('ENROLLMENT', JSON.stringify(e)); x.approve();
  assert.equal(x.call('synchroniserCommitApprouve').etat, 'SYNCHRONISATION_VERIFIEE');
  x.state.files[0].name = 'Code'; assert.equal(x.call('verifierConfiguration').etat, 'REFUSE');
});
// Diagnostic détaillé : transport strictement GET et zéro tentative de mutation.
function diagnostic(x) {
  x.state.diagnosticOnly = true; x.calls.length = 0; x.propertyWrites.length = 0;
  const before = copy([...x.properties]), files = copy(x.state.files);
  const result = x.call('diagnostiquerDifferences');
  assert.deepEqual([...x.properties], before); assert.deepEqual(x.state.files, files);
  assert.deepEqual(x.propertyWrites, []); assert.equal(x.state.puts, 0); assert.equal(x.drive.size, 0);
  assert(x.calls.every(c => c.method === 'get'));
  const output = JSON.stringify([result, x.logs]);
  for (const privateValue of [id, backendId, email, maintenanceId, 'GOOGLE_FICTIF',
    'SECRET_FICTIF_NE_PAS_JOURNALISER', 'DIAGNOSTIC_PRIVE_FICTIF', 'fonctionPriveeFictive']) assert(!output.includes(privateValue));
  return result;
}
for (const [label, version, index] of [['Mission 7', historical, 0], ['Mission 9', syncSource, 1]]) {
  test('Diagnostic références immuables et Code.gs exact : ' + label, () => {
    const x = setup(true, false); x.state.files = makeFiles(personalize(version)); x.state.files[0].name = 'Code';
    const result = diagnostic(x);
    assert.equal(result.etat, 'DIAGNOSTIC_LECTURE_SEULE'); assert.equal(result.nomHistoriqueCode, true);
    assert.equal(result.manifesteConforme, true); assert.equal(result.syntaxe, 'VALIDE_ECMASCRIPT_2022');
    assert.equal(result.comparaisons.length, 2); assert.equal(x.calls.length, 4);
    assert.equal(result.comparaisons[index].texteIdentique, true);
    assert.equal(result.comparaisons[index].arbreSyntaxiqueIdentique, true);
    assert.equal(result.comparaisons[index].premiereLigneDifferente, null);
    assert(!x.properties.has('ENROLLMENT'));
  });
}
for (const [label, change, conclusion] of [
  ['indentation et CRLF', s => s.replace(/\n/g, '\r\n').replace(/  /g, '    '), 'FORMATAGE_OU_GRAPHIE_DES_LITTERAUX'],
  ['lignes vides', s => s + '\n\n', 'FORMATAGE_OU_GRAPHIE_DES_LITTERAUX'],
  ['commentaire ajouté', s => s + '\n// DIAGNOSTIC_PRIVE_FICTIF', 'COMMENTAIRES_ET_EVENTUELLEMENT_FORMATAGE'],
  ['commentaire retiré', s => s.slice(s.indexOf('const REC_DESTINATION')), 'COMMENTAIRES_ET_EVENTUELLEMENT_FORMATAGE'],
  ['commentaire et indentation', s => s.replace(/  /g, '    ') + '\n/* DIAGNOSTIC_PRIVE_FICTIF */', 'COMMENTAIRES_ET_EVENTUELLEMENT_FORMATAGE'],
  ['graphie équivalente de chaîne', s => s.replace("'SuiviDepotAPI-REC'", '"SuiviDepotAPI-REC"'), 'FORMATAGE_OU_GRAPHIE_DES_LITTERAUX'],
  ['bloc privé reformatté', s => s.replace('Object.freeze({\n  scriptId:', 'Object.freeze( { scriptId:').replace('\n  accountEmail:', ' accountEmail:'), 'FORMATAGE_OU_GRAPHIE_DES_LITTERAUX']
]) test('Diagnostic arbre identique : ' + label, () => {
  const x = setup(true, false); x.state.files[0].source = change(personalize(historical));
  const r = diagnostic(x).comparaisons[0];
  assert.equal(r.texteIdentique, false); assert.equal(r.arbreSyntaxiqueIdentique, true);
  assert.equal(r.conclusion, conclusion); assert(r.premiereLigneDifferente > 0);
  assert.equal(x.call('initialiserMaintenance').etat, 'REFUSE'); assert(!x.properties.has('ENROLLMENT'));
});
for (const [label, change] of [
  ['condition', s => s.replace('if (plan.before === plan.after)', 'if (plan.before !== plan.after)')],
  ['constante publique', s => s.replace('SuiviDepotAPI-REC', 'DIAGNOSTIC_PRIVE_FICTIF')],
  ['fonction supplémentaire', s => s + '\nfunction fonctionPriveeFictive() { return "DIAGNOSTIC_PRIVE_FICTIF"; }'],
  ['code global jamais exécuté', s => s + '\nthrow new Error("DIAGNOSTIC_PRIVE_FICTIF");'],
  ['regex', s => s.replace('[a-f0-9]{40}', '[a-f0-9]{39}')]
]) test('Diagnostic structure modifiée : ' + label, () => {
  const x = setup(true, false); const changed = change(personalize(historical));
  assert.notEqual(changed, personalize(historical)); x.state.files[0].source = changed;
  const r = diagnostic(x).comparaisons[0]; assert.equal(r.arbreSyntaxiqueIdentique, false);
  assert.equal(r.conclusion, 'STRUCTURE_MODIFIEE_REVUE_REQUISE');
  assert.equal(r.ecartNombreFonctionsGlobales, label === 'fonction supplémentaire' ? 1 : 0);
});
test('Analyse AST conserve ASI, chaînes, regex, templates, directives et littéraux', () => {
  const x = setup();
  for (const [a, b] of [
    ['function f(){return 1}', 'function f(){return\n1}'],
    ['const x="a b";', 'const x="ab";'],
    ['const x=/a b/g;', 'const x=/ab/g;'],
    ['const x=`a ${1}`;', 'const x=`a ${2}`;'],
    ['"use strict";', '"use asm";'],
    ['const x=1n;', 'const x=2n;'],
    ['String.raw`a\\n`;', 'String.raw`a\\x0a`;']
  ]) assert.equal(x.context.maintDiagCompare_(a, b).arbreSyntaxiqueIdentique, false);
});
test('Erreur syntaxique : résumé fixe sans message ni source privée', () => {
  const x = setup(true, false); x.state.files[0].source += '\nfunction DIAGNOSTIC_PRIVE_FICTIF( {';
  const r = diagnostic(x); assert.equal(r.syntaxe, 'ANALYSE_IMPOSSIBLE'); assert.deepEqual(r.comparaisons, []);
  assert.equal(x.calls.length, 2);
});
for (const change of [m => { m.oauthScopes.push('PORTEE_FICTIVE'); }, m => { m.dependencies = { libraries: [] }; }]) {
  test('Diagnostic manifeste divergent signalé, jamais accepté', () => {
    const x = setup(true, false), m = copy(manifest); change(m); x.state.files[1].source = JSON.stringify(m);
    const r = diagnostic(x); assert.equal(r.manifesteConforme, false); assert.equal(r.comparaisons[0].texteIdentique, true);
    assert.equal(x.call('initialiserMaintenance').etat, 'REFUSE'); assert(!x.properties.has('ENROLLMENT'));
  });
}
test('Diagnostic manifeste JSON malformé signalé sans retour brut', () => {
  const x = setup(true, false); x.state.files[1].source = '{DIAGNOSTIC_PRIVE_FICTIF';
  assert.equal(diagnostic(x).manifesteConforme, false);
});
test('Diagnostic préserve plans, approbation et enrôlement existants', () => {
  const x = setup(); x.approve(); x.properties.set('IN_FLIGHT', 'FICTIF');
  assert.equal(diagnostic(x).comparaisons[0].texteIdentique, true);
});
for (const [label, change] of [
  ['compte différent', x => { x.state.email = 'autre@example.invalid'; }],
  ['auto-ciblage backend', x => { x.state.files[0].source = personalize(historical).replace(backendId, id); }],
  ['titre incorrect', x => { x.state.title = 'AUTRE'; }],
  ['mauvaise cible', x => { x.state.wrongId = true; }],
  ['projet lié', x => { x.state.bound = true; }],
  ['nom inconnu', x => { x.state.files[0].name = 'DIAGNOSTIC_PRIVE_FICTIF'; }],
  ['deux scripts', x => { x.state.files.push({ ...x.state.files[0], name: 'Code' }); }],
  ['configuration ambiguë', x => { x.state.files[0].source += '\n{ const REC_DESTINATION = {}; }'; }],
  ['configuration calculée', x => { x.state.files[0].source = personalize(historical).replace("scriptId: '", "['scriptId']: '"); }],
  ['configuration supplémentaire', x => { x.state.files[0].source = personalize(historical).replace("accountEmail:", "extra: 1, accountEmail:"); }],
  ['GitHub indisponible', x => { x.state.githubFailure = true; }],
  ['blob altéré', x => { x.state.corruptBlob = true; }],
  ['blob mal dimensionné', x => { x.state.badSize = true; }],
  ['blob mauvais encodage', x => { x.state.badEncoding = true; }],
  ['redirection GitHub', x => { x.state.redirect = true; }]
]) test('Diagnostic refus fermé : ' + label, () => {
  const x = setup(true, false); change(x); assert.equal(diagnostic(x).etat, 'REFUSE');
});
test('Références locales liées aux deux empreintes autorisées inchangées', () => {
  const x = setup();
  assert.deepEqual(copy(vm.runInContext('MAINT_KNOWN_SOURCES', x.context)), [
    '2ae711f40846d00eb88d969381b0bc5253f3ad92320f5d02001c3b9d96c21b8d',
    '93765033560978a8b6f8b63736fc3e19fdca9a4a948aeb1f16e5373812cdebea']);
  x.state.diagnosticOnly = true;
  assert.throws(() => x.context.maintDiagReference_({ mission: 'FICTIF',
    blob: '03d9f37a52e8a635cf237352e8ae3930d7ce7e0a', hash: '0'.repeat(64) }));
});
test('Analyseur non installé : état explicite, aucune fausse conclusion de syntaxe', () => {
  const x = setup(true, false, false), result = diagnostic(x);
  assert.equal(result.syntaxe, 'ANALYSEUR_ABSENT'); assert.deepEqual(result.comparaisons, []);
  assert.equal(x.calls.length, 2);
});
test('Diagnostic sans PAT : refus sans mutation ni requête GitHub', () => {
  const x = setup(true, false); x.properties.delete('GITHUB_READ_TOKEN');
  assert.equal(diagnostic(x).etat, 'REFUSE'); assert.equal(x.calls.length, 2);
});
test('Diagnostic manifeste ordre/indentation acceptés', () => {
  const x = setup(true, false);
  x.state.files[1].source = JSON.stringify(Object.fromEntries(Object.entries(manifest).reverse()), null, 4);
  assert.equal(diagnostic(x).manifesteConforme, true);
});
test('Neutralisation limitée aux deux valeurs du bloc : autre occurrence privée reste un écart', () => {
  const x = setup(true, false); x.state.files[0].source += `\nconst fonctionPriveeFictive = '${backendId}';`;
  assert.equal(diagnostic(x).comparaisons[0].arbreSyntaxiqueIdentique, false);
});
test('Fins de ligne seules : zone et première ligne différentes exactes', () => {
  const x = setup(true, false); x.state.files[0].source = personalize(historical).replace(/\n/g, '\r\n');
  const result = diagnostic(x).comparaisons[0];
  assert.equal(result.conclusion, 'FORMATAGE_OU_GRAPHIE_DES_LITTERAUX');
  assert.equal(result.premiereLigneDifferente, 1); assert(result.lignesDansZoneDifferenteInstallee > 0);
});
console.log(`${count} scénarios REC-Maintenance hors réseau réussis.`);
