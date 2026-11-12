# Mission 12 — Prototype UI Suivi Dépôt V2

## Périmètre livré

Quatre écrans issus des références Stitch : connexion simulée, utilisateurs, création et permissions. HTML/CSS/JavaScript statiques, sans framework, dans la continuité de l’architecture du dépôt. Répertoire `demo/` indépendant : les scripts historiques déclenchent des accès externes et ne peuvent pas être réutilisés dans ce prototype isolé. Aucune modification des fichiers applicatifs historiques, des trois backends, des configurations ou des déploiements REC/PROD.

Les fichiers joints ont été lus comme références de présentation. Leurs scripts de simulation, ressources CDN, messages de blocage de sécurité et synchronisation n’ont pas été repris comme spécification d’authentification réelle. Les instructions de la mission priment. Titres Plus Jakarta Sans, textes Inter, polices embarquées sous SIL OFL ; icônes SVG et avatars locaux ; libellé Transactions ; palette marine/blanc/bleu clair/vert.

### Interactions

- Entrée par `ahmed.admin` / `123456` (valeurs publiques exclusivement fictives). Les trois comptes initiaux utilisent ce même PIN, dont un compte désactivé.
- Recherche nom/identifiant, filtres de statut, compteurs et état vide.
- Création avec validation du nom, unicité de l’identifiant et PIN numérique de six chiffres confirmé ; choix actif/inactif et profil initial.
- Modification fictive du nom/identifiant, activation/désactivation, réinitialisation du PIN par modale.
- Douze droits personnalisables ; sauvegarde en mémoire et rétablissement du profil standard.
- Un profil standard avec tous les droits cochés reste standard : aucune promotion implicite.
- Confirmation avant création/promotion administrateur ; annulation sans mutation du compte.
- Dernier administrateur actif protégé contre désactivation et rétrogradation, dans l’interface et dans le modèle de simulation, y compris en présence d’un autre administrateur inactif.
- Retours, historique navigateur, déconnexion, succès et erreurs accessibles. Les rubriques métier hors mission restent visuellement désactivées, sans destination réelle.

## Isolation

État uniquement en mémoire, recréé au rechargement. Aucun cookie de session, stockage persistant, API d’authentification, appel Google Sheets/Apps Script, secret ou identifiant privé. Les PIN ne sont ni sécurisés ni une authentification et ne doivent jamais être réutilisés pour la production. Le parcours simule un visiteur de démonstration ; les rôles et permissions édités ne donnent accès à aucune ressource métier.

CSP dans le HTML et en en-tête du serveur dédié : `connect-src 'none'`, scripts/styles/polices/images locaux, formulaires externes et workers interdits. Le serveur ne sert que `demo/`, jamais la racine du dépôt ; les chemins du frontend historique et des backends renvoient 404. Aucun service worker du prototype. Utiliser l’origine locale dédiée indiquée ci-dessous pour éviter un ancien cache PWA de l’application historique.

## Tester gratuitement sur PC et iPhone

Aucune publication REC n’est nécessaire pour ce test. Installer Node.js 24 sur le PC, récupérer cette branche depuis la PR (GitHub : Code → Download ZIP après sélection de la branche, puis extraire), ouvrir un terminal dans le dossier :

```sh
node scripts/serve-demo.mjs --lan
```

- PC : ouvrir `http://localhost:4173`.
- iPhone sur le même Wi-Fi : ouvrir dans Safari `http://ADRESSE_IP_LOCALE_DU_PC:4173`. Trouver cette adresse dans les paramètres réseau du PC (ou `ipconfig` sous Windows). Le PC doit rester allumé et le serveur actif. Si le pare-feu demande, autoriser Node sur le réseau privé uniquement.
- Saisir `ahmed.admin` et le PIN de démonstration `123456`.
- Arrêter le serveur avec Ctrl+C. Sans `--lan`, il écoute uniquement sur le PC.

Parcours conseillé : filtrer Karim, créer un utilisateur standard, modifier ses droits, revenir vérifier, le désactiver/réactiver, changer son PIN, essayer une promotion puis annuler/confirmer ; vérifier le verrou du dernier administrateur ; recharger pour retrouver les trois comptes initiaux.

Si un test par lien distant est souhaité ultérieurement, une publication statique REC séparée devra faire l’objet d’une autorisation : choisir un hébergement gratuit et une origine distincte, publier exclusivement le contenu de `demo/`, vérifier la CSP et l’absence d’appels externes, communiquer l’URL. Aucune publication réalisée, aucun réglage Pages changé, aucune fusion automatique.

## Vérifications exécutées

- `node --test tests/demo.mjs` : **8 tests réussis** (connexion fictive, recherche/filtres, création/validation, confirmation administrateur, dernier administrateur, droits, édition/PIN/état jetable, isolation statique).
- `DEMO_CHROMIUM_PATH=/usr/bin/chromium node tests/demo-browser.mjs` avec serveur local actif : parcours complets réussis sous Chromium, **1440×1000, 390×844 et 320×720**. Quatre écrans contrôlés sans débordement horizontal, captures revues ; création, erreurs PIN, confirmation/annulation, sauvegarde/restauration des droits, statut, édition, PIN, historique et rechargement testés. **Aucune requête externe, aucune ressource en erreur et aucune erreur JavaScript/console** pendant ces parcours. Requêtes distinctes aux chemins protégés : 404 attendus.
- `node scripts/check-js.mjs` : syntaxe de l’ensemble des sources contrôlée sans exécuter l’application historique.
- `node tests/isolation.mjs`, `node scripts/check-apps-script.mjs`, `node tests/rec-sync.mjs`, `node tests/rec-synchronisation.mjs`, `node tests/rec-maintenance.mjs` : réussis sur mocks, hors réseau ; 84 scénarios backend, 46 synchroniseur, 135 maintenance, et contrôles d’isolation/préparation.
- `git diff --check` : réussi. Comparaison avec la base : uniquement des ajouts pour la démonstration, ses tests, son serveur et sa documentation.

Les tests responsive Chromium ne prouvent pas la compatibilité sur un iPhone physique. WebKit n’est pas installé ; le téléchargement Playwright est refusé par la politique réseau (`cdn.playwright.dev`, HTTP 403 Domain forbidden). Le contrôle Safari sur appareil reste à effectuer par le parcours ci-dessus. Aucun test fonctionnel sur l’ancienne interface reliée à Google n’a été lancé ; sa préservation repose sur l’absence de modification et les suites hors réseau existantes.

### Reproduire les tests navigateur

Playwright est uniquement un outil de test, sans dépendance navigateur à l’exécution du prototype. Utiliser une installation de développement accessible à Node (`playwright`), puis ses navigateurs officiels (`playwright install chromium webkit`). Lancer le serveur dans un autre terminal, puis :

```sh
node tests/demo-browser.mjs
```

`DEMO_CHROMIUM_PATH` permet de sélectionner un Chromium déjà installé. `DEMO_WEBKIT=1` ajoute deux parcours WebKit (390 et 320 px) lorsqu’il est disponible. Captures générées sous `work/demo-screenshots/` (ignorées par Git). Le workflow ajouté exécute uniquement les tests du modèle sans installation npm, ni déploiement.
