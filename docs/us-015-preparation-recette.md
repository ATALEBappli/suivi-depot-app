# US-015 — Vérifications avant autorisation de recette Google

> Mise à jour : l’Excel définitif a depuis été reçu et contrôlé. Voir
> [le dernier contrôle et plan REC](us-015-plan-execution-rec.md), qui remplace
> les réserves de source manquante ci-dessous et signale les écarts de libellés
> ainsi que la limite du lecteur XLSX direct. Les anciennes observations sont
> conservées comme compte rendu de leur intervention.


Date : 14 novembre 2026 (Europe/Paris). Base examinée : commit `401f2f5`, branche
`dev/us-015-referentiel`. Cette intervention complète les tests et la documentation ;
aucun fichier applicatif n'est modifié. Aucun accès Google, changement de classeur,
envoi de sources, déploiement, fusion ou intervention PROD n'est effectué.

## 1. Référentiel définitif : contrôle incomplet, source manquante

Le fichier `depot_v2_referentiel_logements_baux_cautions.xlsx` n'est ni joint à cette
intervention, ni présent dans le checkout ou les pièces locales disponibles. Les
deux pièces HTML précédemment reçues sont des maquettes, pas ce classeur.

Le tableau de la demande initiale a été revérifié localement : 12 logements,
12 locataires, 12 baux, total contractuel mensuel de **220 000 DA**. Dans les entités
produites en mémoire, arrivée, départ, début de suivi financier et caution prévue
sont tous null. Aucun encaissement n'est créé. Ce résultat ne constitue **pas** une
concordance avec l'Excel définitif, ni une lecture des données REC.

Le rapport de ce contrôle local est dans `work/us-015-preparation-reference.json`,
ignoré par Git. Les lignes nominatives ne sont pas versionnées. Le rapprochement
ligne à ligne numéro/type/étage/nom/loyer reste en attente du fichier définitif.

Dès que le fichier est disponible, sans accès Google :

1. Conserver l'original dans un dossier privé et relever son empreinte SHA-256.
2. Exécuter depuis la racine du dépôt :

   ```sh
   node scripts/prepare-referentiel-v2.mjs /chemin/prive/depot_v2_referentiel_logements_baux_cautions.xlsx work/us-015-excel-definitif
   ```

3. Contrôler les 12 lignes de `work/us-015-excel-definitif/lignes.json` directement
   contre les cellules affichées dans l'Excel : numéros textuels avec zéros initiaux,
   types, étages, noms exacts et montants. Aucun nom ne doit être corrigé ou fusionné
   automatiquement. Le lecteur utilise le premier onglet et sa première ligne non
   vide comme en-tête ; un autre agencement exige une revue préalable, pas une
   modification de l'original pour contourner un refus.
4. Additionner les loyers : le total doit être 220 000 DA. Vérifier 12 numéros
   distincts et le rapport de simulation sans conflit sur cible vide. Une égalité
   de total ne suffit pas à valider les montants individuels.
5. Vérifier dans le résultat du modèle que les quatre champs facultatifs restent
   null : arrivee, depart, suiviFinancierDepuis et cautionPrevue. Le lecteur n'importe
   que les cinq colonnes du référentiel ; il ne déduit aucune date ou caution.
6. Conserver le rapport privé de concordance et l'empreinte du fichier vérifié.
   En cas de différence avec le tableau antérieur, faire arbitrer la différence
   avant toute application ; ne pas présenter l'ancien rapport comme définitif.

## 2. Stockage réel prévu : un journal, six entités logiques

**Écart explicite avec la proposition initiale : six onglets séparés ne seront pas
créés.** Les six entités indépendantes restent présentes dans le modèle et l'API,
mais leur stockage physique est un seul nouvel onglet `v2_referentiel_commits` :

| Colonne | Contenu |
| --- | --- |
| revision | Numéro entier séquentiel du changement |
| request_id | Identifiant de la demande, utilisé contre les doublons |
| request_json | Demande sérialisée, contenant les paramètres métier |
| delta_json | Objets créés/modifiés des six entités, historique compris |

