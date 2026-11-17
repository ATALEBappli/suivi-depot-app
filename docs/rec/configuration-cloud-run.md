# Configuration Cloud Run REC — à effectuer seulement après autorisation

Ne copier aucun secret dans une issue, PR, log ou conversation. Aucun secret n'est
fourni dans le dépôt. Le serveur ne réutilise pas REC_GOOGLE_OAUTH de GitHub.

## Configuration privée

| Nom | Destination | Valeur |
|---|---|---|
| APP_ENV | Cloud Run | REC uniquement |
| REC_SERVER_URL | Cloud Run | origine HTTPS du service REC, sans chemin |
| REC_APPS_SCRIPT_URL | Cloud Run | URL /exec du déploiement REC existant ; empreinte vérifiée par le code |
| REC_OAUTH_CLIENT_ID | Cloud Run | client Web OpenID REC, identifiant public mais gardé en configuration serveur |
| REC_OAUTH_CLIENT_SECRET | Secret Manager → Cloud Run | secret du client Web ; jamais côté Pages |
| REC_GATEWAY_KEY | Secret Manager → Cloud Run et propriétés Apps Script REC | même clé hexadécimale aléatoire de 32 octets |
| REC_USER_ALLOWLIST | configuration privée Cloud Run et propriété Apps Script REC | même tableau email/sub/role (reader ou admin) |
| V2_ADMIN_EMAIL | propriété Apps Script REC | Gmail autorisé pour l'ancien accès de maintenance ; ne remplace pas la liste Hotmail |
| REFERENTIEL_V2 | propriété Apps Script REC | absente pendant raccordement/simulation |

Exemple fictif du tableau :

    [{"email":"rec-user@example.invalid","sub":"google-sub-fictif","role":"admin"}]

sub est l'identifiant stable Google du compte, pas un token ni un mot de passe.
Une liste vide refuse tout accès métier. Pour connaître le sub sans manipulation
de token : démarrer avec les listes vides, connecter le compte Google Hotmail au
service configuré ; le callback authentifié affiche sa propre identité et refuse
l'accès REC. Recopier seulement email/sub dans les deux configurations privées.
Le callback est une réponse de refus sans session, affichée uniquement au compte
qui vient de se connecter ; personne ne doit copier un jeton Google.
Ne pas copier l'URL du callback (elle contient un code OAuth éphémère), ni un jeton.
L'ajout à la liste est un changement de droits exigeant une autorisation séparée.

Créer les valeurs sensibles dans Secret Manager et autoriser seulement le compte
technique du service sur ces secrets. Ne pas saisir de secret en argument CLI
journalisé ou dans un fichier versionné. Pour les propriétés Apps Script, utiliser
l'éditeur privé du projet REC confirmé, jamais PROD. Ne pas distribuer la clé au
compte utilisateur dans le code frontend ; elle n'est utilisée que par les serveurs.

## Construction reproductible (à adapter au projet/région REC confirmés)

Le contexte source est rec-server/, pas la racine du dépôt. Les listes .dockerignore
et .gcloudignore excluent tout autre fichier. Le Dockerfile ne copie que *.mjs et
package.json ; aucune installation npm ni dépendance applicative externe.

    gcloud run deploy rec-gateway --source rec-server --project <PROJET_REC> --region <REGION_REC> --max-instances 1 --concurrency 40 --no-allow-unauthenticated --env-vars-file <FICHIER_PRIVE_HORS_GIT> --set-secrets REC_OAUTH_CLIENT_SECRET=<SECRET_OAUTH>:<VERSION>,REC_GATEWAY_KEY=<SECRET_SIGNATURE>:<VERSION>

Cette commande est un exemple de création : NE PAS l'exécuter sans autorisation.
Configurer toutes les variables et références Secret Manager dès cette première
révision ; sans elles, le serveur refuse volontairement de démarrer. Le fichier privé
contient notamment APP_ENV, REC_SERVER_URL, REC_APPS_SCRIPT_URL, REC_OAUTH_CLIENT_ID
et REC_USER_ALLOWLIST (tableau JSON, vide pour l'enregistrement initial). Ne jamais
versionner ce fichier. L'URL déterministe peut être préparée avant la création :
https://rec-gateway-<NUMERO_PROJET>.<REGION_REC>.run.app ; confirmer son format dans
la console et l'utiliser exactement pour REC_SERVER_URL, le retour OAuth et la CSP.
Référence : https://docs.cloud.google.com/run/docs/custom-urls

Le démarrage refuse une cible non REC ou une autre URL Apps Script. Une configuration
manquante renvoie seulement REC_SERVER_CONFIGURATION_REQUIRED, sans secret.

Pour que Safari puisse accéder au service, l'invocation HTTP Cloud Run devra ensuite
être rendue joignable après validation distincte ; les routes métier exigent leur
session applicative et le serveur autorise seulement l'origine Pages prévue.
Ne pas ouvrir de droit Drive/Sheets au public ni partager le classeur avec allUsers.

IMPORTANT journalisation : le callback OAuth contient un code dans la query string.
L'application ne le logue pas et pose Referrer-Policy:no-referrer, mais Cloud Run
peut journaliser les URLs automatiquement. AVANT tout vrai login, configurer dans
Cloud Logging une exclusion des request logs pour resource.type=cloud_run_revision,
le service REC concerné et httpRequest.requestUrl contenant /oauth/callback.
Ne pas activer de journalisation de headers Authorization, bodies ou réponses OAuth,
ni d'outil de tracing qui les capture. Cette configuration est distinctement autorisée.

## Frontend

Dans le checkout suivi-depot-demo, après confirmation du service :

    REC_SERVER_URL=https://<service-REC>.run.app node scripts/configure-rec.mjs
    node --test tests/configure-rec.test.mjs

Seuls rec-config.mjs et l'origine connect-src de la CSP sont modifiés ; aucun secret.
Faire revoir ce diff avant publication Pages. L'export US-015 vient de suivi-depot-app :

    node scripts/prepare-rec-reference.mjs /chemin/suivi-depot-demo/referentiel

Il ne remplace pas les modules finance, index global ou app.mjs. Maintenir les deux
PR liées ; ne pas lancer l'ancien export demo/ à la place du site actuel.

## iPhone

La connexion utilise des navigations plein écran et un retour dans le même onglet,
pas une popup ou un cookie tiers. L'initialisation Cloud Run/OAuth/Secret Manager
reste une tâche administrateur ; Cloud Console et Cloud Shell en mode ordinateur
sur iPhone peuvent la réaliser, mais la saisie d'un ensemble de secrets y est peu
confortable. Ne pas contourner les confirmations ou envoyer de secrets à Codex.
Lors de la prochaine phase, demander une seule intervention bloquante à la fois :
confirmer le projet Google REC et ses droits avant d'activer des APIs ou de créer
un service. Aucune de ces opérations n'est requise pour revoir les PR et les tests.
