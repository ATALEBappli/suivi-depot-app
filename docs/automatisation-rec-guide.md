# Automatisation REC — implémentation et mise en service

État : mécanisme développé/testé localement sur `dev/automatisation-rec`.
Aucun raccordement Google/GitHub, consentement, secret, envoi, déploiement, import,
activation V2 ou fusion n'a été effectué. Les deux gates sont désactivés par défaut ; le workflow n'est pas intégré à main. L'application US-015, ses cinq fichiers et sa Synthèse
restent inchangés.

## Fichiers et architecture

- `.github/workflows/rec-apps-script-manual.yml` : `workflow_dispatch` exclusivement,
  gate explicite, préparation sans secrets puis environnement REC protégé.
- `scripts/rec-automation/validation.mjs` : empreintes des cibles REC confirmées,
  contrôle de fichiers, propriétaire/éditeur, manifeste et déploiement.
- `package.mjs` : extrait le commit applicatif comme données depuis Git, assemble
  les cinq fichiers sans exécuter les scripts du candidat ; compile sans exécuter.
- `google.mjs` : OAuth utilisateur et API officielles Apps Script/Drive, hôtes fixes,
  aucun retry automatique, aucune API Sheets ou scripts.run.
- `core.mjs` : inspect/install/deploy/restore, sauvegarde, contrôle de dérive et
  journal privé d'opération, refus en cas d'incertitude.
- `cli.mjs` : raccordement au workflow, secrets en mémoire, résumés masqués.
- `tests/rec-automation/*.test.mjs` et `helpers.mjs` : services fictifs, aucun Google.
- Le workflow de syntaxe existant exécute aussi ces tests sans secrets. Seul ce
  contrôle local peut se lancer automatiquement ; aucune écriture Google ne le peut.

Les quatre actions :

| Action | Effet après autorisation et configuration |
| --- | --- |
| inspect | Identité, métadonnées du projet/classeur, droits, sources, déploiements et opérations pending ; aucune mutation de ressource Google |
| install | Sauvegarde privée relue, trace pending, remplacement du HEAD par le bundle, relecture et reçu done ; aucun déploiement |
| deploy | Exige le HEAD déjà installé identique au candidat ; sauvegarde, version immuable relue puis création/mise à jour du seul déploiement privé |
| restore | Sauvegarde d'abord l'état courant, restaure les sources d'une sauvegarde vérifiée ; peut aussi rétablir explicitement une version privée de déploiement connue |

Installer et déployer restent deux lancements distincts. Aucune action n'importe
les logements, n'active V2 ou ne crée son journal. Lire les métadonnées Drive du
classeur ne lit ni ne modifie ses cellules. Les propriétés ne sont pas changées.

## Verrous de cible, identité et publication

Les IDs réels ne sont pas dans Git. Leurs SHA-256 attendus sont figés dans le code
à partir des deux cibles REC confirmées par le propriétaire. Modifier uniquement
un secret de cible provoque un refus **avant l'envoi du moindre token à Google**.
Il n'y a aucun input de cible/URL/compte de remplacement, aucune création de projet,
aucun repli PROD. Une nouvelle cible nécessite une revue du contrôleur.

À chaque opération, vérifier :

- email Google vérifié attendu et identité sub fournie ;
- Script ID exact, titre SuiviDepotAPI-REC et absence de parentId (projet autonome) ;
- ID/empreinte du classeur, propriétaire des deux fichiers et droits canEdit ;
- partage direct limité aux deux comptes configurés, rôle explicite propriétaire
  ou éditeur, aucun groupe/domaine/partage public/Drive partagé ;
- manifeste V8 sans exécutable API, accès MYSELF et exécution USER_DEPLOYING ;
- un seul déploiement versionné connu, privé, si une URL existe déjà ;
- empreinte du HEAD et des déploiements inchangée juste avant mutation.

Des métadonnées de permissions omises par Google entraînent un refus, pas une
supposition. Ne pas élargir les permissions pour contourner ce résultat sans revue.

Une baseline sans configuration webapp est sauvegardable/restaurable. Une baseline
ou un déploiement anonyme/public empêche toute installation/restauration automatique.
Si inspect détecte ce cas initial, présenter le diff du manifeste et faire valider
sa mise en conformité privée séparément ; ne pas utiliser un flag de force.

