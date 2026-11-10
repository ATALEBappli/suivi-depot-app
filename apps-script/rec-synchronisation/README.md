# REC-Synchronisation — préparation Mission 7

Code à revoir, pas encore installé ni testé sur Google. Aucun appel Google,
installation, synchronisation, déclencheur ou déploiement réalisé par cette PR.
Ne pas importer ce répertoire dans `SuiviDepotAPI-REC` : il appartient à un
**nouveau projet autonome privé** `REC-Synchronisation`. Les sources métier
dans `../src/` sont inchangées. Google Sheets demeure la base de données.

## Architecture et limites d'autorisation

```text
iPhone → éditeur Apps Script du compte REC → approbation manuelle d'un plan
REC-Synchronisation → GitHub REST (commit SHA exact, lecture seule)
                   → API Apps Script (métadonnées, sources, puis PUT autorisé)
                   → Drive privé (sauvegarde des sources relue avant PUT)
```

Pas de serveur OAuth, de client à créer dans Cloud Console, de jeton Google
exporté, de web app, de `clasp`, de workflow d'envoi ni de déclencheur fourni.
Google assure le consentement utilisateur et le renouvellement des autorisations
du projet. `ScriptApp.getOAuthToken()` reste en mémoire de l'exécution ; aucune
valeur n'est écrite dans les propriétés ou les logs. L'autorisation Google du
projet dure néanmoins jusqu'à révocation : ne pas la confondre avec un jeton
temporaire en mémoire. Elle devra être révoquée si le synchroniseur est retiré.

Les portées déclarées sont `script.projects`, `script.external_request`,
`drive.file` (exports créés par ce projet seulement), `userinfo.email` (contrôle
du compte effectif). Aucun accès API Sheets, Drive global ou déploiement demandé.
`script.projects` n'est **pas** une autorisation limitée à REC : le compte dédié
ne doit avoir aucun accès PROD, y compris par groupes ou dossiers. Le code
personnalisé refuse toute autre destination, mais un éditeur pourrait changer
le code : ne pas partager le synchroniseur. L'autorisation d'un SHA implique
la revue du code métier, qui aura ses propres accès lorsqu'il sera exécuté.

Le Script ID réel est inconnu et ne doit pas entrer dans Git. Les deux constantes
`REC_DESTINATION` sont des marqueurs **bloquants**. Le propriétaire renseignera
l'ID et l'adresse du compte une fois, uniquement dans la copie Google. Aucun
paramètre ou propriété ne peut remplacer la destination. L'ID de la feuille et
un ID de déploiement ne conviennent pas. Le titre attendu est fixé dans le code.
Seuls les projets autonomes sont acceptés (`parentId` absent).

