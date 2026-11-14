# US-015 — Dernière vérification et plan d'exécution REC

14 novembre 2026, Europe/Paris. Branche `dev/us-015-referentiel`, code applicatif
inchangé depuis `401f2f5`. Le principe du journal additif est validé par le propriétaire.
Ce document remplace les réserves « Excel absent » des comptes rendus précédents.
Aucune action Google, modification de classeur, envoi, déploiement ou fusion n'a
été exécuté. Le présent plan est soumis à autorisation explicite.

## 1. Excel définitif reçu et comparé

Source : pièce jointe `depot_v2_referentiel_logements_baux_cautions.xlsx`.
L'empreinte SHA-256 et le rapport privé sont conservés dans
`work/us-015-excel-definitif/concordance.json`, ignoré par Git.
Les données nominatives et le classeur ne sont pas versionnés.

Le fichier contient trois onglets : Logements, Synthèse et Import V2. Les données
métier de Logements et Import V2 ont été croisées ligne par ligne, sans utiliser
les instructions textuelles du classeur comme autorisations d'action.

| Contrôle contre le tableau privé précédemment utilisé | Résultat |
| --- | --- |
| Nombre et numéros des logements | 12, tous identiques, stockés textuellement dans l'Excel |
| Types | 12 identiques |
| Noms des locataires | 12 identiques, casse et orthographe conservées |
| Loyers individuels | 12 identiques |
| Total mensuel recomputé depuis les 12 montants | 220 000 DA |
| Étages | 11 différences de libellé, aucune différence d'étage réel ; Toit identique |
| Dates d'arrivée/départ et cautions reçues/restituées et dates associées | Toutes les cellules correspondantes vides dans les deux onglets métier |

Différences annoncées au propriétaire avant poursuite de la préparation : les
libellés `1er` / `2e` du tableau initial deviennent `1er étage` / `2e étage` dans
l'Excel. L'extraction définitive conserve les libellés exacts de l'Excel.
Le modèle n'a pas de valeur métier codée en dur : les données comparées étaient
le jeu privé ayant servi à la simulation, pas des noms stockés dans le code.

### Limite du lecteur direct et chemin de préparation retenu

Le lecteur versionné ne peut pas importer directement ce classeur en l'état : il
lit uniquement le premier onglet, dont les premières lignes sont un titre et un
sous-titre et dont le total est une formule. Le refus réel est « Formule XLSX
interdite : E17 ». Les en-têtes métier ne sont pas en première ligne non vide.
De plus, les cellules texte utilisent le type XLSX `str`, à prendre en compte
explicitement si le lecteur générique est adapté ultérieurement.

Aucun assouplissement du refus des formules, aucune modification du classeur ni du
lecteur n'a été effectué. Le chemin concret préparé est une extraction locale
contrôlée de l'onglet **Import V2**, croisée avec Logements, vers :

```text
work/us-015-excel-definitif/lignes.json
```

Le script privé reproductible de vérification/extraction est
`work/us-015-verifier-excel-final.py`. Il vérifie l'absence de formules dans les
lignes importées, les numéros textuels, les cellules facultatives vides, l'accord
entre les deux onglets, les différences avec la source antérieure et le total.
Il ne sélectionne que les champs num, type, etage, locataire et loyer. Les colonnes
« caution reçue/restituée » ne sont jamais transformées en caution contractuelle
ou en opération de caisse.

Simulation effectivement exécutée, sans Google :

```sh
node scripts/prepare-referentiel-v2.mjs work/us-015-excel-definitif/lignes.json work/us-015-excel-definitif/simulation
```

Sur cible locale vide : 12 créations proposées, aucun conflit, aucune transaction
créée. Le modèle produit 12 baux avec arrivee, depart, suiviFinancierDepuis et
cautionPrevue null. Un rejeu de la même requête en mémoire ne crée aucun doublon ;
une nouvelle simulation de la source devient 12 identiques.

Sur un état simulé initialisé à partir de l'ancien tableau : **11 conflits** de
libellé d'étage, 1 identique. Cela ne décrit pas l'état REC réel, qui n'a pas été
lu. Si ces conflits existent en REC, arrêter l'import ; toute correction devra
passer par les actions métier sur les UUID existants, avec contrôle du propriétaire.
Ne pas créer d'autres logements pour contourner ces conflits.

## 2. Vérifications techniques locales et preuves distantes manquantes

