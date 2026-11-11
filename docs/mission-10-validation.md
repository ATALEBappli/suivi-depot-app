# Mission 10 — REC-Maintenance

PR indépendante basée sur main après fusion de la PR #8. Aucun changement de
frontend, backend métier ou synchroniseur existant. Aucune opération Google,
installation, publication, fusion, modification Sheets ou du compte PROD.

## Fichiers ajoutés

- apps-script/rec-maintenance/Maintenance.gs : outil autonome à cible unique,
  initialisation explicite, préservation de la liaison privée, cycle approuvé,
  sauvegarde privée relue, vérification et restauration.
- apps-script/rec-maintenance/appsscript.json : quatre portées identiques au
  synchroniseur, sans webapp, bibliothèque ou déclencheur.
- apps-script/rec-maintenance/README.md : installation Safari iPhone, parcours
  courant, restauration, configurations privées, retrait, limites et proposition
  d'interface séparée non implémentée.
- fixtures/rec/mission-7-synchroniseur.gs : source public exact non personnalisé
  du commit dc79ee1, pour les mocks de migration ; aucune valeur privée.
- tests/rec-maintenance.mjs : vrai code dans vm, transports et services simulés.
- .github/workflows/rec-maintenance-tests.yml : tests sur push/PR, lecture seule,
  aucun secret, appel Google, envoi ou déploiement. Ce workflow ne synchronise rien.
- docs/mission-10-validation.md : ce compte rendu.

## Contrôles et décisions

Un seul ID privé à renseigner dans la copie Google : celui de REC-Synchronisation,
jamais celui du backend. initialiserMaintenance accepte les sources normalisées
Mission 7 ou Mission 9 dont les empreintes complètes sont inscrites dans le code.
Seule variation admise : les deux valeurs privées du bloc strict REC_DESTINATION.
La fonction contrôle aussi manifeste exact, compte, titre, identité et absence de
parentId. Elle mémorise la liaison existante dans les propriétés privées locales,
sans remplacer les sources du synchroniseur ni exécuter son code. Réinitialiser
ou changer la cible n'est pas une fonction fournie.

Le candidat doit porter les marqueurs publics exacts ; aucune valeur privée Git
n'est acceptée. Après contrôle des blobs, des fichiers et du manifeste, les deux
valeurs enregistrées sont réinjectées en mémoire, sans modification du dépôt.
SHA et empreintes du contenu personnalisé sont liés à l'approbation. La liaison
courante, les fragments de sécurité, la destination et le compte sont vérifiés
également pour les sauvegardes et restaurations.

L'approbation expire 30 minutes après simulation, n'autorise qu'une écriture et
est consommée avant le PUT. Relecture après sauvegarde et nouveau contrôle de
validité avant écriture. Un PUT incertain bloque le cycle SYNC, pas l'approbation
d'une restauration explicite. Aucun retry ou rollback silencieux. Un plan SYNC ne
peut servir de plan RESTORE, et inversement. L'index des sauvegardes reste limité
à 20, sans purge ; arrêt volontaire avant PUT si plein.

## Validation locale réellement exécutée

Node 24, sans installation npm ni client réseau dans les contextes fonctionnels :

- node tests/rec-maintenance.mjs : 92 scénarios réussis.
- node tests/rec-synchronisation.mjs : 46 scénarios réussis.
- node scripts/check-apps-script.mjs : 84 scénarios backend réussis.
- node tests/isolation.mjs : réussi, hors réseau.
- node tests/rec-sync.mjs : réussi, hors réseau.
- node scripts/check-js.mjs : 16 sources JS/GS et scripts HTML syntaxiquement valides ; aucune exécution applicative.
- git diff --check : réussi.
- Revue du diff depuis origin/main : uniquement les sept ajouts décrits ci-dessus.

Les nouveaux scénarios couvrent : installations inactives et connues Mission 7/9,
refus des versions initiales inconnues, exactitude de la matérialisation privée,
cycle complet et non-rejeu, restauration Mission 7 et sauvegarde de l'état remplacé,
manifestes GitHub/distant/restauration, destinations/identités changées y compris
sauvegardes intègres, routes backend/PROD/soi/déploiement interdites, SHA, branches,
blobs, redirections, arborescences, doublons, expiration avant et pendant sauvegarde,
concurrence, verrou, Drive refusé/partagé/mauvais propriétaire, partage après upload,
index plein, approbation altérée/supprimée et PUT incertain. Les appels simulés
contrôlent aussi que le PUT ne contient que les fichiers et suit une sauvegarde
relue ; toute violation de contrat du mock fait échouer le test même si le code
public masque l'exception. Les logs/retours sont contrôlés sans valeurs privées.

## Risques à examiner avant installation

Le [guide d'installation et de restauration](../apps-script/rec-maintenance/README.md)
fait partie de la revue. Les mocks ne certifient pas Google : droits API, Cloud,
consentements, quotas, état réel des sources et Safari restent à vérifier après
accord distinct. Le compte REC doit rester isolé de PROD ; l'enrôlement d'une
copie mal choisie avec un titre identique ne démontre pas son environnement.

Les contrôles textuels ne prouvent pas l'innocuité de JavaScript arbitraire : un
candidat approuvé peut détourner les portées autorisées. Ils protègent la liaison
structurée et les fragments convenus ; la revue de l'ensemble du SHA reste
obligatoire. Les marqueurs, permissions et fragments protégés ne doivent pas être
contournés pour installer une évolution incompatible.

script.projects est large ; un éditeur du code/propriétés peut contourner les
contrôles. Pas de compare-and-swap ni d'atomicité globale ; arrêter les éditions
et exécutions du synchroniseur pendant sa maintenance. Les propriétés de ce
synchroniseur sont conservées par l'API mais ne sont pas sauvegardées ; aucune
restauration des jetons, données, déclencheurs ou déploiements. Le PAT devra
éventuellement être renouvelé et le consentement peut être révoqué. Maintenance
elle-même n'a aucun mécanisme d'auto-mise à jour. La limite de 20 sauvegardes
nécessitera un archivage privé distinct ; aucune purge automatique.

Installation unique : deux collages initiaux et un seul ID local, puis PAT privé,
SHA et consentement Google du nouveau projet. Usage courant : un SHA à changer,
trois exécutions ; sauvegarde et vérification automatiques. Le Cloud REC existant
est réutilisable si les droits du compte le permettent, sans nouveau compte de
service/client OAuth ; ce raccordement n'a pas été effectué ici.

Attendre la validation du propriétaire avant fusion et une autorisation distincte
avant installation ou toute opération Google réelle. Aucun déploiement fourni.