Les versions de déploiement sont immuables et relues avant publication. Un premier
déploiement est permis seulement sans déploiement versionné préexistant ; les
suivants exigent REC_DEPLOYMENT_ID explicitement configuré. Aucun déploiement inconnu
n'est adopté ni supprimé. La réponse et la relecture doivent confirmer MYSELF et
USER_DEPLOYING. Une URL /dev ou un ping ne constituent pas ce contrôle.

## Déclencheurs : contrôle réel obligatoire, attesté manuellement

L'API REST de gestion ne fournit pas l'inventaire complet des déclencheurs des
comptes propriétaires/éditeurs. Le workflow ne prétend pas l'avoir automatisé.

Avant chaque écriture :

1. Depuis le compte Hotmail propriétaire puis le Gmail REC, examiner les déclencheurs
   du projet et les pages « Mes déclencheurs ». Les déclencheurs installables d'un
   autre compte ne sont pas tous visibles depuis un seul compte.
2. Identifier aussi fonctions déclenchées simplement, exécutions depuis l'éditeur,
   URL de développement et éventuels clients qui utilisent le HEAD.
3. Vérifier qu'aucun contexte exécutant les nouvelles sources ne conserve de droits
   PROD. Le seul fait que le token CI soit Gmail REC n'isole pas un déclencheur
   appartenant à Hotmail. Si un contexte reste incertain, arrêter.
4. Geler les éditions/exécutions pendant installation/restauration, sauvegarder les
   propriétés, vérifier APP_ENV=REC, les deux IDs du classeur connu, V2 inactive et
   V2_ADMIN_EMAIL conforme au Gmail qui déploiera. Cette case ne modifie rien.
5. Refaire inspect après tout changement ; copier son headHash, puis cocher
   audit_confirmed lors du lancement manuel concerné. L'approbateur GitHub confirme
   ces faits. Si l'attente se prolonge ou si l'état change, refaire l'audit.

La case audit_confirmed est une attestation humaine, pas une preuve cryptographique
ou un inventaire Google. Les mutations sont refusées si elle est absente. La liste
blanche d'IDs n'empêche pas un administrateur de changer le code ou les droits.

## Sauvegardes et journal des interruptions

Chaque mutation crée d'abord une sauvegarde JSON à la racine du Drive **privé du
Gmail REC**, avec drive.file. Pas de dossier à configurer, pas d'artefact en clair,
pas de changement de partage ni de suppression. Le JSON contient les sources,
manifestes, références de déploiement, empreintes, cible hachée, compte et date.
La copie est relue depuis Drive et son empreinte comparée avant toute mutation.

Nom : REC-backup-<référence opaque>.json. Le propriétaire du fichier doit être le
Gmail REC, seul bénéficiaire d'une permission owner. Toute permission supplémentaire
bloque l'installation. Les justificatifs OAuth ne sont jamais dans ces fichiers.
Les reçus REC-operation-<référence>.json contiennent l'URL/ID privés du déploiement.
Les logs publics n'affichent que les références opaques, hashes, nombres et statuts.
Sur iPhone, ouvrir Drive avec le Gmail REC pour consulter le reçu et sa webApp.url.

Les appProperties Drive sont privées au client OAuth qui a créé ces fichiers.
Conserver ce même client lors d'une rotation de refresh token. Supprimer/changer
le client peut empêcher la recherche automatique des anciennes sauvegardes ;
préparer alors une reprise administrative spécifique et conserver aussi une copie
privée hors ligne des sauvegardes utiles. Aucune migration silencieuse n'est prévue.

La sauvegarde ne couvre pas Script Properties, autorisations, déclencheurs, données
Sheets, ni les changements intervenus après sa création. Conserver séparément une
sauvegarde privée des propriétés/déclencheurs et celle du classeur déjà réalisée.
Aucune API scripts.run ou code d'export des propriétés n'est ajouté ici.

Avant un premier appel de mutation, un reçu pending est stocké et vérifié. Après
succès et relecture, il devient done. Un timeout/arrêt peut laisser pending. Dans
ce cas toute nouvelle mutation est refusée et inspect restitue la référence et
le checkpoint. Il n'y a aucun retry automatique, purge ou rollback silencieux.
La concurrence GitHub ne protège pas d'une édition manuelle Google entre deux
requêtes ; il n'y a pas de compare-and-swap atomique fourni par ces API.

Une réexécution du même run réussi peut renvoyer son reçu sans réécrire. Ce reçu
est historique : il ne constitue pas une nouvelle validation de l'état actuel.
Ne pas relancer aveuglément un ancien run après une restauration ; refaire inspect.
Un fichier Drive créé juste avant une interruption peut rester orphelin ; le code
ne le supprime pas et ne considère pas une sauvegarde non relue comme validée.

