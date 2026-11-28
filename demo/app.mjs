import { renderFinance } from "./finance-view.mjs";
import { createDemo, groups, standard, all } from "./model.mjs";
const demo = createDemo();
let entered = false,
  query = "",
  filter = "all",
  toastTimer;
const main = document.querySelector("main");
const dialog = document.querySelector("dialog");
const esc = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const paths = {
  users:
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  shield:
    '<path d="m12 3 8 4v5c0 5-8 9-8 9s-8-4-8-9V7Z"/><path d="m8 12 3 3 5-6"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  back: '<path d="m12 5-7 7 7 7M5 12h16"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  key: '<circle cx="7" cy="12" r="4"/><path d="M11 12h10m-4 0v3m-3-3v2"/>',
  edit: '<path d="m16 3 5 5-12 12H4v-5Zm-2 2 5 5"/>',
  reset: '<path d="M3 10a9 9 0 1 1 1 8M3 4v6h6M12 7v5l3 2"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3"/>',
  logout: '<path d="M9 4H4v16h5m7-13 5 5-5 5m-8-5h13"/>',
  chart:
    '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 17v-4m4 4V7m4 10v-7"/>',
  transactions: '<path d="M3 7h17m-4-4 4 4-4 4M21 17H4m4-4-4 4 4 4"/>',
  housing: '<path d="M4 21V4h11v17M8 8h3m-3 4h3m-3 4h3m4-7h5v12M2 21h20"/>',
  settings:
    '<path d="m9 3-1 3-3 1 1 3-2 2 2 2-1 3 3 1 1 3h6l1-3 3-1-1-3 2-2-2-2 1-3-3-1-1-3Z"/><circle cx="12" cy="12" r="3"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
};
const icon = (name) =>
  `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.shield}</svg>`;
const initials = (u) =>
  esc(
    u.name
      .split(/\s+/)
      .slice(0, 2)
      .map((s) => Array.from(s)[0])
      .join("")
      .toUpperCase(),
  );
const avatar = (u) =>
  `<span class="avatar ${u.role === "admin" ? "admin" : ""}" aria-hidden="true">${initials(u)}</span>`;
const button = (text, name, action, extra = "") =>
  `<button class="secondary" type="button" data-action="${action}" ${extra}>${icon(name)}${text}</button>`;
