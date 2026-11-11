# Mission 10 — REC-Maintenance

REC-Maintenance initial a été livré par la PR #9, basée sur main après la PR #8.
La PR #9 étant fusionnée, le dernier diagnostic est proposé dans une nouvelle PR
basée sur main, branche mission-10-diagnostic-differences. Aucun changement de
frontend, backend métier ou synchroniseur existant. Aucune opération Google,
installation, publication, fusion, modification Sheets ou du compte PROD.

## Fichiers de Mission 10

- apps-script/rec-maintenance/Maintenance.gs : outil autonome à cible unique,
  initialisation explicite, préservation de la liaison privée, cycle approuvé,
  sauvegarde privée relue, vérification et restauration.
- apps-script/rec-maintenance/Acorn.gs : analyseur local Acorn 8.15.0, module intact
  avec emballage privé, licence MIT incluse et provenance dans le guide.
- apps-script/rec-maintenance/Acorn-LICENSE.txt : licence MIT originale.
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
Variations admises : les deux valeurs privées du bloc strict REC_DESTINATION et
le nom initial explicitement limité à Code ou Synchroniseur (un seul script).
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

- node tests/rec-maintenance.mjs : 147 scénarios réussis.
- node tests/rec-synchronisation.mjs : 46 scénarios réussis.
- node scripts/check-apps-script.mjs : 84 scénarios backend réussis.
- node tests/isolation.mjs : réussi, hors réseau.
- node tests/rec-sync.mjs : réussi, hors réseau.
- node scripts/check-js.mjs : 17 sources JS/GS et scripts HTML syntaxiquement valides ; aucune exécution applicative.
- git diff --check : réussi.
- Revue du diff du dernier correctif depuis origin/main : quatre modifications
  (Maintenance, README, tests, ce compte rendu), deux ajouts (Acorn et sa licence).

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

Installation unique : trois collages initiaux (Maintenance, Acorn, manifeste) et un seul ID local, puis PAT privé,
SHA et consentement Google du nouveau projet. Usage courant : un SHA à changer,
trois exécutions ; sauvegarde et vérification automatiques. Le Cloud REC existant
est réutilisable si les droits du compte le permettent, sans nouveau compte de
service/client OAuth ; ce raccordement n'a pas été effectué ici.

Attendre la validation du propriétaire avant fusion et une autorisation distincte
avant installation ou toute opération Google réelle. Aucun déploiement fourni.

## Correction avant fusion de la PR #9 — installation historique

La même PR est corrigée, sans nouvelle PR. Le nom API `Code` est accepté à
l'initialisation et mémorisé dans ENROLLMENT.codeName. Le candidat public reste
`Synchroniseur.gs` ; seule sa représentation dans Google reprend le nom enrôlé.
Les contrôles de suppression ne sont pas contournés. Sauvegarde et restauration
conservent le nom et le contenu exacts. Un ancien ENROLLMENT sans codeName reste
compatible uniquement avec Synchroniseur.

Les fonctions manuelles de diagnostic ne sont pas connues du dépôt. Aucun suffixe
n'est ignoré, aucune fonction n'est autorisée par son nom et aucune empreinte
privée fournie par l'utilisateur n'est ajoutée. Elles entraînent un refus fermé
à l'initialisation. diagnostiquerInstallation partage les contrôles initiaux mais
ne crée aucun enrôlement et ne touche ni PLAN ni APPROVAL : deux GET seulement,
aucun GitHub/Drive/backend, aucune écriture distante ou locale. Le résultat se
limite à un état et deux booléens, ou au refus générique de sécurité.

Le guide décrit la comparaison locale hors réseau et la revue privée sans
transmettre les sources, différences, identifiants ou jetons. Conserver les ajouts
nécessite une future reconnaissance revue du contenu exact ; les retirer exige
une intervention manuelle distinctement autorisée, avec copie privée de retour
arrière. Aucun de ces chemins n'est exécuté dans cette mission.

Les 14 scénarios supplémentaires couvrent Code Mission 7 → Mission 9 exact,
Code Mission 9 → candidat public approuvé, sauvegardes/restaurations exactes,
refus des ajouts manuels et code global sans exécution, noms ambigus/inconnus,
manifestes et identités incorrects, verrouillage du nom après enrôlement,
diagnostic inconnu précis sans mutation des propriétés et anciens enrôlements.
Tous les contrôles listés ci-dessus ont été réexécutés sous Node 24.22.1 après
correction. Aucun fichier backend métier ni synchroniseur existant modifié.

