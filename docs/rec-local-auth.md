# REC : comptes locaux, saisie et migration depuis OAuth

## Périmètre et état

Cette évolution prépare l’interface unique REC sur le Worker existant. Aucun accès Google réel, déploiement, changement de secret, activation du backend ou import n’est effectué par sa préparation. PROD et DZKoora sont hors périmètre. Le reçu pending `gha-43927899195` reste inchangé ; sa réconciliation demeure une opération séparée.

La page `/` utilise la nouvelle interface lorsque `REC_AUTH_MODE=local`. Synthèse, Saisie, Paramétrage et Mon compte sont sur la même origine. Le référentiel US-015 existant est réutilisé dans Paramétrage, y compris listes configurables, normalisation, ajout/modification distincts et imports Excel/CSV/JSON avec simulation, conflits et confirmation. Les cautions restent les informations contractuelles implémentées dans US-015 : aucun mouvement de caution n’est inventé.

La nouvelle synthèse concerne uniquement les opérations de **test REC du nouveau journal**. Elle n’agrège pas les transactions historiques. Les sources et assets de l’ancienne interface et l’authentification OAuth restent présents pour un retour contrôlé ; ils ne sont pas une seconde source de comptes active en mode local.

## Architecture et frontières de confiance

Navigateur → Worker → Durable Object `RecAuth` existant (SQLite) → requêtes HMAC → Apps Script REC → Sheets REC.