function notify(message) {
  const n = document.querySelector("#notice");
  n.textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    n.textContent = "";
  }, 5000);
}
function error(form, err) {
  const box = form.querySelector(".form-error");
  box.textContent = err.message;
  box.focus();
}
function go(route) {
  if (location.hash === `#${route}`) render();
  else location.hash = route;
}
function showDialog(content, onSubmit) {
  const previous = document.activeElement;
  dialog.innerHTML = content;
  dialog.showModal();
  dialog.querySelector("[data-cancel]").onclick = () => dialog.close();
  dialog.querySelector("form").onsubmit = onSubmit;
  dialog.addEventListener(
    "close",
    () => previous?.isConnected && previous.focus(),
    { once: true },
  );
}
function confirmAdmin(onConfirm) {
  showDialog(
    `<form><h2 id="dialog-title">Attribuer le rôle administrateur ?</h2><p>Ce profil fictif accorde tous les droits de démonstration, y compris la gestion des utilisateurs. Aucune donnée réelle n’est accessible.</p><div class="form-footer"><button type="button" class="secondary" data-cancel>Annuler</button><button class="primary" type="submit">Confirmer l’attribution</button></div></form>`,
    (e) => {
      e.preventDefault();
      dialog.close();
      onConfirm();
    },
  );
}
function pinField(label, name, confirm = false) {
  return `<label class="field">${label}<input class="pin" name="${name}" type="password" inputmode="numeric" pattern="[0-9]{6}" minlength="6" maxlength="6" autocomplete="off" required aria-describedby="pin-help" ${confirm ? "" : 'placeholder="••••••"'}></label>`;
}
function reveal(form) {
  const inputs = [...form.querySelectorAll(".pin")];
  const visible = inputs[0].type === "password";
  inputs.forEach((i) => {
    i.type = visible ? "text" : "password";
  });
  const b = form.querySelector("[data-reveal]");
  b.setAttribute("aria-pressed", String(visible));
  b.innerHTML = `${icon("eye")}${visible ? "Masquer" : "Afficher"}`;
}
function shell(route) {
  document.querySelector("#header").innerHTML =
    `<div class="inner"><div class="brand"><img src="assets/logo.svg" alt=""><div>Suivi Dépôt<small>${route === "connexion" ? "Prototype V2" : route === "synthese" ? "Synthèse" : "Utilisateurs"}</small></div></div><span class="badge">Démo</span>${entered ? `<span class="avatar mini" aria-label="Visiteur de démonstration">AD</span><button type="button" class="quiet" data-action="logout" aria-label="Quitter la démonstration">${icon("logout")}</button>` : ""}</div>`;
  document.querySelector("#navigation").innerHTML = entered
    ? [
        ["chart", "Synthèse"],
        ["transactions", "Transactions"],
        ["housing", "Logements"],
        ["users", "Utilisateurs"],
        ["settings", "Paramétrage"],
      ]
        .map(
          ([i, label]) =>
            `<button type="button" ${["users", "chart"].includes(i) ? `data-action="${i === "chart" ? "summary" : "users"}" ${((i === "chart") === (route === "synthese")) ? 'aria-current="page"' : ""}` : 'disabled title="Hors périmètre de ce prototype"'}>${icon(i)}<span class="nav-label">${label}</span></button>`,
        )
        .join("")
    : "";
}
function login() {
  main.innerHTML = `<div class="login"><div class="welcome"><img src="assets/logo.svg" alt=""><h1>Bienvenue sur Suivi Dépôt</h1><p>Espace de gestion financière & immobilière</p><span class="badge">Prototype visuel V2</span></div><form class="card" id="login-form"><div class="form-error" role="alert" tabindex="-1"></div><label class="field">Identifiant fictif<input name="username" autocomplete="off" autocapitalize="none" spellcheck="false" required placeholder="ahmed.admin"></label><div class="pin-header"><strong>Code PIN fictif</strong><button type="button" class="quiet" data-reveal aria-pressed="false">${icon("eye")}Afficher</button></div>${pinField("Code PIN (6 chiffres)", "pin")}<small class="hint" id="pin-help">6 chiffres requis — aucune sécurité réelle</small><button class="primary wide" type="submit">Se connecter ${icon("logout")}</button><div class="panel"><strong>Essayer la démonstration</strong>Identifiant : <b>ahmed.admin</b><br>PIN public : <b>123456</b><br>Ces valeurs servent uniquement à simuler la connexion. Tous les écrans restent fictifs.</div></form><p class="login-foot">${icon("shield")} Aucun accès aux données financières réelles.<br>Les modifications disparaissent au rechargement.</p></div>`;
  const form = main.querySelector("form");
  form.querySelector("[data-reveal]").onclick = () => reveal(form);
  form.onsubmit = (e) => {
    e.preventDefault();
    try {
      const d = new FormData(form);
      demo.enter(d.get("username"), d.get("pin"));
      entered = true;
      go("utilisateurs");
    } catch (err) {
      error(form, err);
    }
  };
}
function card(u) {
  const locked = demo.lastAdmin(u.id);
  return `<article class="card user-card" data-user="${u.id}"><div class="user-heading">${avatar(u)}<div class="identity"><h3>${esc(u.name)}</h3><small>@${esc(u.username)}</small></div><span class="badge ${u.active ? "active" : "inactive"}">● ${u.active ? "Actif" : "Désactivé"}</span></div><span class="badge role ${u.role === "admin" ? "admin" : ""}">${icon(u.role === "admin" ? "shield" : "users")} ${u.role === "admin" ? "Administrateur" : "Utilisateur standard"}</span>${locked ? `<div class="panel protection">${icon("lock")}Dernier administrateur actif (protection activée)</div>` : `<div class="panel"><strong>${u.active ? "Périmètre d’accès fictif" : "Compte fictif désactivé"}</strong>${u.role === "admin" ? "Tous les droits de démonstration" : `${Object.values(u.permissions).filter(Boolean).length} autorisations · ${JSON.stringify(u.permissions) === JSON.stringify(standard()) ? "Profil standard" : "Profil personnalisé"}`}</div>`}<div class="actions">${button("Permissions", "key", "permissions")}${button("Modifier", "edit", "edit")}${button(locked ? "Désactiver verrouillé" : u.active ? "Désactiver" : "Activer le compte", locked ? "lock" : "users", "toggle", locked ? "disabled" : "")}${button("Réinit. PIN", "reset", "reset-pin")}</div></article>`;
}
function results() {
  const list = demo.list(query, filter);
  main.querySelector(".cards").innerHTML = list.length
    ? list.map(card).join("")
    : '<div class="card empty">Aucun utilisateur ne correspond à votre recherche.</div>';
  main.querySelector("#results-count").textContent =
    `${list.length} résultat${list.length > 1 ? "s" : ""}`;
}
function users() {
  main.innerHTML = `<section><div class="page-top"><div><h1>Gestion des utilisateurs</h1><p>Gérez les accès, les rôles et la sécurité des comptes en toute sérénité.</p></div><span class="badge">${demo.users.length} utilisateurs enregistrés</span><button class="primary" type="button" data-action="create">${icon("plus")} Ajouter un utilisateur</button></div><div class="tools"><label class="hint" for="search">Rechercher un utilisateur</label><div class="search">${icon("search")}<input id="search" type="search" placeholder="Rechercher un utilisateur…" value="${esc(query)}"></div><div class="filters" aria-label="Filtrer par statut">${[
    ["all", "Tous", demo.users.length],
    ["active", "Actifs", demo.users.filter((u) => u.active).length],
    ["inactive", "Désactivés", demo.users.filter((u) => !u.active).length],
  ]
    .map(
      ([value, label, n]) =>
        `<button type="button" data-filter="${value}" aria-pressed="${filter === value}">${label} (${n})</button>`,
    )
    .join(
      "",
    )}</div><span id="results-count" class="hint" role="status"></span></div><div class="cards"></div><aside class="card advice">${icon("shield")}<div><strong>Conseil sécurité</strong><p>Les PIN des comptes ne sont pas affichés dans la liste. Utilisez « Réinit. PIN » pour en attribuer un nouveau. Les PIN de ce prototype sont fictifs et ne constituent pas une authentification.</p></div></aside></section>`;
  results();
  main.querySelector("#search").oninput = (e) => {
    query = e.target.value;
    results();
  };
  main.querySelectorAll("[data-filter]").forEach((b) => {
    b.onclick = () => {
      filter = b.dataset.filter;
      main
        .querySelectorAll("[data-filter]")
        .forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      results();
    };
  });
}
function subnav(label) {
  return `<div class="subnav"><button type="button" class="secondary" data-action="users">${icon("back")}Retour</button><span>Utilisateurs › ${label}</span></div>`;
}
function create() {
  main.innerHTML = `<div class="form-page">${subnav("Création")}<h1>Créer un utilisateur</h1><p>Renseignez les informations de base et son premier code PIN fictif.</p><form id="create-form"><div class="form-error" role="alert" tabindex="-1"></div><section class="card"><h2 class="section-title">${icon("users")}Informations personnelles & Connexion</h2><label class="field">Nom complet affiché *<input name="name" maxlength="80" required placeholder="Ex. : Samira Amrani"><span class="hint">Visible par l’équipe fictive</span></label><label class="field">Identifiant de connexion *<input name="username" autocapitalize="none" spellcheck="false" required minlength="3" maxlength="40" pattern="[a-z0-9._\\-]{3,40}" placeholder="Ex. : samira.gestion"><span class="hint">Unique · 3 à 40 lettres minuscules, chiffres, points, tirets ou underscores</span></label></section><section class="card"><div class="pin-header"><h2 class="section-title">${icon("key")}Code PIN de démonstration</h2><button type="button" class="quiet" data-reveal aria-pressed="false">${icon("eye")}Afficher</button></div><div class="form-grid">${pinField("Code PIN (6 chiffres) *", "pin")}${pinField("Confirmation du code PIN *", "confirmation", true)}</div><p class="hint" id="pin-help">6 chiffres identiques dans les deux champs. N’utilisez aucun code personnel.</p><div class="panel">${icon("lock")} Le PIN fictif reste uniquement en mémoire pendant cette démonstration.</div></section><section class="card"><h2 class="section-title">${icon("settings")}Statut & Profil de droits</h2><label class="toggle-row"><span class="copy"><strong>Compte actif</strong><small>L’utilisateur pourra simuler une connexion</small></span><input type="checkbox" name="active" checked role="switch"></label><strong>Profil de permissions initial</strong><div class="role-options"><label class="role-option"><input type="radio" name="role" value="standard" checked><span><strong>Utilisateur standard</strong><small>Recommandé · Consultation synthèse, transactions et biens ; ajout de transactions</small></span></label><label class="role-option"><input type="radio" name="role" value="admin"><span><strong>Administrateur complet</strong><small>Tous les droits fictifs · Confirmation requise</small></span></label></div></section><div class="form-footer"><button type="button" class="secondary" data-action="users">Annuler</button><button class="primary" type="submit">${icon("plus")}Créer l’utilisateur</button></div></form></div>`;
  const form = main.querySelector("form");
  form.querySelector("[data-reveal]").onclick = () => reveal(form);
  form.onsubmit = (e) => {
    e.preventDefault();
    const d = new FormData(form);
    const data = Object.fromEntries(d);
    data.active = d.has("active");
    const save = (confirmed) => {
      try {
        demo.create(data, confirmed);
        query = "";
        filter = "all";
        go("utilisateurs");
        notify("Utilisateur fictif créé avec succès.");
      } catch (err) {
        error(form, err);
      }
    };
    if (data.role === "admin") confirmAdmin(() => save(true));
    else save(false);
  };
}
function permissions(u) {
  let role = u.role,
    draft = { ...u.permissions };
  const locked = demo.lastAdmin(u.id);
  main.innerHTML = `<div class="form-page">${subnav("Permissions")}<h1>Permissions utilisateur</h1><form id="permissions-form"><div class="form-error" role="alert" tabindex="-1"></div><section class="card"><div class="user-heading">${avatar(u)}<div class="identity"><h2>${esc(u.name)}</h2><small>@${esc(u.username)}</small></div><span class="badge" id="profile-label"></span></div><div class="panel"><strong>Rôle global du compte</strong><div class="role-options"><label class="role-option"><input type="radio" name="role" value="standard" ${locked ? "disabled" : ""}>Standard</label><label class="role-option"><input type="radio" name="role" value="admin">Administrateur</label></div><small>${locked ? "Dernier administrateur actif : changement de rôle verrouillé." : "Le rôle Administrateur accorde tous les droits fictifs et nécessite une confirmation."}</small></div></section><aside class="panel"><strong>Principe de sécurité par défaut</strong>Le profil standard permet la consultation de la synthèse, des transactions et des logements, ainsi que l’ajout de transactions. Toute autre autorisation doit être choisie ci-dessous. Ces droits n’ouvrent aucune donnée réelle.</aside>${groups.map(([title, rows], i) => `<section class="card"><h2 class="section-title">${icon(["chart", "transactions", "housing", "settings", "reset"][i])}${i + 1}. ${title}</h2>${rows.map(([key, label, hint]) => `<label class="toggle-row"><span class="copy"><strong class="${key.endsWith("Delete") ? "danger" : ""}">${label}</strong><small>${hint}</small></span><input type="checkbox" role="switch" name="${key}" data-permission="${key}"></label>`).join("")}</section>`).join("")}<div class="form-footer"><button class="primary" type="submit">${icon("shield")}Enregistrer les permissions</button><button type="button" class="secondary" id="restore" ${locked ? "disabled" : ""}>${icon("reset")}Rétablir profil standard</button></div></form></div>`;
  const form = main.querySelector("form");
  function sync() {
    form.querySelectorAll("[name=role]").forEach((i) => {
      i.checked = i.value === role;
    });
    form.querySelectorAll("[data-permission]").forEach((i) => {
      i.checked = draft[i.name];
      i.disabled = role === "admin";
    });
    main.querySelector("#profile-label").textContent =
      role === "admin"
        ? "Administrateur"
        : JSON.stringify(draft) === JSON.stringify(standard())
          ? "Standard"
          : "Personnalisé";
  }
  form.querySelectorAll("[name=role]").forEach((i) => {
    i.onchange = () => {
      role = i.value;
      draft = role === "admin" ? all() : standard();
      sync();
    };
  });
  form.querySelectorAll("[data-permission]").forEach((i) => {
    i.onchange = () => {
      draft[i.name] = i.checked;
      sync();
    };
  });
  form.querySelector("#restore").onclick = () => {
    role = "standard";
    draft = standard();
    sync();
  };
  form.onsubmit = (e) => {
    e.preventDefault();
    const save = (confirmed) => {
      try {
        demo.savePermissions(u.id, role, draft, confirmed);
        notify("Permissions fictives enregistrées.");
        permissions(u);
      } catch (err) {
        error(form, err);
      }
    };
    if (role === "admin" && u.role !== "admin") confirmAdmin(() => save(true));
    else save(false);
  };
  sync();
}
function editUser(u) {
  showDialog(
    `<form><h2 id="dialog-title">Modifier l’utilisateur fictif</h2><div class="form-error" role="alert" tabindex="-1"></div><label class="field">Nom complet<input name="name" required maxlength="80" value="${esc(u.name)}"></label><label class="field">Identifiant<input name="username" required minlength="3" maxlength="40" autocapitalize="none" spellcheck="false" value="${esc(u.username)}"></label><div class="form-footer"><button type="button" class="secondary" data-cancel>Annuler</button><button class="primary" type="submit">Enregistrer</button></div></form>`,
    (e) => {
      e.preventDefault();
      const form = e.target,
        d = new FormData(form);
      try {
        demo.edit(u.id, d.get("name"), d.get("username"));
        dialog.close();
        users();
        notify("Utilisateur fictif modifié.");
      } catch (err) {
        error(form, err);
      }
    },
  );
}
function resetPin(u) {
  showDialog(
    `<form><h2 id="dialog-title">Réinitialiser le PIN fictif</h2><p>${esc(u.name)} · @${esc(u.username)}</p><div class="form-error" role="alert" tabindex="-1"></div>${pinField("Nouveau PIN fictif", "pin")}${pinField("Confirmer le PIN fictif", "confirmation", true)}<small class="hint" id="pin-help">6 chiffres. N’utilisez aucun code personnel.</small><div class="form-footer"><button type="button" class="secondary" data-cancel>Annuler</button><button class="primary" type="submit">Réinitialiser</button></div></form>`,
    (e) => {
      e.preventDefault();
      const form = e.target,
        d = new FormData(form);
      try {
        demo.resetPin(u.id, d.get("pin"), d.get("confirmation"));
        dialog.close();
        notify("PIN fictif réinitialisé en mémoire.");
      } catch (err) {
        error(form, err);
      }
    },
  );
}
function render() {
  if (dialog.open) dialog.close();
  const parts = location.hash.slice(1).split("/");
  if (!entered && parts[0] !== "connexion") {
    location.replace("#connexion");
    return;
  }
  const route = parts[0] || "connexion";
  shell(route);
  if (route === "connexion") login();
  else if (route === "synthese") renderFinance(main, { icon, showDialog, error });
  else if (route === "utilisateurs") users();
  else if (route === "creation") create();
  else if (route === "permissions") {
    try {
      permissions(demo.get(parts[1]));
    } catch {
      go("utilisateurs");
      return;
    }
  } else {
    go(entered ? "utilisateurs" : "connexion");
    return;
  }
  document.title = `${{ connexion: "Connexion", synthese: "Synthèse financière", utilisateurs: "Utilisateurs", creation: "Créer un utilisateur", permissions: "Permissions" }[route]} — Suivi Dépôt · Démonstration`;
  window.scrollTo(0, 0);
  main.focus();
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-action]");
  if (!b || b.disabled) return;
  const action = b.dataset.action,
    id = b.closest("[data-user]")?.dataset.user;
  if (action === "logout") {
    entered = false;
    go("connexion");
  }
  if (action === "users") go("utilisateurs");
  if (action === "summary") go("synthese");
  if (action === "create") go("creation");
  if (action === "permissions") go(`permissions/${id}`);
  if (action === "toggle") {
    try {
      demo.toggle(id);
      users();
      notify("Statut fictif mis à jour.");
    } catch (err) {
      notify(err.message);
    }
  }
  if (action === "edit") editUser(demo.get(id));
  if (action === "reset-pin") resetPin(demo.get(id));
});
window.addEventListener("hashchange", render);
render();
