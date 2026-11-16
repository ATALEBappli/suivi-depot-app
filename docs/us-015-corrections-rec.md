# US-015 — interface de recette et import Excel/CSV

## Périmètre livré

Cette branche reprend le code US-015 déjà publié au commit 894f1c63 puis ajoute les
corrections d'ergonomie. main ne contenait jusqu'ici que l'automatisation : la PR
inclut donc aussi les fichiers applicatifs US-015 précédemment présents seulement
sur leur branche. Aucun changement des calculs de Synthèse V2. Aucun appel Google,
aucune propriété, donnée, transaction, version ou URL modifiée pendant ces travaux.

Libellés : Logements / Locaux, Historique des locations, Ajouter / modifier une
location, Loyer mensuel initial et Modifier le loyer. Les identifiants internes
baux et bailId restent inchangés.

Numéro : saisie avec suggestions recherchables 01–20 et numéros existants ; toute
nouvelle valeur textuelle est possible, dont 21. Les nombres composés uniquement
de chiffres sont représentés sur au moins deux chiffres sans zéros supplémentaires :
1, 01 et 001 désignent tous 01. Pas de réécriture automatique des anciennes fiches :
les contrôles comparent leur numéro normalisé. Une ancienne collision bloque la
recette et doit être analysée ; aucune fusion de fiches ou d'historiques implicite.
Ajout et modification sont explicitement séparés, avec préremplissage par fiche.

Le modèle pur ReferentielV2 est chargé également dans le navigateur : mêmes règles
pour UI, backend et imports. Espaces superflus supprimés, types F normalisés et
étages canoniques RDC / 1er étage / 2e étage / 3e étage / Toit. Noms en casse de titre
avec accents, apostrophes et traits d'union ; case à cocher pour une casse particulière.
Les codes et numéros ne subissent pas la règle de casse des noms. Un locataire
homonyme normalisé est refusé à la création ; l'import réutilise une fiche unique
existante, et refuse une ambiguïté au lieu de choisir arbitrairement.

## Valeurs de référence

Consultation, ajout, modification et désactivation des types et étages dans le
Paramétrage. Les valeurs initiales sont celles demandées ; les libellés existants
sont également disponibles pour conserver la compatibilité des données anciennes.
Une valeur utilisée ne peut pas être renommée ; elle peut être désactivée. Les
fiches déjà liées restent modifiables sans perdre cette valeur, mais elle n'est
plus proposée pour de nouvelles affectations. Aucun doublon normalisé, même inactif.

Les changements de listes sont des événements entity=references dans l'historique
du même journal v2_referentiel_commits. Pas de nouvelle entité obligatoire, nouvel
onglet, ni second référentiel parallèle. Les anciens commits et leurs six collections
restent relisibles. Les désactivations n'effacent ni logement ni location ni loyer.

## Import dans l'interface

JSON, CSV UTF-8 et XLSX sont lus dans le navigateur, sans CDN ni envoi du fichier
à un tiers. Seules les lignes normalisées sont transmises à v2.simulate puis à
v2.import après confirmation. Le bundle reste exactement composé de cinq fichiers
Apps Script ; le modèle et le lecteur sont intégrés dans ParametrageV2.html.
Le packager accepte toujours le commit historique et son empreinte inchangée.

XLSX : premier onglet, textes partagés ou inline, ZIP stocké/deflate, maximum 5 Mo
compressés, 20 Mo décompressés au total et 8 Mo par XML, 5 000 logements. Dépend de
DecompressionStream('deflate-raw') ; si indisponible sur Safari, utiliser CSV UTF-8.
Chiffrement, archive ambiguë, liens externes de feuille, XML DTD et formules des
lignes de logement sont refusés. Aucun calcul de formule n'est exécuté.

Le classeur définitif accessible localement a été lu avec le lecteur navigateur :
12 lignes, total recalculé 220 000 DA, dates et cautions laissées nulles lors d'un
import purement en mémoire. Aucun nom/loyer individuel réel n'a été versionné.
Ses titres et sa ligne TOTAL DES LOYERS MENSUELS sont exclus explicitement ; seule
une formule SUM de total, jamais une formule de logement, peut y être ignorée.
Statut information et Commentaire sont signalés comme non importés. Toute autre
colonne renseignée (notamment date/caution non prise en charge) bloque la lecture,
plutôt que de perdre silencieusement des informations.

L'aperçu montre toutes les lignes normalisées, créations, identiques/ignorées,
conflits et total mensuel. Le nombre de mises à jour automatiques est toujours 0 :
une fiche différente est un conflit, pas un remplacement. Le bouton d'import n'est
disponible qu'après simulation sans conflit, avec V2 active ; confirmation obligatoire.
Revision, empreinte de simulation, idempotence requestId et verrou backend conservés.
Le réimport ne crée pas de doublon. Aucune transaction financière n'est créée.
Une erreur métier certaine permet de corriger puis réessayer ; une erreur réseau
incertaine conserve la même demande pour éviter un doublon.

## Vérifications locales réellement exécutées

- 29 scénarios métier/API US-015, y compris la lecture historique après modifications.
- 15 scénarios supplémentaires de normalisation, listes, import et historique.
- Import CLI CSV/XLSX avec données fictives et cas d'erreur.
- 84 scénarios du backend historique, 46 du synchroniseur et isolation frontend/JSONP.
- Tests de l'automatisation et du bundle, sans secrets et sur doublures.
- Playwright Chromium : parcours 1440 et 390 px, ajout/modification, doublon de
  numéro, nom normalisé, location, version de loyer, liste de référence, XLSX
  fictif 12 lignes/220 000 DA, réimport identique, formule refusée et actualisation.
  Toutes les destinations externes bloquées. Captures fictives dans work/ ignoré.
