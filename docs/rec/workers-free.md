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
