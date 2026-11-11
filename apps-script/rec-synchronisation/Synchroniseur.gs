/* Installation manuelle future uniquement. Aucun déclencheur ni point d'entrée web.
 * Personnaliser ces deux valeurs DANS GOOGLE uniquement, jamais dans Git.
 * Le compte REC ne doit disposer d'aucun accès PROD, même indirect.
 */
const REC_DESTINATION = Object.freeze({
  scriptId: 'A_PERSONNALISER_HORS_GIT',
  accountEmail: 'A_PERSONNALISER_HORS_GIT'
});
const REC_REPO = 'ATALEBappli/suivi-depot-app';
const REC_TITLE = 'SuiviDepotAPI-REC';
const REC_PREFIX = 'apps-script/src/';
const REC_TTL = 30 * 60 * 1000;
// Deux contrats revus, jamais alimentés par une propriété ou le candidat.
const REC_APPROVED_MANIFESTS = [ {
  timeZone: 'Europe/Paris', dependencies: {},
  webapp: { access: 'ANYONE_ANONYMOUS', executeAs: 'USER_DEPLOYING' },
  exceptionLogging: 'STACKDRIVER', runtimeVersion: 'V8'
}, {
  timeZone: 'Europe/Paris', dependencies: {},
  webapp: { access: 'MYSELF', executeAs: 'USER_DEPLOYING' },
  exceptionLogging: 'STACKDRIVER', runtimeVersion: 'V8'
} ];

function verifierConfiguration() { return recAction_('CONFIGURATION', function () {
  recConfig_(); recMetadata_(); return { etat: 'CONFIGURATION_VERIFIEE' };
}); }
function simulerSynchronisation() { return recAction_('SIMULATION', function () {
  recConfig_(); recNoFlight_(); recMetadata_();
  const sha = recProps_().getProperty('CANDIDATE_SHA'); recSha_(sha);
  const candidate = recGithub_(sha), before = recContent_();
  const plan = { kind: 'SYNC', sha: sha, before: recHash_(before),
    after: recHash_(candidate), created: Date.now(), target: REC_DESTINATION.scriptId };
  recProps_().deleteProperty('APPROVAL');
  recProps_().setProperty('PLAN', JSON.stringify(plan));
  return { etat: 'SIMULATION_SANS_ECRITURE_GOOGLE', changement: plan.before !== plan.after,
    fichiersAvant: before.length, fichiersApres: candidate.length, sha: sha };
}); }
// Lancer cette fonction est l'approbation humaine explicite du dernier plan.
function approuverSimulation() { return recAction_('APPROBATION', function () {
  recConfig_(); recNoFlight_(); const plan = recPlan_();
  recProps_().setProperty('APPROVAL', recHash_(plan));
  return { etat: 'APPROUVE_POUR_UN_ESSAI', sha: plan.sha || null };
}); }
function sauvegarderSources() { return recAction_('SAUVEGARDE', function () {
  recConfig_(); recNoFlight_(); recMetadata_(); recBackup_(recContent_());
  return { etat: 'SAUVEGARDE_RELUE_ET_VERIFIEE' };
}); }
function synchroniserCommitApprouve() { return recAction_('SYNCHRONISATION', function () {
  recConfig_(); recNoFlight_(); const plan = recApproved_('SYNC'); recMetadata_();
  const candidate = recGithub_(plan.sha), before = recContent_();
  recRequire_(recHash_(candidate) === plan.after, 'CANDIDAT_MODIFIE');
  recRequire_(recHash_(before) === plan.before, 'REC_MODIFIE_DEPUIS_SIMULATION');
  recRequire_(before.every(function (f) { return candidate.some(function (c) {
    return c.name === f.name && c.type === f.type;
  }); }), 'SUPPRESSION_DE_FICHIER_NON_APPROUVEE');
  if (plan.before === plan.after) {
    recProps_().deleteProperty('APPROVAL'); return { etat: 'AUCUN_CHANGEMENT' };
  }
  recBackup_(before); // Échec Drive ou relecture incorrecte : aucun PUT.
  recApply_(candidate, plan);
  return { etat: 'SYNCHRONISATION_VERIFIEE', sha: plan.sha };
}); }
function verifierResultat() { return recAction_('VERIFICATION', function () {
  recConfig_(); recMetadata_();
  const raw = recProps_().getProperty('IN_FLIGHT') || recProps_().getProperty('LAST_RESULT');
  recRequire_(raw, 'AUCUN_RESULTAT'); const expected = JSON.parse(raw);
  recRequire_(expected.target === REC_DESTINATION.scriptId, 'CIBLE_INCORRECTE');
  recRequire_(recHash_(recContent_()) === expected.after, 'RESULTAT_NON_CONFORME');
  recProps_().setProperty('LAST_RESULT', JSON.stringify(expected));
  recProps_().deleteProperty('IN_FLIGHT');
  return { etat: 'RESULTAT_CONFORME' };
}); }
function simulerRestauration() { return recAction_('SIMULATION_RESTAURATION', function () {
  recConfig_(); recMetadata_();
  // Une restauration explicite peut résoudre un résultat de PUT incertain.
  const backup = recReadBackup_(), before = recContent_();
  const plan = { kind: 'RESTORE', target: REC_DESTINATION.scriptId,
    before: recHash_(before), after: recHash_(backup.files), created: Date.now(),
    backupKey: recSelectedBackupKey_() };
  recProps_().deleteProperty('APPROVAL');
  recProps_().setProperty('PLAN', JSON.stringify(plan));
  return { etat: 'RESTAURATION_SIMULEE', fichiers: backup.files.length };
}); }
function restaurerSauvegardeApprouvee() { return recAction_('RESTAURATION', function () {
  recConfig_(); const plan = recApproved_('RESTORE'); recMetadata_();
  recRequire_(recSelectedBackupKey_() === plan.backupKey, 'SAUVEGARDE_MODIFIEE');
  const backup = recReadBackup_(), before = recContent_();
  recRequire_(recHash_(backup.files) === plan.after && recHash_(before) === plan.before, 'ETAT_MODIFIE');
  recBackup_(before); // Sauvegarde aussi l'état remplacé par la restauration.
  recApply_(backup.files, plan);
  return { etat: 'RESTAURATION_VERIFIEE' };
}); }

