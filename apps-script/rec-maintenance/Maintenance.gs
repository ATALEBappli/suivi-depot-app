/* Projet indépendant privé. Installation seulement après validation distincte.
 * Renseigner UNIQUEMENT l'ID de REC-Synchronisation dans la copie Google.
 * Aucune auto-mise à jour, aucun backend direct, aucun déploiement/déclencheur.
 */
const MAINT_DESTINATION = Object.freeze({ scriptId: 'A_PERSONNALISER_HORS_GIT' });
const MAINT_REPO = 'ATALEBappli/suivi-depot-app';
const MAINT_TITLE = 'REC-Synchronisation';
const MAINT_PREFIX = 'apps-script/rec-synchronisation/';
const MAINT_TTL = 30 * 60 * 1000;
const MAINT_HEADER = "/* Installation manuelle future uniquement. Aucun déclencheur ni point d'entrée web.\n * Personnaliser ces deux valeurs DANS GOOGLE uniquement, jamais dans Git.\n * Le compte REC ne doit disposer d'aucun accès PROD, même indirect.\n */\n";
const MAINT_TEMPLATE = "const REC_DESTINATION = Object.freeze({\n  scriptId: 'A_PERSONNALISER_HORS_GIT',\n  accountEmail: 'A_PERSONNALISER_HORS_GIT'\n});\n";
const MAINT_KNOWN_SOURCES = ["2ae711f40846d00eb88d969381b0bc5253f3ad92320f5d02001c3b9d96c21b8d", "93765033560978a8b6f8b63736fc3e19fdca9a4a948aeb1f16e5373812cdebea"];
// Enveloppe de sécurité inchangée : toute évolution exige une revue de Maintenance.
const MAINT_PROTECTED = [
  "const REC_REPO = 'ATALEBappli/suivi-depot-app';",
  "const REC_TITLE = 'SuiviDepotAPI-REC';",
  "const REC_PREFIX = 'apps-script/src/';",
  "function recConfig_() {\n  recRequire_(/^[A-Za-z0-9_-]{20,200}$/.test(REC_DESTINATION.scriptId) &&\n    REC_DESTINATION.scriptId !== 'A_PERSONNALISER_HORS_GIT', 'INSTALLATION_NON_PERSONNALISEE');\n  recRequire_(REC_DESTINATION.scriptId !== ScriptApp.getScriptId(), 'AUTO_MODIFICATION_INTERDITE');\n  const email = Session.getEffectiveUser().getEmail();\n  recRequire_(email && email === REC_DESTINATION.accountEmail, 'COMPTE_NON_AUTORISE');\n  recRequire_(!!recProps_().getProperty('GITHUB_READ_TOKEN'), 'JETON_GITHUB_ABSENT');\n}",
  "function recMetadata_() {\n  const data = recGoogle_('get', '/v1/projects/' + REC_DESTINATION.scriptId);\n  recRequire_(data.scriptId === REC_DESTINATION.scriptId && data.title === REC_TITLE &&\n    !data.parentId, 'IDENTITE_REC_INCORRECTE');\n}",
  "function recGoogle_(method, path, body) {\n  const root = '/v1/projects/' + REC_DESTINATION.scriptId;\n  recRequire_((method === 'get' && (path === root || path === root + '/content')) ||\n    (method === 'put' && path === root + '/content'), 'ROUTE_INTERDITE');\n  return recRequest_('https://script.googleapis.com' + path, method, ScriptApp.getOAuthToken(), body);\n}"
];
const MAINT_MANIFEST = {
  "timeZone": "Europe/Paris",
  "runtimeVersion": "V8",
  "dependencies": {},
  "oauthScopes": [
    "https://www.googleapis.com/auth/script.projects",
    "https://www.googleapis.com/auth/script.external_request",
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/userinfo.email"
  ]
};

