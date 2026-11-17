# Interface REC unifiée — préparation, sans publication

Évolution sans facturation demandée après fusion : [Workers Free](workers-free.md)
remplace Cloud Run comme cible de préparation. Les contrats OAuth/HMAC et le frontend
sont réutilisés ; la description Cloud Run ci-dessous reste la base des PR #20/#4.
Aucune cible réelle n’a été déployée par cette adaptation.

## Architecture constatée

| Ressource | Source et branche de travail | État / responsabilité |
|---|---|---|
| Backend, modèle et orchestration | ATALEBappli/suivi-depot-app, feature/rec-unified-secure-access vers main | Apps Script US-015, mêmes cinq fichiers, tests, passerelle Node 24 et export du référentiel |
| Interface actuellement visée | ATALEBappli/suivi-depot-demo, feature/rec-us015-secure-parametrage vers main | Même interface servie par Cloud Run ; Pages devient une redirection publique |
| Export demo/ dans suivi-depot-app | ancien prototype, scripts/prepare-demo-pages.mjs | Différent du dépôt demo actuel : ne pas l'utiliser pour écraser finance-view/model/data |
| Google | projet SuiviDepotAPI-REC, classeur Suivi Dépôt REC | Cibles figées par empreintes ; hébergement/exécution Gmail REC |
| Identité de recette | compte Google associé à Hotmail | Principal autorisé par email ET sub Google, pas par le PIN fictif |
| Passerelle choisie | Cloud Run, dans le projet Google REC | Aucun service créé. Projet Cloud/IAM/facturation à confirmer lors de la configuration autorisée |

Les droits de lecture/push/administration des deux dépôts sont visibles via le
connecteur GitHub. Ils ne prouvent aucun droit IAM Google. Les branches sont
proposées en PR et non fusionnées. Le dépôt demo ne contient pas de workflow
Actions ; sa publication Pages existante reste inchangée. Ne pas inventer une
chaîne de publication parallèle.

La Synthèse de demo utilise financeFixture en mémoire. Les trois modules finance
restent inchangés. La navigation Transactions est désactivée : aucun écran Saisie
autonome raccordé n'a été trouvé dans demo/main. L'ancien écran Saisie de
suivi-depot-app/index.html n'est ni copié, ni relié à PROD. Cette livraison raccorde
US-015 ; elle ne prétend pas transformer les autres US fictives en fonctionnalités
Google persistantes. Le bandeau indique clairement ces deux périmètres.

## Pourquoi Cloud Run est nécessaire

Pages ne peut conserver de secret ni utiliser la session Gmail de MYSELF à la
place de Hotmail. JSONP anonyme et ouverture directe du déploiement ne constituent
pas une authentification. Un iframe vers MYSELF échouerait également.

L'application complète est servie sur l'origine Cloud Run, indépendante de Pages.
Le lien Pages redirige avant toute authentification. La page Paramétrage charge les
formulaires US-015 dans un iframe de même origine Cloud Run, intégré à l'application. Ses opérations passent exclusivement par le client de
l'application parente ; aucun appel direct Apps Script, secret OAuth, jeton Google
ou clé de signature n'est placé dans les fichiers publics.

Flux : Pages (redirection seulement) → interface Cloud Run → connexion Google →
API Cloud Run de même origine → requête signée → même Apps Script REC.

Cloud Run effectue un code flow OpenID Connect avec PKCE et nonce ; il vérifie la
signature RS256 par les certificats Google, issuer, audience, azp éventuel, dates,
email vérifié, email et sub explicitement autorisés. Scope : openid email uniquement.
Le client OAuth Web et son secret restent côté serveur, distincts des credentials
GitHub d'automatisation ; aucun refresh token Google n'est stocké ou envoyé au front.
Une identité hors liste ne reçoit aucune session REC. Le callback peut afficher
uniquement sa propre identité Google vérifiée (email/sub) pour l'enregistrement
privé par l'administrateur, jamais un jeton ou une donnée métier.

Le retour vers l’interface Cloud Run contient un ticket à usage unique, valable 60 secondes, lié
à un second PKCE initié par le navigateur. Il est dans le fragment, nettoyé avant
échange. Le navigateur conserve seulement un identifiant de session opaque pendant
15 minutes en mémoire ; le vérificateur temporaire est supprimé de sessionStorage.
Pas de cookie tiers, pas de popup, pas de jeton en localStorage. Après actualisation,
la reconnexion est volontairement requise ; les données Sheets restent persistantes.
Les API n'acceptent que l'origine Cloud Run ; même Pages est refusé. Requêtes
authentifiées par Bearer. Aucun ticket ou session sur l'origine Pages partagée.
Le PIN et les permissions de démonstration n'accordent aucun droit serveur REC.

