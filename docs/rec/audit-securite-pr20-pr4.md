# Audit avant fusion PR #20 / PR #4

Conclusion : corrections préparées et testées localement ; PAS encore prêt pour
une ouverture réelle de REC. Aucun service/client OAuth/secret n'est raccordé,
aucun accès réel Hotmail n'a été démontré sur cette application. Aucun déploiement,
changement d'accès, écriture Google ou fusion effectué pendant cet audit.

## Risques corrigés

1. Contournement de la passerelle par la session du mainteneur : la version initiale
   conservait les accès HTTP/JSONP et RPC du propriétaire. Un point anonyme ne doit
   pas dépendre de cookies Google pour fermer ces routes (risque de CSRF/lecture
   JSONP sous un navigateur privilégié). Le mode signé est maintenant lié par le
   packager à une constante compilée. Il ferme tous ces accès, même pour le compte
   de maintenance et même si la clé a été supprimée. Le RPC v2Client n'accepte que
   l'acteur établi à l'intérieur d'un appel signé. Les helpers internes _json_ et
   _getSheet_ portent le suffixe privé Apps Script.
2. Origine Pages partagée : deux chemins github.io ne sont pas isolés par le
   navigateur. Le bridge global et la session en mémoire pouvaient être utilisés
   par un autre script de cette même origine. L'interface complète est maintenant
   embarquée dans Cloud Run, sur une origine dédiée, avec les mêmes modules finance
   et formulaires. Pages redirige AVANT authentification. Tickets, PKCE et sessions
   restent sur Cloud Run. CORS refuse explicitement Pages ; le callback ne peut
   retourner que sur Cloud Run. Aucun domaine supplémentaire n'est nécessaire.
3. Fichiers serveur : le serveur statique n'expose que les assets d'un manifeste
   d'export Git explicite, avec contrôle d'empreinte et de noms. Il ne sert ni code
   serveur, ni .env, ni manifest.json, ni chemin arbitraire. L'image ne démarre pas
   sans un frontend vérifié. Root frame-ancestors none ; seule la page référentiel
   permet un parent de même origine. CSP self, aucune librairie tierce de login.
4. Corps HTTP : décodage UTF-8 strict après assemblage des chunks, limites 8 Ko pour
   l'authentification et 600 Ko pour l'API. La session est vérifiée avant lecture du
   corps métier ; démarrages OAuth bornés à 10/minute/instance et états expirants.
   Cette limitation n'est pas une protection anti-DDoS complète.

Ces risques ont été reproduits sur le code et/ou les frontières navigateur locales,
pas exploités sur un service Google réellement déployé. Les anciennes ressources
REC (version 2 et pending) n'ont pas été modifiées.

## Signatures et droits vérifiés

HMAC-SHA256 sur le payload exact, clé 256 bits hors navigateur, comparaison sans
arrêt au premier octet, nonce aléatoire, horodatage ±120 secondes, réponses liées
au nonce et signées. Échec MAC/clé/acteur/cible/rôle => refus avant données métier.
Le cache de nonce peut être évincé : le test de rejeu après éviction prouve que le
requestId identique ne crée aucune deuxième écriture. L'expiration et les rôles
sont revérifiés à chaque requête ; aucune action de gestion des propriétés, de
version, déploiement ou transaction financière n'est exposée par la passerelle.

Identité : RS256, clé Google, issuer/audience/azp/nonce/dates/email_verified, puis
liste email+sub. Le client ne fournit jamais le rôle effectif. Deux listes privées
peuvent réduire les droits ; la moindre divergence refuse l'action. reader ne
peut écrire même avec V2 active. REFERENTIEL_V2 n'est pas activable via cette API.
Le script et le classeur sont épinglés ; une modification de leurs propriétés entre
contrôle et écriture ne permet pas d'ouvrir un classeur étranger. URL existante
épinglée côté Cloud Run ; aucun repli vers PROD ou une autre ressource.

OAuth : state et code PKCE serveur, nonce, ticket court à usage unique avec second
PKCE navigateur ; aucun client secret, refresh token ou ID token Google au front.
Un bearer applicatif est en mémoire seulement, pendant 15 minutes. Il reste une
cible en cas de XSS : fichiers de même origine revus, CSP limitée et valeurs métier
rendues en textContent ; pas de garantie absolue contre un compte administrateur
ou un serveur compromis. Google recommande une bibliothèque de validation mature ;
le validateur natif actuel utilise node:crypto et ses critères sont testés, sans
prétendre à une certification ou un audit externe.

## Hotmail : compatibilité et preuve manquante

Google permet un compte Google avec une adresse non Gmail :
https://support.google.com/accounts/answer/27441?hl=fr
Ce n'est pas une authentification Microsoft. Les vérifications antérieures du
propriétaire constituent un indice d'existence de son compte Google, pas une
preuve d'utilisation du nouveau client OAuth. Un alias de connexion ne garantit
pas la valeur exacte email du jeton Google ; utiliser les claims réellement vérifiés.

Pour un email tiers, Google n'est pas l'autorité de la boîte Hotmail, même si
email_verified=true. La sécurité repose sur le sub Google connu et approuvé par
l'administrateur, pas sur une auto-inscription par email :
https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
Aucun compte ne doit être ajouté automatiquement à partir de son adresse seule.

Avant ouverture réelle : client OAuth Web du projet REC, audience externe ou
utilisateur test Hotmail admis, callback HTTPS exact, compte Google Hotmail
contrôlé par le propriétaire, email/sub vérifiés et inscrits dans les deux listes
privées. Exécuter un vrai login en lecture seule et contrôler l'identité affichée,
rec.status et la cible. Ces vérifications ne peuvent pas être honnêtement annoncées
réussies avant configuration et déploiement distinctement autorisés. Ne pas envoyer
mot de passe, jeton ou contenu de secret dans la conversation.

## Points bloquants avant REC réelle

- Autorisations distinctes pour Cloud Run/OAuth/transport et publication de l'interface
  isolée ; l'ancien lien Pages restera une redirection vers la même application.
- Secrets, listes, IAM et exclusion des logs du callback avant tout vrai login.
- Preuve de connexion Google du compte Hotmail attendu et recette Safari réelle.
- Réconciliation séparée du reçu gha-43927899195 avant mise à jour Apps Script,
  sans réutiliser la réconciliation du run #10 ni faire deploy/restore pour ce reçu.
- Contrôles anonymes réels GET/POST/JSONP/RPC après mise en service, puis simulation
  Excel 12 lignes/220000 DA avec REFERENTIEL_V2 inactive. Activation/import séparés.

Le transport ANYONE_ANONYMOUS consomme des quotas Apps Script même lorsqu'il refuse
une requête. Le HMAC protège les données, pas la disponibilité contre des attaques
massives ; surveiller les quotas, garder max=1 pour cette recette et ne pas assimiler
cette architecture à une infrastructure PROD haute disponibilité. Les sessions
mémoire sont perdues au redémarrage, ce qui impose une reconnexion sans perdre les
données Sheets. Fermer les anciennes pages de maintenance pendant la bascule.