- Contrôle privé optionnel du classeur définitif dans le navigateur local :
  aucune écriture serveur/Google, aucune capture ou donnée nominative dans les logs.

Commandes :

    node --test tests/rec-automation/*.test.mjs
    node tests/referentiel-v2.mjs
    node tests/referentiel-v2-ergonomie.mjs
    node tests/import-referentiel-v2.mjs
    node scripts/check-apps-script.mjs
    node tests/rec-synchronisation.mjs
    node tests/isolation.mjs
    DEMO_CHROMIUM_PATH=/usr/bin/chromium node tests/referentiel-v2-browser.mjs
    node scripts/check-js.mjs
    git diff --check

Le test navigateur dépend de Playwright et d'un Chromium local ; il n'installe pas
de dépendance ni de navigateur en CI. Les tests métier sans navigateur sont ajoutés
au workflow de syntaxe existant. Aucun nouveau mécanisme CI/CD ou environnement.

## Mise à disposition en REC après validation explicite

1. Faire revoir puis autoriser la fusion de cette PR. Cela met à jour le packager
   existant pour intégrer les deux scripts locaux supplémentaires au HTML, sans
   changer les cinq fichiers du bundle. Ne pas lancer de workflow avant autorisation.
2. Vérifier le reçu de réconciliation done et inspect.pending=[], puis que le secret
   REC_DEPLOYMENT_ID désigne l'URL REC existante. Sans cet ID vérifié, arrêter :
   ne pas utiliser le mode création ni recréer un projet/déploiement.
3. Geler les écritures REC, conserver les sauvegardes du classeur, des sources et
   des propriétés. Vérifier APP_ENV=REC, SPREADSHEET_ID=REC_SPREADSHEET_ID et le
   compte V2_ADMIN_EMAIL autorisé. REFERENTIEL_V2 reste absente à ce stade.
4. Utiliser inspect, puis install avec le SHA complet de la version approuvée et
   son headHash récent ; le mécanisme existant sauvegarde les sources avant remplacement.
5. Refaire inspect puis deploy avec le même source_sha et le nouveau headHash.
   REC_DEPLOYMENT_ID renseigné conduit à la mise à jour du même déploiement / même URL.
   La réponse PUT sans scriptId reçoit la preuve de route REC en mémoire, comme list ;
   un ID retourné différent reste refusé. Le chemin de création n'est pas utilisé.
6. Ouvrir l'URL privée existante avec action=v2.ui sous le compte REC autorisé.
   Tester lecture et simulation Excel : 12 lignes, 220 000 DA, aucun conflit.
7. Autoriser séparément l'activation : Apps Script REC → Paramètres du projet →
   Propriétés du script → ajouter REFERENTIEL_V2 avec la valeur exacte 1.
   V2_ENABLED n'est pas utilisé. Ne changer aucune propriété PROD.
8. Pendant le gel, actualiser puis simuler à nouveau et confirmer l'import dans
   l'interface. Le premier import crée le journal si absent, sans toucher aux
   transactions. Ne pas laisser durablement V2 activée vide : la lecture historique
   utilise alors ce référentiel vide jusqu'à l'import.
9. Actualiser : retrouver les 12 fiches, locations, loyers et dates/cautions inconnues.
   Réimporter le même fichier : 0 création, 12 identiques, 0 conflit. Contrôler la
   lecture historique et la Synthèse avec les données REC ; ne pas appeler PROD.

Aucune de ces opérations Google ou d'activation n'a été effectuée ici. Les tests
réels de permissions HtmlService, de persistance Sheets et de Safari iPhone restent
à exécuter en REC. Un déploiement privé n'offre pas un JSONP anonyme : tester la
lecture historique en session autorisée et ne pas ouvrir l'accès à tous pour contourner
un blocage. Les jetons et identifiants ne doivent jamais être copiés dans la conversation.

## Petit scénario de recette dans l'interface

- Avant activation, simuler Excel et vérifier l'aperçu/total ; le bouton d'import
  reste inactif. Après activation autorisée, importer et actualiser, puis réimporter.
- Ajouter un logement fictif 99 avec type f3 via une valeur déjà proposée F3,
  puis tenter 099 : doublon refusé. Modifier sa fiche et le désactiver en fin de test.
- Ajouter un locataire fictif en majuscules avec trait d'union ; vérifier la casse,
  créer une location avec arrivée connue et suivi financier distinct. Modifier un
  loyer avec une date d'effet future : les deux montants restent dans l'historique.
- Clore cette location avec une date de départ puis en créer une autre avec un
  second locataire fictif, sans chevauchement ; les deux locations restent visibles.
- Ajouter un type fictif, vérifier le doublon normalisé, le renommer avant usage,
  l'utiliser puis tenter son renommage : refus. Le désactiver : historique conservé.
- Actualiser la page ; vérifier la persistance de chaque action et l'absence de
  nouvelle transaction dans la feuille transactions. Conserver les historiques.

Le logement 99 constitue une donnée fictive supplémentaire : le désactiver laisse
12 logements réels actifs, sans effacer sa fiche ni son historique. Si un compte
strict de 12 fiches totales est requis, faire ces essais dans une phase REC distincte
avec sauvegarde/restauration contrôlée, pas par suppression manuelle de commits.
