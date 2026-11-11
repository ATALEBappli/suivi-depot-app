# Mission 9 — compatibilité du synchroniseur avec le backend privé REC

Base : main après fusion de la PR #7 (Mission 8). PR dédiée, aucune fusion,
installation, exécution Google, modification Sheets ou publication réalisée.
Aucun changement frontend, backend métier ou compte de production.

## Liste fermée et protection de la destination

Deux contrats complets figés dans le code : historique ANYONE_ANONYMOUS et privé
MYSELF, tous deux USER_DEPLOYING ; les autres champs restent strictement identiques.
La comparaison sémantique accepte l'ordre/indentation, refuse tout autre champ,
portée, bibliothèque, fuseau ou mode d'exécution. La liste n'est pas configurable.
Le même contrôle vaut pour GitHub, les sources distantes et les sauvegardes
restaurées, même avec des empreintes valides. Une source distante au manifeste
inconnu ne peut plus être sauvegardée par cet outil : arrêt et revue séparée.

Aucune modification des routes, constantes de destination, portées ou marqueurs
bloquants livrés. Le compte effectif, Script ID, titre et caractère autonome sont
contrôlés ; le plan et les sauvegardes doivent viser la cible fixe. Les propriétés
ne peuvent pas remplacer cette destination. Les mocks refusent toute route Apps
Script hors de cette cible fictive ; des propriétés et un plan PROD fictifs sont
testés. Aucun appel à une cible réelle n'est nécessaire pour ces vérifications.

Cela ne certifie pas l'isolation Google : script.projects reste une portée large,
un éditeur peut modifier le code ou renseigner un mauvais ID lors de l'installation.
Le titre n'est pas une preuve suffisante. Le compte REC doit rester sans accès PROD,
y compris indirect ; l'identité exacte de la copie REC doit être vérifiée en privé.

## MYSELF et partage depuis le compte propriétaire initial

Le projet SuiviDepotAPI-REC est partagé vers REC, sans transfert de propriété
établi. Distinguer le droit d'éditer ses sources par l'API Apps Script du droit
d'appeler sa web app. MYSELF est le mode « moi seul » ; le partage du projet ne
constitue pas une liste d'utilisateurs web autorisés. USER_DEPLOYING lie l'identité
d'exécution au compte ayant déployé, pas au compte ayant synchronisé les sources.
Ne pas assimiler automatiquement REC au propriétaire/déployeur initial.

Le PUT des sources ne transfère ni propriété ni déploiement et ne change pas les
permissions d'un déploiement versionné existant. Un ancien déploiement anonyme
peut donc rester accessible ; un manifeste privé dans Git ne prouve pas sa fermeture.
Le frontend actuel n'est pas compatible avec cet accès privé sans conception
séparée. Aucun élargissement vers ANYONE, DOMAIN ou USER_ACCESSING pour le raccorder.

Avant une installation réelle autorisée séparément : vérifier en privé le
propriétaire, le rôle éditeur REC, le compte de chaque déploiement existant, son
accès effectif et l'identité d'exécution attendue. Définir si l'usage restera chez
le propriétaire initial ou nécessitera une décision explicite sur la propriété
et les futurs déploiements. Ne pas transférer ni redéployer dans cette mission.
Un accès éditeur au projet depuis le propriétaire initial ne doit pas s'étendre
à la production. Aucun succès OAuth/API/web n'est affirmé par les mocks.

## Propriétés privées et sauvegarde

Dans **SuiviDepotAPI-REC**, hors Git, hors logs et hors conversation :

| Propriété | Exigence |
| --- | --- |
| APP_ENV | Exactement REC. |
| SPREADSHEET_ID | Identifiant privé du classeur REC fictif, obligatoire, sans espaces périphériques. |
| REC_SPREADSHEET_ID | Identifiant privé autorisé, obligatoire, exactement égal à SPREADSHEET_ID. |

Le backend vérifie également l'identité retournée par le classeur ; aucun repli
vers le classeur actif. Ces contrôles ne résistent pas à un éditeur changeant les
deux IDs. Vérifier les droits du compte d'exécution réel (USER_DEPLOYING), pas
seulement ceux du compte REC. Ne jamais utiliser un classeur PROD pour ce contrôle.

Ces propriétés appartiennent au backend, pas à REC-Synchronisation. Le PUT des
sources les conserve ; elles ne sont ni lues ni copiées par le synchroniseur.
Les sauvegardes/restaurations couvrent seulement sources et manifeste, jamais
propriétés, données, déclencheurs, autorisations ou versions déployées. Une
restauration MYSELF ne répare donc pas une propriété erronée. Une restauration
historique peut réintroduire la déclaration anonyme et doit être revue explicitement.

## Montants : constat sans modification métier

Transactions et loyers logements/locaux partagent la validation Mission 8 :
valeurs finies, non négatives, au plus deux décimales ; plafond inclus de
1 000 000 000 par valeur, sans devise définie. Chaînes à point uniquement,
sans espaces, séparateurs de milliers, notation exponentielle ni virgule française.
Zéro et centime acceptés, 999 999 999,99 et plafond acceptés ; plafond + 0,01,
négatif et trois décimales refusés. Les nombres JS utilisent une tolérance de
0,00001 sur les centimes : ce n'est pas un moteur décimal comptable exact.
À ce plafond, les centimes (100 milliards) restent sous la limite des entiers
exacts JS, sans garantir pour autant l'exactitude de tous les calculs flottants.

Les tests vérifient ces bornes sur transactions et les deux configurations de
loyers, avec absence d'écriture en cas de refus. Ils ne valident pas une politique
comptable. Le dépôt ne fixe ni devise, montant maximal réel, besoins d'avoirs ou
corrections négatives, précision supérieure au centime, arrondis ou import français.
Compatibilité possible pour des valeurs positives à deux décimales sous ce plafond,
mais **validation comptable préalable requise** sur ces points. Aucune règle ni
limite n'est changée ici ; toute adaptation exige accord et PR séparée.

## Validation et risques avant installation

Commandes locales Node 24, sans dépendance installée :

- node tests/rec-synchronisation.mjs : 46 scénarios sur mocks.
- node scripts/check-apps-script.mjs : 84 scénarios backend sur mocks.
- node tests/isolation.mjs et node tests/rec-sync.mjs : contrôles locaux.
- node scripts/check-js.mjs : syntaxe seulement.
- git diff --check et revue du diff depuis origin/main.

Le candidat par défaut est MYSELF. Simulation sans PUT/sauvegarde, approbation,
sauvegarde relue, PUT unique, relecture, non-rejeu, restauration de MYSELF et retour
historique sont testés. Les refus existants (compte/cible, approbation, expiration,
concurrence, corruption, sauvegarde partagée ou impossible, résultat incertain)
restent couverts. Le contexte vm ne dispose d'aucun client réseau réel.

Risques restants : permissions Google non vérifiées, propriété/déploiement partagé
à clarifier, anciens accès web potentiellement inchangés, index de 20 sauvegardes,
fenêtre d'édition concurrente sans compare-and-swap, déclencheurs ou exécutions
de développement pouvant employer immédiatement les nouvelles sources. Aucun
rollback automatique ni nouvel essai silencieux après PUT incertain. Réviser le
SHA exact et ses sources avant approbation. Cette PR ne vaut ni autorisation
d'installation, ni autorisation de synchronisation ou de déploiement réel.