| Sujet | Vérifié localement | À vérifier sur les ressources REC réelles après autorisation |
| --- | --- | --- |
| Séparation | APP_ENV=REC obligatoire ; deux propriétés Sheets égales ; identité du classeur contrôlée ; build sans repli et sans SW REC | IDs effectifs, propriétaire et droits du compte REC |
| Bundle | Trois GS + HTML assemblé + manifeste ; syntaxe combinée valide ; HTML autonome sans CDN | Autorisations Google, chargement HtmlService, contexte d'identité |
| Permissions | MYSELF / USER_DEPLOYING ; email serveur égal à V2_ADMIN_EMAIL | Compte propriétaire accepté, autre compte refusé |
| JSONP | Fonction de transport réelle et vrai handler testés en Chromium avec réponses interceptées ; données attendues relues ; réponse HTML de connexion simulée refusée | Authentification réelle du frontend face au déploiement MYSELF et règles de cookies/redirections |
| Doublons | requestId, empreinte de simulation et expectedRevision ; refus des conflits | Comportement aux quotas/erreurs Google et reprise contrôlée |
| Historique | Les quatre onglets historiques simulés restent strictement identiques après import ; anciennes écritures logement bloquées en V2 | Comparaison aux sauvegardes des données REC réelles |
| Restauration | Copie du stockage simulé complet puis rejeu : état identique | Validité des sauvegardes Drive/XLSX, projets, propriétés, partages et déploiements |

Les propriétés concordantes ne prouvent pas à elles seules la séparation de PROD :
si un opérateur configure les deux IDs vers une mauvaise cible, le code ne connaît
pas une liste indépendante de tous les classeurs PROD. La vérification privée de
la cible par le propriétaire et un compte REC sans accès PROD restent nécessaires.
Aucun ID Google réel ni propriété distante n'est disponible dans les sources locales.
Aucune séparation effective de l'installation distante n'est donc certifiée ici.

Le bundle préparé par `node scripts/prepare-v2-rec.mjs` contient exactement :

```text
Code.gs
ReferentielV2.gs
ReferentielV2Api.gs
ParametrageV2.html
appsscript.json
```

Ses fichiers GS et manifeste sont identiques aux sources revues ; l'HTML contient
l'interface et ses styles/scripts intégrés. Syntaxe GS combinée et script HTML
contrôlés localement. Les handlers testés sont les mêmes sources. Le synchroniseur
REC antérieur refuse les nouveaux fichiers par sa liste fermée : **ne pas l'utiliser**.
La méthode prévue est un transfert manuel complet et revu dans le projet REC.

La validation JSONP locale ne certifie pas l'authentification Google : le navigateur
n'a émis aucune requête réelle. Le test a intercepté les réponses du domaine fictif.
Une API MYSELF ne doit pas être rendue anonyme pour faire réussir cette recette.

## 3. Ressources Google concernées et périmètre à autoriser

| Ressource | Actions futures prévues |
| --- | --- |
| Compte REC propriétaire | Vérifier identité, permissions et absence d'accès PROD |
| Classeur Google Sheets REC désigné par le propriétaire, ID privé à confirmer | Lecture initiale, sauvegarde complète, ajout du seul onglet v2_referentiel_commits lors de l'import autorisé |
| Projet Apps Script backend REC désigné, ID privé à confirmer | Sauvegarde sources/configuration, transfert des cinq fichiers, configuration privée et déploiement web MYSELF |
| Dossier privé de sauvegarde REC, emplacement à confirmer | Conserver copies Sheets, export XLSX, sources, propriétés et preuves de recette |
| Déploiement web REC, existant ou nouveau, URL /exec privée à confirmer | Tester lectures, Paramétrage HtmlService et authentification JSONP |

Les quatre onglets historiques sont uniquement lus et comparés dans cette recette.
Aucun projet REC-Synchronisation/REC-Maintenance n'est modifié, aucun déclencheur
n'est créé, aucune publication Pages ni ressource PROD n'est concernée.
Les tests du frontend se feront sur un build REC servi localement.

Les IDs privés, propriétaires, URL de déploiement et dossier de sauvegarde doivent
être identifiés et approuvés avant exécution. Les noms « REC » ne suffisent pas ;
aucune URL ni ressource réelle n'est inventée dans ce plan.

## 4. Actions exactes et points d'arrêt

### Phase A — Identification, sauvegarde et lecture seulement

1. Après autorisation, relever le classeur REC depuis son URL `/spreadsheets/d/ID/`,
   vérifier son propriétaire puis comparer cet ID à celui autorisé. Ouvrir seulement
   le projet Apps Script REC confirmé, relever son ID, propriétaire, version et
   déploiements. Ne pas ouvrir PROD pour ce contrôle.