Exemple conceptuel non nominatif : un import crée logements, locataires, baux,
loyers initiaux, historique et suivi d'import dans le delta d'une même ligne. Une
modification ultérieure ajoute une nouvelle ligne ; elle ne remplace pas les
anciennes. Les anciennes configurations et transactions restent dans leurs onglets.

Ce choix réduit le risque d'une modification partielle répartie entre plusieurs
onglets : un changement métier utilise une seule opération `appendRow` pour son
commit, après validation complète. La première écriture crée aussi l'onglet et son
en-tête. Cela ne constitue pas une garantie ACID de base de données. Une réponse
Google perdue est traitée par relecture et idempotence, sans réessai automatique.

À l'ouverture ou après une sauvegarde, le Paramétrage appelle `v2Client` via
`google.script.run` dans l'interface privée HtmlService. Le serveur relit le journal,
reconstruit les six collections, puis les renvoie à l'écran. Lors d'une modification,
il vérifie l'utilisateur propriétaire, l'environnement REC, la révision attendue,
les validations métier et le verrou ; il ajoute un delta et l'interface recharge
l'état. Une révision périmée est refusée. Une requête identique peut être rejouée
avec le même identifiant sans créer un deuxième changement.

L'historique conserve auteur serveur, horodatage, avant/après et identifiant de
l'objet. Les baux et versions de loyers précédents restent présents ; le changement
de locataire crée un nouveau bail. L'API n'offre pas de suppression. Une modification
du nom d'une même personne conserve son UUID et trace son ancien nom dans l'historique.

Conséquences pratiques :

- Le journal est moins lisible manuellement que six tables : les corrections doivent
  passer par le Paramétrage ; ne pas éditer ses JSON ni trier ses lignes.
- Les anciens onglets ne sont pas des copies synchronisées des entités V2. Après
  activation, les lectures historiques logement sont calculées depuis V2 et leur
  ancienne route de sauvegarde est refusée côté serveur.
- Chaque lecture recharge tout le journal. Le rejeu revalide et recopie les états
  successifs ; le coût peut croître plus vite que le nombre de commits. La lecture
  historique de configuration des logements subit aussi ce coût après activation.
- Le plafond préventif est 45 000 caractères par cellule de demande/delta. Un commit
  trop gros est refusé avant toute écriture. Le volume actuel de 12 logements a été
  testé localement, pas les durées/quota Google en charge.
- Sauvegarder le journal entier, pas seulement les anciennes configurations. Garder
  un lecteur compatible lors des futures évolutions du schéma. Des snapshots, un
  export tabulaire ou une compaction devront être conçus et testés avant une forte
  croissance ; ils ne sont pas implémentés dans cette US.
- Les éditeurs du classeur peuvent altérer le journal en dehors de l'application.
  Le code détecte plusieurs corruptions et échoue sans repli, mais ne fournit pas
  d'intégrité cryptographique contre un éditeur. Restreindre les droits d'édition
  à la cible REC autorisée ; l'empreinte d'import n'est pas une signature du journal.

## 3. Vérification du Paramétrage local

Les parcours automatisés à 1440 et 390 pixels ont été enrichis et rejoués :

| Objet | Ajout | Modification et relecture |
| --- | --- | --- |
| Logement fictif | Numéro, type, étage | Type/étage changés ; même UUID, même nombre de logements |
| Locataire fictif | Nom | Nom et complément changés ; même UUID, aucun doublon |
| Bail fictif | Lien logement/locataire, loyer | Arrivée, début du suivi et caution changés ; même UUID et mêmes parties |

Les changements persistent après actualisation du navigateur ; l'historique du
logement et du locataire contient les valeurs avant/après. Révision de loyer,
simulation sans changement de révision et application contrôlée sont également
rejouées. Les dates/caution saisies dans ces scénarios sont **fictives** et ne sont
pas injectées dans les 12 logements métier. Le serveur local ne persiste qu'en
mémoire ; arrêter ce serveur efface ces données, contrairement à un simple reload.

