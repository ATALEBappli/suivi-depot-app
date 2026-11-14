# US-015 — Étude de l'automatisation REC depuis GitHub

Étude du 14 novembre 2026, Europe/Paris. Aucune connexion Google, création de
ressource, modification de sources distantes, activation V2, import, publication
ou fusion n'est effectuée. Seuls une proposition et un brouillon inactif sont
préparés sur la branche de développement.

## Décision recommandée

Solution faisable : GitHub Actions, déclenchement exclusivement manuel, OAuth
utilisateur Gmail REC, API REST officielle Apps Script, sauvegarde privée avant
remplacement et premier déploiement MYSELF / USER_DEPLOYING dans le projet REC
existant. Aucune copie des cinq fichiers depuis l'iPhone à chaque intervention.

Le compte Gmail REC reste éditeur du projet et du classeur appartenant au compte
Google Hotmail. Il n'est pas nécessaire de transférer leur propriété. Les éditeurs
peuvent créer des versions et déployer. Le Gmail REC doit n'avoir aucun accès PROD.

Conséquence : le compte Gmail qui crée le déploiement en est le déployeur ; en
MYSELF, lui seul peut accéder à cette web app, pas automatiquement le propriétaire
Hotmail. Le compte actif dans Safari et V2_ADMIN_EMAIL devront correspondre à ce
Gmail. Le partage comme éditeur ne remplace pas l'authentification web.

## Options étudiées

| Option | Conclusion |
| --- | --- |
| API REST Apps Script | Recommandée : API Google officiellement documentée, payload de cinq fichiers explicite, sauvegarde/getContent et versions/déploiements contrôlables |
| clasp | Alternative viable, outil open source documenté par Google ; son README précise qu'il n'est pas un produit officiellement supporté. Version et dépendances à figer, OAuth utilisateur nécessaire ; pas de push sans revue |
| Compte de service / GitHub OIDC vers compte de service | Non retenu : Google indique que l'API Apps Script ne fonctionne pas avec les comptes de service ; clasp marque cette voie expérimentale/non fonctionnelle. Ne pas promettre un déploiement sans refresh token sur cette base |
| Synchroniseur REC existant | Non utilisable tel quel : liste fermée ancienne, refus du nouveau bundle multi-GS/HTML ; ne pas contourner ses contrôles |

## Authentification et secrets

1. Créer un client OAuth dédié dans un projet Google Cloud de configuration, activer
   Apps Script API, puis autoriser cette API dans les paramètres Apps Script du
   compte Gmail REC. La configuration du client OAuth n'impose pas de changer
   l'association Google Cloud du projet Apps Script existant pour les seules
   opérations de gestion proposées. Ne pas ajouter scripts.run à ce circuit.
2. Obtenir une fois une autorisation utilisateur avec accès hors ligne dans un
   terminal privé de confiance, avec client OAuth propre et bibliothèque Google.
   Portées proposées : identité openid/email, script.projects et script.deployments.
   Ajouter drive.file uniquement si la sauvegarde privée Drive est retenue.
   Pas de portée Sheets pour le client d'installation ; l'exécution de la web app
   nécessitera ses propres autorisations Sheets auprès du compte déployeur.
3. Le refresh token, le client secret et les autres justificatifs nécessaires
   restent hors Git, chat, captures et artefacts. Proposition : un secret
   GOOGLE_REC_OAUTH_JSON dans un environnement GitHub REC protégé, jamais un fichier
   du dépôt. Identifiants de cible et email attendu restent dans la configuration
   protégée hors Git ; le code contient seulement des empreintes attendues.
4. Cette proposition confie donc un secret OAuth au coffre GitHub Actions. Elle
   respecte l'absence de secret dans le code/historique Git, mais n'est pas une
   solution sans secret. Si le propriétaire refuse aussi GitHub Secrets, un coffre
   externe/courtier OAuth sera nécessaire, avec davantage d'infrastructure.
5. À chaque exécution : renouveler le jeton en mémoire, vérifier l'identité Google
   attendue, masquer les jetons, ne jamais journaliser les réponses OAuth complètes
   et supprimer les éventuels fichiers temporaires privés. Pas de debug shell ou
   d'export de l'environnement ; aucune exécution de code candidat avec ces secrets.
6. Prévoir rotation, révocation et réauthentification. Une application OAuth externe
   en statut Testing produit normalement un refresh token expirant après sept jours
   pour ces portées. Pour un usage durable, revoir son statut de publication et les
   éventuelles exigences Google. Ce statut OAuth est distinct de l'accès privé
   MYSELF de la web app ; ne pas rendre le backend anonyme. Même hors Testing, un
   refresh token peut être révoqué ou expirer : il n'est pas permanent.

