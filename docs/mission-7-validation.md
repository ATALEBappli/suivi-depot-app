# Mission 7 — Synchroniseur GitHub vers Apps Script REC

Base : `origin/main` au commit `ef5abaf` (Missions 1 à 5 fusionnées).
Branche : `mission-7-synchroniseur-rec`. Aucun changement métier, accès Google,
OAuth, sauvegarde réelle, installation, déclencheur ou déploiement effectué.

## Fichiers ajoutés

- `apps-script/rec-synchronisation/Synchroniseur.gs` : outil autonome, bloqué
  sans personnalisation privée ; compte et cible fixes, validation GitHub,
  simulation, approbation à usage unique, sauvegarde privée relue, envoi et
  vérification, restauration explicite, verrou et état d'écriture incertaine.
- `apps-script/rec-synchronisation/appsscript.json` : manifeste du synchroniseur,
  sans point d'entrée web ni autorisation Sheets ; permissions sources, requêtes
  externes, fichiers Drive créés par l'application et identité du compte.
- `apps-script/rec-synchronisation/README.md` : conception, limites, propriétés,
  installation Safari iPhone, approbation par SHA, restauration et retrait.
- `tests/rec-synchronisation.mjs` : 36 scénarios, exécution du vrai `.gs` avec
  services intégralement fictifs et sans client réseau.
- `.github/workflows/rec-synchronisation-tests.yml` : Node 24, tests avec mocks
  uniquement ; aucune identité Google, aucun secret ou envoi.
- Ce compte rendu.

## Contrôles réellement exécutés

| Commande | Résultat |
| --- | --- |
| `node tests/rec-synchronisation.mjs` | 36 scénarios réussis, sans réseau. |
| `node scripts/check-js.mjs` | 13 sources analysées, dont le nouveau `.gs`. |
| `node scripts/check-apps-script.mjs` | Contrats métier historiques sur doublures réussis. |
| `node tests/rec-sync.mjs` | Contrôles de préparation Mission 5 réussis. |
| `node tests/isolation.mjs` | Isolation REC/PROD et fixtures réussies. |
| `git diff --check` | Réussi. |

Tests du synchroniseur : installation non personnalisée, compte et cible erronés,
projet lié refusé, simulation sans PUT/Drive, SHA exact, blobs vérifiés, refus de
fichiers supplémentaires/symlinks/arbre tronqué/sources manquantes/manifeste
incorrect, expiration/absence/altération d'approbation, contenu candidat modifié,
dérive de REC (y compris après sauvegarde), sauvegarde refusée/corrompue/partagée,
verrou occupé, PUT incertain sans rejeu, divergence de relecture, restauration
approuvée et contrôle de sélection, index plein, absence de changement, routes
alternatives refusées et logs sans valeurs privées.

Ces résultats ne valident pas OAuth, les permissions effectives Drive, le réseau
Google, les quotas ou l'édition depuis Safari iPhone. Aucun test distant réalisé.

## Points de revue avant installation

1. La vraie cible et l'adresse du compte n'ont pas été fournies et restent hors
   Git. La copie Google devra être personnalisée puis vérifiée ; impossible de
   certifier aujourd'hui l'identité réelle ou les ACL du projet REC.
2. Le compte dédié doit n'avoir aucun accès PROD. La portée `script.projects`
   n'isole pas un seul script. Les éditeurs du synchroniseur peuvent modifier
   son code et lire ses propriétés : il doit rester privé.
3. La sauvegarde demande `drive.file` et conserve du code potentiellement sensible
   dans des fichiers privés, jamais dans GitHub. Index limité à 20, pas de purge.
4. Le PUT remplace les sources ; une fenêtre de concurrence extérieure demeure.
   Ne pas éditer REC simultanément. Des déclencheurs REC existants peuvent utiliser
   le code modifié sans nouveau déploiement. Les données Sheets et les propriétés
   ne sont pas sauvegardées par cet export.
5. Le PAT GitHub est limité au dépôt et à Contents en lecture, exclusivement dans
   les propriétés privées ; renouvellement à expiration. Aucun jeton Google
   enregistré, mais consentement Google persistant jusqu'à révocation.
6. L'installation nécessite deux collages (code et manifeste), deux valeurs
   personnalisées et deux propriétés. D'abord configuration et simulation
   seulement ; chaque écriture réclame l'approbation explicite d'un plan SHA.

Arrêt demandé : PR pour revue, sans fusion. Toute installation, consentement,
sauvegarde distante, approbation de plan ou synchronisation appartient à une phase
ultérieure expressément autorisée.
