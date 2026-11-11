# REC-Maintenance — installation initiale et usage depuis iPhone

**Préparation uniquement. Attendre la validation et la fusion de la PR, puis une
autorisation distincte d'installation avant d'effectuer ces étapes dans Google.**
Aucune installation, connexion Google, modification de projet distant, écriture
Sheets, création de déclencheur ou publication n'a été réalisée pour cette mission.

REC-Maintenance est un **troisième projet autonome privé**. Ne pas coller ces
fichiers dans SuiviDepotAPI-REC ni dans REC-Synchronisation.

```text
REC-Maintenance → sources de REC-Synchronisation uniquement
REC-Synchronisation → sources de SuiviDepotAPI-REC uniquement
```

Aucune action au moment d'une fusion GitHub. Chaque mise à jour réclame le SHA
complet d'un commit relu et une approbation manuelle. Aucun outil ne se met à jour
lui-même. Les mises à jour des sources ne publient pas une nouvelle web app.

## Une seule installation initiale, après autorisation

Utiliser Safari, connecté **uniquement au compte REC**. Le mode « Version pour
ordinateur » peut aider à afficher les commandes Apps Script. Les libellés peuvent
varier avec Google ; ce parcours n'a pas encore été testé sur un iPhone réel.

1. Ouvrir le projet **REC-Synchronisation** existant. Vérifier son titre, son
   caractère autonome et son **Script ID** dans les paramètres. Ne pas utiliser
   l'ID du backend, d'une feuille ou d'un déploiement. Garder cet ID privé.
   Confirmer que le compte REC n'a aucun accès PROD, même indirect, et que les deux
   paramètres déjà installés désignent bien le backend REC et le compte REC.
   Cette attestation reste indispensable : un ID n'indique pas à lui seul REC/PROD.
2. Vérifier les fichiers existants : exactement un script `Synchroniseur` ou le nom historique `Code`
   (affichés avec `.gs`) et `appsscript` (JSON). La version initiale doit être
   exactement celle de Mission 7 ou Mission 9, avec uniquement les deux valeurs
   privées remplacées. Les ajouts de diagnostics et toute autre édition ou formatage initial sont
   bloquants : arrêter et faire revoir la différence, sans désactiver le contrôle.
3. Créer un nouveau projet Apps Script autonome nommé **REC-Maintenance**, privé,
   sans autre éditeur. Copier **une seule fois** le fichier `Maintenance.gs` revu
   depuis GitHub Raw/Copy ; renommer le fichier initial `Maintenance` et y coller
   le code. Dans cette copie Google seulement, remplacer l'unique marqueur de
   `MAINT_DESTINATION.scriptId`, au début, par le Script ID de REC-Synchronisation.
   **Ne pas remplacer les marqueurs présents dans les chaînes MAINT_TEMPLATE et
   MAINT_PROTECTED** : ils décrivent le contrat public, ce ne sont pas vos réglages.
4. Dans Paramètres du projet, afficher le manifeste `appsscript.json`, puis
   coller une fois le manifeste de **ce répertoire**. Aucun déploiement.
   Rattacher ce nouveau projet au **Google Cloud REC standard déjà configuré**,
   avec son numéro de projet, si le compte et les paramètres le permettent.
   Réutiliser les API Apps Script et Drive déjà activées ; ne pas créer un nouveau
   Cloud, compte de service ou client OAuth pour ce parcours. Les consentements
   restent propres aux projets : celui du synchroniseur n'autorise pas Maintenance.
   Si Google réclame de nouveaux droits ou une autre infrastructure, arrêter pour
   revue, sans élargir les permissions ni changer de compte.
5. Dans les propriétés du **nouveau** projet, ajouter `GITHUB_READ_TOKEN` avec le
   PAT existant en lecture seule, depuis votre stockage privé, et `CANDIDATE_SHA`
   avec les **40 caractères hexadécimaux minuscules** du commit fusionné et revu.
   Le PAT doit être limité à `ATALEBappli/suivi-depot-app`, Contents: Read-only.
   Il ne peut pas être récupéré automatiquement depuis les propriétés d'un autre
   projet. Ne jamais le coller dans le code, les logs, GitHub ou la conversation.