Un GitHub runner ne peut pas accomplir seul le premier consentement Google humain.
Ne pas demander de saisir un mot de passe ou un code OAuth dans des inputs Actions
ou dans la conversation. Un flux clasp --no-localhost peut être envisagé pour
l'amorçage, uniquement dans un terminal privé ; le retour de redirection contient
un code sensible. Son fonctionnement sur l'iPhone du propriétaire reste à essayer.

## Workflow prévu et état du brouillon

Brouillon : `docs/examples/us-015-rec.workflow.yml.example`. Il est hors de
`.github/workflows/` et n'est donc pas enregistré. Il vérifie seulement la syntaxe
des inputs puis s'arrête en erreur avant Google, y compris en mode inspect.
Il ne comporte ni authentification ni client de transfert. Ce n'est pas un
workflow de déploiement prêt à activer.

La future implémentation comprendrait :

- `workflow_dispatch` seulement ; pas de push, PR, schedule, workflow_run ou dispatch
  externe supplémentaire. Lancement réservé aux personnes ayant les droits requis.
- Inputs : opération inspect/install/deploy/restore, SHA complet revu, référence de
  sauvegarde si restauration. Aucun input de Script ID, classeur, email ou URL.
- Orchestrateur de confiance sur une référence protégée, actions/dépendances figées
  par SHA/version et permissions GitHub minimales. Le commit applicatif est lu comme
  donnée candidate ; il ne doit pas fournir les scripts exécutés dans le job à
  secrets. Préparation/tests dans un job sans identifiants Google, puis validation
  du paquet exact et des empreintes dans le job protégé.
- Environnement REC : approbation avant accès aux secrets, branches d'exécution
  limitées, bypass administrateur désactivé lorsque disponible. Avec un seul
  opérateur, empêcher l'auto-approbation bloquerait tous les déploiements : choisir
  soit un deuxième approbateur, soit une auto-revue explicitement assumée. Ne pas
  présenter ce dernier cas comme une séparation de rôles.
- Groupe de concurrence unique REC, aucune annulation d'une écriture en cours.
- Rapport masqué : SHA source, hashes, contrôles, état et référence de reçu. Les
  sauvegardes et URL privées restent dans le reçu privé, pas dans les logs publics.

Les protections d'environnements sont disponibles sur un dépôt public avec les
plans GitHub courants. Sur un dépôt privé, vérifier le plan et les restrictions :
la même protection par reviewers n'est pas acquise avec GitHub Free/Pro/Team.
Ne pas activer une exécution avec secrets si le verrou prévu est indisponible.

Point de mise en service : GitHub exige que le workflow manuel existe sur la
branche par défaut. Un nouveau fichier uniquement dans dev/us-015-referentiel
n'est pas suffisant. Il faudra donc une autorisation ultérieure pour intégrer
l'orchestrateur revu dans la branche par défaut, ou autoriser un dépôt d'outillage
REC distinct. Aucun de ces gestes n'est réalisé ici. Le workflow pourra ensuite
sélectionner un commit applicatif revu sans fusionner toute l'US dans main.
Le SHA source doit aussi être accessible sur GitHub, pas seulement dans ce checkout.

## Séquence d'une installation future

1. Sélection manuelle de l'opération et du commit exact ; construire et valider les
   cinq fichiers, leur manifeste et les tests hors réseau, sans secrets Google.
2. Approvisionner l'accès protégé seulement après revue ; vérifier compte OAuth,
   ID cible contre empreinte attendue et métadonnées Google : titre SuiviDepotAPI-REC,
   scriptId exact et projet autonome. Aucune création de projet de remplacement.
3. Inspecter HEAD et déploiements existants, afficher un diff non nominatif et le
   bilan des fichiers remplacés. Une source distante inattendue arrête le processus.
4. Sauvegarder les sources complètes via projects.getContent, le manifeste et les
   références de déploiement. Stockage recommandé : fichier JSON dans Drive privé
   du compte REC, créé par le client OAuth avec drive.file. Vérifier absence de
   partage hérité, relire le fichier stocké et comparer SHA-256 avant tout PUT.
   Le dossier de sauvegarde doit être accessible à ce client : un ID arbitraire de
   dossier manuel ne suffit pas avec drive.file. Créer/autoriser ce dossier lors
   de la configuration initiale, sous validation du propriétaire.
5. Conserver séparément une sauvegarde privée des propriétés, déclencheurs,
   autorisations et du classeur. getContent ne les contient pas et l'API de gestion
   n'expose pas une sauvegarde complète des Script Properties. Leurs valeurs réelles
   restent à contrôler manuellement ou par un futur diagnostic autorisé. Aucun
   endpoint scripts.run ou changement de propriétés n'est ajouté pour contourner
   cette limite.
