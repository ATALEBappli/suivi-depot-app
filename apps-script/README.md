# Google Apps Script — préparation de l'intégration

La Mission 2 prépare le versionnement du backend existant, sans le reconstruire.
Le vrai `Code.gs` et son manifeste ne sont pas disponibles. Aucun accès Google,
changement de projet, écriture Sheets ou déploiement n'est effectué ici.

## Structure et configuration prévues

- `src/` : recevra les sources réelles nettoyées, dont `Code.gs`, et le manifeste
  réel `appsscript.json`, après revue dans une prochaine PR.
- `templates/Config.gs.example` : exemple autonome de lecture de la propriété
  `SPREADSHEET_ID` par `PropertiesService.getScriptProperties()`. Il refuse une
  valeur absente ou vide, sans valeur par défaut, journalisation d'identifiant,
  accès Sheets ni écriture de propriété.
- `templates/script-properties.example.json` : inventaire des clés prévues,
  avec uniquement un marqueur fictif. Ce JSON n'est pas importé automatiquement.
- `templates/clasp.example.json` : modèle de liaison locale, non utilisable tel
  quel. Le vrai `.clasp.json` et les jetons restent hors du checkout.

Après examen du code réel, adapter le nom du helper pour éviter les collisions,
remplacer les références codées en dur par cette lecture et vérifier tous les
chemins d'accès au classeur. L'appel éventuel à `SpreadsheetApp.openById(...)`
restera dans le vrai backend examiné ; aucun accès n'est ajouté par le modèle.
Les propriétés appartiennent au projet Apps Script, pas à Git : elles ne sont
pas transportées par `clasp`. Dans le projet de test autorisé, le propriétaire
renseignera `SPREADSHEET_ID` dans Paramètres du projet → Propriétés du script,
avec l'identifiant d'une feuille distincte contenant des données fictives.
Ne pas exporter les valeurs dans Git. Les éditeurs du projet peuvent y accéder :
ce mécanisme ne remplace ni l'authentification ni les autorisations serveur.

## Import initial : intervention du propriétaire

1. Fournir un export privé du code réel et du manifeste. Un export manuel depuis
   l'éditeur convient. La Mission 2 n'autorise aucun accès au projet de production.
2. Conserver une sauvegarde privée de l'export original. Les données Sheets ne
   sont pas contenues dans un export de code ; ne pas copier de données réelles
   dans le dépôt ni créer de script de migration, d'effacement ou de réinitialisation.
3. Examiner **tous** les fichiers : retirer identifiants Google, URL de production,
   secrets, jetons et données personnelles avant leur ajout à `src/`. Vérifier les
   points d'entrée réels, dépendances, portées OAuth, déclencheurs et paramètres
   du manifeste. Ne pas déduire ces éléments du frontend.
4. Adapter la configuration dans une PR distincte à partir du code réel, puis
   créer uniquement après autorisation un projet Apps Script de test et une
   feuille de test. Conserver hors Git la correspondance entre environnements.

## Synchronisation avec clasp, lors d'une mission autorisée

Référence : [guide officiel clasp](https://developers.google.com/apps-script/guides/clasp).
Aucune dépendance n'est ajoutée au projet frontend et aucun outil n'est installé
pour cette préparation. Lors de l'import, choisir et consigner une version de
`@google/clasp` compatible avec Node, vérifier `clasp --version` et l'aide de cette
version, puis l'utiliser dans un espace privé **hors du checkout**.

### Récupération distante vers un espace privé

Uniquement avec autorisation de lecture de la cible concernée : se placer dans
un dossier privé vide hors du dépôt, puis utiliser les commandes suivantes.
Les marqueurs doivent être remplacés localement, jamais dans un fichier suivi.

```sh
clasp --version
clasp login
clasp clone <IDENTIFIANT_DU_PROJET_AUTORISE>
```

`clone` récupère les sources et le manifeste ; il crée une liaison locale
`.clasp.json`. Garder également `.clasprc.json` (jetons OAuth, généralement dans
le dossier personnel) hors Git. Ne pas lancer `clone` dans `src/`. Pour un export
ultérieur, depuis cette même liaison privée :

```sh
clasp pull
```

`pull` peut écraser les sources locales : sauvegarder les changements avant de
l'utiliser. Comparer l'export privé avec Git et transférer seulement les fichiers
examinés et nettoyés vers `src/`. Ne pas copier la liaison, les jetons ou les
propriétés du script. Ne jamais exécuter le backend récupéré pendant cette revue.

### Préparation d'un envoi vers un projet de test

Cette étape reste bloquée jusqu'à réception du vrai code et autorisation de la
cible de test. Dans un **autre** espace privé, copier le modèle de liaison sous
le nom `.clasp.json`, renseigner uniquement l'identifiant du projet de test et
un `rootDir` absolu pointant vers une copie privée des sources complètes et
revues de `src/`. Le dossier synchronisé ne doit contenir ni modèles, ni README,
ni exports bruts. Conserver le manifeste réel et toutes les sources nécessaires.

Depuis cet espace privé, `clasp status` permet d'examiner les fichiers candidats.
Contrôler séparément l'identité de la cible dans la liaison privée, la complétude
des sources et le diff ; `status` ne valide ni les droits ni le fonctionnement.
Un futur `clasp push` écrit dans le projet distant et peut remplacer son code,
même sans déploiement : il est interdit dans cette mission. Ne pas utiliser
`--force`, `--watch`, `create`, `run` ou une automatisation d'envoi ici.
Ne jamais envoyer cette structure incomplète au projet existant.

## Validation et déploiement ultérieurs

Les tests fonctionnels nécessitent le backend réel, les propriétés du projet de
test et une feuille fictive. Vérifier les autorisations serveur et la conservation
des données sans ouvrir le frontend actuel, qui appelle la production.

La fusion Git ne synchronise ni ne déploie Apps Script. Aucun workflow d'envoi ou
de déploiement n'est ajouté. Tout envoi vers la production, changement de propriété
de production, fusion ou déploiement exige un accord explicite ultérieur.
Avant un déploiement autorisé : sauvegarde privée, revue des permissions,
version immuable et plan de retour arrière ; conserver en privé l'association
commit Git/version Apps Script/déploiement. Toute modification du frontend ou de
son URL fera l'objet d'une PR distincte.