6. Lancer d’abord `diagnostiquerInstallation` (voir le diagnostic privé ci-dessous).
   Si `SOURCE_INITIALE_RECONNUE`, sélectionner `initialiserMaintenance` près du bouton Exécuter, puis Exécuter.
   Examiner le consentement : sources Apps Script, requêtes externes, fichiers
   Drive créés/ouverts par l'application et adresse du compte. Aucun accès Sheets,
   Drive global ou gestion des déploiements demandé. Le résultat doit être
   `LIAISON_EXISTANTE_VERROUILLEE`.
   Cette fonction ne fait que lire le synchroniseur et créer **dans Maintenance**
   une propriété privée `ENROLLMENT`. Elle détecte automatiquement ses deux valeurs
   privées, vérifie le compte effectif et refuse une version initiale inconnue.
   Elle ne peut pas être relancée pour remplacer la liaison. Ne pas supprimer
   ENROLLMENT pour contourner un refus.
7. Lancer `simulerSynchronisation`. Vérifier le SHA dans le journal et l'état
   `SIMULATION_SANS_ECRITURE_GOOGLE`. Aucun PUT ni sauvegarde Drive à ce stade.
   Pour la première installation, **s'arrêter ici** : l'autorisation d'installation
   ne vaut pas autorisation de mise à jour réelle. Ajouter le projet aux favoris
   Safari ou un raccourci sur l'écran d'accueil.

Le collage initial des deux fichiers et le seul ID privé sont nécessaires avec
les accès actuels. Aucun installateur OAuth externe n'est fourni. Les versions
futures du synchroniseur n'exigeront pas de nouveau collage tant que leur contrat
reste compatible avec ce noyau. Une évolution de Maintenance elle-même, de ses
permissions ou de l'enveloppe protégée exigera une intervention distincte revue.

## Première installation historique et diagnostic privé

Le nom API est `Code`, sans suffixe : `Code.gs` n'est que son affichage dans
l'éditeur. L'initialisation accepte explicitement `Code` ou `Synchroniseur`,
jamais les deux, jamais un nom libre. Le nom est verrouillé dans ENROLLMENT et
conservé lors de la matérialisation du candidat GitHub : Mission 7 `Code.gs`
reste `Code.gs` en Mission 9. Aucun renommage ni suppression implicitement
approuvée. Les sauvegardes/restaurations conservent ce même nom et le texte exact.
Les anciens enrôlements sans codeName restent limités à `Synchroniseur`.

La reconnaissance porte sur **tout le texte**, après remplacement du seul bloc
REC_DESTINATION strictement parsé par le bloc public à marqueurs. L'empreinte
SHA-256 doit appartenir aux deux références Mission 7/9 déjà approuvées ; aucune
nouvelle empreinte privée ni liste de noms de fonctions n'est acceptée.
Le manifeste, l'enveloppe, le compte effectif, les identités distinctes et les
métadonnées du projet restent contrôlés. L'installation avec diagnostics manuels
n'est donc pas déclarée compatible sans revue de leur contenu réel.

Après autorisation distincte d'installation, `diagnostiquerInstallation` ne lit
que les métadonnées et les sources de la cible. Aucun accès GitHub, Drive, backend,
aucune écriture de propriété, aucun plan ou approbation créé/effacé. Il retourne
uniquement un état et deux booléens ; aucun identifiant, empreinte privée, nom de
fonction, source ou erreur brute. `REVUE_PRIVEE_REQUISE` signifie que la structure,
le manifeste, la liaison et l'enveloppe passent, mais que le texte complet est
inconnu (diagnostics inclus). `REFUSE` signifie qu'un contrôle préalable échoue ;
ce diagnostic ne cherche pas à deviner un format ou une identité.

Procédure de revue **à préparer maintenant, à effectuer ultérieurement en privé** :