6. Arrêt si la sauvegarde n'est pas relue/vérifiée ou si la restauration n'est pas
   préparée. Une sauvegarde réelle peut contenir des valeurs sensibles : jamais
   d'artefact GitHub en clair. Les lecteurs d'un dépôt peuvent télécharger ses
   artefacts. Si un artefact sert de copie secondaire, le chiffrer avant upload et
   ne pas placer la clé de déchiffrement avec lui ; ne pas en faire l'unique sauvegarde.
7. Relire le HEAD immédiatement avant écriture, comparer son empreinte au HEAD
   sauvegardé, puis projects.updateContent avec exactement les cinq fichiers.
   Cette API remplace tout le contenu ; elle peut affecter immédiatement les
   déclencheurs et le code de développement, même sans déploiement. Geler les
   éditions/exécutions concurrentes ; aucun verrou GitHub ne bloque l'éditeur Google.
8. Relire les sources après transfert et vérifier noms/types/contenus. En cas de
   timeout ou résultat incertain, arrêter pour inspection ; pas de réessai aveugle.
9. Pour l'opération deploy seulement : créer une version immuable du HEAD contrôlé,
   puis un premier déploiement MYSELF/USER_DEPLOYING, ou mettre à jour uniquement le
   déploiement REC connu vers cette version lors des futures US. Vérifier ensuite
   sa version et son exposition dans la réponse API. Conserver la même URL lorsque
   c'est une mise à jour. Aucun déploiement actif inattendu n'est supprimé automatiquement.
10. Ouvrir l'URL privée sur Safari avec le Gmail déployeur et réaliser le consentement
    d'exécution initial si demandé. Contrôler lecture du vrai classeur REC et
    propriétés, puis le Paramétrage. Le succès de l'API de déploiement ne constitue
    pas ce test fonctionnel. Un curl de CI ne remplace pas une session navigateur
    privée Google et son consentement.

Aucune étape n'active REFERENTIEL_V2, ne crée le journal, n'importe les logements
ou ne modifie les transactions. L'installation ne gère pas les propriétés de
script. Vérifier auparavant que V2 est inactive et que les déclencheurs existants
n'introduisent pas d'effet hors du périmètre autorisé.

## Restauration contrôlée

Opération manuelle séparée : choisir la sauvegarde privée et vérifier cible,
empreinte, manifeste et diff ; sauvegarder d'abord l'état en échec puis restaurer
le HEAD avec le contenu complet approuvé et relire. Si un déploiement privé
précédent existe, un retour explicite à sa version peut restaurer son comportement
sans réécrire les données Sheets. HEAD et déploiement sont deux états différents.
Lors d'une première installation sans ancien déploiement, il n'existe pas d'ancienne
URL à rétablir. Aucun rollback ne répare les données éventuellement déjà modifiées.

Si l'ancienne sauvegarde déclare un accès anonyme, ne jamais la republier comme
retour arrière automatique : arrêt et revue spécifique. Ne pas supprimer le journal
ni les transactions, ne pas désactiver V2 pour rouvrir silencieusement un ancien
référentiel. Une restauration Google réelle devra être répétée sous autorisation
avant de présenter le mécanisme comme validé ; ce document décrit sa conception.

## Garantie de séparation REC/PROD

La barrière principale est l'ACL Google : le Gmail utilisé n'a aucun accès PROD,
direct ou indirect. Compléter par cible fixe/empreinte revue, identité attendue,
contrôle de métadonnées et environnement GitHub protégé, sans input de cible ni
repli. Ne jamais utiliser les identifiants du propriétaire Hotmail pour la CI s'ils
lui donnent accès à PROD. Les propriétés Sheets déjà confirmées manuellement
restent à vérifier au premier test réel ; le titre REC seul n'est jamais une preuve.

Attention au projet partagé : l'isolation du seul compte CI ne suffit pas si un
déclencheur ou une exécution de HEAD utilise encore le compte Hotmail ayant accès
à PROD. Le code installé pourrait alors s'exécuter sous une identité plus puissante
que le Gmail CI. Le propriétaire doit inventorier les contextes d'exécution de
chaque compte, puis confirmer qu'aucun contexte utilisant les nouvelles sources
ne conserve un accès PROD. Si cela reste incertain, arrêter avant installation ;
ne pas présenter une simple liste blanche de Script ID comme une isolation des
données à l'exécution.

Pas de garantie absolue contre un administrateur changeant code, secrets et droits
Google : un workflow ne peut pas retirer les pouvoirs de ses administrateurs. Le
système proposé bloque les erreurs de cible dans le circuit approuvé et limite
l'impact des identifiants à REC par les permissions Google.

## Compatibilité frontend : blocage distinct

JSONP injecte un script ; il n'effectue pas un parcours de connexion Google, ne
permet pas d'ajouter librement un en-tête OAuth et reste dépendant des cookies et
redirections. Le backend MYSELF n'est donc pas une API JSONP privée fiable à fournir
au frontend externe actuel. Le jeton GitHub Actions ne doit jamais être exposé au
frontend et ne résout pas cette authentification.

