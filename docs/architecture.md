# Architecture actuelle

## Parcours web

L’application web est accessible par lien et destinée à 3 à 4 personnes. Le parcours décrit par le propriétaire repose sur GitHub Pages pour servir les fichiers statiques du dépôt. La configuration effective de Pages n’a pas été interrogée ni modifiée pendant cette préparation.

```text
Navigateur → GitHub Pages → index.html + styles.css + app.js
Navigateur → Google Apps Script (JSONP) → Google Sheets du propriétaire
```

| Élément | Responsabilité observée dans le dépôt |
| --- | --- |
| `index.html` | Structure, onglets Synthèse/Saisie/Paramétrage, configuration de l’URL API et chargement des scripts. |
| `styles.css` | Présentation de l’interface. |
| `app.js` | Chargement JSONP, filtres, synthèse, saisie et appels de paramétrage. |
| `manifest.json`, `sw.js` | Métadonnées PWA et cache des ressources du même domaine ; les requêtes externes ne sont pas interceptées par le service worker. |
| Google Apps Script | Sources REC versionnées dans `apps-script/src/`. Le code historique et ses garde-fous ont évolué depuis la préparation initiale ; voir les README backend et la recette US-015. |
| Google Sheets | Stockage des données dans le document du propriétaire. Aucun accès effectué pour cette mission. |

L’URL Apps Script est actuellement définie dans le HTML. Ne pas la recopier dans les nouveaux fichiers. Le frontend emploie des scripts JSONP avec un paramètre de callback, y compris pour des actions d’enregistrement. Les contrats et protections du backend doivent être vérifiés lors de son intégration, sans déduire des contrôles d’interface qu’une autorisation serveur existe.

## Variante Python présente

`app.py` est une interface Streamlit distincte ; `requirements.txt` déclare ses dépendances. Elle utilise `gspread`, un compte de service lu dans les secrets Streamlit et un identifiant de feuille. Elle lit et écrit des transactions directement dans Sheets. GitHub Pages ne fait pas tourner Python. Aucun hébergement actif de cette variante n’a été vérifié et elle n’est pas lancée pour cette mission.

## Développement et validation

Le contrôle `node scripts/check-js.mjs` fonctionne sans réseau ni données Google. Le workflow `.github/workflows/javascript-syntax.yml` l’exécute sur les Pull Requests et les poussées de branches ; il ne contient aucun déploiement.

Ne pas ouvrir l’interface actuelle pour un test supposé local : elle conserve son URL API de production. Une future mission devra définir un environnement de test isolé avant les tests d’intégration.

Les règles métier cibles sont dans [regles-metier.md](regles-metier.md). Elles ne constituent pas une description de fonctionnalités déjà sécurisées. Le versionnement futur du backend est décrit dans [apps-script/README.md](../apps-script/README.md).

Limite connue issue de l’inspection : `app.js` appelle `toggleHedamExtra` sans définition présente dans le dépôt. Un contrôle de syntaxe ne détecte pas ce type d’erreur d’exécution ; aucune correction applicative n’est incluse ici.

## Évolution US-015 (locale, non déployée)

Le référentiel V2 est décrit dans [la procédure US-015](us-015-recette.md).
Ses six entités sont stockées dans un journal additif distinct des quatre onglets
historiques. Le Paramétrage privé utilise HtmlService et des contrôles serveur ;
le serveur local dédié simule Google sans aucun appel distant.