Limite explicite : la compatibilité de l'installation réelle avec diagnostics
n'est pas certifiée. Aucun accès Google n'a été fait. La migration est démontrée
sur les références publiques et les mocks ; l'installation inconnue reste bloquée
jusqu'à la revue privée décrite dans le guide, sans affaiblir les approbations,
sauvegardes et restaurations.

## Dernier correctif — diagnostic automatique des différences

Nouvelle fonction diagnostiquerDifferences, utilisable avant enrôlement après
mise à jour manuelle de Maintenance et ajout du fichier public Acorn.gs dans le
même projet. Aucun nouveau projet, configuration Cloud, permission ou déploiement.
Ni cette mise à jour Google ni le diagnostic réel n'ont été effectués ici.

Deux GET vers la cible unique, deux GET de blobs publics GitHub figés, sans corps.
Les références sont vérifiées par taille, SHA-1 Git et SHA-256 existants. Le code
Google n'est envoyé à aucun autre service ; seuls les jetons respectifs, en mémoire,
authentifient les requêtes vers leur service d'origine. Aucun Drive/Sheets/backend.
Aucune écriture, même temporaire, dans les propriétés, plans ou approbations.

Le diagnostic vérifie Code/Synchroniseur et le manifeste complet ; une divergence
JSON est signalée sans donner son contenu. Acorn analyse le code sans l'exécuter ;
seuls les deux littéraux du véritable bloc REC_DESTINATION sont neutralisés, après
contrôle de sa forme et de l'identité privée. La comparaison textuelle et celle des
arbres normalisés sont distinctes. Positions et graphie des littéraux ordinaires
sont ignorées dans l'arbre ; directives, regex, valeurs et templates bruts restent
significatifs. Les commentaires sont comparés séparément, avec fins de ligne
uniformisées pour ce seul classement. Aucune conclusion d'équivalence fonctionnelle.

Résumé limité à états publics, booléens, nombres de lignes/fonctions et référence
publique Mission 7/9. Aucun extrait, nom de fonction privée, empreinte privée,
identifiant, jeton ou erreur brute. Analyse impossible (syntaxique, limite ou
syntaxe hors ECMAScript 2022) et analyseur absent sont explicitement distingués.
L'enrôlement strict, ses empreintes, les approbations, sauvegardes, contrôles de
suppression, restauration et chemins de synchronisation sont inchangés.

41 scénarios supplémentaires (147 au total) couvrent références exactes Mission 7/9
et Code.gs, indentation/CRLF, fins de ligne seules, lignes vides, commentaires ajoutés/retirés, graphie de
chaîne, bloc privé reformatté, condition/constante modifiées, fonction ajoutée,
code global jamais exécuté, regex, ASI après return, templates bruts, directives,
BigInt, syntaxe invalide, manifeste divergent/malformé/reformaté, propriétés et
plans existants intacts, identités/noms/configurations interdits, erreurs et
corruptions GitHub, références non approuvées, analyseur absent, PAT absent et
neutralisation strictement limitée au bloc. Le transport mock refuse toute requête
avec corps ou méthode autre que GET et toute route hors des quatre prévues pour ce
diagnostic. Les tests vérifient zéro tentative d'écriture de propriété, même avec
la même valeur, et désactivent eval/Function par génération de chaîne dans la VM.

Acorn 8.15.0 (~242 ko) est embarqué pour éviter un faux analyseur par regex. Son
paquet npm a été téléchargé uniquement pour la préparation locale et vérifié par
l'intégrité SHA-512 publiée avant extraction ; aucune installation npm nécessaire
aux tests ou à Google. Le corps du module distribué est inchangé, seul l'emballage
UMD est remplacé pour isoler MAINT_ACORN. Licence complète incluse dans le fichier
Google et dans Acorn-LICENSE.txt. Aucun téléchargement d'analyseur à l'exécution.
La dépendance représente l'essentiel des lignes ajoutées et doit être revue.

Tous les contrôles de la section validation locale ont été réexécutés pour ce
correctif. Le guide contient la procédure de mise à jour en trois étapes et les
limites : un arbre identique ne débloque pas automatiquement l'installation.
