# REC gratuite : Workers Free, préparation sans déploiement

## Solution retenue et alternatives (sources vérifiées le 17/11/2026)

| Solution | Compatibilité / décision |
|---|---|
| Cloudflare Workers Free + Durable Object SQLite | Retenue. Même interface et API sur une origine workers.dev isolée, secrets serveur, OAuth Google natif et stockage transactionnel des états. Aucun domaine payant ou compte de facturation Google. |
| Netlify Free | Possible avec adaptation du stockage des états ; 300 crédits/mois couvrant plusieurs usages, pause à épuisement. Moins de réutilisation ici. |
| Vercel Hobby | Limité à l'usage personnel non commercial ; pas retenu pour la gestion locative sans clarification des conditions. |
| Pages seul / JSONP public / iframe MYSELF | Ne fournit pas la passerelle serveur et ses secrets, ni l'accès Hotmail au backend Gmail privé. Refusé. |
| Cloud Run | Nécessite un compte Billing actif ; écarté selon la préférence de l'utilisateur. |

Sources officielles :
- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/durable-objects/platform/pricing/
- https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/
- https://vercel.com/docs/plans/hobby

Coût visé : 0 sur Workers FREE, sans souscription Paid, domaine payant ou option
payante. Quotas quotidiens : 100000 requêtes Worker, CPU 10 ms par requête (attente
réseau exclue), 128 Mo ; Durable Objects SQLite Free : 100000 requêtes, 13000 GB-s,
5 millions de lignes lues et 100000 écrites, stockage total 5 Go. Les appels API
consomment des quotas Worker ET DO ; les assets passent aussi dans le Worker pour
appliquer la CSP et vérifier leur empreinte. Une alarme de nettoyage peut être
facturée en unités gratuites DO. Vérifier que le compte reste bien Free : ne pas
activer Paid pour résoudre un quota. Dépassement = refus/indisponibilité, pas repli
vers PROD ou upgrade automatique. Pas de SLA ; aucune garantie de gratuité future
si l'offre fournisseur change. Le runtime local ne certifie pas le CPU de production :
contrôler les erreurs 1102 lors de la recette autorisée. L'usage de 12 logements
reste petit, mais un abus peut épuiser les quotas. Les limites Apps Script restent.

## Réutilisation / sécurité

rec-server/application.mjs est le cœur OAuth partagé, extrait sans changement de
contrat ; server.mjs reste l'adaptateur Node. Node crypto RS256/HMAC conservé via
nodejs_compat. Le contrat frontend et les écrans PR #4 sont inchangés. Aucun besoin
de nouvelle PR frontend pour accéder directement à l'origine unique workers.dev.
Le script frontend configure-rec.mjs reste réservé Cloud Run : ne pas l'utiliser
pour Workers. L'ancien Pages ne redirige pas encore ; sa publication sera une
opération séparée, l'application unique sera d'abord accessible au lien Workers.

Workers a plusieurs isolates : les Map serveur seules seraient incorrectes pour
OAuth. Un unique Durable Object nommé rec-auth-v1 gère le stockage SQLite des
états, tickets et sessions ; consommation atomique AVANT appel externe/échange,
expiration, capacité et rate limit global. Les clés de session sont hachées au repos.
Le stockage contient identité/rôle, challenge et PKCE serveur temporaires ; pas de
jeton Google, refresh token, données métier ou sauvegarde Sheets. Nettoyage par
alarme après expiration. Durées inchangées : state 5 min, ticket 60 s, session 15 min.
L'allowlist courante est revérifiée à l'échange ET à chaque API (retrait/rôle changé
refusé). Les identités ont un sub stable approuvé et un email exact, jamais une
inscription automatique par email. Une expiration/interruption impose reconnexion.

