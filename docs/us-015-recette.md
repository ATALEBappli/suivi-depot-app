# US-015 — Référentiel V2 : implémentation, migration et recette

État : implémenté localement sur `dev/us-015-referentiel`. Aucun accès Google,
écriture REC/PROD, envoi Apps Script, déploiement Pages, fusion ou publication.

## Périmètre et fichiers

Modifiés :
- `apps-script/src/Code.gs` : routes V2, projection historique, refus de sauvegarde
  historique des logements lorsque V2 est active ; autres routes conservées.
- `app.js` : détecte l'activation, masque l'ancien éditeur et propose la gestion
  privée REC. La Saisie et les calculs de Synthèse restent identiques.
- `index.html` : entrée V2 dans Paramétrage seulement.

Ajoutés :
- `apps-script/src/ReferentielV2.gs` : modèle pur et validations.
- `apps-script/src/ReferentielV2Api.gs` : droits, journal, concurrence, idempotence,
  simulation et pont HtmlService.
- `referentiel-v2.html`, `.css`, `.js` : Paramétrage responsive, sans CDN.
- `scripts/read-referentiel.py`, `prepare-referentiel-v2.mjs` : lecture locale
  Excel/CSV/JSON et simulation, sans dépendance Python externe ni réseau.
- `scripts/v2-local-runtime.mjs`, `serve-referentiel-v2.mjs` : vrais handlers avec
  services Google simulés ; stockage en mémoire exclusivement.
- `scripts/prepare-v2-rec.mjs` : assemblage local des sources et de l'interface
  HtmlService dans `work/us-015-rec-candidate/`, ignoré par Git.
- `tests/referentiel-v2.mjs`, `import-referentiel-v2.mjs`,
  `referentiel-v2-browser.mjs` : tests métier, import et parcours navigateur.

Les pièces jointes desktop/mobile sont des maquettes de Saisie, consultées comme
références. Elles ne sont pas exécutées ou intégrées. Aucune nouvelle Saisie V2,
échéance, affectation de paiement ou opération de caisse n'est implémentée.

## Modèle et règles

Les six entités sont indépendantes dans le modèle :

| Entité | Champs |
| --- | --- |
| logements | id UUID stable, numero textuel unique, type, etage, actif |
| locataires | id UUID stable, nom, complement facultatif |
| baux | id, logementId, locataireId, arrivee, depart, suiviFinancierDepuis, statut actif/termine, cautionPrevue, devise DZD |
| loyers | id, bailId, montant, effet |
| historique | id, entity, entityId, avant, apres, auteur serveur, date ISO horodatée |
| imports | id, source normalisée, auteur serveur, date, rapport |

Les trois dates sont distinctes et facultatives. Les intervalles de location sont
`[arrivee, depart)` : le jour de sortie peut être le jour d'entrée du bail suivant.
Une borne inconnue est traitée comme ouverte pour les contrôles : il faut compléter
les dates nécessaires avant d'ajouter un bail qui pourrait chevaucher un autre.
Un bail terminé doit avoir une date de départ. Un bail actif peut porter une date
de départ programmée. La projection du locataire à une date repose sur l'intervalle,
pas sur le seul statut déclaré.
Il n'existe pas de suppression métier : désactiver un logement conserve ses baux.

Le remplacement d'un locataire consiste à terminer son bail et à en créer un autre.
Les parties d'un bail existant ne sont pas remplaçables par modification : cela
préserve l'identité de l'ancien bail. Deux personnes de même nom ne sont pas
fusionnées. La révision globale protège toutes les modifications concurrentes.

La version initiale du loyer a une date d'effet nulle : elle est la valeur de base
du bail, applicable sur sa période, même lorsque son arrivée reste inconnue.
Les versions suivantes demandent une date d'effet au moins égale à la date courante
et postérieure aux versions déjà datées. Aucune révision rétroactive ni correction
d'une ancienne version n'est proposée. Le jour métier est calculé en Europe/Paris.
Les échéances déjà émises ne sont pas présentes dans cette US : les futures US
devront en conserver le montant propre et gérer les corrections explicitement.