1. Arrêter les éditions/exécutions concurrentes du synchroniseur. Vérifier les
   identités dans Google en privé. Ne jamais transmettre les sources Google dans
   la conversation, les commentaires de PR, un service de diff ou des logs.
2. Garder une copie intégrale privée de tous les fichiers et une copie séparée
   des réglages/propriétés nécessaires au retour arrière, dans un stockage local
   protégé sans synchronisation publique. Les exports contiennent des données
   privées ; aucun export n'est demandé ni effectué par cette mission.
3. Dans un outil local hors réseau, comparer une **copie** du script à la fixture
   publique Mission 7 (ou au fichier Mission 9 du commit exact revu). Neutraliser
   uniquement les deux valeurs du bloc REC_DESTINATION dans la copie de travail,
   sans modifier l'original. Vérifier chaque différence localement, y compris
   position des ajouts, déclarations dupliquées, code global, manifeste et autres
   fichiers. Un nom « diagnostic » ne prouve pas l'innocuité d'une fonction.
   Ne pas partager le diff, même supposé expurgé : il peut contenir d'autres secrets.
4. Partager uniquement un constat humain sans détails privés : référence publique
   comparée, égalité du noyau oui/non, ajouts présents oui/non, revue terminée ou
   bloquée. Ce constat ne constitue pas une nouvelle empreinte approuvée et ne
   déverrouille pas Maintenance.
5. Si les ajouts doivent rester, arrêter l'installation. Une revue privée du texte
   exact, puis une évolution de reconnaissance revue et testée séparément sont
   nécessaires ; ne pas ajouter une empreinte utilisateur dans les propriétés,
   ignorer un suffixe, supprimer les contrôles ou élargir les noms autorisés.
   Si le propriétaire décide plutôt de retirer les diagnostics, une intervention
   distinctement autorisée, sauvegardée et réversible doit rétablir exactement
   une référence publique avec les deux valeurs privées conservées. Ne jamais
   remplacer toute la configuration par les marqueurs publics.
6. Relancer le diagnostic puis l'initialisation uniquement après cette validation.
   S'arrêter après simulation pour la première installation. La sauvegarde Drive
   automatique reste obligatoire avant tout PUT ultérieurement autorisé ; elle ne
   remplace pas la copie privée préalable à une éventuelle intervention manuelle.

Aucun diagnostic de l'installation réelle n'a été exécuté : la compatibilité
Mission 7 → Mission 9 est vérifiée sur mocks pour `Code.gs` exact et les refus des
ajouts manuels. La réussite passée d'une synchronisation ne prouve pas l'identité
du texte installé aujourd'hui.

## Chaque mise à jour future : un SHA, trois exécutions

Après revue/validation de la PR et autorisation de mettre à jour ce commit :

1. Sur GitHub dans Safari, copier le SHA **du commit fusionné réellement relu**,
   pas le numéro de PR, une branche, un tag ou un SHA court. Une PR validée puis
   modifiée n'est pas une autorisation pour ses nouvelles modifications.
2. Ouvrir le favori REC-Maintenance, puis Paramètres → Propriétés du script.
   Modifier seulement `CANDIDATE_SHA`, enregistrer et revenir à l'éditeur.
3. Choisir `simulerSynchronisation` → Exécuter. Vérifier le SHA et le résumé.
4. Choisir `approuverSimulation` → Exécuter : `APPROUVE_POUR_UN_ESSAI`.
5. Choisir `synchroniserCommitApprouve` → Exécuter dans les 30 minutes suivant la
   simulation. Sauvegarde privée, relecture, consommation de l'approbation, PUT
   unique et vérification sont automatiques. Attendre `SYNCHRONISATION_VERIFIEE`.
   Si `AUCUN_CHANGEMENT`, aucun PUT ni sauvegarde inutile.

Aucun paramètre privé à recopier, aucune sauvegarde manuelle à lancer, aucun
nouveau déploiement. `verifierResultat` est disponible pour revérifier ou résoudre
un PUT dont la réponse s'est perdue. `verifierConfiguration` est un diagnostic
facultatif après l'initialisation. `sauvegarderSources` permet un export privé
supplémentaire, mais n'est pas nécessaire au cycle normal.