Une régression API supplémentaire vérifie qu'après modification des trois objets,
la lecture historique renvoie le contrat et les valeurs attendus, sans changer les
quatre onglets historiques. Une saisie de caisse explicitement demandée dans le
mock reste possible et ajoute exactement une ligne, sans toucher aux précédentes.

## 4. Procédure Google REC à exécuter seulement après nouvelle autorisation

Toutes les opérations ci-dessous sont **futures, non exécutées**. L'autorisation
devra couvrir la cible privée choisie, la sauvegarde, l'envoi de sources, le
déploiement REC, la configuration et l'import. Aucun geste PROD n'est nécessaire.

### A. Vérifier l'identité de la cible et sauvegarder

1. Utiliser le compte REC autorisé. Ouvrir uniquement le classeur REC désigné par
   son lien privé. Relever son identifiant dans `/spreadsheets/d/<ID>/edit`, son
   propriétaire et son dossier ; le seul nom « REC » ne prouve pas son identité.
   Comparer l'identifiant à celui confirmé par le propriétaire, sans ouvrir PROD.
2. Dans le projet Apps Script REC désigné, vérifier l'ID du projet dans Paramètres
   et l'identité du propriétaire. Relever les déploiements et déclencheurs existants.
   Ne pas utiliser un projet de synchronisation ou maintenance comme backend.
3. Vérifier les quatre onglets et l'ordre exact de leurs en-têtes :

   ```text
   transactions : type,date,montant,sous_bloc,description,local,locataire,fournisseur,periode,moyen,personne
   config_logements : num,type,locataire,loyer
   config_locaux : code,nom,locataire,loyer
   config_hedam : code,nom
   ```

   Les colonnes utilisées supplémentaires sont refusées par les contrôles existants.
   Vérifier aussi si `v2_referentiel_commits` existe : ne jamais le vider ni le
   remplacer pour obtenir une cible vide.
4. Avant modification, dans Sheets : Fichier → Créer une copie, tous les onglets,
   dans un dossier privé REC, avec date et heure dans le nom. Ne pas réutiliser les
   partages d'une autre cible. Télécharger également le classeur complet au format
   XLSX dans le dossier privé de sauvegarde ; vérifier qu'il s'ouvre et contient
   tous les onglets, y compris un éventuel journal V2.
5. Exporter/capturer les sources complètes et le manifeste du projet Apps Script
   avant envoi, sa version et le déploiement utilisé. Conserver les propriétés
   privées et les déclencheurs dans un emplacement sûr hors Git. Une copie de
   classeur ou de sources ne sauvegarde pas à elle seule toute la configuration
   du projet autonome et de ses déploiements.
6. Conserver un état de référence des quatre onglets : valeurs et formules,
   en-têtes, nombre de lignes/colonnes utilisées. Ces exports privés seront comparés
   après import et tests, sans réimport automatique ni copie vers le dépôt.

### B. Préparer et déployer uniquement le backend REC privé

7. Depuis la branche revue, préparer localement :

   ```sh
   node scripts/prepare-v2-rec.mjs
   ```

   Vérifier les cinq fichiers de `work/us-015-rec-candidate/` : Code.gs,
   ReferentielV2.gs, ReferentielV2Api.gs, ParametrageV2.html, appsscript.json.
   Le synchroniseur REC existant n'accepte pas encore ce nouveau bundle : ne pas
   l'utiliser ni modifier ses garde-fous pour passer outre.
8. Après contrôle de l'ID du projet REC sauvegardé, transférer les trois fichiers
   `.gs`, créer le fichier HTML `ParametrageV2` et copier son contenu généré ;
   conserver le manifeste complet du candidat. Ne pas laisser d'anciennes sources
   homonymes ou de fonctions doGet/doPost concurrentes. Arrêter si le projet contient
   des dépendances non comprises dans l'export revu.