`cautionPrevue` appartient au bail ; null est distinct de zéro. Le modèle de lecture
financière expose séparément encaissement, restitutions, retenues et solde, tous
inconnus (null) dans cette US. Aucun de ces montants n'est calculé depuis le contrat.
Avant `suiviFinancierDepuis`, le suivi est `non_determine`, jamais « impayé ».
Après cette date il reste `a_rapprocher`, sans calcul de dette. Hors de la période
du bail il est `hors_bail`. Aucun import de paiements historiques n'est supposé.

## Stockage physique : journal additif

Les six entités logiques sont stockées dans **un onglet nouveau**
`v2_referentiel_commits`, au lieu de six onglets mutables indépendamment :

```text
revision | request_id | request_json | delta_json
```

Ce choix évite de répartir un changement métier entre plusieurs écritures Sheets.
Une ligne contient le delta complet, y compris l'historique et les versions de
loyer créées. La lecture reconstruit les six entités par rejeu et validation. Les
anciennes lignes ne sont jamais remplacées par l'API. Les UUID sont attribués côté
serveur et présents dans les deltas, jamais recalculés à partir des numéros.

Le journal est créé uniquement lors de la première écriture explicitement demandée,
pas pendant une lecture ou une simulation. Une interruption après la création de
l'en-tête laisse une révision zéro valide. `LockService` sérialise les écritures.
`expectedRevision` refuse les modifications sur une lecture périmée. Un même
`requestId` et le même corps renvoient le résultat déjà enregistré ; la réutilisation
de cet ID avec un autre corps est refusée. Un appel append dont l'issue est incertaine
n'est jamais relancé automatiquement. Les formulaires réutilisent leur identifiant
pour une nouvelle tentative identique tant que la page n'a pas été actualisée.
Après rechargement de page, consulter l'état et l'historique avant de ressaisir.

Une cellule est limitée à 45 000 caractères par précaution avant toute écriture.
Un import trop gros est refusé intégralement : ne pas le découper aveuglément.
Le journal croît et est relu intégralement : mesurer les quotas et durées en REC
avant d'envisager un volume important. Le mécanisme ne prétend pas offrir les
transactions ACID d'une base de données ni protéger contre un éditeur Sheets qui
modifie directement les cellules. Les contraintes et erreurs de Google ne sont
pas prouvées par les mocks. Un journal corrompu échoue sans repli sur l'ancien
référentiel.

Les onglets `transactions`, `config_logements`, `config_locaux`, `config_hedam`
restent inchangés, y compris leurs colonnes. Une fois V2 active, la lecture logement
historique projette `{num,type,locataire,loyer}` depuis les entités V2 à la date du
jour. L'ancienne sauvegarde globale est refusée côté serveur et masquée dans
l'interface : il n'existe pas deux sources modifiables en parallèle.

## API et protection

- GET `action=v2.read` : lecture sans initialisation.
- GET `action=v2.simulate&rows=...` : compatibilité de lecture ; pour les données
  nominatives, préférer le pont privé, évitant leur présence dans une URL.
- GET `action=v2.ui` : interface HtmlService propriétaire seul.
- GET des écritures V2 : refus `POST_REQUIRED`.
- POST JSON `v2.write` : commande logement, locataire, bail ou loyer.
- POST JSON `v2.import` : lignes, révision attendue et empreinte `preview` du rapport.
- `v2Client(body)` : mêmes contrôles, utilisé par `google.script.run` depuis l'UI
  privée. La lecture et la simulation passent également par ce pont.