function recProps_() { return PropertiesService.getScriptProperties(); }
function recRequire_(condition, code) { if (!condition) throw new Error(code); }
function recConfig_() {
  recRequire_(/^[A-Za-z0-9_-]{20,200}$/.test(REC_DESTINATION.scriptId) &&
    REC_DESTINATION.scriptId !== 'A_PERSONNALISER_HORS_GIT', 'INSTALLATION_NON_PERSONNALISEE');
  recRequire_(REC_DESTINATION.scriptId !== ScriptApp.getScriptId(), 'AUTO_MODIFICATION_INTERDITE');
  const email = Session.getEffectiveUser().getEmail();
  recRequire_(email && email === REC_DESTINATION.accountEmail, 'COMPTE_NON_AUTORISE');
  recRequire_(!!recProps_().getProperty('GITHUB_READ_TOKEN'), 'JETON_GITHUB_ABSENT');
}
function recMetadata_() {
  const data = recGoogle_('get', '/v1/projects/' + REC_DESTINATION.scriptId);
  recRequire_(data.scriptId === REC_DESTINATION.scriptId && data.title === REC_TITLE &&
    !data.parentId, 'IDENTITE_REC_INCORRECTE');
}
function recContent_() {
  const data = recGoogle_('get', '/v1/projects/' + REC_DESTINATION.scriptId + '/content');
  recRequire_(data.scriptId === REC_DESTINATION.scriptId, 'CIBLE_INCORRECTE');
  return recFiles_(data.files);
}
function recRequest_(url, method, token, body) {
  const options = { method: method, followRedirects: false, muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' } };
  if (body !== undefined) { options.contentType = 'application/json'; options.payload = JSON.stringify(body); }
  let response;
  try { response = UrlFetchApp.fetch(url, options); } catch (_) { throw new Error('TRANSPORT_REFUSE'); }
  recRequire_(response.getResponseCode() >= 200 && response.getResponseCode() < 300, 'HTTP_REFUSE');
  const text = response.getContentText(); recRequire_(text.length <= 2000000, 'REPONSE_TROP_GRANDE');
  try { return JSON.parse(text); } catch (_) { throw new Error('JSON_INVALIDE'); }
}
function recGoogle_(method, path, body) {
  const root = '/v1/projects/' + REC_DESTINATION.scriptId;
  recRequire_((method === 'get' && (path === root || path === root + '/content')) ||
    (method === 'put' && path === root + '/content'), 'ROUTE_INTERDITE');
  return recRequest_('https://script.googleapis.com' + path, method, ScriptApp.getOAuthToken(), body);
}
function recSha_(sha) { recRequire_(typeof sha === 'string' && /^[a-f0-9]{40}$/.test(sha), 'SHA_EXACT_REQUIS'); }
function recGit_(path) {
  return recRequest_('https://api.github.com/repos/' + REC_REPO + '/git/' + path,
    'get', recProps_().getProperty('GITHUB_READ_TOKEN'));
}
function recGithub_(sha) {
  recSha_(sha); const commit = recGit_('commits/' + sha);
  recRequire_(commit.sha === sha && commit.tree, 'COMMIT_INCORRECT'); recSha_(commit.tree.sha);
  const tree = recGit_('trees/' + commit.tree.sha + '?recursive=1');
  recRequire_(tree.sha === commit.tree.sha && tree.truncated === false && Array.isArray(tree.tree), 'ARBRE_INCOMPLET');
  const files = [], seen = {};
  tree.tree.filter(function (entry) { return entry.path.startsWith(REC_PREFIX); }).forEach(function (entry) {
    const name = entry.path.slice(REC_PREFIX.length);
    recRequire_(['Code.gs', 'appsscript.json', 'README.md'].indexOf(name) !== -1 &&
      entry.type === 'blob' && entry.mode === '100644' && !seen[name], 'FICHIER_INATTENDU');
    seen[name] = true;
    if (name === 'README.md') return;
    recSha_(entry.sha); const blob = recGit_('blobs/' + entry.sha);
    recRequire_(blob.sha === entry.sha && blob.encoding === 'base64' &&
      typeof blob.content === 'string' && blob.size > 0 && blob.size <= 500000, 'BLOB_INVALIDE');
    const bytes = Utilities.base64Decode(blob.content.replace(/\s/g, ''));
    const header = Utilities.newBlob('blob ' + bytes.length + '\x00').getBytes();
    recRequire_(bytes.length === blob.size && recHex_(Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_1, header.concat(bytes))) === entry.sha, 'BLOB_CORROMPU');
    const source = Utilities.newBlob(bytes).getDataAsString('UTF-8');
    recRequire_(source.length > 0 && source.indexOf('\ufffd') === -1, 'SOURCE_INVALIDE');
    files.push({ name: name === 'Code.gs' ? 'Code' : 'appsscript',
      type: name === 'Code.gs' ? 'SERVER_JS' : 'JSON', source: source });
  });
  recRequire_(seen['Code.gs'] && seen['appsscript.json'], 'SOURCES_MANQUANTES');
  const result = recFiles_(files);
  return result;
}
function recFiles_(files) {
  recRequire_(Array.isArray(files) && files.length > 0 && files.length <= 100, 'FICHIERS_INVALIDES');
  const seen = {}; let manifest = false;
  const result = files.map(function (f) {
    recRequire_(f && typeof f.name === 'string' && /^[A-Za-z0-9_/-]+$/.test(f.name) &&
      !seen[f.name] && ['SERVER_JS', 'HTML', 'JSON'].indexOf(f.type) !== -1 &&
      typeof f.source === 'string' && f.source.length <= 500000, 'FICHIER_INVALIDE');
    seen[f.name] = true;
    if (f.name === 'appsscript') {
      recRequire_(f.type === 'JSON', 'MANIFESTE_INVALIDE');
      let parsed; try { parsed = JSON.parse(f.source); } catch (_) { throw new Error('MANIFESTE_INVALIDE'); }
      // Même contrôle pour GitHub, l'état distant et les sauvegardes restaurées.
      recRequire_(REC_APPROVED_MANIFESTS.some(function (approved) {
        return recCanonical_(parsed) === recCanonical_(approved);
      }), 'MANIFESTE_NON_APPROUVE');
      manifest = true;
    }
    return { name: f.name, type: f.type, source: f.source };
  });
  recRequire_(manifest && JSON.stringify(result).length <= 1000000, 'MANIFESTE_OU_TAILLE_INVALIDE');
  return result.sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; });
}
function recCanonical_(value) {
  if (Array.isArray(value)) return '[' + value.map(recCanonical_).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(function (key) {
    return JSON.stringify(key) + ':' + recCanonical_(value[key]);
  }).join(',') + '}';
  return JSON.stringify(value);
}
function recHex_(bytes) { return bytes.map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join(''); }
function recHash_(value) { return recHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
  recCanonical_(value), Utilities.Charset.UTF_8)); }
