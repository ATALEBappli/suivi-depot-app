# Diagnostic du déploiement REC interrompu

Préparation locale, non publiée et non exécutée contre Google. Aucun workflow modifié.

Exécuter avec Node 24 depuis un environnement de confiance disposant déjà des variables
REC_SCRIPT_ID, REC_SHEET_ID, REC_GOOGLE_EMAIL, REC_OWNER_EMAIL, REC_GOOGLE_OAUTH,
et éventuellement REC_DEPLOYMENT_ID. Ne jamais fournir les secrets en arguments,
dans une conversation ou dans des logs. Le script ne lit pas les gates de mutation
et ne permet aucune opération de mutation, même si elles sont activées.

    node scripts/rec-automation/diagnose-version.mjs

Le seul POST autorisé est le renouvellement OAuth. Tous les appels métier sont GET.
Le diagnostic réutilise les validations de cible REC figée, de compte, de propriétaire
et de partage. Il exige exactement un déploiement versionné, privé, en version 1,
avec la description du run 43825230600. Il compare le contenu immuable de cette
version au SHA-256 validé et au schéma fermé de cinq fichiers, puis vérifie le reçu
pending unique et sa sauvegarde avec leur identité, cible et empreinte.
Le rapport ne contient ni sources, ni URL, ni identifiant de déploiement, ni jeton.
Tout échec arrête le diagnostic ; aucun mécanisme de repli ni réparation.
Un scriptId explicitement différent, nul ou vide est refusé. Si le champ est absent,
le diagnostic exige une provenance en mémoire attachée par le transport à l'objet
retourné par GET projects/{REC_SCRIPT_ID}/deployments. Aucun champ de la réponse
n'est remplacé ; une copie JSON perd cette preuve et reste refusée sans scriptId.

## Réconciliation proposée, non implémentée

Ne pas relancer deploy ou restore. Conserver le reçu pending et la sauvegarde.
Le restore actuel refuse un déploiement créé depuis l'état sauvegardé
(DEPLOYMENT_RECONCILIATION_REQUIRED). Renseigner le seul REC_DEPLOYMENT_ID ne
résout donc pas l'incertitude persistante.

Après diagnostic positif et autorisation distincte, prévoir une action dédiée
acceptant exclusivement ce run, sa sauvegarde et le déploiement vérifié :
- relire les preuves et vérifier l'absence de changement concurrent ;
- conserver une copie privée vérifiée du reçu pending original ;
- enregistrer une preuve de réconciliation liant version, empreinte, sauvegarde,
  identifiant et URL existants ;
- finaliser uniquement le reçu Drive comme done, avec le schéma de résultat
  attendu par core.mjs, sans modifier checkpoint ni supprimer la sauvegarde ;
- relire et vérifier le résultat, reprise idempotente en cas de réponse perdue ;
- enregistrer ensuite l'identifiant existant dans REC_DEPLOYMENT_ID après autorisation.

Cette étape écrit dans Drive et dans la configuration GitHub : elle n'est ni
incluse dans ce diagnostic, ni autorisée par sa préparation. Elle nécessite des
tests de concurrence, interruptions et rejeu avant utilisation. Aucune création
de version, aucun appel createDeployment/updateDeployment, aucune nouvelle URL.
Après réconciliation, utiliser inspect puis tester l'URL privée existante ;
un nouveau deploy n'est pas nécessaire pour rendre la version 1 déjà publiée utilisable.

## Lancement manuel GitHub après fusion autorisée séparément

Le workflow `.github/workflows/rec-diagnostic-version-1.yml` est exclusivement
workflow_dispatch, sans entrée utilisateur ni choix d'opération. Il exige main,
le dépôt attendu et REC_AUTOMATION_ENABLED=true. Les tests sans secrets précèdent
le job REC, soumis aux protections/approbations déjà configurées de cet environnement.
Il utilise les secrets REC existants, sans les changer. REC_DEPLOYMENT_ID peut rester
vide ; REC_MUTATIONS_ENABLED n'est ni utilisé ni nécessaire. Le verrou partagé
apps-script-rec empêche le chevauchement avec les opérations de l'automatisation.
L'approbation manuelle dépend des règles existantes de l'environnement REC : ce
workflow ne crée ni ne modifie ces règles.

Sur iPhone : dépôt GitHub → Actions → « REC — diagnostic version 1 en lecture seule »
→ Run workflow → branche main → Run workflow, puis approuver le job REC si demandé.
Le rapport JSON est dans les logs de l'étape de vérification. Aucun artefact privé
ni export de sources n'est publié. Ne pas lancer tant que la PR n'a pas été revue
et fusionnée avec autorisation explicite. La création de la PR ne lance pas Google.

Le script exige aussi REC_AUTOMATION_ENABLED=true en lancement local. Il conserve
les exigences OAuth du client partagé (les scopes de gestion peuvent donc être
présents sur le jeton), mais sa barrière HTTP refuse tout POST métier, PUT, PATCH
ou DELETE. Le renouvellement OAuth, seul POST autorisé, ne modifie pas les ressources.
La lecture est séquentielle, sans verrou Google : si une autre personne intervient,
faire geler les modifications manuelles et recommencer le diagnostic ; aucun rapport
ne constitue une autorisation de réconciliation ou de déploiement.

## Structure REST et contrôle d’appartenance

Sources publiques consultées, sans appel aux API de ressources Google :
- https://developers.google.com/apps-script/api/reference/rest/v1/projects.deployments#DeploymentConfig
- https://developers.google.com/apps-script/api/reference/rest/v1/projects.deployments/list

Deployment contient deploymentId, deploymentConfig, updateTime et entryPoints.
DeploymentConfig décrit scriptId, versionNumber, manifestFileName et description.
La référence ne garantit pas explicitement la présence de chaque champ dans chaque
réponse : une omission doit être traitée sans supposer un mauvais projet, mais
ne constitue jamais à elle seule une preuve d’appartenance. Aucun retour réel
n’a été interrogé pour établir la cause exacte de l’échec initial.

La route list sélectionne explicitement le projet. Le client construit cette route
avec la cible dont l’empreinte REC a été validée avant OAuth, en HTTPS et sans
redirection. Le diagnostic vérifie aussi projects.get (ID et titre), les droits
et propriétaires, puis content?versionNumber=1 (scriptId et empreinte des cinq
fichiers). Chaque objet issu de list reçoit une provenance WeakMap privée au
module de validation, non incluse dans les sauvegardes ou logs. Le validateur
exige soit le champ exact, soit cette provenance si le champ manque ; une
provenance contradictoire est toujours refusée. Version, identifiant, point
d’entrée WEB_APP unique et accès MYSELF / USER_DEPLOYING restent contrôlés.

Le changement ne marque que les réponses list en lecture seule. Les réponses
create/update sans scriptId et les sauvegardes JSON sans scriptId restent refusées :
la présente PR ne corrige pas les chemins de mutation et n’autorise aucune reprise.
Les états comparés en mémoire utilisent la provenance comme ID de projet afin
d’éviter une valeur undefined lors du calcul canonique. Le JSON brut est conservé.