Pour les évolutions du **backend**, employer ensuite le projet REC-Synchronisation
et son guide existant : Maintenance ne synchronise jamais le backend directement.
Une mise à jour de Maintenance n'autorise pas implicitement une opération backend.
Ne pas exécuter les deux outils en parallèle ; aucun verrou n'est partagé entre
projets. Vérifier l'absence d'exécution du synchroniseur pendant sa maintenance.

## Restauration explicite et erreurs

En cas de `REFUSE / CONTROLE_ECHOUE`, ne pas journaliser les erreurs HTTP brutes,
les propriétés ou les sauvegardes. Ne pas modifier les contrôles pour continuer.
En cas d'écriture incertaine, essayer uniquement `verifierResultat` ; les nouvelles
synchronisations et approbations SYNC restent bloquées tant que IN_FLIGHT demeure.

Pour restaurer :

1. La dernière sauvegarde est choisie par défaut. Pour une autre, définir
   `RESTORE_BACKUP_KEY` avec la clé numérique de l'index privé BACKUPS, jamais
   un ID Drive. Ne pas copier cet index dans GitHub ou dans la conversation.
2. Exécuter `simulerRestauration`, vérifier le choix privé, puis
   `approuverSimulation` et `restaurerSauvegardeApprouvee`.
3. Attendre `RESTAURATION_VERIFIEE`, puis supprimer RESTORE_BACKUP_KEY si utilisé.

Une approbation de synchronisation ne vaut pas pour une restauration. Un plan de
restauration peut être approuvé même après un PUT incertain. L'état remplacé est
lui aussi sauvegardé ; l'identité, la destination et le manifeste doivent toujours
respecter le contrat. Si l'état courant a une liaison ou un manifeste interdit,
la restauration s'arrête : revue privée nécessaire, aucun écrasement de secours.
Ne pas supprimer IN_FLIGHT pour forcer un nouvel essai.

## Ce qui reste privé et inchangé

| Élément | Où il reste |
| --- | --- |
| ID de REC-Synchronisation | Constante de la copie Google de Maintenance uniquement. |
| ID backend et accountEmail déjà installés | Détectés sans exécution de code, mémorisés dans ENROLLMENT, réinjectés dans Google. |
| PAT GitHub | GITHUB_READ_TOKEN de chaque projet qui en a besoin, jamais exporté. |
| Jeton Google | Mémoire d'exécution uniquement ; aucun stockage ou log par cet outil. |
| PLAN, APPROVAL, ENROLLMENT, BACKUPS, IN_FLIGHT, LAST_RESULT | Propriétés privées générées dans Maintenance ; ne pas éditer manuellement. |
| Propriétés du synchroniseur existant | Conservées : le PUT n'envoie que les fichiers, jamais ses propriétés. |
| Propriétés et données du backend | Inaccessibles à ce code : aucun appel vers le backend ou Sheets. |

Les sauvegardes contiennent **les sources personnalisées et donc des identifiants
privés**. Elles sont créées dans le Drive REC, avec un propriétaire unique REC et
aucun partage vérifié avant/après écriture puis avant restauration. Ne jamais les
exporter vers GitHub. Elles ne contiennent pas les propriétés, PAT, données Sheets,
déclencheurs ou déploiements. Elles n'accèdent pas aux sauvegardes créées par
l'autre projet ; drive.file ne donne pas un accès Drive global.

## Contrat de confiance et limites

Liste exacte GitHub : `Synchroniseur.gs`, `appsscript.json`, `README.md` ignoré.
Arbres complets, blobs Git vérifiés, aucun sous-répertoire/symlink/fichier inattendu.
Sur Google et dans les sauvegardes : deux fichiers seulement. Le manifeste complet
est figé, y compris les quatre portées ; aucune permission ou bibliothèque ajoutée.
L'ordre des clés JSON et l'indentation sont libres, pas le contrat.