Origine exacte workers.dev validée ; previews et domaines supplémentaires non
admis. CSP self, pas de parent hors origine, exception iframe référentiel self.
Assets publics seulement issus d'un SHA approuvé et contrôlés par empreinte.
rec-config.mjs dynamique ne contient que l'origine publique ; .env/manifest/code
serveur ne sont pas exposés par le routeur. run_worker_first=true empêche un accès
asset contournant ces gardes. Secrets stockés en secrets Worker, pas en variables
publiques, GitHub, manifeste public ou navigateur. Ne jamais partager de token.
observability.enabled=false, pas de console.log applicatif ; ne pas activer tail,
tracing, logs de requêtes ou outils qui capturent callback/headers/bodies OAuth.
La télémétrie fournisseur interne n'est pas rendue inexistante par cette option.

Workers ne prend pas en charge fetch redirect:error : edgeFetch utilise manual et
refuse explicitement les réponses 3xx dans ces cas. Le seul redirect Apps Script
accepté demeure script.googleusercontent.com, pas accounts.google.com. Les HMAC,
nonce ±120 s, signatures de réponse et pins script/classeur/déploiement n'ont pas
été relâchés. Le cache anti-rejeu Apps Script reste best-effort ; le requestId
idempotent empêche la même commande d'écrire deux fois après éviction du cache.
Tous les anciens accès HTTP/JSONP/RPC sont fermés dans le bundle signé. Le transport
public protège les données par signature mais ne protège pas les quotas contre
les requêtes invalides. Aucun nouveau workflow Apps Script.

