// Démonstration uniquement : état jetable, aucun stockage ni authentification réelle.
export const groups = [
  ['Synthèse financière', [['summary', 'Consulter la synthèse', 'Entrées, sorties et solde de trésorerie']]],
  ['Transactions (Recettes & Dépenses)', [['transactionsView', 'Consulter les transactions', 'Historique des transactions'], ['transactionsAdd', 'Ajouter une transaction', 'Encaisser loyer, consigne, enregistrer une dépense'], ['transactionsEdit', 'Modifier une transaction existante', 'Ajuster montant, date ou libellé'], ['transactionsDelete', 'Supprimer une transaction', 'Suppression logique (archivage traçable)']]],
  ['Logements, Locaux & Locataires', [['housingView', 'Consulter les biens & fiches locataires', 'Coordonnées, loyers prévus et baux'], ['housingAdd', 'Ajouter un nouveau bien ou locataire', 'Création d’un nouveau lot ou dossier'], ['housingEdit', 'Modifier les informations des biens', 'Édition des surfaces, loyers et contacts'], ['housingDelete', 'Supprimer un bien ou contrat', 'Suppression logique (archivage traçable)']]],
  ['Paramétrage métier', [['settingsView', 'Consulter les paramètres financiers', 'Catégories de charges et modes de règlement'], ['settingsEdit', 'Modifier la configuration des loyers', 'Changer les seuils et indexations']]],
  ['Historique & Journal d’audit', [['audit', 'Consulter le journal d’audit', 'Traçabilité complète des actions système']]]
];
export const keys = groups.flatMap(([, rows]) => rows.map(([key]) => key));
export const standard = () => Object.fromEntries(keys.map(k => [k, ['summary', 'transactionsView', 'transactionsAdd', 'housingView'].includes(k)]));
export const all = () => Object.fromEntries(keys.map(k => [k, true]));
export function createDemo() {
  let sequence = 3;
  const users = [
    { id: '1', name: 'Ahmed Benali', username: 'ahmed.admin', pin: '123456', active: true, role: 'admin', permissions: all() },
    { id: '2', name: 'Karim Mansouri', username: 'karim.gestion', pin: '123456', active: true, role: 'standard', permissions: standard() },
    { id: '3', name: 'Mohammed Tazi', username: 'm.tazi', pin: '123456', active: false, role: 'standard', permissions: standard() }
  ];
  const get = id => { const u = users.find(u => u.id === id); if (!u) throw Error('Utilisateur fictif introuvable.'); return u; };
  const lastAdmin = id => { const u = get(id); return u.active && u.role === 'admin' && users.filter(u => u.active && u.role === 'admin').length === 1; };
  const validatePin = (pin, confirmation) => {
    if (!/^\d{6}$/.test(pin)) throw Error('Le PIN doit contenir exactement 6 chiffres.');
    if (pin !== confirmation) throw Error('Les deux codes PIN ne correspondent pas.');
  };
  return {
    users, get, lastAdmin,
    list(query = '', filter = 'all') {
      const q = query.trim().toLocaleLowerCase('fr');
      return users.filter(u => `${u.name} ${u.username}`.toLocaleLowerCase('fr').includes(q) && (filter === 'all' || u.active === (filter === 'active')));
    },
    enter(username, pin) {
      const u = users.find(u => u.username === username.trim().toLowerCase() && u.pin === pin && u.active);
      if (!u) throw Error('Identifiant ou PIN fictif incorrect, ou compte désactivé.');
      return u;
    },
    create({ name, username, pin, confirmation, active, role }, confirmed = false) {
      name = name.trim(); username = username.trim().toLowerCase();
      if (!name || name.length > 80) throw Error('Renseignez un nom de 1 à 80 caractères.');
      if (!/^[a-z0-9._-]{3,40}$/.test(username)) throw Error('Identifiant : 3 à 40 lettres minuscules, chiffres, points, tirets ou underscores.');
      if (users.some(u => u.username === username)) throw Error('Cet identifiant fictif existe déjà.');
      validatePin(pin, confirmation);
      if (!['standard', 'admin'].includes(role)) throw Error('Profil invalide.');
      if (role === 'admin' && !confirmed) throw Error('Confirmez l’attribution du rôle administrateur.');
      const u = { id: String(++sequence), name, username, pin, active: !!active, role, permissions: role === 'admin' ? all() : standard() };
      users.push(u); return u;
    },
    edit(id, name, username) {
      name = name.trim(); username = username.trim().toLowerCase();
      if (!name || name.length > 80) throw Error('Renseignez un nom de 1 à 80 caractères.');
      if (!/^[a-z0-9._-]{3,40}$/.test(username)) throw Error('Identifiant fictif invalide.');
      if (users.some(u => u.id !== id && u.username === username)) throw Error('Cet identifiant fictif existe déjà.');
      Object.assign(get(id), { name, username });
    },
    toggle(id) { const u = get(id); if (lastAdmin(id)) throw Error('Le dernier administrateur actif est protégé.'); u.active = !u.active; },
    resetPin(id, pin, confirmation) { validatePin(pin, confirmation); get(id).pin = pin; },
    savePermissions(id, role, permissions, confirmed = false) {
      const u = get(id);
      if (!['standard', 'admin'].includes(role)) throw Error('Profil invalide.');
      if (lastAdmin(id) && role !== 'admin') throw Error('Le dernier administrateur actif est protégé.');
      if (role === 'admin' && u.role !== 'admin' && !confirmed) throw Error('Confirmez l’attribution du rôle administrateur.');
      if (keys.some(k => typeof permissions[k] !== 'boolean')) throw Error('Permissions incomplètes.');
      u.role = role; u.permissions = role === 'admin' ? all() : Object.fromEntries(keys.map(k => [k, permissions[k]]));
    }
  };
}