9. Renseigner dans Propriétés du script, hors Git :

   ```text
   APP_ENV = REC
   SPREADSHEET_ID = <ID privé du classeur REC vérifié>
   REC_SPREADSHEET_ID = <le même ID privé>
   V2_ADMIN_EMAIL = <adresse du propriétaire REC vérifié>
   ```

   Laisser `REFERENTIEL_V2` absent pour cette première vérification. Vérifier
   manuellement l'égalité des deux IDs avec l'URL du classeur, pas seulement entre
   eux. Le code vérifie aussi l'identité renvoyée par le classeur ouvert.
10. Dans Déployer → Nouveau déploiement → Application Web : exécuter en tant que
    propriétaire du déploiement, accès « Moi uniquement ». Cela correspond à
    `USER_DEPLOYING` et `MYSELF` du manifeste. Refuser tout accès anonyme. Autoriser
    les services demandés uniquement avec le compte REC et conserver en privé la
    version, l'URL `/exec` et la correspondance avec le commit candidat. Aucun
    déclencheur ni déploiement Pages n'est requis.
11. Ouvrir cette URL REC avec `?action=v2.ui`. Vérifier l'utilisateur, la mention
    REC et V2 inactive. Une lecture ou simulation ne doit créer ni onglet ni commit.
    Si le journal existe, relever sa révision et l'état reconstruit ; ne pas
    supposer que le référentiel est vide. Vérifier le refus d'un autre compte.

### C. Initialiser et importer sans changer les transactions

12. Utiliser uniquement `lignes.json` issu de l'Excel définitif vérifié en section 1.
    Charger ce fichier dans Simulation d'import. Pour un journal initialement absent,
    attendre 12 créations, aucun conflit. Pour un état V2 existant, examiner chaque
    ligne identique/création/conflit ; ne pas imposer artificiellement 12 créations.
13. Rapprocher aussi le fichier des anciennes configurations exportées. La simulation
    V2 ne déduit pas une correspondance depuis les transactions ni depuis un ancien
    numéro éventuellement tronqué par Sheets : les écarts doivent être arbitrés
    avant activation, sans réécriture de ces lignes historiques.
14. Prévoir une fenêtre sans saisie ; mettre `REFERENTIEL_V2=1` dans les propriétés
    du backend REC. Cette bascule active immédiatement V2 comme seule source logement.
    Avant l'import initial, sa projection peut donc être vide. Ne pas rouvrir la
    saisie pendant cette fenêtre et ne pas désactiver V2 automatiquement après erreur.
15. Actualiser le Paramétrage privé, recharger le fichier si nécessaire et refaire
    Simuler. Vérifier rapport, révision, total de la source (220 000 DA) et absence
    de conflit, puis cliquer Appliquer et confirmer sur la cible REC autorisée.
    La première application crée le nouvel onglet et son en-tête, puis un commit.
    Aucun onglet historique ne doit être créé, nettoyé ou remplacé par l'import.
16. Actualiser : vérifier les 12 logements métier, les 12 locataires et baux, les
    loyers ligne à ligne, le total de 220 000 DA et toutes les dates/cautions vides.
    Vérifier l'historique d'import. Refaire Simuler sur la même source : 12 identiques,
    aucune création et aucun conflit. Il n'est pas nécessaire d'appliquer ce second
    rapport pour démontrer l'idempotence.
17. Comparer les quatre onglets historiques aux états sauvegardés : mêmes valeurs,
    formules, en-têtes et dimensions utilisées. L'import ne doit ajouter aucune
    transaction, même si des loyers contractuels sont désormais disponibles.

### D. Tester les modifications et la compatibilité

18. Dans le Paramétrage REC privé, utiliser une fiche technique **fictive** distincte
    des 12 logements : numéro `REC-US015-TEST`, locataire « Locataire fictif REC ».
    Créer un bail à la date de test J, loyer fictif 100 DA, suivi depuis J et caution
    vide. Modifier type/étage, nom/complément et dates du bail. Actualiser et vérifier
    les mêmes UUID et les avant/après, sans toucher aux locataires réels.
