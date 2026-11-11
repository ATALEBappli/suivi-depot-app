// Contexte vm sans fetch/process/require/import : aucun transport réel.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
const source = readFileSync(new URL('../apps-script/rec-maintenance/Maintenance.gs', import.meta.url), 'utf8');
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
function setup(personalized = true, initialized = true) {
  const properties = new Map([['GITHUB_READ_TOKEN', 'SECRET_FICTIF_NE_PAS_JOURNALISER'], ['CANDIDATE_SHA', sha]]);
  const calls = [], logs = [], drive = new Map();
  const state = { files: copy(old), title: 'REC-Synchronisation', email, candidate: makeFiles(syncSource),
    treeExtra: null, truncated: false, backupFailure: false, corruptBackup: false,
    corruptBlob: false, writeFailure: false, wrongReadback: false, held: false, now: 1000000, puts: 0 };
  const blobMap = new Map();
  const hex = (alg, value) => createHash(alg).update(value).digest();
  const response = (value, code = 200) => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(value) });
  function mockFetch(url, options) {
    calls.push({ url, method: options.method });
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
      const blob = copy(blobMap.get(url.split('/').at(-1)));
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
      setProperty: (k, v) => properties.set(k, v), deleteProperty: k => properties.delete(k) }) },
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
  });
  vm.runInContext(personalized ? source.replace("scriptId: 'A_PERSONNALISER_HORS_GIT'", `scriptId: '${id}'`)
    : source, context);
  const call = name => copy(context[name]());
  const approve = () => { assert.notEqual(call('simulerSynchronisation').etat, 'REFUSE');
    assert.equal(call('approuverSimulation').etat, 'APPROUVE_POUR_UN_ESSAI'); };
  if (personalized && initialized) {
    assert.equal(call('initialiserMaintenance').etat, 'LIAISON_EXISTANTE_VERROUILLEE');
    calls.length = 0;
  }
  return { context, state, properties, calls, logs, drive, call, approve };
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
    nomHistoriqueCode: false, sourceCompleteConnue: false, normalisationTerminaleNecessaire: false });
  assert.deepEqual([...x.properties], before); assert.equal(x.calls.length, 2);
  assert(x.calls.every(c => c.method === 'get')); assert.equal(x.drive.size, 0);
});
test('Ancien enrôlement sans codeName : compatibilité limitée à Synchroniseur', () => {
  const x = setup(), e = JSON.parse(x.properties.get('ENROLLMENT')); delete e.codeName;
  x.properties.set('ENROLLMENT', JSON.stringify(e)); x.approve();
  assert.equal(x.call('synchroniserCommitApprouve').etat, 'SYNCHRONISATION_VERIFIEE');
  x.state.files[0].name = 'Code'; assert.equal(x.call('verifierConfiguration').etat, 'REFUSE');
});
// Variantes terminales : seules SP ASCII, TAB, CR et LF, après le code exact.
for (const [versionName, version] of [['Mission 7', historical], ['Mission 9', syncSource]]) {
  for (const [variant, suffix, required] of [
    ['exact', '\n', false], ['sans LF', '', true], ['LF supplémentaires', '\n\n\n', true],
    ['CRLF final', '\r\n', true], ['CR final', '\r', true], ['espaces et tabulations', ' \t ', true],
    ['zone mixte', '\r\n \t\n\r \n', true]
  ]) test('Reconnaissance terminale ' + versionName + ' : ' + variant, () => {
    const x = setup(true, false);
    x.state.files = makeFiles(personalize(version).replace(/[ \t\r\n]*$/, '') + suffix);
    x.state.files[0].name = 'Code';
    const original = copy(x.state.files), properties = copy([...x.properties]);
    const result = x.call('diagnostiquerInstallation');
    assert.deepEqual(result, { etat: 'SOURCE_INITIALE_RECONNUE', nomHistoriqueCode: true,
      sourceCompleteConnue: true, normalisationTerminaleNecessaire: required });
    assert.deepEqual([...x.properties], properties); assert.deepEqual(x.state.files, original);
    assert.equal(x.drive.size, 0); assert(x.calls.every(c => c.method === 'get'));
    assert.equal(x.call('initialiserMaintenance').etat, 'LIAISON_EXISTANTE_VERROUILLEE');
    assert.deepEqual(x.state.files, original); assert.deepEqual(JSON.parse(x.properties.get('ENROLLMENT')).binding,
      {scriptId: backendId, accountEmail: email});
    x.approve(); assert.equal(x.call('synchroniserCommitApprouve').etat,
      version === syncSource && !required ? 'AUCUN_CHANGEMENT' : 'SYNCHRONISATION_VERIFIEE');
    if (version !== syncSource || required) {
      assert.deepEqual([...x.drive.values()][0].files, original);
      x.properties.set('RESTORE_BACKUP_KEY', '1'); x.call('simulerRestauration'); x.call('approuverSimulation');
      assert.equal(x.call('restaurerSauvegardeApprouvee').etat, 'RESTAURATION_VERIFIEE');
      assert.deepEqual(x.state.files, original);
    }
    const output = JSON.stringify([result, x.logs]);
    for (const value of [id, backendId, email, maintenanceId, 'GOOGLE_FICTIF', 'SECRET_FICTIF_NE_PAS_JOURNALISER']) assert(!output.includes(value));
  });
}
for (const [label, change] of [
  ['commentaire final', s => s + '// ajout fictif\n'],
  ['commentaire final puis blancs', s => s + '/* ajout */ \t\n'],
  ['fonction ajoutée', s => s + 'function diagnosticFictif() {}\n'],
  ['condition modifiée', s => s.replace('if (plan.before === plan.after)', 'if (plan.before !== plan.after)')],
  ['espacement intérieur', s => s.replace('const plan = recPlan_();', 'const plan  = recPlan_();')],
  ['ligne vide intérieure', s => s.replace('function recProps_', '\nfunction recProps_')],
  ['commentaire intérieur', s => s.replace('function recProps_', '// ajout\nfunction recProps_')],
  ['NBSP final', s => s + '\u00a0'], ['espace Unicode final', s => s + '\u2003'],
  ['séparateur Unicode final', s => s + '\u2028'], ['BOM final', s => s + '\ufeff'],
  ['zéro largeur final', s => s + '\u200b'],
  ['CRLF partout', s => s.replace(/\n/g, '\r\n')], ['BOM initial', s => '\ufeff' + s]
]) test('Normalisation terminale refuse : ' + label, () => {
  const x = setup(true, false), original = personalize(historical), changed = change(original);
  assert.notEqual(changed, original); x.state.files[0].name = 'Code'; x.state.files[0].source = changed;
  const result = x.call('diagnostiquerInstallation');
  assert(['REFUSE', 'REVUE_PRIVEE_REQUISE'].includes(result.etat));
  if (result.etat !== 'REFUSE') {
    assert.equal(result.sourceCompleteConnue, false); assert.equal(result.normalisationTerminaleNecessaire, false);
  }
  refused(x, 'initialiserMaintenance'); assert(!x.properties.has('ENROLLMENT'));
  assert.equal(x.drive.size, 0); assert(x.calls.every(c => c.method === 'get'));
});
test('Empreintes approuvées vérifiées sur fixtures et absence de diagnostic complexe', () => {
  const x = setup();
  assert.deepEqual(copy(vm.runInContext('MAINT_KNOWN_SOURCES', x.context)), [
    '2ae711f40846d00eb88d969381b0bc5253f3ad92320f5d02001c3b9d96c21b8d',
    '93765033560978a8b6f8b63736fc3e19fdca9a4a948aeb1f16e5373812cdebea']);
  for (const [i, text] of [historical, syncSource].entries()) {
    const hash = createHash('sha256').update(x.context.maintBinding_(personalize(text)).normalized, 'utf8').digest('hex');
    assert.equal(hash, vm.runInContext('MAINT_KNOWN_SOURCES', x.context)[i]);
  }
  assert.equal(typeof x.context.diagnostiquerDifferences, 'undefined');
  assert(!source.includes('MAINT_ACORN'));
});
console.log(`${count} scénarios REC-Maintenance hors réseau réussis.`);