Pour US-015, conserver le Paramétrage privé HtmlService et google.script.run, déjà
préparé. La recette de l'ancien frontend JSONP reste un volet distinct et peut
rester bloquée. Pour une connexion durable de toute l'application, prévoir une
évolution de transport/authentification : hébergement HtmlService ou backend
intermédiaire authentifié après étude. Ne pas promettre ce résultat dans le seul
workflow, ne pas ouvrir ANYONE/ANYONE_ANONYMOUS pour le contourner.

Google recommande de réserver JSONP à des lectures non sensibles ; les écritures
JSONP historiques et les données nominatives ne constituent donc pas une cible
durable. Aucune refonte du frontend ou de la Synthèse n'est réalisée ici.

## Usage iPhone et configuration initiale

Configuration unique future, soumise à autorisation :

1. Vérifier les accès du Gmail REC au projet partagé et au classeur, et son absence
   totale de droits PROD. Choisir ce même compte pour les déploiements, Safari et
   V2_ADMIN_EMAIL, sans transfert de propriété.
2. Configurer le client OAuth et l'API dans Google Cloud/Apps Script ; obtenir le
   consentement hors ligne et stocker les justificatifs dans le coffre protégé.
   Ne pas utiliser une session Actions interactive pour saisir des identifiants.
3. Configurer l'environnement GitHub REC, les règles, valeurs privées et sauvegardes.
   Vérifier le statut OAuth pour éviter une réauthentification tous les sept jours.
4. Revoir/implémenter/tester l'orchestrateur et les refus sur doublures : identité,
   cible, backup invalide, drift distant, suppression de fichier, accès public,
   résultat incertain et restauration. Le brouillon actuel ne les implémente pas.
5. Après accord distinct, rendre disponible le workflow sur une branche par défaut
   de confiance, puis commencer par inspect : aucune mutation de sources. Répéter
   une sauvegarde et une restauration contrôlée sur REC avant usage récurrent.
6. Autoriser ensuite install/deploy privé sur le commit approuvé ; valider en Safari
   la lecture réelle. Import et activation V2 restent exclus et séparés.

Sur iPhone, l'usage courant est réaliste : GitHub dans Safari → Actions → workflow
REC → Run workflow → opération et commit ; lire le rapport, approuver le job, puis
ouvrir le reçu privé Drive et l'interface privée sous le Gmail REC. Aucun collage
des cinq fichiers ni Node local nécessaire. Un second approbateur doit avoir son
propre accès si la séparation des rôles est activée.

Les consoles GitHub/Google peuvent être manipulées en mode ordinateur sur iPhone,
mais l'amorçage OAuth dans un terminal privé reste la partie délicate. Un terminal
cloud privé contrôlé par le propriétaire peut convenir ; ce parcours mobile n'est
pas validé ici. Une intervention initiale depuis un ordinateur de confiance peut
être nécessaire/recommandée ; les futures US ne doivent pas la répéter sauf
révocation/expiration ou changement de portées. Ne pas présenter cette étude comme
une installation 100 % iPhone déjà prouvée.

## Sources officielles vérifiées

- [API Apps Script : possibilités et absence de prise en charge des comptes de service](https://developers.google.com/apps-script/api/concepts/).
- [clasp et CI GitHub Actions, secrets OAuth](https://developers.google.com/apps-script/guides/clasp).
- [README clasp : statut et limites des comptes de service](https://github.com/google/clasp/blob/master/README.md).
- [Droits des éditeurs sur les projets partagés](https://developers.google.com/apps-script/guides/collaborating).
- [Activation de l'API Apps Script](https://developers.google.com/apps-script/api/how-tos/enable).
- [Expiration OAuth, notamment sept jours en Testing](https://developers.google.com/identity/protocols/oauth2#expiration).
- [Sauvegarde getContent](https://developers.google.com/apps-script/api/reference/rest/v1/projects/getContent).
- [Remplacement complet updateContent et effets sur HEAD](https://developers.google.com/apps-script/api/reference/rest/v1/projects/updateContent).
- [Déploiement par l'API officielle](https://developers.google.com/apps-script/api/reference/rest/v1/projects.deployments/create).
- [MYSELF et USER_DEPLOYING](https://developers.google.com/apps-script/manifest/web-app-api-executable).
- [Portée Drive limitée drive.file](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).
- [Lancement manuel et présence sur la branche par défaut](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow).
- [Environnements, reviewers et restrictions de plans GitHub](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments).
- [Accès aux artefacts GitHub](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/download-workflow-artifacts).
- [Content Service, JSONP et recommandations de confidentialité](https://developers.google.com/apps-script/guides/content).