Toutes les nouvelles actions exigent `Session.getActiveUser().getEmail()` égal à
`V2_ADMIN_EMAIL`, propriété privée obligatoire. Le manifeste existant reste
`MYSELF` / `USER_DEPLOYING`. Ce mécanisme est réservé au propriétaire REC, pas une
implémentation de rôles multi-utilisateurs. Les champs auteur envoyés par un client
ne sont pas acceptés. Les erreurs publiques n'exposent ni exception Google ni
valeur privée. Les textes pouvant devenir des formules Sheets sont refusés.

La propriété `REFERENTIEL_V2=1` autorise les écritures V2, active la projection et
bloque la sauvegarde historique des logements. Absente, elle conserve les lectures
historiques et permet seulement lecture/simulation V2. L'accès au classeur vérifie
les garde-fous REC existants : APP_ENV, SPREADSHEET_ID, REC_SPREADSHEET_ID et identité.
Aucune cible PROD ou de secours n'est ajoutée.

## Import local et rapport obtenu

Prérequis : Node.js 24 et Python 3. Les cinq colonnes attendues sont Appartement,
Étage, Type, Locataire, Loyer DA (ou leurs noms JSON `num,etage,type,locataire,loyer`).
L'Excel doit porter ces en-têtes sur sa première ligne non vide, dans son premier
onglet. Les cellules de numéro sont textuelles, ou numériques avec format explicite
`00` (ou davantage de zéros). Un numéro numérique ambigu est refusé. Les formules
XLSX sont refusées, même si une valeur calculée est disponible. Les colonnes
supplémentaires ne sont pas importées. Les noms ne sont pas normalisés ou modifiés.

```sh
node scripts/prepare-referentiel-v2.mjs /chemin/prive/source.xlsx work/us-015-import
```

La commande produit `lignes.json` et `rapport.json`, exclusivement dans `work/`.
Une troisième entrée facultative permet de comparer à un export local des six
entités :

```sh
node scripts/prepare-referentiel-v2.mjs /chemin/prive/source.xlsx work/us-015-import /chemin/prive/etat-v2.json
```

Sans cet export, la cible est explicitement un référentiel local vide. Le code de
sortie est 2 si le rapport contient des conflits ; une erreur de lecture/validation
interrompt la simulation. Rien n'est envoyé à Google.

Simulation réalisée le 14 novembre 2026 : les 12 lignes du tableau métier fourni
ont été conservées uniquement dans `work/us-015-reference-privee.json`, ignoré par
Git. Rapport privé : `work/us-015-simulation/rapport.json`.

| Résultat sur cible locale vide | Valeur |
| --- | --- |
| Lignes valides / créations proposées | 12 / 12 |
| Identiques / conflits | 0 / 0 |
| Transactions créées / modifiées | 0 / 0 |
| Dates et cautions initiales | Non renseignées |

**Limite : le fichier Excel métier lui-même n'a pas été reçu.** Le rapport repose
sur le tableau de la demande, pas sur une lecture de cet Excel ni sur un état REC
réel. Les tests du lecteur XLSX portent sur des classeurs fictifs construits localement.
Avant recette réelle, rapprocher les lignes converties de l'Excel validé et
comparer les correspondances aux exports historiques privés. Aucun conflit réel
avec REC/PROD n'a été recherché ou exclu.

La simulation API produit une empreinte SHA-256 du contenu normalisé et de la
révision. L'application vérifie cette empreinte ainsi que la révision avant tout
append ; modifier la source ou l'état nécessite une nouvelle simulation. Cette
empreinte est un contrôle de cohérence, pas une signature ni une autorisation.
Les conflits n'écrasent jamais un bail ; un réimport identique ne recrée ni entités
ni historique métier (une demande explicite avec un nouvel ID peut journaliser un
commit sans delta).

## Procédure exacte de recette locale, autorisée maintenant

Depuis la racine du dépôt :

```sh
node tests/referentiel-v2.mjs
node tests/import-referentiel-v2.mjs
node scripts/check-apps-script.mjs
node tests/rec-synchronisation.mjs
node tests/isolation.mjs
node scripts/check-js.mjs
node scripts/prepare-v2-rec.mjs
node scripts/serve-referentiel-v2.mjs
```