Cloud Run signe le corps exact (horodatage, nonce, acteur, demande). Apps Script
vérifie la clé privée partagée, les cibles script/classeur, l'acteur et le rôle,
la fraîcheur et le nonce, puis appelle les handlers US-015 existants. Les réponses
sont également signées et liées au nonce. Le serveur confirme la cible via rec.status
avant toute requête métier. Lectures/simulations pour reader/admin ; écritures
uniquement admin et REFERENTIEL_V2=1. Pas d'action d'activation dans l'API.
Les révisions, locks, confirmations et requestId restent ceux d'US-015 ; le même
requestId est conservé après une réponse perdue. L'auteur historique est Hotmail,
non l'identité technique Gmail exécutant le script.

## Point de transport public ≠ données publiques

MYSELF est conservé dans le manifeste source et reste le défaut de l'orchestrateur.
Aucune permission actuelle n'a été modifiée. Pour que le serveur Cloud Run puisse
appeler ce projet sans session navigateur Gmail, une autorisation distincte sera
nécessaire pour rendre joignable le transport HTTP du MÊME déploiement. Le mode
optionnel gateway_transport du workflow manuel existant prépare alors
ANYONE_ANONYMOUS / USER_DEPLOYING. Cela ne rend ni lectures ni écritures anonymes :
le packager lie ce mode à une constante compilée REC_SIGNED_TRANSPORT=true.
Tous les anciens GET/JSONP/POST et RPC directs sont fermés, même pour le compte
V2_ADMIN_EMAIL. Seul rec.gateway valide la signature et l'autorisation serveur.
Cette fermeture ne dépend pas d'une propriété modifiable ou de la présence d'une clé. Une clé ou liste
absente ferme l'accès. L'ancien code sans ces gardes est refusé par le packager en
mode passerelle ; cette détection ne remplace pas la revue du commit approuvé.

Ce changement de surface d'accès est IMPORTANT et exige sa propre validation,
les approbations de l'environnement REC et l'audit manuel existants. L'option est
false par défaut, exige REC_DEPLOYMENT_ID non vide et n'ajoute aucun workflow.
Ne pas cocher cette option ou déployer avant autorisation. Les modes historiques
continuent à refuser un manifeste ou un déploiement public. executionApi reste interdit.

## Prérequis avant raccordement réel

1. Réconcilier séparément gha-43927899195, après validation de sa version 2 déjà
   publiée et de l'empreinte d0d1…22e. Ne pas relancer deploy/restore pour ce reçu,
   ni utiliser la réconciliation du run #10. Le pending n'est pas modifié par ces PR.
2. Confirmer le projet Google REC existant et les droits du compte chargé de Cloud
   Run. Le partage Apps Script/Sheets ne donne pas automatiquement ces droits.
   Prévoir Cloud Run Admin et Service Account User pour le déployeur, les droits
   Cloud Build/Artifact Registry nécessaires à la construction ; le compte de
   service d'exécution n'a besoin que de Secret Accessor sur les secrets REC utiles,
   pas de droit Drive/Sheets/Apps Script API.
3. Activer, après autorisation, Cloud Run, Cloud Build, Artifact Registry et Secret
   Manager dans CE projet. Confirmer la facturation et le coût avant création.
4. Créer un client OAuth Google de type Application Web REC, externe/testing avec
   Hotmail comme utilisateur test si nécessaire. Scope openid email ; URI de retour
   exacte https://<service-REC>.run.app/oauth/callback. Le compte Hotmail doit être
   son compte Google, pas une connexion Microsoft supposée interchangeable.
5. Configurer les secrets privés et listes selon configuration-cloud-run.md.
6. Geler les interventions concurrentes, sauvegarder les sources/propriétés/Sheets,
   obtenir un inspect récent sans pending. Mettre à jour les sources puis le même
   déploiement via le workflow manuel existant, mode passerelle explicitement
   approuvé ; conserver son URL et REC_DEPLOYMENT_ID. Jamais de nouveau Web App.
