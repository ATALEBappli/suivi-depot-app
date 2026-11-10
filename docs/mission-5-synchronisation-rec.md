# Mission 5 — Préparation de la synchronisation REC

## État et limites

Méthode validée : compte Google dédié disposant uniquement des accès REC.
Cette PR n'autorise aucune connexion Google. Aucun OAuth, accès Google,
identifiant réel, envoi, exécution distante ou déploiement n'est nécessaire pour
ses tests. Aucun workflow d'envoi n'est ajouté. Aucun comportement métier changé.

Base examinée : `main` au commit `ed75e8d` (Missions 1 à 4 fusionnées).
Les sources exécutables complètes versionnées sont `apps-script/src/Code.gs`
et `appsscript.json` : points d'entrée GET/POST, helpers et manifeste V8,
sans bibliothèque externe déclarée. `README.md` n'est pas une source à envoyer.
Cela ne certifie pas le contenu, les déclencheurs ni les permissions du projet Google.

Node 24 convient. Au contrôle initial : Node 24.22.1, npm 11.9.0, clasp absent.
Le paquet publié `@google/clasp@3.4.1` requiert Node >=20 ; cette version est la
référence proposée, à installer seulement lors d'une mission de raccordement
validée, dans un espace privé hors checkout (pas de dépendance frontend).
Aucune installation ni authentification effectuée pour cette PR.

## Premier raccordement — opérations manuelles futures

Attendre l'autorisation du propriétaire avant chacune des phases Google.

