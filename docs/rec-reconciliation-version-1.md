# Réconciliation REC du run 43825230600

Préparation uniquement. Ne lancer aucune opération avant validation explicite.
Cette opération écrit dans Drive : ce n'est pas un diagnostic en lecture seule.
Elle ne crée ni version Apps Script, ni déploiement, et ne touche pas aux sources,
transactions, propriétés Apps Script, au référentiel V2 ou aux secrets GitHub.

## Préconditions et preuves

Après fusion autorisée séparément, relancer le diagnostic manuel version 1.
Son rapport expose désormais deploymentHash et operationHash, empreintes SHA-256
sans identifiant ni URL. Conserver le rapport et sa date. Il doit être
verified_read_only avec headMatches=true. La cible, le compte, les permissions,
la description exacte, la version 1 et les cinq fichiers doivent être conformes.
Conserver la sauvegarde initiale et le reçu pending ; ne rien éditer manuellement.

Le nouveau workflow n'est utilisable que depuis main du dépôt attendu,
REC_AUTOMATION_ENABLED=true, REC_MUTATIONS_ENABLED=true et audit_confirmed=true.
Il utilise les secrets existants et les règles d'approbation de l'environnement
REC sans les modifier. Aucun nouvel identifiant Google n'est versionné.
Le groupe de concurrence apps-script-rec est partagé avec les autres opérations.
Les tests sans secrets précèdent le job Google. Aucune exécution n'est déclenchée
par une PR, un push ou une fusion.

## Lancement futur sur iPhone

1. Faire valider explicitement l'exécution de réconciliation, après revue/fusion.
2. Geler les modifications manuelles du projet Apps Script et des reçus Drive.
3. GitHub → dépôt → Actions → « REC — réconciliation du reçu GitHub 43825230600 ».
4. Run workflow → main. Recopier deploymentHash dans deployment_sha256 et
   operationHash dans operation_sha256 depuis le diagnostic récent.
5. Cocher audit_confirmed seulement après relecture des preuves et du périmètre.
6. Run workflow, puis approuver le job REC selon les protections existantes.
7. Vérifier status=reconciled, version=1, appsScriptWrites=0 dans le rapport.
   Ne pas lancer deploy/restore, même si le workflow échoue.

Les variables d'activation ne sont pas changées par ce workflow ou cette PR.
Si elles bloquent le lancement, demander une autorisation distincte avant de les changer.

## Écritures exactes et conservation des preuves

Le script relit et contrôle les preuves, le reçu unique et sa sauvegarde initiale.
Il exige un HEAD égal au bundle validé et le même déploiement version 1 privé.
Il crée au plus un fichier privé dans Mon Drive REC :
REC-backup-reconcile-gha-43825230600.json (kind backup, tag déterministe).
Il contient l'objet JSON intégral original du reçu pending, son ID, son empreinte,
les sources et le déploiement relus. La copie est relue et comparée avant toute
finalisation. La sauvegarde initiale référencée par checkpoint reste inchangée.

Après nouvelle vérification des preuves et absence de changement, seul le fichier
REC-operation-gha-43825230600.json est finalisé en done. Les champs originaux sont
conservés, sauf status ; result et deployment sont renseignés selon le contrat
historique, avec completedAt et une preuve reconciliation liant l'archive.
Checkpoint et intentHash sont conservés. Le reçu final est relu et vérifié.
L'URL et l'ID ne sont conservés que dans les fichiers Drive privés, pas dans le rapport.
Le POST OAuth renouvelle le jeton ; le transport refuse toutes les mutations
Apps Script, tout DELETE et tout PATCH d'un fichier autre que le reçu identifié.

## Échec et reprise

- Avant sauvegarde : le reçu reste pending ; nouvelle exécution après diagnostic.
- Réponse perdue après création de l'archive : rechercher/relire le même tag,
  refuser doublon ou contenu différent ; ne pas fabriquer une deuxième archive.
- Avant finalisation : relire et revérifier les mêmes preuves.
- Réponse perdue après finalisation : une nouvelle exécution avec les mêmes
  empreintes reconnaît done, vérifie l'archive et le reçu complet, puis rend
  replayed=true sans nouvelle écriture.
- État ambigu, preuves différentes, autre pending ou archive modifiée : arrêt.
  Ne pas supprimer les fichiers pour débloquer ; analyser le refus.

Les lectures suivies du PATCH ne sont pas une transaction Drive et n'offrent pas
un compare-and-swap atomique. Le verrou GitHub ne bloque pas les interventions
humaines ou d'autres clients. Le gel des écritures externes est obligatoire.
Un changement détecté après création de la copie peut laisser cette copie, mais
n'autorise pas la finalisation. Aucun retour arrière automatique.

## Reconnaître l'identifiant sans créer une autre URL

Après succès, et autorisation distincte de configurer le secret :
1. Apps Script SuiviDepotAPI-REC → Déployer → Gérer les déploiements → sélectionner
   la version 1 à la description exacte du run #10, sans la modifier.
2. Copier l'identifiant de déploiement (pas le Script ID ni l'URL /exec).
3. GitHub → dépôt → Settings → Environments → REC → Environment secrets →
   Add environment secret (ou modifier l'existant) → REC_DEPLOYMENT_ID.
   Coller l'identifiant uniquement dans ce champ secret, jamais dans le chat/Git/logs.
4. Après finalisation, utiliser inspect pour vérifier pending=[] et le reçu privé
   pour le lien au déploiement. Le diagnostic version 1, conçu pour un reçu pending,
   s'arrête désormais sur PENDING_SET_MISMATCH : c'est attendu.
   Ne pas interpréter inspect seul comme une validation de l'identifiant configuré.
5. Pour vérifier l'identifiant configuré après finalisation, relancer la même
   réconciliation avec les deux empreintes initiales : le contrôle idempotent
   exige que REC_DEPLOYMENT_ID corresponde au déploiement et retourne replayed=true,
   sans écriture. Cela reste une exécution à autoriser distinctement.

La création/modification du secret est volontairement manuelle ; aucune permission
GitHub d'écriture des secrets n'est donnée au workflow. Un mauvais ID est refusé.
Aucun nouveau deploy n'est requis pour utiliser l'URL privée déjà publiée.
La configuration n'active pas le référentiel V2 et n'autorise aucun import.

## Validation locale

Tests uniquement fictifs : preuves, altérations, interruptions avant/après création
et PATCH, perte de réponse, rejeu done, refus de modifications concurrentes, gates
et barrière HTTP. Les tests vérifient l'absence de toute mutation des sources,
versions ou déploiements et la conservation de la sauvegarde initiale.