2. Vérifier les en-têtes exacts des quatre onglets historiques selon
   `apps-script/src/Code.gs`, les données et l'existence éventuelle du journal V2.
   Relever la révision si un journal existe. Ne rien initialiser pendant ces lectures.
3. Faire une copie complète du classeur dans le dossier privé REC, télécharger un
   XLSX, vérifier la présence de tous les onglets et l'ouverture des exports. Capturer
   valeurs, formules et dimensions utilisées des quatre onglets historiques.
4. Sauvegarder séparément toutes les sources Apps Script, manifeste, propriétés
   privées, versions/déploiements et déclencheurs. Vérifier que ces sauvegardes sont
   lisibles ; une copie Sheets ne sauvegarde pas à elle seule le projet autonome.
5. Si un déploiement REC existe, préparer un frontend local isolé ciblant son URL
   approuvée et tester uniquement les lectures JSONP configuration/transactions.
   Vérifier les réponses et redirections dans Réseau : HTTP 200 seul et ping ne
   prouvent ni le contrat JSONP ni la bonne cible Sheets. Si le transport privé
   échoue, arrêter le volet frontend et présenter le blocage avant l'envoi candidat.
   S'il n'existe aucun déploiement, cette preuve est impossible avant un premier
   déploiement privé de test : l'autorisation devra explicitement couvrir ce test,
   sans activation V2 ni import.

### Phase B — Installation et déploiement privé, V2 inactive

6. Reconstituer le candidat local avec `node scripts/prepare-v2-rec.mjs`. Dans le
   seul projet backend REC sauvegardé, transférer les trois GS, l'HTML ParametrageV2
   et le manifeste ; vérifier le contenu complet, aucune fonction homonyme ancienne.
   Ne pas utiliser le synchroniseur actuel ou envoyer seulement Code.gs.
7. Configurer en privé APP_ENV=REC ; SPREADSHEET_ID et REC_SPREADSHEET_ID égaux à
   l'ID Sheets REC autorisé ; V2_ADMIN_EMAIL égal au propriétaire attendu. Laisser
   REFERENTIEL_V2 absent. Recontrôler les deux IDs contre l'URL du classeur autorisé.
8. Créer une version et un déploiement Application Web REC, exécuter comme le
   propriétaire, accès « Moi uniquement » (MYSELF). Conserver en privé commit,
   version et URL /exec ; aucun déploiement public, Pages ou déclencheur.
9. Ouvrir `?action=v2.ui` sur cette URL REC : propriétaire accepté, autre compte
   refusé, V2 inactive et aucune écriture à la lecture/simulation. Rejouer la lecture
   JSONP depuis le frontend REC local contre ce candidat. En cas d'échec, arrêter
   avant activation/import et demander un arbitrage sur le transport ; ne pas
   déclarer la recette globale réussie parce que HtmlService fonctionne seul.

### Phase C — Initialisation/import explicite, sans transaction de caisse

10. Contrôler l'empreinte du classeur Excel source et du JSON extrait, examiner les
    différences d'étage annoncées et rapprocher les exports REC privés de la source.
    Charger uniquement le JSON contrôlé depuis Import V2. Sur état V2 absent, le
    rapport attendu est 12 créations. Sur état existant, analyser le vrai rapport ;
    tout conflit interdit l'application et exige une résolution validée.
11. Fermer la saisie pendant la fenêtre de bascule. Configurer REFERENTIEL_V2=1
    uniquement sur le backend REC. Actualiser et refaire Simuler : la révision doit
    correspondre au rapport contrôlé. V2 devient immédiatement la seule source
    logement ; sa projection est vide avant le premier import sur cible vide.
12. Après contrôle du rapport, cliquer Appliquer puis confirmer. Le serveur valide
    l'empreinte, la révision, les règles, le verrou et la taille des cellules ; il
    crée le journal absent et son en-tête puis ajoute un commit. Il n'écrit dans
    aucun des quatre onglets historiques et ne crée aucune opération de caisse.
13. Actualiser, vérifier les 12 lignes métier, les libellés exacts de l'Excel, le
    total recomputé de 220 000 DA, les quatre champs facultatifs null et l'historique.
    Refaire Simuler : 12 identiques, aucune création/conflit. Ne pas appliquer une
    seconde fois inutilement. Comparer les onglets historiques à la sauvegarde :
    valeurs, formules et dimensions utilisées strictement inchangées.