function recDrive_(method, path, body) {
  return recRequest_('https://www.googleapis.com/drive/v3/files' + path,
    method, ScriptApp.getOAuthToken(), body);
}
function recBackup_(files) {
  const index = JSON.parse(recProps_().getProperty('BACKUPS') || '[]');
  // Limite volontaire, pas de suppression automatique ni d'oubli d'anciens exports.
  recRequire_(index.length < 20, 'ARCHIVER_SAUVEGARDES_AVANT_CONTINUATION');
  const backup = { schema: 1, target: REC_DESTINATION.scriptId, files: files, hash: recHash_(files) };
  const payload = JSON.stringify(backup);
  // Fichier créé par cette application seulement : drive.file, pas d'accès Drive global.
  const created = recDrive_('post', '?fields=id', { name: 'REC-source-backup-' + Date.now() + '.json',
    mimeType: 'application/json' });
  recRequire_(created.id && /^[A-Za-z0-9_-]+$/.test(created.id), 'SAUVEGARDE_NON_CREEE');
  const metadata = recDrive_('get', '/' + created.id + '?fields=id,permissions(type,role,emailAddress)');
  recRequire_(metadata.id === created.id && Array.isArray(metadata.permissions) &&
    metadata.permissions.length === 1 && metadata.permissions[0].type === 'user' &&
    metadata.permissions[0].role === 'owner' &&
    metadata.permissions[0].emailAddress === REC_DESTINATION.accountEmail, 'SAUVEGARDE_NON_PRIVEE');
  const response = UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files/' +
    created.id + '?uploadType=media', { method: 'patch', followRedirects: false, muteHttpExceptions: true,
    contentType: 'application/json', headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, payload: payload });
  recRequire_(response.getResponseCode() === 200, 'SAUVEGARDE_NON_ECRITE');
  const read = recDrive_('get', '/' + created.id + '?alt=media');
  recRequire_(recCanonical_(read) === recCanonical_(backup), 'SAUVEGARDE_NON_VERIFIEE');
  index.push({ key: String(index.length + 1), id: created.id, hash: recHash_(backup) });
  recProps_().setProperty('BACKUPS', JSON.stringify(index));
}
function recSelectedBackupKey_() {
  const index = JSON.parse(recProps_().getProperty('BACKUPS') || '[]');
  recRequire_(index.length > 0, 'SAUVEGARDE_ABSENTE');
  return recProps_().getProperty('RESTORE_BACKUP_KEY') || index[index.length - 1].key;
}
function recReadBackup_() {
  const index = JSON.parse(recProps_().getProperty('BACKUPS') || '[]');
  const record = index.filter(function (item) { return item.key === recSelectedBackupKey_(); })[0];
  recRequire_(record && /^[A-Za-z0-9_-]+$/.test(record.id), 'SAUVEGARDE_ABSENTE');
  const id = record.id;
  const backup = recDrive_('get', '/' + id + '?alt=media');
  recRequire_(backup.schema === 1 && backup.target === REC_DESTINATION.scriptId &&
    recHash_(backup) === record.hash, 'SAUVEGARDE_INCORRECTE');
  backup.files = recFiles_(backup.files);
  recRequire_(recHash_(backup.files) === backup.hash, 'SAUVEGARDE_CORROMPUE'); return backup;
}
function recPlan_() {
  const raw = recProps_().getProperty('PLAN'); recRequire_(raw, 'SIMULATION_REQUISE');
  const plan = JSON.parse(raw);
  recRequire_(plan.target === REC_DESTINATION.scriptId && Number.isFinite(plan.created) &&
    Date.now() >= plan.created && Date.now() - plan.created < REC_TTL, 'PLAN_EXPIRE_OU_INCORRECT');
  if (plan.kind === 'SYNC') recRequire_(plan.sha === recProps_().getProperty('CANDIDATE_SHA'), 'SHA_MODIFIE');
  return plan;
}
function recApproved_(kind) {
  const plan = recPlan_(); recRequire_(plan.kind === kind &&
    recProps_().getProperty('APPROVAL') === recHash_(plan), 'APPROBATION_REQUISE'); return plan;
}
function recNoFlight_() { recRequire_(!recProps_().getProperty('IN_FLIGHT'), 'RESULTAT_INCERTAIN_VERIFIER_OU_RESTAURER'); }
function recApply_(files, plan) {
  // Relecture après sauvegarde : réduire la fenêtre de modification concurrente.
  recMetadata_(); recRequire_(recHash_(recContent_()) === plan.before, 'REC_MODIFIE_AVANT_ECRITURE');
  recProps_().deleteProperty('APPROVAL'); // Consommation AVANT le PUT : jamais de retry silencieux.
  recProps_().setProperty('IN_FLIGHT', JSON.stringify({ target: plan.target, after: plan.after }));
  recGoogle_('put', '/v1/projects/' + REC_DESTINATION.scriptId + '/content', { files: files });
  recRequire_(recHash_(recContent_()) === plan.after, 'VERIFICATION_APRES_ECRITURE_ECHOUEE');
  recProps_().setProperty('LAST_RESULT', JSON.stringify({ target: plan.target, after: plan.after }));
  recProps_().deleteProperty('IN_FLIGHT'); recProps_().deleteProperty('PLAN');
}
function recAction_(event, operation) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) { console.log('REC OCCUPE'); return { etat: 'REFUSE', code: 'OCCUPE' }; }
  try {
    // Résultats construits localement : états, SHA Git public, nombres, jamais de réponse brute.
    const result = operation(); console.log('REC ' + event + ' ' + JSON.stringify(result)); return result;
  } catch (_) {
    // Aucune exception brute : elle peut contenir URL, en-tête, identité ou réponse API.
    console.log('REC ' + event + ' REFUSE'); return { etat: 'REFUSE', code: 'CONTROLE_ECHOUE' };
  } finally { lock.releaseLock(); }
}