1. Le propriétaire partage **uniquement** `SuiviDepotAPI-REC` (éditeur) et
   `Suivi Dépôt REC` (éditeur pour les futurs tests d'exécution) avec le compte
   dédié. Aucun accès PROD, direct, par groupe ou par dossier partagé. Vérifier
   dans le projet autonome REC que `SPREADSHEET_ID` pointe vers le classeur fictif.
   Ne pas communiquer sa valeur dans le chat, Git, une PR ou les journaux.
2. Activer l'API Apps Script dans les paramètres Apps Script du compte dédié.
   Avec un client OAuth personnel, activer aussi Apps Script API dans son projet
   Cloud ; créer un client de type application de bureau si nécessaire. Les API
   Drive, Logging ou Service Usage ne sont pas requises par notre préparation.
3. Vérifier la politique réseau et autoriser les hôtes réellement nécessaires :
   `accounts.google.com`, `oauth2.googleapis.com`, `script.googleapis.com`, puis
   les éventuelles destinations additionnelles identifiées. Ces hôtes n'étaient
   pas autorisés lors de la préparation. Ne pas contourner le proxy ni TLS.
4. Installer la version fixée dans un dossier privé ; contrôler sa version et son
   aide. La connexion standard demande davantage que `script.projects`, notamment
   des portées de déploiement, Drive et gestion Cloud. Examiner le consentement.
   Un client OAuth dédié et des portées réduites peuvent être étudiés séparément ;
   leur fonctionnement n'a pas été testé. Ne pas présenter la portée
   `script.projects` comme limitée à REC : elle couvre les projets accessibles
   au compte. L'isolation des accès du compte est indispensable.
5. Enregistrer en privé la politique REC et la liaison ci-dessous, séparément,
   après vérification du **Script ID** dans les paramètres du projet REC (ce n'est
   ni l'identifiant du classeur ni celui d'un déploiement). Faire relire leur
   concordance par le propriétaire. Ne jamais rechercher ou enregistrer l'ID PROD.

La synchronisation de sources ne lit/écrit pas Sheets et ne copie pas les
propriétés de script. Les autorisations Sheets ne seront nécessaires qu'à une
exécution fonctionnelle ultérieure, séparément autorisée.

## Téléphone et authentification : décision encore en attente

Le code publié de clasp 3.4.1 prévoit `login --no-localhost` : ouverture du lien
sur le téléphone, puis saisie de **l'URL de retour complète** dans l'invite privée
clasp. La redirection localhost peut afficher une erreur sur le téléphone ;
le flux sans serveur attend cette URL et vérifie son paramètre state.
Ce n'est pas l'ancien flux OAuth OOB et ce n'est pas un code à envoyer dans le chat.

Une interface de terminal réellement privée, non enregistrée dans le chat et
accessible sur téléphone, doit être vérifiée avant ce choix. Ni la réussite de
Google OAuth ni cette interface mobile n'ont été testées dans cette mission.
Ne pas utiliser une commande dont la sortie collecte le code OAuth dans la
conversation. Les jetons restent hors checkout, hors journaux et hors GitHub.
L'option sans localhost ne résout pas à elle seule ce problème de confidentialité.

**Alternative si cette interface n'est pas sûre ou disponible :** effectuer la
connexion du compte dédié dans un terminal de confiance (ordinateur personnel,
ou terminal Cloud contrôlé par le propriétaire, accessible depuis le téléphone).
Stocker le justificatif obtenu dans un coffre de secrets protégé de
l'environnement d'exécution, jamais dans GitHub ni dans la conversation. Après
validation, le monter comme fichier privé hors checkout pour clasp, en vérifiant
les options et emplacements de cette version. Pas de jeton dans un argument de
commande ni de fichier temporaire public. Prévoir révocation, rotation et
suppression des fichiers en fin de session. Un refresh token reste un secret
puissant ; son périmètre REC repose sur le compte dédié. Pas de compte de service
ou de fédération supposés compatibles sans essai distinct.

L'usage courant depuis le téléphone se limite ensuite à lire le rapport et à
donner une validation explicite dans Codex. Aucun terminal mobile local requis.
Aucune de ces alternatives n'est activée par la présente PR.

## Préparation locale, sans connexion

Le script `scripts/prepare-rec-sync.mjs` n'importe aucun client réseau et ne lance
aucun sous-processus. Il ne connaît ni mot de passe ni jeton. Il ne contient
aucune commande d'envoi. Il exige une sauvegarde pour toute nouvelle préparation.

Créer un dossier privé **hors checkout**, parent existant de la sortie, permissions
`0700`. Les quatre entrées doivent être des fichiers réguliers non symboliques,
permissions `0600`, hors checkout. Utiliser des chemins absolus. Les exemples
ci-dessous sont des structures fictives, pas des configurations utilisables.

Politique privée `rec-policy.json` :

```json
{"environment":"REC","scriptId":"FICTIF_REMPLACER_EN_PRIVE","title":"SuiviDepotAPI-REC"}
```

Liaison privée `rec-binding.json` (adapter le chemin à chaque nouveau dossier) :

```json
{"scriptId":"FICTIF_REMPLACER_EN_PRIVE","rootDir":"/CHEMIN_PRIVE/revue-unique/src"}
```

Les deux autres entrées sont des réponses JSON **brutes**, obtenues ultérieurement
par un client API authentifié privé, uniquement après autorisation de lecture REC :

- `GET https://script.googleapis.com/v1/projects/{SCRIPT_ID_REC}` → `metadata.json`.
  Vérifier le nom, l'identifiant et l'absence de `parentId` (projet autonome).
- `GET https://script.googleapis.com/v1/projects/{SCRIPT_ID_REC}/content` →
  `backup.json`, contenant `scriptId` et tous les `files` avec `name`, `type`,
  `source`, dont le manifeste `appsscript` de type `JSON`.

Aucune commande API authentifiée n'est fournie ou exécutée ici. Son raccordement
sécurisé reste à valider. `clasp pull`/`clone` dans un dossier vide privé peuvent
servir à une comparaison complémentaire, mais ne produisent pas ces réponses
JSON brutes et ne remplacent pas les entrées attendues. Ne jamais faire pull
sur les sources Git ni sur le dossier candidat.

Exemple de préparation, depuis la racine du dépôt, avec les chemins privés réels :

```sh
node scripts/prepare-rec-sync.mjs \
  --policy /CHEMIN_PRIVE/rec-policy.json \
  --binding /CHEMIN_PRIVE/rec-binding.json \
  --metadata /CHEMIN_PRIVE/metadata.json \
  --backup /CHEMIN_PRIVE/backup.json \
  --out /CHEMIN_PRIVE/revue-unique
```

Une sortie existante est refusée. La sortie contient une sauvegarde distante
brute, ses métadonnées, une copie des deux sources, la liaison privée et
`review.json` avec empreintes SHA-256 et état `STOP_BEFORE_PUSH`. Aucun README,
modèle ou secret n'est copié parmi les sources. Les erreurs CLI ne reproduisent
pas les entrées privées. En cas d'échec d'écriture partielle, abandonner ce dossier
et recommencer avec une nouvelle sortie ; ne pas le considérer comme validé.

## Avant chaque envoi futur : arrêt obligatoire

1. Vérifier indépendamment le compte REC connecté et ses accès. Ne pas lister
   les projets d'un compte personnel disposant d'accès PROD.
2. Refaire les deux lectures REC ci-dessus immédiatement avant la préparation,
   conserver leurs réponses en privé et vérifier la cible. Ni le nom seul, ni
   un hash, ni un fichier local ne prouvent l'identité du compte ou la fraîcheur
   du serveur. Le script vérifie seulement la cohérence des entrées fournies.
3. Exécuter les tests hors réseau, noter le commit Git et préparer un dossier neuf.
   Comparer tous les fichiers distants sauvegardés aux candidats, y compris les
   suppressions : un envoi Apps Script remplace l'ensemble du contenu distant.
4. Dans ce dossier privé seulement, examiner les fichiers avec `clasp status`
   (ou l'alias de la version fixée). Cela ne valide ni les permissions ni la cible.
   Vérifier les hashes, la liaison, le compte et que les sources n'ont pas changé.
5. **ARRÊT. Présenter au propriétaire la cible REC, le commit, le diff et la preuve
   de sauvegarde, sans exposer les IDs/secrets. Attendre son accord spécifique.**
   La présente mission interdit toujours tout envoi. Aucun script ne transforme
   une réponse dans le chat en commande d'envoi. Aucun `--force`, `--watch`,
   déclencheur d'envoi, création de projet ou déploiement.
6. Après une future autorisation distincte, l'opérateur devra refaire les contrôles
   si le code distant/local a changé ou si la revue a attendu. La sauvegarde permet
   un retour arrière futur, lui aussi soumis à autorisation ; aucun rollback
   automatique. Un push peut affecter le code de tête même sans déploiement.

Ce mécanisme impose un arrêt dans le parcours fourni ; il ne peut empêcher un
opérateur disposant de clasp et de ses droits de contourner ce parcours.

## Tests de cette mission et recette ultérieure

```sh
node scripts/check-js.mjs
node scripts/check-apps-script.mjs
node tests/isolation.mjs
node tests/rec-sync.mjs
git diff --check
```

Les tests REC utilisent exclusivement des réponses fictives locales. Ils couvrent
le succès sans envoi, les divergences d'identifiant, le mauvais nom/environnement,
un projet lié, une sauvegarde absente/incomplète, les doublons, les chemins,
permissions, liens symboliques, sources inattendues/vides et le refus d'écraser une
sauvegarde. Aucun compte, OAuth ou appel Google requis. À exécuter explicitement ;
aucun nouveau workflow n'est installé par cette PR.

Après autorisation ultérieure d'un envoi REC : relire le contenu distant dans un
nouvel espace et comparer noms/types/sources aux candidats (tenir compte des
normalisations de fins de ligne), vérifier que les propriétés REC ont été
conservées. Ces tests de transport n'exigent pas de déploiement ni d'exécution.

Les tests fonctionnels Sheets sont une étape séparée : vérifier de nouveau la
propriété REC et les données fictives avant toute exécution. Les lectures
historiques peuvent créer des onglets et les sauvegardes de configuration utilisent
`clearContents()`. Le manifeste conserve l'accès anonyme avec identité du déployeur,
sans authentification métier ; il ne doit pas motiver un déploiement dans cette
mission. Ne pas lancer l'interface racine, qui peut appeler PROD.

Automatisation future possible : contrôles hors ligne et préparation de rapport.
Pas d'envoi sur fusion ou push Git. Toute intégration de secrets, authentification,
écriture distante ou automatisation supplémentaire demande une validation séparée.

Références : [guide clasp](https://developers.google.com/apps-script/guides/clasp),
[paquet clasp](https://www.npmjs.com/package/@google/clasp),
[API projects](https://developers.google.com/apps-script/api/reference/rest/v1/projects),
[API getContent](https://developers.google.com/apps-script/api/reference/rest/v1/projects/getContent).
