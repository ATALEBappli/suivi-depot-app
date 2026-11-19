# REC — préparation de la régularisation du reçu 43927899195

**Préparation uniquement.** Cette modification n'exécute aucun workflow Google,
ne change aucun déploiement et n'active ni backend ni écriture métier.

## Preuve reçue (lecture seule)

Le workflow `REC Apps Script — opérations manuelles`, en mode `inspect`,
a rapporté `classification=new_version_published`, `publishedVersion=2`,
`createdVersion=2`, `publishedHash=expectedHash` (empreinte épinglée
`d0d1a31c52723910498536be899944f69d4c6085c76070190928efa74a21a22e`),
`existingUrlUnchanged=true`, `backupVerified=true`, `readOnly=true`.
Le reçu `gha-43927899195` reste `pending` malgré cette publication.

## Nouvel outil, distinct de la réconciliation de version 1

- `scripts/rec-automation/reconcile-pending-deploy.mjs` n'accepte que le reçu
  épinglé `gha-43927899195` et sa version 2 déjà publiée.
- Le workflow `rec-reconcile-pending-deploy.yml` est **manuel uniquement**, limité
  à `main`, environnement GitHub `REC`, concurrence `apps-script-rec` et deux
  empreintes de preuve à fournir. `audit_confirmed` est désactivé par défaut.
- Avant une écriture, le code revérifie les empreintes du reçu, de la sauvegarde,
  du script HEAD, de la version publiée, de l'URL/déploiement et les permissions
  privées. La sauvegarde historique reste inchangée.
- Une archive Drive privée distincte du reçu est créée et relue, puis seule
  l'entrée `operation` exacte est finalisée à `done` avec version 2.
- Les répétitions sont vérifiées et idempotentes ; divergence, nouvelle opération
  pending, changement de version, archive incohérente ou preuve manquante arrêtent
  la procédure. Les contrôles sont séquentiels : les interventions parallèles
  doivent être gelées.
- Le filtre HTTP interdit toute écriture Apps Script, Sheets ou tout autre fichier
  Drive. **Deux mutations Drive privées restent possibles :** création de
  l'archive du reçu et PATCH du même reçu.

## Prérequis avant toute exécution réelle (autorisation distincte)

1. Fusion/revue de la PR correspondante explicitement approuvée.
2. Audit REC récent : identité Google propriétaire, absence de droits PROD du
   compte opérateur, permissions, déclencheurs, V2 inactive, sauvegarde et gel
   des changements manuels.
3. Refaire le workflow **inspect en lecture seule** sur `main`. Son bloc
   `deploymentRecovery` doit conserver exactement `new_version_published`,
   version 2, les deux empreintes `deploymentHash` et `operationHash` ; ne pas
   confondre ces empreintes avec `publishedHash`.
4. L'opérateur demande ensuite une **autorisation expresse pour modifier les
   deux fichiers Drive techniques REC**. Sans elle, ne pas lancer le nouveau
   workflow et ne pas activer `REC_MUTATIONS_ENABLED`.
5. En cas de confirmation distincte seulement, faire revoir les deux empreintes,
   la case d'audit, les approbations de l'environnement `REC`, et les logs finaux.
   Ne jamais lancer le workflow version 1 pour ce reçu.

Ce travail ne raccorde pas encore Apps Script privé `MYSELF` au Worker. Il
n'autorise aucune lecture du référentiel réel ni simulation/écriture de location.