L'en-tête et le bloc REC_DESTINATION ont une syntaxe stricte. Les constantes dépôt,
titre et chemin du backend, ainsi que recConfig_, recMetadata_ et recGoogle_,
doivent conserver leur texte exact et une déclaration unique. Un candidat GitHub
personnalisé est refusé, même avec les bonnes valeurs. Seuls les deux marqueurs
sont remplacés localement. Le plan lie SHA, empreintes avant/après, cible et liaison
privée ; les empreintes sont revérifiées avant PUT, après sauvegarde.

**Ces vérifications textuelles ne sont pas un analyseur de sécurité JavaScript.**
Un code malveillant peut contourner des fonctions conservées, utiliser les mêmes
portées pour d'autres appels ou agir lors d'une exécution future. Relire tout le
commit exact et ses tests avant approbation ; ne jamais traiter un code arbitraire
comme sûr parce que le manifeste et les fragments protégés correspondent.
Aucun candidat n'est compilé ni exécuté par Maintenance.

La portée script.projects n'est pas bornée par Google à un seul projet. Le compte
REC doit rester sans accès PROD et aucun éditeur non fiable ne doit accéder aux
outils, à leurs propriétés ou au Cloud REC. Une modification manuelle du code ou
des propriétés de confiance par un éditeur peut contourner ces contrôles. Le titre
seul ne prouve ni la propriété, ni l'environnement. L'initialisation n'inventorie
pas les droits Google et ne certifie pas les IDs privés.

Autres limites : fenêtre de concurrence sans compare-and-swap, changements de
partage concurrents possibles après contrôle, quotas/OAuth/API et Safari non
validés à distance, absence d'atomicité globale. Le PUT remplace tous les fichiers
et change HEAD ; des exécutions éditeur/développement ou déclencheurs préexistants
peuvent employer les nouvelles sources sans déploiement versionné. Aucun nouveau
déclencheur n'est créé. Arrêter les opérations concurrentes avant maintenance.

L'index s'arrête volontairement à **20 sauvegardes**, sans purge automatique.
Au-delà, aucune écriture de sources ; une maintenance privée revue est nécessaire
pour l'archivage. Une sauvegarde vide/orpheline peut subsister après échec. Les
renouvellements du PAT, consentements révoqués ou changements de permissions ne
peuvent être rendus entièrement automatiques. Ne pas élargir les droits pour les
contourner. Pour retirer l'outil : arrêter les approbations, révoquer son accès
Google, retirer le PAT de ses propriétés et gérer séparément les sauvegardes.
Révoquer un PAT réutilisé arrête aussi les autres projets qui l'emploient.

## Interface plus simple : proposition séparée

Un favori Safari/raccourci d'accueil n'ajoute aucun droit et est recommandé dès
l'installation. Une interface avec boutons dans une web app privée pourrait
réduire les manipulations, mais ajouterait déploiement, sessions, protection des
actions et maintenance du point d'entrée. Aucune interface plus simple avec un
risque équivalent n'est démontrée ici ; cette web app n'est **pas implémentée** et
nécessiterait une étude et un accord distincts.

## Validation hors réseau et références

`node tests/rec-maintenance.mjs` charge le vrai Maintenance.gs dans node:vm avec
Google, GitHub, Drive, horloge et verrou simulés. Aucun client réseau réel dans le
contexte. La fixture historique est le source public Mission 7 non personnalisé,
conservé pour tester une première installation sans dépendre de l'historique Git.
Les mocks ne prouvent ni les autorisations Google réelles ni le confort iPhone.

Références : [mise à jour complète des sources](https://developers.google.com/apps-script/api/how-tos/manage-projects),
[jeton en mémoire](https://developers.google.com/apps-script/reference/script/script-app#getOAuthToken()),
[consentement Google](https://developers.google.com/apps-script/guides/services/authorization),
[projet Cloud standard](https://developers.google.com/apps-script/guides/cloud-platform-projects),
[portée Drive limitée](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).