- Aucun utilisateur ne doit disposer d’un compte Google. L’identifiant est un nom applicatif, pas une adresse Google. Le propriétaire Google conserve seul l’accès au stockage.
- Les comptes sont dans `local:user:<sha256(nom)>`, les sessions dans `local:session:<sha256(jeton)>` et les limitations dans `local:rate:<sha256(clé)>`. Aucun de ces stockages n’est servi par HTTP. Les clés OAuth existantes sont conservées dans leur espace distinct.
- `REC_BOOTSTRAP_ADMIN` est un secret Cloudflare contenant un **dérivé salé** et l’identité du premier admin. Il n’est jamais renvoyé au navigateur ni ajouté à un artefact. L’initialisation atomique n’a lieu qu’une fois dans le DO ; un changement ultérieur du secret ne réinitialise pas le compte. Aucune inscription publique, aucun compte par défaut.
- **Alternative iPhone sans terminal** : le propriétaire génère localement un jeton cryptographiquement aléatoire de 32 octets (64 caractères hexadécimaux), puis le colle directement dans le secret Cloudflare REC `REC_BOOTSTRAP_SETUP_TOKEN` et dans le formulaire sur Safari. Le Worker compare le jeton sans l'exposer, limite les essais et crée atomiquement le premier administrateur avec son mot de passe dérivé PBKDF2 côté serveur. Sans jeton privé, toute création est refusée ; après initialisation, toute nouvelle création initiale est refusée, même avec le même jeton. Ne jamais réutiliser la clé HMAC ou le secret OAuth pour ce jeton. Supprimer le secret d'installation après avoir confirmé la connexion. Éviter captures d'écran, liens URL, notes partagées et journaux.
- PBKDF2-HMAC-SHA256 natif : **600 000 itérations, sel aléatoire de 32 octets, résultat 32 octets**. Minimum 15 caractères, maximum 128 caractères / 512 octets ; aucun trim du mot de passe. Vérification à coût comparable pour un identifiant absent et comparaison constante du dérivé. Aucun mot de passe en clair persistant. L’entrée reste transitoirement en mémoire pendant le traitement, jamais dans les logs.
- Choix PBKDF2 : pas de dépendance Argon2/WASM supplémentaire ; le runtime Workers avec `nodejs_compat` exécute le PBKDF2 natif dans le Durable Object. Le test workerd/SQLite vérifie réellement les 600 000 itérations. Le calcul n’est pas fait dans le Worker d’entrée limité en CPU. Références : [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [limites DO](https://developers.cloudflare.com/durable-objects/platform/limits/).
- Cookie `__Host-rec_session`, `Secure`, `HttpOnly`, `SameSite=Strict`, `Path=/`, durée absolue 15 minutes. Jeton aléatoire 256 bits ; aucune persistance localStorage/sessionStorage. POST JSON avec Origin exact et CSRF aléatoire lié à la session. Aucune autorisation par un champ de formulaire.
- La version du compte et son état sont relus à chaque requête. Modifier rôle, mot de passe ou état invalide les anciennes sessions. Le dernier admin actif ne peut pas être rétrogradé/désactivé. Les modifications sensibles exigent le mot de passe actuel de l’admin ; le changement personnel exige l’ancien mot de passe.
- Limitation persistante 15 minutes : 30 tentatives globales, 10 par IP, 5 par identifiant ; 5 réauthentifications sensibles par compte. Les réponses d’échec de connexion ne distinguent pas un compte inconnu d’un mauvais mot de passe. Les enregistrements expirés sont purgés ; limites de 100 comptes et 500 sessions.
- En mode local, `/api`, `/auth/*`, `/oauth/callback` sont fermés, même si les secrets OAuth sont encore présents. Il n’existe pas de conversion automatique d’un email OAuth en compte local.

### Autorisations indépendantes

| Opérations | Lecteur | Gestionnaire | Admin |
| --- | --- | --- | --- |
| Référentiel, synthèse de test, état REC | Oui | Oui | Oui |
| Prévisualisation et saisie financière de test | Non | Oui | Oui |
| Simulation/import/modification du référentiel | Non | Non | Oui |
| Configuration catégories / sous-catégories | Non | Non | Oui |
| Gestion utilisateurs | Non | Non | Oui |

Le Worker vérifie les actions et rôles avant tout appel Google. Apps Script vérifie séparément la même matrice. Les actions historiques de création de test restent réservées à l’admin.

Le transport local utilise une enveloppe HMAC **version 2** contenant `{id, role, authVersion}`, l’action, l’horodatage et un nonce 256 bits. Apps Script exige simultanément `REC_AUTH_MODE=local` et `REC_LOCAL_AUTH_ENABLED=1`, vérifie signature, fraîcheur, nonce et empreintes du projet/classeur REC. L’ancienne enveloppe OAuth version 1 est alors refusée. L’auteur du journal est `local:<UUID>` ; aucun email Google fictif n’est généré.

Apps Script ne possède pas une copie modifiable de la base des comptes : il fait confiance à l’identité/au rôle attestés par le Worker détenteur du HMAC et applique sa propre autorisation d’action. La compromission de cette clé permettrait l’usurpation d’un rôle ; conserver la clé côté serveur et restreindre les éditeurs Cloudflare/Apps Script reste indispensable. L’anti-rejeu CacheService existant est temporaire et peut être évincé ; les requestId persistants et les révisions empêchent les doubles écritures des journaux même après une interruption.

Le bundle Apps Script doit impérativement être produit avec le **transport signé** existant (`gatewayTransport=true`) avant toute ouverture du point HTTP. Il bloque les accès directs HTTP/JSONP/RPC hérités. Ne jamais rendre anonyme une ancienne version sans ces contrôles. Les empreintes REC des trois ressources restent inchangées ; aucune cible de repli PROD.

## Données et saisie

Activités fixes : Dépôt locatif, HEADM — Construction, Charges communes, Famille / Divers. Catégories et sous-catégories configurables par admin ; interface JSON explicite pour cette première version. La catégorie technique `loyer`, si conservée, reste attachée au Dépôt et impose une entrée, un logement existant, une période mensuelle et un mode de paiement. Le locataire est dérivé côté serveur du logement, jamais accepté du navigateur. Dates d’opération et périodes sont saisies explicitement ; dates d’arrivée/de départ et cautions ne sont pas inventées.

Lectures via `rec.reference` : contrat historique des logements tant que V2 est inactive, puis projection V2 existante après activation distincte. Aucun nouveau référentiel parallèle modifiable.

`finance.preview` normalise et valide montant/date/références puis renvoie un hash lié à la révision. `finance.write` exige cette empreinte, la révision et un requestId stable. Le bouton confirme explicitement l’aperçu. Une réponse interrompue peut être rejouée avec le même requestId, corps, révision et empreinte ; ne pas inventer un nouvel identifiant pour la même tentative incertaine.

Les seules nouvelles écritures sont des événements dans `rec_finance_commits` (request_id, payload_json, created_at, actor), créés **seulement lors de la première écriture autorisée**. Événements `catalog` ou `transaction`, verrou du script, contrôle du schéma, idempotence et révision. Chaque transaction porte `environment:REC` et `testOnly:true`. Aucun remplacement de ligne historique. `REC_FINANCE_ENABLED=1` est une autorisation supplémentaire indépendante dans Apps Script ; les lectures et simulations ne créent pas d’onglet. V2 reste contrôlée par `REFERENTIEL_V2=1`, jamais activée automatiquement.

## Préparation reproductible, sans Google

```sh
node rec-worker/prepare.mjs /chemin/checkout-suivi-depot-demo 8cee35c60b77ee4cd01960990c4ad937cf52d2d9
node --test tests/rec-automation/*.test.mjs tests/rec-server/*.test.mjs tests/rec-worker/*.test.mjs
node tests/rec-worker/local-mobile.mjs
node scripts/check-js.mjs
WRANGLER_SEND_METRICS=false node rec-worker/node_modules/wrangler/bin/wrangler.js deploy --config rec-worker/wrangler.jsonc --dry-run --outdir /tmp/rec-local-build
```

Le répertoire de sortie frontend doit être neuf. Les assets de `rec-local/` sont ajoutés au manifeste fermé, avec empreinte de chaque fichier. Le SHA frontend existant reste épinglé ; le code local et ses hashes sont liés au SHA de la PR dans le reçu global. Aucun nouveau workflow. Le workflow manuel existant compile, teste, verrouille et vérifie les octets exacts avant une éventuelle publication approuvée.

Le test mobile automatisé utilise Chromium tactile en 390 et 320 px avec vraie authentification workerd/SQLite et données financières simulées. Ce n’est pas une validation Safari réel ni une connexion Google réelle. Le harness interdit les requêtes externes. Exécuter le scénario Safari ci-dessous après mise en service autorisée.

## Mise en service : étapes séparées, toutes soumises à autorisation

1. Revoir et fusionner la PR seulement après validation du propriétaire. Confirmer sauvegardes des sources/configuration REC et conservation de l’URL Apps Script existante. Ne pas traiter le pending historique par un nouveau deploy/restore ; suivre la réconciliation adaptée séparément.
2. Choisir **une seule méthode** d'initialisation privée :
   - **Terminal privé** : générer le dérivé initial hors dépôt avec `node rec-worker/bootstrap-admin.mjs /chemin/prive/admin.private.json`, puis, après autorisation du changement de secret, `wrangler secret put REC_BOOTSTRAP_ADMIN --name suivi-depot-rec < /chemin/prive/admin.private.json` avec le compte Cloudflare REC contrôlé. Ne pas exposer le fichier.
   - **iPhone sans terminal** : générer un **nouveau** jeton aléatoire de 64 caractères hexadécimaux via un générateur cryptographique local, le conserver temporairement dans un coffre privé, puis ajouter dans Cloudflare → Worker `suivi-depot-rec` → Settings → Variables and Secrets (Production) un **Secret**, et non une Variable, nommé `REC_BOOTSTRAP_SETUP_TOKEN`. La valeur ne passe ni dans GitHub ni dans Codex.
3. Après publication du Worker avec backend OFF, ouvrir `https://suivi-depot-rec.amine-taleb.workers.dev/` dans Safari : l'écran « Premier administrateur REC » apparaît uniquement si le secret iPhone existe et qu'aucun compte n'a été initialisé. Saisir le jeton directement sur cette page, choisir un identifiant et un mot de passe unique d'au moins 15 caractères. Confirmer, puis se connecter normalement. Après vérification, **supprimer le secret temporaire** par une action Cloudflare distincte approuvée ; le compte initial persiste. Ce formulaire ne permet jamais la réinitialisation d'un compte existant.
4. Après autorisation distincte de publication, lancer le workflow existant `rec-worker-manual.yml` depuis main avec l’environnement REC. La configuration fixe `REC_AUTH_MODE=local`, `REC_BACKEND_ENABLED=false`, le même Worker et le même DO SQLite. `keep_vars=true` préserve les paramètres OAuth/URL existants et le secret d'initialisation iPhone ; les secrets ne sont pas dans l’artefact. Le contrôle pré/post exige leur conservation et refuse un backend déjà actif. Aucun Google n’est appelé. Vérifier connexion locale, gestion des trois rôles et blocage des fonctionnalités de données. Supprimer ensuite le secret bootstrap par action séparée approuvée une fois le compte persisté et sa connexion contrôlée ; cela ne supprime pas l’admin du DO.
5. Après validation et autorisation distincte, préparer installer le **bundle signé** via l’automatisation Apps Script existante, contrôler hash/version/manifest et sauvegarde ; mise à jour du déploiement existant et de son URL uniquement après résolution du pending approprié. Cette PR ne lance ni install, ni deploy, ni restore. Aucune modification des droits Google ne doit précéder la vérification des protections signées.
6. Après autorisation spécifique des propriétés/permissions, configurer côté Apps Script REC `REC_AUTH_MODE=local`, `REC_LOCAL_AUTH_ENABLED=1`, maintenir les cibles/HMAC contrôlés et laisser `REFERENTIEL_V2`/`REC_FINANCE_ENABLED` désactivés. Vérifier version, anonymat direct refusé, HMAC et cible. Le propriétaire Google reste l’exécutant ; utilisateurs applicatifs sans partage Google.
7. Après autorisation spécifique, activer le raccordement `REC_BACKEND_ENABLED=true` et vérifier les lectures signées avec le compte admin local. Ne pas utiliser le workflow de publication « backend OFF » pour cette activation : il est volontairement bloquant quand le backend est actif. Préparer toute future mise à jour dans un état OFF approuvé.
8. Vérifier l’extraction privée contrôlée des 12 logements (220 000 DA, libellés exacts, dates/cautions vides). Effectuer **simulation uniquement**, vérifier 12 lignes, doublons, anomalies et aucun append. Ne pas versionner l’Excel réel ni ses noms dans les tests.
9. L’import, l’activation de `REFERENTIEL_V2` et les écritures financières `REC_FINANCE_ENABLED=1` nécessitent chacun l’autorisation du propriétaire. Ne pas les déduire de la validation des lectures. Après accord, importer une fois avec révision/requestId et confirmation ; contrôler le journal additif, les 12 logements et l’absence de changement des transactions historiques.

## Recette Safari iPhone après autorisation

- Ouvrir l’URL REC unique existante. Aucun écran Google ne doit être demandé. Se connecter avec le nom/mot de passe applicatifs. Aucune donnée avant connexion.
- Contrôler le message backend OFF avant tout raccordement et l’absence de données Google.
- Créer trois comptes fictifs admin/gestionnaire/lecteur dans Paramétrage ; le dernier admin actif est protégé. Reconnexion après changement de rôle, mot de passe et désactivation ; anciennes sessions refusées, logout puis bouton retour sans accès API.
- Après ouverture des lectures autorisée : Synthèse, 12 logements / 220 000 DA, Paramétrage US-015, simulation Excel/CSV/JSON. Dates et cautions restent vides. Aucune importation pendant cette étape.
- Après autorisation des écritures : création/modification logement/locataire/location, import confirmé, choix des quatre activités, catégories/sous-catégories, loyer avec logement/locataire/période/date/montant/paiement. Vérifier aperçu puis confirmation, lecture seule du lecteur et saisie du gestionnaire sans accès au paramétrage.
- Couper le réseau pendant une confirmation : ne pas relancer avec un nouvel identifiant sans vérifier la synthèse ; une reprise technique garde le même requestId. Contrôler l’absence de double entrée et les historiques intacts.
- Vérifier clavier, labels, défilement, boutons tactiles et absence de débordement en portrait. Safari privé, fermeture/réouverture et expiration de 15 min restent à valider sur appareil réel.

## Limites et récupération

Workers Free et SQLite DO existant : aucun service payant, aucune ressource supplémentaire. Respecter les [quotas Workers](https://developers.cloudflare.com/workers/platform/limits/) et [DO Free](https://developers.cloudflare.com/durable-objects/platform/pricing/). Les limites de connexion protègent la CPU et le stockage mais un attaquant peut provoquer un refus temporaire global ; pas de garantie de disponibilité sous attaque ni de contournement du quota Free.

Le journal financier est relu intégralement : adapté à cette recette, à surveiller avant un volume important. Ni migration de transactions historiques, ni export comptable, ni encaissement/restauration de cautions ne sont ajoutés. Le mot de passe perdu du dernier admin nécessite une récupération privée revue (aucun reset public). Une erreur d’initialisation/DO absent s’arrête fermée ; ne pas recréer ou effacer le namespace pour récupérer un compte.

Un rollback doit d’abord désactiver le backend avec accord, conserver comptes/sessions/journaux et sauvegardes, puis restaurer un bundle approuvé. Réactiver OAuth exige son ancienne allowlist contrôlée et une décision explicite, avec mode cohérent Worker/Apps Script. Ne pas supprimer les comptes locaux ou le HMAC pour « débloquer » une erreur. Aucun déploiement réel n’est attesté par les tests locaux.

## Vérifications locales de cette évolution

- Suite automatisation / serveur / Worker : **168 tests réussis**, aucun échec (API Google et Cloudflare simulées).
- Backend historique : **84 scénarios** ; modèle US-015 : **29 scénarios** ; synchronisation REC : **46 scénarios** ; ergonomie/import US-015 : **15 scénarios**, réussis. Import XLSX/CSV/JSON également exécuté sur données fictives.
- Mobile Chromium tactile : parcours **390 px et 320 px** réussis, vraie authentification SQLite, aucune requête externe, partie financière simulée.
- Compilation Wrangler **dry-run uniquement**, puis reçu de bundle et smoke test des octets compilés avec vraie liaison Static Assets locale : réussis, backend OFF et entrées anonymes closes.
- Contrôle de syntaxe : **119 sources** ; `git diff --check` : réussi. Ces contrôles ne remplacent pas la recette sur Safari réel ni les validations d’autorisation avant raccordement Google.