## OAuth : configuration initiale future, sans copie des fichiers Apps Script

Ne réaliser ces étapes qu'après validation de cette implémentation et du
raccordement. Aucun compte de service ou token OIDC n'est utilisé.

### Google

1. Garder Gmail REC éditeur du seul projet/classeur REC et sans accès PROD. Hotmail
   reste propriétaire ; aucun transfert de propriété n'est nécessaire.
2. Dans Google Cloud, créer/choisir un projet de configuration OAuth, activer
   **Google Apps Script API** et **Google Drive API**. Cela ne demande pas de changer
   l'association Cloud du projet Apps Script existant.
3. Dans Google Auth Platform, configurer le consentement, le Gmail REC comme
   utilisateur de test au démarrage et un client OAuth « Application Web ». Pour
   l'amorçage via OAuth Playground, ajouter l'URI autorisée :
   `https://developers.google.com/oauthplayground`.
4. Dans les paramètres du compte Gmail sur le tableau de bord Apps Script, activer
   l'accès API Apps Script. Cela n'installe et n'exécute aucun code du projet.
5. Depuis le navigateur privé de confiance du propriétaire, ouvrir le
   [Playground OAuth officiel Google](https://developers.google.com/oauthplayground/).
   Dans la roue dentée : Use your own OAuth credentials, saisir SON client ID et
   client secret ; conserver l'accès hors ligne. Ne pas employer le client partagé
   par défaut du Playground : ses refresh tokens sont révoqués après 24 h.
6. Dans Step 1, saisir les portées ci-dessous, autoriser avec le **Gmail REC**, puis
   dans Step 2 échanger le code. Ne pas utiliser Step 3 pour appeler une API de
   mutation. Ne pas partager l'URL de retour (elle contient un code) ni les tokens.

   ```text
   openid
   https://www.googleapis.com/auth/userinfo.email
   https://www.googleapis.com/auth/script.projects
   https://www.googleapis.com/auth/script.deployments
   https://www.googleapis.com/auth/drive.metadata.readonly
   https://www.googleapis.com/auth/drive.file
   ```

   metadata.readonly sert à vérifier propriétaire/permissions des deux ressources ;
   drive.file sert uniquement aux sauvegardes/reçus créés par cette application.
   La première portée permet aussi de voir les métadonnées des fichiers accessibles
   au compte : cette autorisation reste plus large que les seules deux ressources,
   d'où l'importance d'un compte sans droits PROD. Aucun scope Sheets n'est demandé
   à la CI ; l'exécution privée demandera séparément ses droits Sheets si nécessaire.
7. Conserver en privé client_id, client_secret et refresh_token. Ne pas copier
   access_token, id_token ou authorization_code dans le code ou les inputs Actions.
   Placer les trois valeurs dans le secret GitHub expliqué ci-dessous. Après
   amorçage, retirer l'URI Playground des redirections autorisées si approprié,
   sans révoquer le refresh token destiné à la CI.
8. Pour le pilote, OAuth externe Testing expire normalement après 7 jours avec ces
   portées. Pour un usage durable, revoir le statut OAuth et les exigences de
   vérification Google, puis réautoriser si nécessaire ; aucune durée infinie n'est
   garantie. Le statut de publication OAuth ne rend pas la web app publique.

L'interface Cloud/Playground est accessible par navigateur ; les opérations peuvent
être tentées dans Safari « Version pour ordinateur ». Ce parcours iPhone n'a pas
été validé ici. Aucun terminal, Node ou clasp sur l'iPhone n'est nécessaire avec
cette voie. Les consentements et protections Google peuvent imposer un ordinateur
de confiance ou une assistance ponctuelle : aucune étape n'est affirmée impossible
sur tout iPhone, mais l'amorçage intégral sur ce téléphone n'est pas garanti.
Ne pas désactiver une protection de connexion pour le faire fonctionner.

### GitHub, sans activation immédiate

1. Faire revoir la branche dev/automatisation-rec et ses tests. Les sources de
   l'US-015 doivent être disponibles dans une branche distante pour que son SHA
   soit lisible par Actions ; les secrets ne doivent jamais accompagner ce push.
2. GitHub → dépôt → Settings → Environments → créer **REC**. Configurer les
   approbateurs requis, la branche de déploiement main uniquement et interdire le
   bypass administrateur lorsque disponible. Avec un seul approbateur, laisser
   l'auto-approbation possible si c'est le choix assumé ; sinon prévoir un second
   approbateur pour ne pas bloquer tous les runs. Ne pas présenter l'auto-revue
   comme une séparation des rôles. Vérifier les fonctions disponibles selon le plan
   GitHub, notamment pour un dépôt privé.
3. Ajouter exclusivement dans cet environnement les secrets :

   | Secret | Valeur à saisir en privé |
   | --- | --- |
   | REC_SCRIPT_ID | ID du projet REC déjà confirmé, pas un ID de déploiement |
   | REC_SHEET_ID | ID du classeur REC déjà confirmé |
   | REC_GOOGLE_EMAIL | Adresse Gmail REC en minuscules |
   | REC_OWNER_EMAIL | Adresse Google Hotmail propriétaire, en minuscules |
   | REC_DEPLOYMENT_ID | Laisser absent au premier déploiement ; ensuite ID lu dans le reçu privé |
   | REC_GOOGLE_OAUTH | JSON ci-dessous, constitué avec les seules valeurs privées réelles |

   ```json
   {"client_id":"EXEMPLE_REMPLACER_EN_PRIVE","client_secret":"EXEMPLE_REMPLACER_EN_PRIVE","refresh_token":"EXEMPLE_REMPLACER_EN_PRIVE"}
   ```

4. Après autorisation de fusion de l'orchestrateur, l'intégrer à la branche par
   défaut, au moyen d'une PR limitée aux fichiers d'automatisation. La branche
   actuelle contient des ancêtres US-015 : ne pas la fusionner intégralement vers
   main si seule l'automatisation est autorisée. GitHub exige cette présence pour le bouton Run workflow. Cela n'autorise
   pas la fusion de l'US-015 applicative ; le paquet peut venir de son commit revu
   sur une autre branche. Aucun changement de main n'est réalisé par cette mission.
5. Garder la variable **de dépôt** REC_AUTOMATION_ENABLED absente ou false jusqu'à
   la validation explicite de mise en service. Elle est volontairement différente
   d'un secret et sert de gate avant même les jobs. Lors de l'activation autorisée,
   la créer dans Settings → Secrets and variables → Actions → Variables, valeur true.
   Laisser la deuxième variable de dépôt REC_MUTATIONS_ENABLED absente ou false :
   seul inspect fonctionnera. Après validation distincte des écritures, la passer
   à true pour permettre install/deploy/restore. Le premier job, sans environnement
   Google, contrôle ces gates avant tout accès aux secrets. Ne pas créer de
   variables d'environnement homonymes qui changeraient leur signification.

Le workflow reste refusé sur une autre branche que main, dans un fork, sans cette
variable ou sans les bons IDs. Aucune entrée de formulaire ne peut choisir PROD.
Les actions externes sont figées à des SHA revus ; aucune dépendance npm n'est
installée dans le job ayant les secrets. Le code candidat ne s'y exécute pas.

## Lancement depuis l'iPhone après autorisation de mise en service

GitHub dans Safari → Actions → « REC Apps Script — opérations manuelles » → Run
workflow, branche main. Ne pas sélectionner le commit applicatif comme branche
d'exécution du contrôleur : c'est le champ source_sha qui le choisit.

1. **inspect** : aucun autre champ requis. Approuver le job REC. Lire headHash,
   nombre de fichiers/déploiements et pending. Vérifier les reçus privés si nécessaire.
2. **install** : source_sha complet (40 caractères) du commit approuvé,
   expected_head_sha256 copié d'inspect, audit_confirmed coché après les contrôles
   décrits plus haut. Approuver. Vérifier status done, références de backup et reçu
   privé Drive ; aucune URL n'est créée par cette action.
3. Refaire **inspect**, puis **deploy** avec le même source_sha, le nouveau headHash
   et une attestation renouvelée. Approuver. Ouvrir le reçu Drive sous Gmail REC pour
   obtenir l'URL privée, puis l'ouvrir dans Safari sous ce même compte. Un premier
   consentement aux services du script peut être demandé ; la CI ne le remplace pas.
4. Après le premier succès, enregistrer en privé REC_DEPLOYMENT_ID depuis le reçu
   pour que les prochaines US mettent à jour le même déploiement, sans nouvelle URL.
5. Tester le Paramétrage et les lectures historiques. Ne pas activer V2 ni importer
   les 12 logements. Une page HTTP 200, le succès API ou un ping ne prouvent pas
   la bonne lecture du classeur ni la compatibilité du frontend externe JSONP.

Le badge de déploiement de l'environnement GitHub décrit le job GitHub ; il ne
prouve pas qu'une web app Google a été déployée. Seuls l'opération deploy, les
contrôles API et le reçu privé en apportent la preuve technique, avant le test Safari.

Après inspect, si le HEAD est public/ancien, un déploiement est inconnu ou les
permissions ne sont pas visibles, arrêter avant install. Une première mise en
conformité du seul manifeste court peut être revue séparément sur iPhone : aucun
flag de force n'est fourni et les cinq fichiers ne sont pas à copier manuellement.

## Restauration et interruption

Ne pas supprimer les reçus pending pour débloquer une erreur. Commencer par inspect.

- Pour restaurer des sources : operation restore, expected_head_sha256 actuel,
  audit_confirmed, backup_reference et backup_sha256 du checkpoint choisi. Une
  nouvelle sauvegarde de l'état courant est créée avant toute restauration.
- Après un install interrompu : ajouter recovery_reference correspondant au pending
  et utiliser exactement sa backup_reference/backup_sha256. Une seule opération
  pending est acceptée ; son checkpoint initial reste la cible même si une reprise
  est interrompue. Le reçu original sera résolu, pas supprimé.
- Pour rétablir aussi le déploiement : cocher restore_deployment. Seul un ancien
  déploiement privé connu, présent dans cette sauvegarde, peut être repointé vers
  sa version. Sans cette case, restaurer HEAD ne change pas l'application versionnée.
- Après un deploy incertain : inspecter/reconcilier d'abord les déploiements. Une
  première URL potentiellement créée n'est jamais supprimée ou adoptée automatiquement.
  Une intervention Google séparément autorisée peut être nécessaire. Si la liste
  des déploiements ne correspond pas à l'état d'avant l'opération, la reprise est
  refusée. Ne pas créer une deuxième URL pour contourner le pending.
- Après récupération : nouveau inspect et nouveau lancement, pas de rerun aveugle
  d'anciens runs. Si plusieurs pending existent ou si leurs références ont été
  altérées, arrêter et faire auditer les reçus privés ; pas de purge automatique.

Le code refuse une sauvegarde publique, corrompue, d'un autre compte/projet ou un
retour à un manifeste anonyme. Il ne restaure ni propriétés, ni transactions, ni
classeur ; ces opérations sont distinctes et restent hors périmètre.

## Démarrage plus simple, sécurisé

Commencer par le client OAuth propre via Playground et **inspect seulement**
avec REC_AUTOMATION_ENABLED=true et REC_MUTATIONS_ENABLED=false dans
le workflow protégé. Aucun coffre externe, clasp, serveur OAuth à héberger,
transfert de propriété ou nouveau backend n'est nécessaire. Puis valider une
installation seule et sa sauvegarde, avant de lancer deploy. Garder ce déroulé en
deux étapes pour les futures US, plutôt qu'un déploiement automatique à chaque push.
Le token durable et ses secrets restent nécessaires ; cette solution ne prétend
pas être sans identifiants persistants.

Si l'amorçage Google bloque sur l'iPhone, l'alternative la plus simple est une
intervention unique d'un administrateur de confiance sur ordinateur pour configurer
OAuth/Secrets ; ensuite les lancements et approbations se font depuis l'iPhone.
Ne pas remplacer cela par un compte de service ou l'ouverture publique de l'API.

## Tests et limites

Commandes locales :

```sh
node --test tests/rec-automation/*.test.mjs
node tests/referentiel-v2.mjs
node scripts/check-apps-script.mjs
node tests/isolation.mjs
node scripts/check-js.mjs
git diff --check
```

Les tests utilisent exclusivement identités, comptes, sources et réponses fictifs.
Ils couvrent sauvegardes privées, corruption/partage, mauvais compte/cible/droits,
manifestes publics, drift concurrent, perte de réponse avant/après PUT et déploiement,
reprise, restauration source/version, packaging Git sans exécution de code candidat,
gates et absence de secrets dans les erreurs. Aucun test ne contacte Google.

Restent non certifiés : OAuth réel, droits effectifs du projet partagé, visibilité
réelle des permissions Drive pour le Gmail éditeur, consentement du déploiement,
quotas/délais Google et restauration réelle. Le contrôleur peut refuser une
normalisation Google des sources non prévue ; il conserve alors pending pour revue.
Il n'existe pas de transaction atomique entre backup, HEAD, version et déploiement.

Une installation ne supprime pas silencieusement un fichier distant : si un
fichier/type de l'ancien HEAD n'est pas dans le candidat, elle refuse avec
REMOTE_FILE_REMOVAL_REFUSED. Une restauration explicite peut retirer les fichiers
ajoutés depuis le checkpoint pour revenir à la sauvegarde choisie.

Les deux comptes/ACL autorisés et la liste de cinq fichiers sont volontairement
fermés. Une nouvelle cible, un nouveau fichier Apps Script ou un autre type de
déploiement nécessite une mise à jour revue du contrôleur, pas un paramètre libre.
Le système limite les erreurs dans le circuit approuvé ; il ne résiste pas à un
administrateur qui changerait simultanément code, secrets, approbations et droits.

La CI ne résout pas JSONP privé : le Paramétrage HtmlService/google.script.run reste
la voie privée prévue. Le frontend externe et ses appels nominatifs/écritures JSONP
ne sont pas déclarés compatibles par ce déployeur. Ne jamais fournir le token CI
au navigateur ni passer à ANYONE pour faire réussir les tests.

Sources officielles :
[API Apps Script](https://developers.google.com/apps-script/api/concepts/),
[remplacement HEAD](https://developers.google.com/apps-script/api/reference/rest/v1/projects/updateContent),
[déploiements](https://developers.google.com/apps-script/api/how-tos/manage-deployments),
[Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth),
[OAuth Playground](https://developers.google.com/oauthplayground/),
[Playground avec client propre](https://developers.google.com/admob/api/v1/how-tos/playground),
[durée OAuth](https://developers.google.com/identity/protocols/oauth2#expiration),
[workflows manuels](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow),
[environnements GitHub](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments).


## Lecture des refus depuis le téléphone

| Code / situation | Suite sûre |
| --- | --- |
| MUTATIONS_DISABLED | Le pilote est en lecture seule ; ne pas activer les écritures sans accord |
| AUTOMATION_DISABLED | Situation attendue avant validation ; ne pas activer la variable sans accord |
| WRONG_SCRIPT_TARGET / WRONG_SHEET_TARGET | Vérifier la saisie des IDs REC ; ne pas remplacer les empreintes par celles d'une cible inconnue |
| WRONG_GOOGLE_ACCOUNT | Réautoriser le Gmail REC prévu, pas le compte propriétaire ayant des droits PROD |
| PERMISSIONS_UNAVAILABLE / INVALID_FILE_PERMISSIONS | Faire vérifier visibilité et ACL par le propriétaire ; ne pas supposer que le contrôle a réussi |
| UNSAFE_MANIFEST / PUBLIC_DEPLOYMENT_REFUSED | Arrêter et faire revoir l'état distant ; aucun mode force |
| REMOTE_FILE_REMOVAL_REFUSED | Examiner les fichiers distants inconnus ; prévoir une revue, aucun effacement automatique |
| HEAD_CHANGED | Nouveau inspect, revue de l'édition intervenue et nouvelle attestation |
| PENDING_OPERATION / GOOGLE_WRITE_UNCERTAIN | Inspecter les reçus et la cible ; reprise explicite, pas de rerun aveugle |
| UNEXPECTED_EXISTING_DEPLOYMENT | Après premier succès, renseigner l'ID du reçu ; sinon faire identifier le déploiement inconnu |
| BACKUP_* / PRIVATE_* | Contrôler le backup privé, sa référence, son compte et son empreinte ; ne pas supprimer le reçu pour contourner |
| OAUTH_REFRESH_FAILED | Vérifier révocation/expiration et statut Testing, réamorcer dans le canal privé ; jamais de token dans le chat |

## Bilan local de cette implémentation

- 68 tests d'automatisation réussis, sans réseau Google.
- 29 scénarios métier/API US-015 et 84 scénarios historiques réussis.
- Isolation frontend REC/PROD réussie ; syntaxe de 48 sources analysée sans
  exécution applicative ; YAML du workflow analysé et diff sans défaut d'espacement.
- Comparaison à 401f2f5 : aucun changement du code applicatif US-015.
- Aucune nouvelle dépendance npm, aucun secret, API réellement authentifiée,
  activation de variable, job Google, publication ou fusion.

Les tests sont des validations sur doublures ; ils ne certifient pas l'OAuth,
les réponses de permission Drive du vrai projet ni une restauration Google.
