# REC — régularisation ciblée de la publication version 3

Le 20 novembre 2026, l'installation REC du commit
`ad5c72bf31ea822b459ef6867470e331f80a8c8f` a réussi. La publication
suivante a répondu `WRONG_DEPLOYMENT_VERSION`. Apps Script affiche la version 3,
mais l'inspection REC conserve le reçu `gha-44785870895` en attente.

## Périmètre et limites

- Ne pas relancer `deploy`, `install` ou `restore` tant que le reçu est `pending`.
- Conserver l'identifiant du projet, l'URL et l'identifiant du déploiement existants.
- Aucune écriture Apps Script, Google Sheets ou PROD n'est effectuée par la
  nouvelle procédure ; la clôture modifie uniquement un reçu privé Drive,
  après création et relecture d'une archive privée de ce reçu.
- Aucune activation de `REC_BACKEND_ENABLED`, `REC_FINANCE_ENABLED` ou des droits
  d'écriture n'est comprise dans cette procédure.

## Marche à suivre après revue et fusion de la PR corrective

1. Dans GitHub Actions, lancer **REC — diagnostic et régularisation publication v3**
   avec l'opération `diagnose` (par défaut). Aucun secret supplémentaire à saisir.
2. Le diagnostic doit retourner `classification: new_version_published`,
   `publishedVersion: 3`, `createdVersion: 3`, `backupVerified: true`,
   `existingUrlUnchanged: true` et `readOnly: true`.
3. Si une de ces preuves manque, arrêter. Ne pas tenter une restauration
   automatique et examiner le déploiement avec un administrateur.
4. Après accord distinct de clôture du seul reçu, relancer ce même workflow
   avec `operation: reconcile`, `audit_confirmed: true`, les valeurs exactes
   `deploymentHash` et `operationHash` produites par le diagnostic.
5. Attendre `status: reconciled`, `version: 3`, `appsScriptWrites: 0`.
   Un nouvel `inspect` peut alors confirmer `pending: []`.

Les empreintes de preuves sont des SHA-256 d'identifiants et d'un reçu privé.
Ne jamais copier les secrets OAuth, le contenu du reçu, les URL privées ou les
identifiants de ressources dans une discussion publique.