7. Tester sans authentification : GET, JSONP et POST métier doivent être refusés.
   Puis connecter Hotmail et confirmer rec.status, lecture et simulation, avec V2
   inactive. Une redirection vers accounts.google.com sur le transport Apps Script
   est refusée : pas de repli ni contournement de MYSELF.
8. Exporter les assets du commit frontend approuvé vers rec-server/public puis les
   embarquer dans Cloud Run (empreintes vérifiées au démarrage). Configurer ensuite
   la redirection Pages, revue puis publication séparément autorisée. Aucun secret GitHub ou Google dans le front.
9. Après validation de l'identité, des cibles et des sauvegardes seulement, autoriser
   REFERENTIEL_V2=1 en REC, puis simuler et confirmer l'import. Rien n'active V2 ici.

La liste de référence Excel/CSV/JSON, les normalisations, la simulation et les
conflits de la PR #17 sont conservés intégralement. Les cautions sont limitées au
montant contractuel et aux informations déjà implémentées ; aucun encaissement,
retenue, restitution ou solde fictif n'est créé.

## Tests et recette iPhone

Unitaires : identité RS256, mauvais issuer/audience/nonce/expiration/compte,
PKCE aller/retour, ticket à usage unique, session/logout, origine non autorisée,
MAC/replay/rôle, signatures de réponse et cible, V2 inactive, ancien endpoint
anonyme fermé, absence de transactions et idempotence. Tests financiers et
orchestrateur existants conservés ; aucun test ne contacte Google.

    node --test tests/rec-automation/*.test.mjs tests/rec-server/*.test.mjs
    node tests/rec-server/browser.mjs

Le navigateur utilise par défaut /workspace/suivi-depot-demo (ou REC_FRONT_DIR).
OAuth, Cloud Run, Apps Script et Sheets y sont remplacés par des services locaux.
Parcours desktop et 390px : connexion complète, aperçu CSV 12 lignes / 220000 DA,
refus d'import V2 inactive, activation exclusivement dans la fixture en mémoire,
import fictif, persistance après reconnexion, navigation Synthèse et déconnexion.
Les tests XLSX/JSON existants continuent à vérifier le même lecteur et modèle.
Ces tests Chromium ne prouvent pas le fonctionnement réel de Safari/Google/IAM.

Après publication autorisée : Safari iPhone, ouvrir l'unique site Pages, Paramétrage,
connexion du compte Google Hotmail. Refuser le mauvais compte ; vérifier que le PIN
fictif seul n'ouvre aucune fiche. Confirmer REC et V2 inactive. Choisir l'Excel
fourni : 12 lignes, 220000 DA, dates/cautions inconnues et conflits éventuels visibles,
sans import. Actualiser : reconnexion requise, même état conservé. Tester expiration,
déconnexion, refus de modification et absence de données en cache. Après activation
séparée, confirmer un import et vérifier le réimport sans doublon. Si Safari ne
supporte pas deflate-raw, utiliser CSV UTF-8 sans activer de service externe.

## Limites et état de livraison

Aucun raccordement, IAM, OAuth, secret, propriété, déploiement, import réel ou
publication Pages réalisé. Aucun lien d'intégration nouvelle n'est annoncé comme
opérationnel. Après les validations, l'ancien lien Pages redirigera vers la même interface
#parametrage sur Cloud Run ; Synthèse/Saisie fictives ne deviennent pas des données réelles.
Les identifiants privés des projets Cloud et clients ne sont pas disponibles dans
les dépôts : ils seront vérifiés dans les interfaces autorisées, sans demander
mot de passe, jeton personnel ou contenu de secret dans la conversation.

La session est en mémoire serveur : Cloud Run doit rester à une seule instance
(max=1) ; redémarrage ou déploiement imposent une reconnexion. La limitation mémoire
et les expirations bornent les sessions, mais ne constituent pas une protection
anti-DDoS complète. Le nonce CacheService est une protection de replay best-effort ;
les écritures exactes restent idempotentes par requestId même en cas d'éviction.
Le gel des modifications extérieures reste nécessaire aux recettes et migrations.
GitHub Pages partage l'origine entre les dépôts du même compte : c'est pourquoi
aucune session ou requête métier n'y est désormais créée. L'isolation Cloud Run est
obligatoire, pas une amélioration optionnelle. Les routes privées/serveur ne sont
jamais servies par le gestionnaire d'assets publics, limité au manifeste vérifié.
La passerelle gère un bearer de session en mémoire : un XSS pourrait le lire ; elle
ne place aucun secret OAuth ni jeton Google dans le navigateur.