19. Sur ce bail fictif, ajouter un loyer 110 DA à effet J+1 ; vérifier les deux
    versions et l'ancienne valeur avant cette date. Terminer le bail à J+2 puis
    créer un autre bail à J+2 avec un second locataire fictif ; vérifier les deux
    baux et le refus d'un chevauchement. Désactiver ensuite le logement de test :
    son historique subsiste, il ne figure plus parmi les logements actifs. La cible
    contient alors 12 logements métier actifs plus une fiche technique inactive.
20. Pour le frontend REC historique, préparer localement sa variante isolée, avec
    l'URL privée du seul déploiement REC (jamais l'index brut du dépôt) :

    ```sh
    APP_ENV=REC REC_API_URL='<URL privée REC /exec vérifiée>' node scripts/build-frontend.mjs
    python3 -m http.server 4177 --bind 127.0.0.1 --directory dist
    ```

    Ouvrir `http://127.0.0.1:4177`, vérifier le bandeau REC, l'absence de service
    worker et la destination de chaque appel dans l'onglet Réseau. N'accorder aucun
    accès public au backend pour contourner un échec d'authentification.
21. Vérifier la lecture des anciennes transactions et les mêmes résultats de
    Synthèse sur les mêmes filtres. Vérifier les lectures locaux/Hedam et le
    préremplissage numéro/locataire/loyer de Saisie, sans enregistrer une opération.
    Après activation, l'ancien éditeur logement doit être masqué et son ancienne
    route d'écriture refusée. Ces vérifications sont en lecture, sauf le test V2
    explicitement fictif des étapes 18–19.
22. **Limite connue** : le frontend historique utilise JSONP et le backend est privé
    MYSELF. Les cookies/authentifications du navigateur peuvent empêcher l'appel
    depuis le frontend local. Le bon fonctionnement de HtmlService ne prouve pas
    celui de ce transport. Si la lecture échoue, enregistrer un blocage de recette
    du frontend historique et arrêter ce volet ; ne pas déclarer la compatibilité
    bout en bout acquise ni élargir les permissions. Une adaptation d'authentification
    et de transport devra faire l'objet d'une évolution revue séparément.
23. Si un test d'écriture de caisse est demandé ultérieurement, le réaliser sur une
    seconde cible REC autorisée à données entièrement fictives ; ne pas injecter
    d'encaissement de test dans le référentiel métier importé. Les tests locaux de
    cette intervention couvrent déjà le contrat d'ajout historique avec des mocks.
24. Contrôler une dernière fois les onglets historiques, le journal, la liste des
    logements actifs et les rôles réels. Conserver les preuves privées de recette
    (différences, révisions, captures, version déployée et temps de réponse). Une
    absence de preuve ou un échec reste une réserve ; ne pas poursuivre en PROD.

## 5. Résultats locaux et restrictions maintenues

- `node tests/referentiel-v2.mjs` : 29 scénarios réussis, dont compatibilité après
  modification des trois entités et intégrité des anciennes lignes.
- `node tests/import-referentiel-v2.mjs` : 3 groupes de contrôles réussis.
- `DEMO_CHROMIUM_PATH=/usr/bin/chromium node tests/referentiel-v2-browser.mjs` :
  ajout/modification des trois entités à 1440 et 390 px, UUID, relecture, historique,
  import ; aucune requête externe ou erreur JavaScript.
- Les contrôles de syntaxe, du backend historique, d'isolation et d'espacement
  sont relancés pour cette préparation ; leurs résultats sont consignés dans le
  compte rendu de la conversation. Aucune autorisation Google n'a été sollicitée.

Décision : contrôles locaux concluants. **Concordance Excel définitive en attente**.
Les performances et permissions Google réelles, ainsi que le transport historique
vers MYSELF, ne sont pas certifiées. Aucune opération réelle ne sera entreprise
sans nouvelle autorisation explicite.