function verifierConfiguration() { return maintAction_('CONFIGURATION', function () {
  maintConfig_(); maintMetadata_(); maintContent_(); return { etat: 'CONFIGURATION_VERIFIEE' };
}); }
function simulerSynchronisation() { return maintAction_('SIMULATION', function () {
  maintConfig_(); maintNoFlight_(); maintProps_().deleteProperty('APPROVAL');
  maintProps_().deleteProperty('PLAN'); maintMetadata_();
  const sha = maintProps_().getProperty('CANDIDATE_SHA'); maintSha_(sha);
  const candidate = maintGithub_(sha), before = maintContent_();
  const plan = { kind: 'SYNC', sha: sha, before: maintHash_(before),
    after: maintHash_(candidate), created: Date.now(), target: MAINT_DESTINATION.scriptId, enrollment: maintHash_(maintEnrollment_()) };
  maintProps_().deleteProperty('APPROVAL');
  maintProps_().setProperty('PLAN', JSON.stringify(plan));
  return { etat: 'SIMULATION_SANS_ECRITURE_GOOGLE', changement: plan.before !== plan.after,
    fichiersAvant: before.length, fichiersApres: candidate.length, sha: sha };
}); }
// Lancer cette fonction est l'approbation humaine explicite du dernier plan.
function approuverSimulation() { return maintAction_('APPROBATION', function () {
  maintConfig_(); const plan = maintPlan_();
  if (plan.kind !== 'RESTORE') maintNoFlight_();
  maintProps_().setProperty('APPROVAL', maintHash_(plan));
  return { etat: 'APPROUVE_POUR_UN_ESSAI', sha: plan.sha || null };
}); }
function sauvegarderSources() { return maintAction_('SAUVEGARDE', function () {
  maintConfig_(); maintNoFlight_(); maintMetadata_(); maintBackup_(maintContent_());
  return { etat: 'SAUVEGARDE_RELUE_ET_VERIFIEE' };
}); }
function synchroniserCommitApprouve() { return maintAction_('SYNCHRONISATION', function () {
  maintConfig_(); maintNoFlight_(); const plan = maintApproved_('SYNC'); maintMetadata_();
  const candidate = maintGithub_(plan.sha), before = maintContent_();
  maintRequire_(maintHash_(candidate) === plan.after, 'CANDIDAT_MODIFIE');
  maintRequire_(maintHash_(before) === plan.before, 'MAINT_MODIFIE_DEPUIS_SIMULATION');
  maintRequire_(before.every(function (f) { return candidate.some(function (c) {
    return c.name === f.name && c.type === f.type;
  }); }), 'SUPPRESSION_DE_FICHIER_NON_APPROUVEE');
  if (plan.before === plan.after) {
    maintProps_().deleteProperty('APPROVAL'); return { etat: 'AUCUN_CHANGEMENT' };
  }
  maintBackup_(before); // Échec Drive ou relecture incorrecte : aucun PUT.
  maintApply_(candidate, plan);
  return { etat: 'SYNCHRONISATION_VERIFIEE', sha: plan.sha };
}); }
function verifierResultat() { return maintAction_('VERIFICATION', function () {
  maintConfig_(); maintMetadata_();
  const raw = maintProps_().getProperty('IN_FLIGHT') || maintProps_().getProperty('LAST_RESULT');
  maintRequire_(raw, 'AUCUN_RESULTAT'); const expected = JSON.parse(raw);
  maintRequire_(expected.target === MAINT_DESTINATION.scriptId && expected.enrollment === maintHash_(maintEnrollment_()), 'CIBLE_INCORRECTE');
  maintRequire_(maintHash_(maintContent_()) === expected.after, 'RESULTAT_NON_CONFORME');
  maintProps_().setProperty('LAST_RESULT', JSON.stringify(expected));
  maintProps_().deleteProperty('IN_FLIGHT');
  return { etat: 'RESULTAT_CONFORME' };
}); }
function simulerRestauration() { return maintAction_('SIMULATION_RESTAURATION', function () {
  maintConfig_(); maintProps_().deleteProperty('APPROVAL'); maintProps_().deleteProperty('PLAN'); maintMetadata_();
  // Une restauration explicite peut résoudre un résultat de PUT incertain.
  const backup = maintReadBackup_(), before = maintContent_();
  const plan = { kind: 'RESTORE', target: MAINT_DESTINATION.scriptId,
    before: maintHash_(before), after: maintHash_(backup.files), created: Date.now(), enrollment: maintHash_(maintEnrollment_()),
    backupKey: maintSelectedBackupKey_() };
  maintProps_().deleteProperty('APPROVAL');
  maintProps_().setProperty('PLAN', JSON.stringify(plan));
  return { etat: 'RESTAURATION_SIMULEE', fichiers: backup.files.length };
}); }
function restaurerSauvegardeApprouvee() { return maintAction_('RESTAURATION', function () {
  maintConfig_(); const plan = maintApproved_('RESTORE'); maintMetadata_();
  maintRequire_(maintSelectedBackupKey_() === plan.backupKey, 'SAUVEGARDE_MODIFIEE');
  const backup = maintReadBackup_(), before = maintContent_();
  maintRequire_(maintHash_(backup.files) === plan.after && maintHash_(before) === plan.before, 'ETAT_MODIFIE');
  maintBackup_(before); // Sauvegarde aussi l'état remplacé par la restauration.
  maintApply_(backup.files, plan);
  return { etat: 'RESTAURATION_VERIFIEE' };
}); }