## Préparation locale reproductible (aucun accès Cloud)

    npm ci --prefix rec-worker
    node rec-worker/prepare.mjs /chemin/suivi-depot-demo 0ee316d7f8f4a34f13f94299c623d6046cd5bc44
    node --test tests/rec-automation/*.test.mjs tests/rec-server/*.test.mjs tests/rec-worker/*.test.mjs
    WRANGLER_SEND_METRICS=false npm run --prefix rec-worker check
    REC_WORKER_TEST=1 node tests/rec-server/browser.mjs

La sortie public/ doit être neuve comme l'exige l'export existant. Ne pas effacer
aveuglément une sortie existante ; la déplacer localement après vérification.
prepare lit le commit frontend comme données et vérifie les assets avec le même
validateur que Cloud Run ; generated-manifest.mjs et public/ sont ignorés Git.
Le dry-run compile seulement et n'appelle aucun Google ou Cloudflare de déploiement.
Wrangler/miniflare sont des dépendances de développement épinglées dans package-lock.
Miniflare 5 est une version beta épinglée, également utilisée par la version Wrangler
épinglée ; ces outils servent uniquement aux tests/constructions locaux, pas au
code exécuté dans le Worker. Aucun paquet applicatif tiers dans le bundle.
Le workflow REC-Maintenance existant est étendu aux tests, pas au déploiement.
Le harness de test est séparé de l'entrée réelle worker.mjs : ses identités fictives
et services Google simulés ne sont jamais importés par le bundle de déploiement.

## Premier affichage sans secrets

Le premier déploiement peut maintenant servir les seuls assets publics vérifiés
avec APP_ENV=REC et REC_SERVER_URL=<ORIGINE_WORKERS_CONFIRMEE>. Il conserve
REC_BACKEND_ENABLED=false, REC_USER_ALLOWLIST=[] et observability.enabled=false.
Aucune valeur factice de secret ni ouverture Google n'est nécessaire pour afficher
l'interface. Les routes OAuth et API exigent toujours la configuration complète
avant même de solliciter le Durable Object : sans celle-ci, HTTP 503 générique,
sans jeton ni appel Google. Afficher la navigation n'est pas réussir le login Hotmail.

L'entrée de production est testée dans workerd sans secrets : assets/CSP, config
publique minimale, absence de fichiers privés, fermeture de toutes les routes
OAuth/API, rejet d'une origine différente et d'un environnement PROD. Les tests
OAuth/SQLite et HMAC antérieurs restent applicables après configuration complète.

Le Worker existant doit être mis à jour avec le nom exact suivi-depot-rec, jamais
créé sous un nom de remplacement. La migration SQLite et sa liaison REC_AUTH sont
déjà dans wrangler.jsonc. Ne pas remplacer le Worker par un simple upload statique
ni utiliser l'ancien formulaire de copie Code.gs. Conserver la version Hello World
comme retour arrière de déploiement, sans la supprimer.

Si Cloudflare est refusé par le proxy Codex : ajouter exactement dash.cloudflare.com,
api.cloudflare.com et l'hôte REC workers.dev aux domaines autorisés de l'environnement.
Ne pas désactiver le proxy ou la validation TLS, ni réutiliser l'accès de DZKoora.
Autre voie : lancer les mêmes commandes préparées depuis une machine autorisée,
avec connexion Wrangler interactive locale ; jamais demander un token dans le chat.
L'autorisation de déployer et la présence d'un accès authentifié sont deux prérequis
distincts. Un code local 200 n'atteste pas l'état du Worker Cloudflare distant.

## Configuration future, UNE action à la fois après autorisations

1. Identifier/connecter un compte Cloudflare et confirmer Workers Free sans upgrade.
   https://dash.cloudflare.com/ — ne créer aucun Worker maintenant.
2. Après autorisation de création, choisir le sous-domaine gratuit workers.dev ;
   origine attendue https://suivi-depot-rec.<SOUS_DOMAINE>.workers.dev, ne pas inventer
   son URL avant confirmation. Client OAuth Google Application Web REC : projet
   standard indépendant gratuit SANS Billing. Apps Script conserve son projet par
   défaut. Pas besoin de scripts.run, API Drive/Sheets ou de changer son projet.
   Google Auth Platform : audience External, scopes openid email, callback EXACT
   <ORIGINE>/oauth/callback ; login plein écran dans Safari. Pas de connexion Microsoft.
   Les scopes de base ne font pas de la liste des testeurs une protection métier.
3. Après autorisation de secrets/configuration : APP_ENV=REC (déjà dans le modèle),
   REC_SERVER_URL=<ORIGINE>, REC_APPS_SCRIPT_URL=<exec REC existant, pin contrôlé>,
   REC_OAUTH_CLIENT_ID=<client Web REC>. Secrets Worker REC_OAUTH_CLIENT_SECRET,
   REC_GATEWAY_KEY ; REC_USER_ALLOWLIST=[] au départ. REC_BACKEND_ENABLED=false.
   Les entrées privées refusent une configuration incomplète ; les assets publics
   exigent seulement APP_ENV et REC_SERVER_URL. Aucun secret généré ici.
   Commande future interactive, seulement après accord :

       cd rec-worker
       npx wrangler login
       npx wrangler secret put REC_OAUTH_CLIENT_SECRET
       npx wrangler secret put REC_GATEWAY_KEY

   Ces commandes peuvent créer une ressource selon l'état du compte : ne pas les
   lancer maintenant. La méthode Dashboard/import et l'ordre exact seront choisis
   après identification, pour éviter les manipulations de token depuis iPhone.
   Aucune création d'API token personnel demandée. Préférer l'OAuth Wrangler interactif
   sur une machine administrateur autorisée ; sur iPhone, utiliser le dashboard
   et un upload approuvé si l'interface le permet, sans promettre un déploiement DO
   complet par le seul éditeur Web. Pas d'outil de construction supplémentaire ici.
4. Après autorisation de publication seulement : déployer Worker + DO SQLite +
   assets. wrangler deploy est une mutation explicitement NON exécutée. L'entrée
   refuse Apps Script tant que REC_BACKEND_ENABLED n'est pas exactement true.
   Tester d'abord login et découverte de la propre identité Hotmail sans session
   métier autorisée ; approuver sub/email puis renseigner les listes privées.
5. Apps Script privé MYSELF reste inaccessible au Worker : c'est attendu. Ne pas
   ouvrir la version actuelle à tous. Préserver URL, déploiement et pending
   gha-43927899195 ; aucun deploy/restore ici. La résolution séparée du pending et
   la bascule du même déploiement vers le bundle signé requièrent une autorisation
   future, comme le changement des propriétés REC_GATEWAY_KEY/REC_USER_ALLOWLIST.
   Ne pas utiliser l'ancienne réconciliation spécifique au run #10.
6. Après ces accords/tests seulement, REC_BACKEND_ENABLED=true. Contrôles anonymes
   GET/POST/JSONP/RPC refusés ; compte non autorisé refusé ; statut REC, sub approuvé,
   V2 inactive. Ne pas activer REFERENTIEL_V2.

## Recette iPhone

Lien unique Workers après vraie publication : Safari, Paramétrage, connexion Google
Hotmail, retour même onglet sans cookies tiers ; vérifier identité/cible REC et
V2 inactive. Simulation de l'Excel définitif : 12 lignes, 220000 DA ; dates et
cautions vides, doublons et conflits visibles, pas d'import. Expiration/reload,
reconnexion, déconnexion et refus mauvais compte. Après autorisation d'activation
et d'écriture seulement, créer/modifier un logement fictif identifié ; après une
autorisation d'import distincte, nouvelle simulation puis confirmation, réimport
sans doublon et vérification de l'absence de transaction financière créée.
Les tests locaux Chromium 390px ne prouvent pas Safari réel ni le login du compte.

Synthèse demeure fictive et aucun écran Saisie autonome raccordé n'est présent dans
le main frontend fusionné. Cette adaptation livre toute l'US-015 implémentée ; elle
n'invente ni écran financier ni mouvement de caution. Aucune modification de PROD,
des données, permissions, secrets Google, déploiement ou journal pending réalisée.

## Publication manuelle GitHub Actions de l'interface seule

Workflow ajouté dans la PR #22 : `.github/workflows/rec-worker-manual.yml`.
Il est nécessaire car les workflows de mutation existants ciblent Apps Script,
qui est explicitement hors périmètre de cette publication Cloudflare. Le workflow
REC-Maintenance existant vérifie aussi le bundle compilé localement en CI.
Aucun lancement n'est effectué pendant cette préparation.

Après revue, validation et fusion séparée de la PR #22 dans main :
https://github.com/ATALEBappli/suivi-depot-app/actions/workflows/rec-worker-manual.yml

Depuis iPhone : Actions → ce workflow → Run workflow → branche main → cocher la
confirmation du Worker existant et de l'offre Free → Run workflow. Si REC exige
une approbation, lire d'abord la synthèse du job prepare (source SHA + empreinte
SHA-256), puis approuver dans Review deployments. Le workflow n'existe dans la
liste des actions exécutables qu'après son intégration dans la branche par défaut.
Ne pas lancer avant la validation du propriétaire.

Aucune nouvelle variable GitHub n'est nécessaire. Seul CLOUDFLARE_API_TOKEN de
l'environnement REC est transmis à la dernière étape du job publish. Le jeton
existant peut être limité au rôle Individual Workers Editor sur le seul Worker
REC existant : le précontrôle confirme l'activation workers.dev et lit les settings du seul Worker
suivi-depot-rec. Il s'arrête si le Worker manque, si le token ne permet pas cette
lecture ou si des bindings/secrets/configurations inattendus sont déjà présents.
Aucun endpoint de facturation/abonnement ni autre Worker n'est ciblé. Le plan Free
est confirmé par la case du déclenchement ; la lecture des settings ne prouve pas
le plan commercial et ne nécessite pas d'ajouter des droits Billing au jeton.

Le job prepare n'a aucun secret : checkout du SHA exact du workflow main et du
frontend approuvé, npm ci avec verrouillage, tests, compilation Wrangler dry-run,
artefact contenant uniquement le JS compilé, les assets publics, la configuration
fixe et un reçu d'empreintes. Les sources/maps/credentials ne sont pas exportées.
La liaison Static Assets réelle est testée dans workerd avec CES octets compilés,
pas seulement avec un faux serveur de fichiers. html_handling=none évite les
redirections canoniques index.html incompatibles avec la vérification des octets.
La CSP et les gardes restent appliquées par le Worker avant les assets.

Après approbation REC, publish récupère l'artefact immutable du même run, vérifie
son empreinte, ses sources, les fichiers autorisés et la configuration exacte :
compte/Worker fixes, migrations SQLite RecAuth, backend false, allowlist vide,
origine REC uniquement, aucun secret OAuth/HMAC, aucune route custom, logs et tail
consumers désactivés. Aucun input ne permet de changer ces paramètres. Seul le
script main approuvé a accès au token ; npm ci et les tests n'en disposent pas.
Wrangler réutilise le JS compilé avec --no-bundle et sans découverte de modules
supplémentaires. Ses sorties brutes ne sont pas reproduites ; son fichier de debug
est redirigé vers /dev/null, la sanitisation forcée et ses métriques désactivées. Les erreurs API sont
réduites à des codes fixes, sans corps, headers ou token. Aucune réponse API brute,
log Wrangler, configuration privée ou secret n'est téléversé comme artefact.

Après publication, contrôles HTTP strictement sur l'origine REC : racine et tous
les assets identiques aux empreintes, config publique exacte, fichiers privés
inaccessibles, routes OAuth/API fermées (503 de configuration), settings/DO et
collecte de logs contrôlés. Aucun appel Google. La synthèse n'annonce l'URL vérifiée
que lorsque tous ces contrôles passent. Si la propagation ou le CPU Free fait
échouer un contrôle, le run échoue, sans affirmer que Hello World est toujours
publié : l'écriture peut avoir réussi. Pas de second deploy, de suppression, de
restore ou de rollback automatique. Conserver l'artefact et le reçu du run pour une
vérification en lecture seule avant toute reprise. Les artefacts expirent après
7 jours ; la synthèse conserve le SHA et le hash. Les versions Cloudflare antérieures
ne sont pas supprimées. Aucun état Apps Script/pending n'est lu ou modifié.

La protection REC (reviewers et branches autorisées) reste celle déjà configurée
par le propriétaire ; ce workflow ne la modifie pas. La fusion dans main et le
workflow_dispatch sont les autorisations distinctes préalables à la publication.


### Diagnostic de préparation du bundle

Le run manuel 44275974989 a compilé avec succès puis échoué sur la lecture du JS,
avant les validations de taille, d'empreinte ou de cible : --outdir relatif est
résolu par Wrangler depuis rec-worker/wrangler.jsonc, alors que le packager lit
depuis la racine du checkout. Le workflow utilise désormais
--outdir "$GITHUB_WORKSPACE/work/rec-worker-compiled". Le chemin absolu est partagé
par les deux outils ; aucun repli ou recherche automatique du bundle n'est ajouté.
La CI antérieure utilisait déjà un chemin /tmp absolu et ne reproduisait pas ce cas.

Une régression locale exécute Wrangler en dry-run avec les deux formes de chemin,
y compris un workspace contenant des espaces. Un bundle absent produit maintenant
REC_WORKER_STOP COMPILED_WORKER_MISSING ; une empreinte différente conserve
RELEASE_HASH_MISMATCH et les autres contrôles restent bloquants. Les diagnostics
proviennent d'une liste fermée, sans message d'exception brut, chemin, JSON ou
variable d'environnement. Aucun répertoire de release n'est créé si le JS manque.
Cette correction ne lance pas le workflow manuel ; nouvelle validation du
propriétaire requise avant une publication.


### Lectures compatibles avec un jeton Individual Workers Editor

Le run 44283361390 a réussi prepare puis renvoyé CLOUDFLARE_READ_FAILED_400 dans
publish. L'ancien diagnostic ne distinguait pas les appels : il ne constitue pas
à lui seul une trace certaine de l'endpoint fautif. Le premier appel du code était
GET /accounts/{account}/workers/subdomain. Cette lecture globale est valide mais
sa liste de permissions acceptées ne comprend pas Individual Workers Editor.
Ce précontrôle était donc incompatible avec le rôle indiqué par le propriétaire.

Il est remplacé par GET /accounts/{account}/workers/scripts/suivi-depot-rec/subdomain,
qui accepte ce rôle et doit répondre enabled=true. Les lectures /settings et
/script-settings du même Worker sont valides et acceptent également Individual
Workers Editor ; elles restent inchangées. Aucun droit de compte plus large n'est
demandé. L'API globale du sous-domaine est maintenant refusée par la liste interne
des endpoints autorisés, sans repli si la lecture scoped échoue.

Le compte, le nom et l'origine autorisée restent figés dans le reçu et la config.
Les GET authentifiés sont limités à ce compte et ce Worker ; un mauvais scope ou
un Worker absent arrête avant l'écriture. L'activation workers.dev est contrôlée
sur ce Worker précis ; elle ne renvoie pas le libellé du sous-domaine du compte.
L'origine reste celle déjà confirmée par le propriétaire ; elle est vérifiée après
publication par comparaison des octets et du fichier de configuration publique.
Les contrôles de bindings, sources, hash, logs et backend désactivé sont conservés.

Chaque échec de lecture donne seulement une étape fixe et un statut/type d'erreur :
CLOUDFLARE_READ_PRE_WORKER_SUBDOMAIN_HTTP_400, PRE_WORKER_SETTINGS,
POST_WORKER_SETTINGS ou POST_LOG_SETTINGS ; NETWORK_ERROR et INVALID_RESPONSE sont
aussi possibles. Les noms ne viennent pas de paramètres utilisateur ou d'une
réponse Cloudflare. Aucun corps/headers/token/message brut n'est affiché. Le statut
HTTP seul n'est pas interprété comme la preuve d'un problème précis de jeton.
Aucun déploiement de diagnostic n'est déclenché pour tester le secret réel.

Sources officielles vérifiées le 18 novembre 2026 :
- Lecture globale (permissions legacy Workers Scripts Read/Write) : https://developers.cloudflare.com/api/resources/workers/subresources/subdomains/methods/get/
- Lecture du Worker (Individual Workers Editor accepté) : https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/subdomain/methods/get/
- Settings de version/bindings : https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/script_and_version_settings/methods/get/
- Settings de script/logs : https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/settings/methods/get/
- Rôles et scopes Worker : https://developers.cloudflare.com/workers/authorization/workers/

### Normalisation des settings de collecte désactivés

Le modèle officiel ScriptSetting déclare observability optionnel et nullable,
logpush optionnel booléen, et tail_consumers optionnel/nullable. Un bloc
observability absent/null n'est pas équivalent à un objet explicitement activé.
Le contrôle initial observability?.enabled === false rejetait pourtant ces deux
représentations OFF : undefined !== false. Les tests ne couvraient que l'objet
explicite {enabled:false}, d'où le faux positif UNEXPECTED_LOG_COLLECTION.

checkLogSettings normalise seulement l'absence/null documentée. Si observability
est un objet présent, enabled doit rester strictement false. Les activations
explicites de logs, traces, issues ou agents, les destinations non vides, Logpush
et les tail consumers sont toujours refusés. Les types incohérents, notamment
"false" en chaîne et un objet observability sans enabled, restent bloquants.
Un sous-paramètre invocation_logs/persist conservé ne rend pas un canal explicitement
désactivé actif ; en revanche une destination configurée reste interdite même OFF.
Aucun échantillonnage à zéro ou persist=false n'est assimilé à une désactivation.

La réponse Cloudflare privée n'a pas été extraite ni affichée pendant la correction.
Les anciens logs indiquent l'échec de la condition combinée, pas la valeur exacte
absente/null du Worker ; les cas conformes OFF sont reproduits localement. Les
lectures des settings, tous les contrôles avant déploiement et les vérifications
publiques après le contrôle des logs restent inchangés. Ne pas relancer un deploy
pour appliquer ou diagnostiquer cette normalisation sans validation distincte.

Schéma officiel de la réponse :
https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/settings/methods/get/
Types du SDK officiel (ScriptSetting, observability nullable) :
https://github.com/cloudflare/cloudflare-typescript/blob/main/src/resources/workers/scripts/scripts.ts
Activation des logs, opt-in explicite :
https://developers.cloudflare.com/workers/observability/logs/workers-logs/