Références : [OAuth dans ScriptApp](https://developers.google.com/apps-script/reference/script/script-app#getOAuthToken()),
[lecture des métadonnées](https://developers.google.com/apps-script/api/reference/rest/v1/projects/get),
[remplacement du contenu](https://developers.google.com/apps-script/api/reference/rest/v1/projects/updateContent),
[portée Drive limitée aux fichiers de l'application](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).

## Contrat GitHub et manifeste

Dépôt fixe `ATALEBappli/suivi-depot-app`, répertoire `apps-script/src/`.
SHA de commit obligatoire de 40 caractères hexadécimaux minuscules ; refus des
branches et tags. Lecture de l'objet commit, de son arbre non tronqué puis des
blobs. SHA-1 Git de chaque blob recalculé sur ses octets ; refus des symlinks,
sous-répertoires, doublons, fichiers non prévus, sources manquantes et contenus
trop volumineux. Liste fermée : `Code.gs`, `appsscript.json`, et `README.md`
ignoré. Tout élargissement exige une PR du synchroniseur, pas une simple propriété.

Le manifeste candidat doit être du JSON et correspondre sémantiquement au
manifeste actuellement revu dans `apps-script/src/` (ordre des clés et indentation
libres). Une portée, bibliothèque ou permission ajoutée est refusée. Ce manifeste
métier conserve son accès web historique `ANYONE_ANONYMOUS` ; ce n'est pas une
certification de sécurité de l'application. Le manifeste du synchroniseur ne
contient aucun `webapp`.

La simulation ne compile ni n'exécute le code candidat et ne prouve pas son
innocuité. Vérifier les tests de la PR et le SHA sur GitHub avant de l'approuver.
Un fichier distant supplémentaire n'est pas supprimé automatiquement : la
synchronisation refuse cette situation, qui nécessite une revue séparée.

## Fonctions à choisir dans l'éditeur

| Fonction | Effet |
| --- | --- |
| `verifierConfiguration` | Contrôle compte, personnalisation, présence du jeton et identité du projet ; aucun PUT. |
| `simulerSynchronisation` | Lit GitHub et REC, fige SHA + empreintes avant/après dans les propriétés du synchroniseur ; aucune écriture des sources ni sauvegarde Drive. |
| `approuverSimulation` | Action humaine explicite ; autorise le dernier plan pendant les 30 minutes suivant sa simulation. |
| `sauvegarderSources` | Crée une sauvegarde privée Drive, la relit et vérifie intégrité et permissions ; aucun PUT Apps Script. |
| `synchroniserCommitApprouve` | Vérifie le plan, sauvegarde REC, relit REC, consomme l'approbation, envoie puis relit et compare. |
| `verifierResultat` | Compare REC à l'empreinte du dernier résultat attendu ; peut résoudre une écriture dont la réponse s'est perdue. |
| `simulerRestauration` | Prépare un plan à partir d'une sauvegarde sélectionnée, sans remplacer les sources. |
| `restaurerSauvegardeApprouvee` | Après approbation du plan, sauvegarde l'état actuel puis restaure et vérifie. |

Les logs affichent uniquement états fixes, nombres et SHA Git, sans ID Google,
adresse, jeton, contenu source ou réponse API. Les erreurs brutes sont supprimées,
y compris celles provenant du transport. `REFUSE / CONTROLE_ECHOUE` est volontairement
générique : vérifier les prérequis, ne pas activer de journalisation HTTP brute.
Ne jamais journaliser `PLAN`, `BACKUPS`, les propriétés ou un objet d'erreur.

## Approbation, concurrence et reprise

Pas d'écriture à chaque fusion et pas de surveillance de `main`. Le propriétaire
saisit `CANDIDATE_SHA`, simule, examine le résumé puis exécute
`approuverSimulation`. Il lance ensuite `synchroniserCommitApprouve`. La simulation
suivante invalide l'approbation précédente. Une modification de SHA ou de REC,
un plan expiré ou une sauvegarde impossible empêchent le PUT. Un plan sans
changement ne provoque aucune écriture ni sauvegarde inutile.

Un verrou de script protège toutes les fonctions publiques. L'approbation est
consommée **avant** le PUT ; un marqueur `IN_FLIGHT` est conservé jusqu'à la
vérification. Une erreur HTTP, un timeout ou une interruption après PUT interdit
les nouvelles synchronisations, sans nouvel essai automatique. Exécuter
`verifierResultat` ; en cas de divergence, préparer une restauration explicite.
Ne pas supprimer manuellement `IN_FLIGHT` pour forcer un nouvel essai.

L'API ne fournit ici aucun compare-and-swap : une édition extérieure entre la
dernière lecture et le PUT reste possible. Interdire les éditions manuelles REC
pendant l'opération. La relecture détecte une divergence, mais ne peut empêcher
ce conflit ni garantir un retour arrière atomique. Aucun rollback silencieux.

## Sauvegarde privée et restauration

Chaque sauvegarde est un JSON indépendant à la racine du Drive du compte REC,
nommé `REC-source-backup-<horodatage>.json`. Vérification : un seul propriétaire,
le compte dédié, aucun partage ; écriture du contenu puis relecture intégrale.
Une sauvegarde privée ne contient que le code/manifeste et la cible ; **ni données
Sheets, ni propriétés du backend, ni déclencheurs, ni déploiements**. Les sources
historiques peuvent contenir des informations sensibles : aucun export GitHub.

L'index privé `BACKUPS` conserve ID et empreinte, avec une clé numérique `1`, `2`,
etc. Ne pas le copier dans une PR ou une conversation. Limite volontaire de 20
sauvegardes ; au-delà, arrêt avant PUT. L'archivage de l'index et sa remise à zéro
nécessitent une maintenance privée revue, non implémentée ici. Aucune purge
automatique. Un fichier Drive vide/orphelin peut subsister si la sauvegarde échoue.

Pour restaurer :

1. Dans les propriétés du synchroniseur, définir `RESTORE_BACKUP_KEY` avec la clé
   numérique de la sauvegarde souhaitée (pas un ID Drive). À défaut, la dernière.
2. Lancer `simulerRestauration`, puis `approuverSimulation` après examen.
3. Lancer `restaurerSauvegardeApprouvee` puis `verifierResultat`.
4. Supprimer `RESTORE_BACKUP_KEY` pour revenir au choix par défaut.

La restauration vérifie la cible et l'empreinte du JSON, puis sauvegarde l'état
qu'elle remplace. Elle ne restaure ni les propriétés, ni les données, ni les
versions déployées. Conserver assez de place dans l'index pour cette sauvegarde.

## Installation future depuis Safari sur iPhone

**Ne pas suivre ces étapes avant validation de la PR et autorisation Google
distincte.** L'accès au projet a été confirmé par le propriétaire ; le confort
d'édition et de collage de ces fichiers sur iPhone n'a pas été vérifié.

1. Dans Safari, utiliser le compte Google REC uniquement. Vérifier hors de ce
   synchroniseur qu'il n'a aucun partage PROD. Ouvrir `SuiviDepotAPI-REC`, puis
   ses paramètres : relever le **Script ID** et confirmer le titre, le caractère
   autonome et `SPREADSHEET_ID` vers le classeur fictif. Ne communiquer aucun ID.
2. GitHub → profil → Settings → Developer settings → Personal access tokens →
   Fine-grained tokens → Generate new token. Choisir le propriétaire du dépôt,
   **Only select repositories → suivi-depot-app**, **Contents: Read-only**,
   expiration adaptée. Metadata en lecture est implicite. Ne pas choisir `repo`
   global, Actions, Administration ou Contents en écriture. Une organisation peut
   exiger une approbation ; elle doit être obtenue avant le test.
3. Apps Script → Nouveau projet → nommer `REC-Synchronisation`. Ne pas le partager.
   Remplacer le fichier initial par `Synchroniseur.gs` : un seul collage du code
   revu via le bouton Raw/Copy de GitHub. Dans la copie Google uniquement,
   remplacer les deux marqueurs `REC_DESTINATION` (ID REC et adresse du compte).
   Ne pas ajouter cette copie personnalisée à Git.
4. Paramètres du projet → afficher le manifeste `appsscript.json`. Remplacer son
   contenu par le manifeste de CE répertoire : second collage. Aucun déploiement.
5. Paramètres → Propriétés du script → ajouter `GITHUB_READ_TOKEN` avec le jeton
   créé et `CANDIDATE_SHA` avec le SHA exact du commit revu. Aucun autre secret
   nécessaire. Ne jamais coller le jeton dans le fichier, les logs ou le chat.
   Les éditeurs du synchroniseur auraient accès aux propriétés : rester seul éditeur.
6. Vérifier l'activation Apps Script API dans les paramètres du compte, déjà
   déclarée faite. Lancer `verifierConfiguration`, examiner le consentement Google
   (sources, requêtes externes, fichiers Drive créés par l'application, adresse).
   Arrêter si Google exige une configuration Cloud/API supplémentaire : ce
   parcours n'est pas validé à distance et ne justifie pas d'élargir les droits.
7. Lancer `simulerSynchronisation`, puis consulter le journal d'exécution. Il doit
   indiquer une simulation réussie, les nombres de fichiers et le SHA attendu.
   S'arrêter ici pour la première installation : l'approbation d'installation
   n'est pas une autorisation de synchronisation.

Pour les mises à jour ultérieurement autorisées : copier une fois le SHA du commit
validé dans `CANDIDATE_SHA`, puis choisir successivement les fonctions de simulation,
d'approbation et de synchronisation dans le menu près d'Exécuter. Consulter le
résultat explicite dans les logs. Une fusion Git seule n'agit jamais sur Google.
Un futur déclencheur réclamera une revue distincte ; aucun n'est créé par ce code.

## Réseau, retrait et risques résiduels

Les requêtes de ce code vont uniquement vers `api.github.com`,
`script.googleapis.com`, `www.googleapis.com` (Drive, y compris upload). Les
redirections HTTP sont refusées. Le navigateur Google et le consentement utilisent
leurs propres domaines ; aucune modification du réseau Codex n'est nécessaire.
Le flux ne passe pas par Codex Cloud après l'installation.

Pour arrêter : ne plus approuver de plan ; retirer toute approbation en attente,
révoquer le PAT dans GitHub, supprimer `GITHUB_READ_TOKEN`, révoquer l'accès du
projet dans les connexions du compte Google. Supprimer séparément les sauvegardes
privées si leur conservation n'est plus souhaitée ; supprimer la propriété seule
ne révoque pas le jeton. Aucun mécanisme ne promet une absence de journaux internes
chez les fournisseurs.

Le PUT remplace l'ensemble des fichiers. Les propriétés REC et les données Sheets
restent en place ; cependant des déclencheurs REC préexistants ou des exécutions
en mode développement peuvent utiliser immédiatement le nouveau code. Vérifier
leur absence/maîtrise avant autorisation ; l'API de sources n'inventorie pas tous
les déclencheurs. Aucun envoi ne doit être qualifié de simple lecture.

## Tests hors réseau

`node tests/rec-synchronisation.mjs` charge le vrai `.gs` dans `node:vm` avec
services Google, GitHub, Drive, horloge et verrou entièrement simulés. Aucune
dépendance npm. Le contexte ne dispose d'aucun client réseau réel. Ces scénarios
valident les contrôles et l'ordre des opérations, pas la réussite OAuth, la
politique Drive, les quotas, l'interface iPhone ou la compatibilité distante.