function maintProps_() { return PropertiesService.getScriptProperties(); }
function maintRequire_(condition, code) { if (!condition) throw new Error(code); }
function maintLocalTarget_() {
  maintRequire_(/^[A-Za-z0-9_-]{20,200}$/.test(MAINT_DESTINATION.scriptId) &&
    MAINT_DESTINATION.scriptId !== 'A_PERSONNALISER_HORS_GIT' &&
    MAINT_DESTINATION.scriptId !== ScriptApp.getScriptId(), 'CIBLE_LOCALE_INVALIDE');
}
function maintEnrollment_() {
  const raw = maintProps_().getProperty('ENROLLMENT'); maintRequire_(raw, 'INITIALISATION_REQUISE');
  const value = JSON.parse(raw);
  maintRequire_(value.target === MAINT_DESTINATION.scriptId && value.maintenance === ScriptApp.getScriptId() &&
    value.binding && value.binding.scriptId !== MAINT_DESTINATION.scriptId &&
    value.binding.scriptId !== ScriptApp.getScriptId() &&
    value.binding.accountEmail === Session.getEffectiveUser().getEmail(), 'IDENTITE_MODIFIEE');
  return value;
}
function maintConfig_() {
  maintLocalTarget_(); maintEnrollment_();
  maintRequire_(!!maintProps_().getProperty('GITHUB_READ_TOKEN'), 'JETON_GITHUB_ABSENT');
}
function maintMetadata_() {
  const data = maintGoogle_('get', '/v1/projects/' + MAINT_DESTINATION.scriptId);
  maintRequire_(data.scriptId === MAINT_DESTINATION.scriptId && data.title === MAINT_TITLE &&
    !data.parentId, 'IDENTITE_MAINT_INCORRECTE');
}
function maintContent_() {
  const data = maintGoogle_('get', '/v1/projects/' + MAINT_DESTINATION.scriptId + '/content');
  maintRequire_(data.scriptId === MAINT_DESTINATION.scriptId, 'CIBLE_INCORRECTE');
  return maintFiles_(data.files);
}
function maintRequest_(url, method, token, body) {
  const options = { method: method, followRedirects: false, muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' } };
  if (body !== undefined) { options.contentType = 'application/json'; options.payload = JSON.stringify(body); }
  let response;
  try { response = UrlFetchApp.fetch(url, options); } catch (_) { throw new Error('TRANSPORT_REFUSE'); }
  maintRequire_(response.getResponseCode() >= 200 && response.getResponseCode() < 300, 'HTTP_REFUSE');
  const text = response.getContentText(); maintRequire_(text.length <= 2000000, 'REPONSE_TROP_GRANDE');
  try { return JSON.parse(text); } catch (_) { throw new Error('JSON_INVALIDE'); }
}
function maintGoogle_(method, path, body) {
  maintLocalTarget_();
  const root = '/v1/projects/' + MAINT_DESTINATION.scriptId;
  maintRequire_((method === 'get' && (path === root || path === root + '/content')) ||
    (method === 'put' && path === root + '/content'), 'ROUTE_INTERDITE');
  return maintRequest_('https://script.googleapis.com' + path, method, ScriptApp.getOAuthToken(), body);
}
function maintSha_(sha) { maintRequire_(typeof sha === 'string' && /^[a-f0-9]{40}$/.test(sha), 'SHA_EXACT_REQUIS'); }
function maintGit_(path) {
  return maintRequest_('https://api.github.com/repos/' + MAINT_REPO + '/git/' + path,
    'get', maintProps_().getProperty('GITHUB_READ_TOKEN'));
}
function maintGithub_(sha) {
  maintSha_(sha); const commit = maintGit_('commits/' + sha);
  maintRequire_(commit.sha === sha && commit.tree, 'COMMIT_INCORRECT'); maintSha_(commit.tree.sha);
  const tree = maintGit_('trees/' + commit.tree.sha + '?recursive=1');
  maintRequire_(tree.sha === commit.tree.sha && tree.truncated === false && Array.isArray(tree.tree), 'ARBRE_INCOMPLET');
  const files = [], seen = {};
  tree.tree.filter(function (entry) { return entry.path.startsWith(MAINT_PREFIX); }).forEach(function (entry) {
    const name = entry.path.slice(MAINT_PREFIX.length);
    maintRequire_(['Synchroniseur.gs', 'appsscript.json', 'README.md'].indexOf(name) !== -1 &&
      entry.type === 'blob' && entry.mode === '100644' && !seen[name], 'FICHIER_INATTENDU');
    seen[name] = true;
    if (name === 'README.md') return;
    maintSha_(entry.sha); const blob = maintGit_('blobs/' + entry.sha);
    maintRequire_(blob.sha === entry.sha && blob.encoding === 'base64' &&
      typeof blob.content === 'string' && blob.size > 0 && blob.size <= 500000, 'BLOB_INVALIDE');
    const bytes = Utilities.base64Decode(blob.content.replace(/\s/g, ''));
    const header = Utilities.newBlob('blob ' + bytes.length + '\x00').getBytes();
    maintRequire_(bytes.length === blob.size && maintHex_(Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_1, header.concat(bytes))) === entry.sha, 'BLOB_CORROMPU');
    const source = Utilities.newBlob(bytes).getDataAsString('UTF-8');
    maintRequire_(source.length > 0 && source.indexOf('\ufffd') === -1, 'SOURCE_INVALIDE');
    files.push({ name: name === 'Synchroniseur.gs' ? 'Synchroniseur' : 'appsscript',
      type: name === 'Synchroniseur.gs' ? 'SERVER_JS' : 'JSON', source: source });
  });
  maintRequire_(seen['Synchroniseur.gs'] && seen['appsscript.json'], 'SOURCES_MANQUANTES');
  return maintMaterialize_(files);
}
// Parser de données strict, jamais eval/Function du code distant.
function maintBinding_(source) {
  maintRequire_(source.startsWith(MAINT_HEADER), 'ENTETE_INCONNUE');
  const tail = source.slice(MAINT_HEADER.length);
  const match = /^const REC_DESTINATION = Object\.freeze\(\{\n  scriptId: '([A-Za-z0-9_-]+)',\n  accountEmail: '([A-Za-z0-9_.+@-]+)'\n\}\);\n/.exec(tail);
  maintRequire_(match && (source.match(/const REC_DESTINATION\s*=/g) || []).length === 1,
    'CONFIGURATION_AMBIGUE');
  const binding = { scriptId: match[1], accountEmail: match[2] };
  const template = binding.scriptId === 'A_PERSONNALISER_HORS_GIT' && binding.accountEmail === 'A_PERSONNALISER_HORS_GIT';
  maintRequire_(template || (binding.scriptId !== 'A_PERSONNALISER_HORS_GIT' &&
    /^[A-Za-z0-9_-]{20,200}$/.test(binding.scriptId) &&
    /^[A-Za-z0-9_.+-]+@[A-Za-z0-9.-]+$/.test(binding.accountEmail)), 'CONFIGURATION_INVALIDE');
  return { binding: binding, block: match[0], normalized: MAINT_HEADER + MAINT_TEMPLATE + tail.slice(match[0].length) };
}
function maintEnvelope_(source) {
  MAINT_PROTECTED.forEach(function (expected) {
    maintRequire_(source.split(expected).length === 2, 'ENVELOPPE_MODIFIEE');
    const name = /^(?:const|function) ([A-Za-z_]+)/.exec(expected)[1];
    const declaration = new RegExp('(?:const|let|var|function)\\s+' + name + '\\b', 'g');
    maintRequire_((source.match(declaration) || []).length === 1, 'ENVELOPPE_AMBIGUE');
  });
}
function maintFiles_(files, unbound, initialName) {
  const codeName = unbound ? (initialName || 'Synchroniseur') : (maintEnrollment_().codeName || 'Synchroniseur');
  maintRequire_(['Synchroniseur', 'Code'].indexOf(codeName) !== -1, 'NOM_SOURCE_INVALIDE');
  maintRequire_(Array.isArray(files) && files.length === 2, 'FICHIERS_INVALIDES');
  const seen = {};
  const result = files.map(function (f) {
    maintRequire_(f && ((f.name === codeName && f.type === 'SERVER_JS') ||
      (f.name === 'appsscript' && f.type === 'JSON')) && !seen[f.name] &&
      typeof f.source === 'string' && f.source.length > 0 && f.source.length <= 500000, 'FICHIER_INVALIDE');
    seen[f.name] = true;
    if (f.name === 'appsscript') {
      maintRequire_(maintCanonical_(JSON.parse(f.source)) === maintCanonical_(MAINT_MANIFEST), 'MANIFESTE_NON_APPROUVE');
    } else {
      const parsed = maintBinding_(f.source); maintEnvelope_(f.source);
      if (!unbound) maintRequire_(maintCanonical_(parsed.binding) ===
        maintCanonical_(maintEnrollment_().binding), 'DESTINATION_OU_IDENTITE_MODIFIEE');
    }
    return { name: f.name, type: f.type, source: f.source };
  });
  maintRequire_(seen[codeName] && seen.appsscript && JSON.stringify(result).length <= 1000000, 'FICHIERS_INVALIDES');
  return result.sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; });
}
function maintMaterialize_(files) {
  const checked = maintFiles_(files, true), binding = maintEnrollment_().binding;
  const code = checked.filter(function (f) { return f.name === 'Synchroniseur'; })[0];
  const parsed = maintBinding_(code.source);
  maintRequire_(parsed.block === MAINT_TEMPLATE, 'CANDIDAT_DEJA_PERSONNALISE');
  const block = MAINT_TEMPLATE.replace("scriptId: 'A_PERSONNALISER_HORS_GIT'", "scriptId: '" + binding.scriptId + "'")
    .replace("accountEmail: 'A_PERSONNALISER_HORS_GIT'", "accountEmail: '" + binding.accountEmail + "'");
  code.source = MAINT_HEADER + block + code.source.slice(MAINT_HEADER.length + MAINT_TEMPLATE.length);
  code.name = maintEnrollment_().codeName || 'Synchroniseur';
  return maintFiles_(checked);
}
// Inspection commune : uniquement les deux noms historiques explicites, jamais un alias libre.
function maintInitial_() {
  maintLocalTarget_(); maintMetadata_();
  const response = maintGoogle_('get', '/v1/projects/' + MAINT_DESTINATION.scriptId + '/content');
  maintRequire_(response.scriptId === MAINT_DESTINATION.scriptId, 'CIBLE_INCORRECTE');
  maintRequire_(Array.isArray(response.files), 'FICHIERS_INVALIDES');
  const code = response.files.filter(function (f) { return f && f.type === 'SERVER_JS'; });
  maintRequire_(code.length === 1 && ['Code', 'Synchroniseur'].indexOf(code[0].name) !== -1, 'NOM_SOURCE_INVALIDE');
  const files = maintFiles_(response.files, true, code[0].name);
  const parsed = maintBinding_(files.filter(function (f) { return f.type === 'SERVER_JS'; })[0].source);
  maintRequire_(parsed.block !== MAINT_TEMPLATE &&
    parsed.binding.scriptId !== MAINT_DESTINATION.scriptId && parsed.binding.scriptId !== ScriptApp.getScriptId() &&
    parsed.binding.accountEmail === Session.getEffectiveUser().getEmail(), 'IDENTITE_INITIALE_INCORRECTE');
  const digest = maintHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, parsed.normalized, Utilities.Charset.UTF_8));
  const exact = MAINT_KNOWN_SOURCES.indexOf(digest) !== -1;
  // Reconnaissance initiale seulement : conserver chaque caractère intérieur.
  // Ne pas utiliser trim/\s : seuls SP ASCII, TAB, CR et LF terminaux sont admis.
  const terminal = parsed.normalized.replace(/[ \t\r\n]*$/, '') + '\n';
  const terminalDigest = maintHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, terminal, Utilities.Charset.UTF_8));
  const terminalKnown = MAINT_KNOWN_SOURCES.indexOf(terminalDigest) !== -1;
  return { codeName: code[0].name, binding: parsed.binding, known: exact || terminalKnown,
    terminalNormalizationRequired: !exact && terminalKnown };
}
// Aucun enrôlement, plan, approbation, sauvegarde ou écriture distante.
// Un ajout de diagnostics reste inconnu tant que son contenu exact n'a pas été revu.
function diagnostiquerInstallation() { return maintAction_('DIAGNOSTIC_INITIAL', function () {
  const inspected = maintInitial_();
  return { etat: inspected.known ? 'SOURCE_INITIALE_RECONNUE' : 'REVUE_PRIVEE_REQUISE',
    nomHistoriqueCode: inspected.codeName === 'Code', sourceCompleteConnue: inspected.known,
    normalisationTerminaleNecessaire: inspected.terminalNormalizationRequired };
}); }
// Approbation initiale de la liaison existante, aucune écriture distante.
function initialiserMaintenance() { return maintAction_('INITIALISATION', function () {
  maintLocalTarget_();
  maintRequire_(!maintProps_().getProperty('ENROLLMENT'), 'DEJA_INITIALISE');
  const inspected = maintInitial_();
  maintRequire_(inspected.known, 'SOURCE_INITIALE_NON_RECONNUE');
  maintProps_().setProperty('ENROLLMENT', JSON.stringify({ target: MAINT_DESTINATION.scriptId,
    maintenance: ScriptApp.getScriptId(), binding: inspected.binding, codeName: inspected.codeName }));
  return { etat: 'LIAISON_EXISTANTE_VERROUILLEE' };
}); }
function maintCanonical_(value) {
  if (Array.isArray(value)) return '[' + value.map(maintCanonical_).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(function (key) {
    return JSON.stringify(key) + ':' + maintCanonical_(value[key]);
  }).join(',') + '}';
  return JSON.stringify(value);
}
function maintHex_(bytes) { return bytes.map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join(''); }
function maintHash_(value) { return maintHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
  maintCanonical_(value), Utilities.Charset.UTF_8)); }