### Phase D — Recette fonctionnelle et clôture

14. Créer seulement une fiche technique fictive distincte des logements métier,
    tester ajout/modification logement/locataire/bail, dates indépendantes, caution
    vide/zéro, nouveau loyer daté, succession de baux et refus du chevauchement.
    Vérifier UUID, avant/après, révisions et relecture après actualisation. Désactiver
    ensuite le logement technique ; sa trace reste dans le journal. Ne modifier
    aucun des douze locataires réels pour ces scénarios.
15. Sur le frontend local construit avec APP_ENV=REC et la seule REC_API_URL validée,
    vérifier transactions existantes, Synthèse sur mêmes filtres, locaux/Hedam,
    préremplissage Saisie et masquage/refus de l'ancien éditeur logement. Ne pas
    enregistrer d'encaissement fictif dans cette cible métier. Les tests de caisse
    en écriture nécessitent une autre cible REC fictive explicitement autorisée.
16. Comparer encore les quatre onglets historiques, relever temps de lecture et
    sauvegarde, erreurs/quota, révisions et preuves privées. La recette complète
    exige le succès du transport réel, pas seulement les tests de contrat. Remettre
    le compte rendu au propriétaire ; aucune étape de fusion ou PROD n'est incluse.

## 5. Sauvegarde, restauration et risques résiduels

Aucun outil de restauration automatique du nouveau journal n'est fourni. Le test
local de copie/rejeu confirme uniquement la reconstruction depuis les données
simulées complètes ; il ne valide pas une restauration Google réelle.

En cas d'incident : fermer la saisie REC ; conserver une copie de l'état en échec,
son journal et sa révision ; ne pas réessayer avec de nouveaux requestId ni couper
V2 pour rouvrir automatiquement l'ancien référentiel potentiellement périmé.
Comparer avec la sauvegarde. Préparer une restauration sur une **copie REC distincte**
et vérifier les quatre onglets plus le journal et les permissions avant toute
bascule. Une restauration et un changement de cible/propriétés/déploiement devront
être explicitement autorisés ; ne pas écraser le classeur source ni supprimer des
transactions intervenues depuis la sauvegarde. Un retour au code ancien ne suffit
pas à réconcilier les modifications V2 ; garder les écritures fermées jusqu'à
validation de cette réconciliation.

Risques résiduels à lever ou accepter avant exécution :

- Identifiants/configuration privée et séparation effective REC/PROD non audités
  sur Google ; les ressources sont encore à confirmer par le propriétaire.
- Communication JSONP/authentification MYSELF non certifiée sur le vrai déploiement.
- Import direct du XLSX non supporté par le lecteur actuel ; utiliser l'extraction
  revue, ne pas masquer ce refus ou prétendre avoir corrigé le lecteur générique.
- Conflits possibles sur les 11 libellés d'étage si V2 est déjà initialisée avec
  l'ancien tableau ; aucun écrasement automatique.
- Journal relu/revalidé intégralement, limites de cellule et quotas Google ; pas
  de transaction ACID ni de protection contre un éditeur Sheets altérant les JSON.
- Restauration Google non répétée en conditions réelles ; sauvegardes privées à
  contrôler avant toute écriture.

## 6. Vérifications réellement exécutées

- Contrôle croisé XML de l'Excel définitif et comparaison des 12 lignes à la source
  privée antérieure ; total et cellules facultatives vérifiés.
- Refus du lecteur XLSX direct reproduit ; extraction contrôlée et simulation JSON.
- Assemblage/syntaxe des cinq fichiers candidats, manifeste et absence de ressources
  externes de l'interface ; services Google exclusivement simulés.
- Simulation/import en mémoire : 12 baux, total 220 000, dates/cautions null,
  anciennes données intactes, rejouabilité sans doublon, copie/restauration par rejeu.
- Vrai transport JSONP en Chromium, vrai handler avec services fictifs : réponse
  attendue acceptée et HTML d'authentification simulé refusé, requêtes interceptées.
- Suites existantes relancées : 29 scénarios V2, 84 historiques, 46 synchronisation,
  isolation ; contrôles de syntaxe et d'espacement.

Les scripts/rapports nominatifs restent dans work/ ignoré par Git. Le code applicatif,
le lecteur d'import et les tests versionnés ne sont pas modifiés pour cette étape.
Aucune opération réelle n'est autorisée par ce compte rendu : attendre l'accord
explicite du propriétaire sur les cibles et phases retenues.