Ouvrir `http://127.0.0.1:4175`. Le serveur n'expose que la nouvelle interface et
les vrais handlers simulés. Il ne sert ni l'ancien index pointant vers Google ni
les fichiers privés de `work/`. Les données sont en mémoire et disparaissent à
l'arrêt. Commencer avec des noms fictifs.

1. Créer un logement au numéro textuel, puis un locataire et un bail sans dates.
2. Renseigner une arrivée et une date de début de suivi différentes ; saisir une
   caution zéro puis la vider, vérifier la distinction.
3. Ajouter une version de loyer datée ; constater les deux versions conservées.
4. Terminer un bail puis créer son successeur à la date de sortie ; vérifier les
   deux baux. Un chevauchement doit être refusé.
5. Charger le JSON privé ou fictif, cliquer Simuler : vérifier la révision inchangée.
6. Contrôler le rapport, puis appliquer dans ce bac à sable uniquement. Simuler une
   seconde fois : les lignes deviennent identiques. Modifier un loyer de la source :
   le conflit interdit l'application.
7. Vérifier l'historique, l'absence d'encaissements et les anciennes données intactes.

Test navigateur automatisé (Playwright fourni par l'environnement de développement) :

```sh
DEMO_CHROMIUM_PATH=/usr/bin/chromium node tests/referentiel-v2-browser.mjs
```

Le script démarre et arrête son propre serveur sur 4176, teste 1440 et 390 pixels,
refuse les requêtes externes et enregistre des captures fictives dans
`work/us-015-screenshots/`. Adapter le chemin du navigateur local si nécessaire.

## Recette Google REC : procédure future, interdite sans nouvelle autorisation

Les étapes suivantes écrivent dans Google et/ou déploient : elles **n'ont pas été
exécutées** et exigent l'accord distinct du propriétaire.

1. Identifier un projet et un classeur REC autorisés. Sauvegarder leurs sources,
   propriétés privées et toutes leurs données, y compris un éventuel journal V2.
   Le compte REC ne doit pas avoir accès à PROD.
2. Vérifier l'Excel reçu, les correspondances avec le référentiel historique et
   les différences du candidat local. Ne rien mettre de nominatif dans Git.
3. Préparer le candidat avec `node scripts/prepare-v2-rec.mjs`. Il contient exactement
   Code.gs, ReferentielV2.gs, ReferentielV2Api.gs, ParametrageV2.html et appsscript.json.
4. Après autorisation d'envoi, transférer le candidat complet au projet REC dédié
   (manuellement ou par une liaison privée revue). **Ne pas utiliser le synchroniseur
   REC existant** : ses contrats approuvés concernent le backend antérieur et ne
   couvrent pas encore ce bundle multi-fichiers/HtmlService. Son adaptation exige
   une revue distincte ; aucun garde-fou de synchronisation n'est assoupli ici.
5. Après autorisation de configuration, renseigner dans les propriétés privées :
   APP_ENV=REC, SPREADSHEET_ID et REC_SPREADSHEET_ID égaux à la seule cible REC,
   V2_ADMIN_EMAIL égal au compte propriétaire. Laisser REFERENTIEL_V2 absent au
   premier contrôle. Les quatre onglets historiques et leurs en-têtes exacts doivent
   déjà exister. N'inscrire aucune valeur privée dans Git ou dans les logs.
6. Après autorisation de déploiement REC privé, conserver le manifeste MYSELF,
   puis ouvrir son URL privée avec `?action=v2.ui` sous le compte propriétaire.
   Vérifier lecture et simulation, sans onglet ni révision nouvellement créé.
7. Après autorisation d'activation et d'import sur cette cible, mettre
   REFERENTIEL_V2=1. Cette bascule rend immédiatement V2 seule source logement ;
   prévoir une fenêtre sans saisie jusqu'à l'import validé. Dans l'interface,
   simuler à nouveau, vérifier les 12 lignes et la révision, puis appliquer.
8. Rejouer les scénarios locaux sur données REC autorisées. Vérifier aussi les
   vraies permissions propriétaire/autre compte, l'accès HtmlService et les quotas,
   que les mocks ne certifient pas. Comparer les onglets historiques à la sauvegarde.
9. Pour tester le frontend REC existant avec la projection, générer sa configuration
   exclusivement à partir de l'URL REC autorisée et vérifier le préremplissage.
   Ne pas ouvrir l'index historique directement et ne pas publier sur Pages.
   L'authentification du frontend historique au backend MYSELF reste une limite
   existante : la recette du Paramétrage s'effectue via HtmlService privé.

Aucune étape PROD n'est incluse. Avant une évolution PROD ultérieure, revoir
notamment droits multi-utilisateurs, cache/service worker et stratégie de reprise.

## Retour arrière

Sans suppression : conserver le journal et les anciennes configurations, comparer
les états et préparer une correction contrôlée. Ne pas désactiver V2 automatiquement
après un échec : cela remettrait en service des données historiques potentiellement
périmées. Un retour de configuration ou de code doit être autorisé, sauvegardé et
accompagné d'un rapprochement explicite des modifications faites depuis l'activation.
Les outils REC existants ne constituent pas une sauvegarde du nouveau journal.

## Résultats de validation locale

Commandes réellement exécutées avec Node 24.22.1 et Python 3 :

| Contrôle | Résultat |
| --- | --- |
| `node tests/referentiel-v2.mjs` | 28 scénarios métier/API réussis : dates, loyers, historique, droits, environnement, concurrence, idempotence, réponse perdue, taille limite, journal corrompu, interface privée |
| `node tests/import-referentiel-v2.mjs` | 3 groupes réussis : 12 lignes fictives et réimport, XLSX/format 00/formules, protection des sorties privées |
| `node scripts/check-apps-script.mjs` | 84 scénarios historiques réussis |
| `node tests/rec-synchronisation.mjs` | 46 scénarios historiques hors réseau réussis ; ne certifie pas la compatibilité du synchroniseur avec le nouveau bundle |
| `node tests/isolation.mjs` | Isolation build/JSONP, absence de repli PROD et configuration immuable vérifiées |
| `DEMO_CHROMIUM_PATH=/usr/bin/chromium node tests/referentiel-v2-browser.mjs` | Parcours 1440 px et 390 px réussis, aucune requête externe ni erreur JavaScript |
| `node scripts/check-js.mjs` | Syntaxe de toutes les sources parcourues vérifiée, y compris sources candidates générées ; aucun code applicatif exécuté par ce contrôle |
| `node scripts/prepare-v2-rec.mjs` | Candidat complet généré localement, aucun envoi |
| `git diff --check` | Aucun problème d'espacement |

La bibliothèque Playwright était disponible ; son navigateur par défaut ne l'était
pas. Les parcours ont ensuite été exécutés avec le Chromium installé dans le
système, sans installation ni téléchargement. Une attente du test mobile a été
corrigée pour tenir compte des locataires fictifs créés par l'import desktop.

Une comparaison avec la base Git confirme que le HTML avant Paramétrage et les
fonctions Saisie/Synthèse après ce bloc sont inchangés. Aucun test sur Google réel,
permissions Google effectives, quotas, accès web REC ou déploiement n'a été effectué.
Le workflow existant de syntaxe inclut désormais les contrôles métier/import et
les régressions hors réseau ; il ne contient aucune publication ni déploiement.

## Complément avant autorisation de recette

Voir [les vérifications de préparation REC](us-015-preparation-recette.md) pour
le contrôle agrégé à 220 000 DA, l'absence du fichier Excel définitif, les tests
explicites de modification des trois entités et les 24 étapes de recette future.
Ce complément ne donne aucune autorisation Google supplémentaire.