function maintDrive_(method, path, body) {
  return maintRequest_('https://www.googleapis.com/drive/v3/files' + path,
    method, ScriptApp.getOAuthToken(), body);
}
function maintBackup_(files) {
  maintFiles_(files);
  const index = JSON.parse(maintProps_().getProperty('BACKUPS') || '[]');
  // Limite volontaire, pas de suppression automatique ni d'oubli d'anciens exports.
  maintRequire_(Array.isArray(index) && index.length < 20, 'ARCHIVER_SAUVEGARDES_AVANT_CONTINUATION');
  const backup = { schema: 1, target: MAINT_DESTINATION.scriptId, files: files, hash: maintHash_(files) };
  const payload = JSON.stringify(backup);
  // Fichier créé par cette application seulement : drive.file, pas d'accès Drive global.
  const created = maintDrive_('post', '?fields=id', { name: 'REC-maintenance-backup-' + Date.now() + '.json',
    mimeType: 'application/json' });
  maintRequire_(created.id && /^[A-Za-z0-9_-]+$/.test(created.id), 'SAUVEGARDE_NON_CREEE');
  maintPrivateBackup_(created.id);
  const response = UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files/' +
    created.id + '?uploadType=media', { method: 'patch', followRedirects: false, muteHttpExceptions: true,
    contentType: 'application/json', headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, payload: payload });
  maintRequire_(response.getResponseCode() === 200, 'SAUVEGARDE_NON_ECRITE');
  maintPrivateBackup_(created.id);
  const read = maintDrive_('get', '/' + created.id + '?alt=media');
  maintRequire_(maintCanonical_(read) === maintCanonical_(backup), 'SAUVEGARDE_NON_VERIFIEE');
  index.push({ key: String(index.length + 1), id: created.id, hash: maintHash_(backup) });
  maintProps_().setProperty('BACKUPS', JSON.stringify(index));
}
function maintSelectedBackupKey_() {
  const index = JSON.parse(maintProps_().getProperty('BACKUPS') || '[]');
  maintRequire_(index.length > 0, 'SAUVEGARDE_ABSENTE');
  return maintProps_().getProperty('RESTORE_BACKUP_KEY') || index[index.length - 1].key;
}
function maintReadBackup_() {
  const index = JSON.parse(maintProps_().getProperty('BACKUPS') || '[]');
  const record = index.filter(function (item) { return item.key === maintSelectedBackupKey_(); })[0];
  maintRequire_(record && /^[A-Za-z0-9_-]+$/.test(record.id), 'SAUVEGARDE_ABSENTE');
  const id = record.id;
  maintPrivateBackup_(id);
  const backup = maintDrive_('get', '/' + id + '?alt=media');
  maintRequire_(backup.schema === 1 && backup.target === MAINT_DESTINATION.scriptId &&
    maintHash_(backup) === record.hash, 'SAUVEGARDE_INCORRECTE');
  backup.files = maintFiles_(backup.files);
  maintRequire_(maintHash_(backup.files) === backup.hash, 'SAUVEGARDE_CORROMPUE'); return backup;
}
function maintPlan_() {
  const raw = maintProps_().getProperty('PLAN'); maintRequire_(raw, 'SIMULATION_REQUISE');
  const plan = JSON.parse(raw);
  maintRequire_(plan.target === MAINT_DESTINATION.scriptId && plan.enrollment === maintHash_(maintEnrollment_()) && Number.isFinite(plan.created) &&
    Date.now() >= plan.created && Date.now() - plan.created < MAINT_TTL, 'PLAN_EXPIRE_OU_INCORRECT');
  if (plan.kind === 'SYNC') maintRequire_(plan.sha === maintProps_().getProperty('CANDIDATE_SHA'), 'SHA_MODIFIE');
  return plan;
}
function maintApproved_(kind) {
  const plan = maintPlan_(); maintRequire_(plan.kind === kind &&
    maintProps_().getProperty('APPROVAL') === maintHash_(plan), 'APPROBATION_REQUISE'); return plan;
}
function maintNoFlight_() { maintRequire_(!maintProps_().getProperty('IN_FLIGHT'), 'RESULTAT_INCERTAIN_VERIFIER_OU_RESTAURER'); }
function maintApply_(files, plan) {
  // Relecture après sauvegarde : réduire la fenêtre de modification concurrente.
  maintConfig_(); maintFiles_(files);
  maintMetadata_(); maintRequire_(maintHash_(maintContent_()) === plan.before, 'MAINT_MODIFIE_AVANT_ECRITURE');
  maintRequire_(maintHash_(maintApproved_(plan.kind)) === maintHash_(plan), 'PLAN_MODIFIE_AVANT_ECRITURE');
  maintProps_().deleteProperty('APPROVAL'); // Consommation AVANT le PUT : jamais de retry silencieux.
  maintProps_().setProperty('IN_FLIGHT', JSON.stringify({ target: plan.target, after: plan.after, enrollment: plan.enrollment }));
  maintGoogle_('put', '/v1/projects/' + MAINT_DESTINATION.scriptId + '/content', { files: files });
  maintRequire_(maintHash_(maintContent_()) === plan.after, 'VERIFICATION_APRES_ECRITURE_ECHOUEE');
  maintProps_().setProperty('LAST_RESULT', JSON.stringify({ target: plan.target, after: plan.after, enrollment: plan.enrollment }));
  maintProps_().deleteProperty('IN_FLIGHT'); maintProps_().deleteProperty('PLAN');
}
function maintAction_(event, operation) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) { console.log('MAINTENANCE OCCUPE'); return { etat: 'REFUSE', code: 'OCCUPE' }; }
  try {
    // Résultats construits localement : états, SHA Git public, nombres, jamais de réponse brute.
    const result = operation(); console.log('MAINTENANCE ' + event + ' ' + JSON.stringify(result)); return result;
  } catch (_) {
    // Aucune exception brute : elle peut contenir URL, en-tête, identité ou réponse API.
    console.log('MAINTENANCE ' + event + ' REFUSE'); return { etat: 'REFUSE', code: 'CONTROLE_ECHOUE' };
  } finally { lock.releaseLock(); }
}

function maintPrivateBackup_(id) {
  const metadata = maintDrive_('get', '/' + id + '?fields=id,permissions(type,role,emailAddress)');
  maintRequire_(metadata.id === id && Array.isArray(metadata.permissions) &&
    metadata.permissions.length === 1 && metadata.permissions[0].type === 'user' &&
    metadata.permissions[0].role === 'owner' &&
    metadata.permissions[0].emailAddress === maintEnrollment_().binding.accountEmail, 'SAUVEGARDE_NON_PRIVEE');
}
