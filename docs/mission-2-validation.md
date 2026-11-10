# Mission 2 — préparation de Google Apps Script

Base : `origin/main` à `af0e3d3` (Mission 1 fusionnée). Branche dédiée :
`chore/mission-2-apps-script-preparation`, créée après `git fetch origin main`.

## Changements

- `.gitignore` : exclusion des liaisons clasp, jetons, configurations locales et
  fichiers de travail ; les exports privés restent à conserver hors du checkout.
- `apps-script/README.md` : configuration, import privé et revue du code réel,
  synchronisation clasp et séparation explicite entre lecture, envoi et déploiement.
- `apps-script/src/README.md` : emplacement prévu pour les sources réelles.
- `apps-script/templates/Config.gs.example` : lecture proposée de `SPREADSHEET_ID`,
  sans accès Sheets, valeur de repli ni écriture dans les propriétés.
- `apps-script/templates/clasp.example.json` et
  `script-properties.example.json` : modèles JSON à marqueurs fictifs.
- Ce compte rendu.

Aucun `Code.gs` ou manifeste réel inventé. Aucun changement du frontend, de ses
URL, des dépendances ou workflows. Les modèles sont hors du dossier des futures
sources et ne sont reliés à aucun projet Google.

## Vérifications exécutées

- Lecture de `AGENTS.md`, de l'architecture, des règles métier, du compte rendu
  Mission 1 et de la documentation Apps Script existante.
- Node.js `v24.22.1` ; `node scripts/check-js.mjs` : 5 sources valides, sans
  exécution du JavaScript applicatif. Ce contrôleur ne parcourt pas `.gs.example`.
- Vérification séparée du helper avec `node --input-type=module`, `node:vm` et
  un `PropertiesService` simulé : cas absent, vide, espaces et valeur fictive.
  Aucun service Google appelé ; cela ne valide pas le backend réel ni ses droits.
- Parsing JSON des deux modèles : réussite.
- `git check-ignore` : les fichiers `.clasp.json` et `.clasprc.json` sont exclus
  à la racine et sous `apps-script/src/` ; `.env`, `credentials.json` et les
  exports dans `work/` sont également exclus.
- Inspection des nouveaux contenus et recherche locale de motifs de clés,
  identifiants longs, clés privées et URL Google de production : aucun ajouté.
  Les seuls champs d'identifiant des modèles contiennent des marqueurs fictifs.
  Cette recherche ne constitue pas un audit des secrets de l'historique existant.
- Comparaison octet par octet avec `origin/main` : tous les fichiers préexistants
  sont identiques, sauf `apps-script/README.md`, dont la modification est prévue.
- `git diff --check`, `git diff --cached --check` et revue de la liste des fichiers
  par rapport à `origin/main` : périmètre limité aux fichiers de préparation.

Aucune dépendance installée, aucun accès Google, aucune écriture Sheets, aucune
commande clasp, aucun test fonctionnel en production, fusion ou déploiement.

## Intervention requise du propriétaire

1. Fournir un export privé du vrai backend et de son manifeste ; ne pas coller
   d'identifiants ou secrets dans la PR.
2. Faire examiner et nettoyer l'export avant versionnement ; adapter la lecture
   de configuration aux fonctions réelles et vérifier les portées du manifeste.
3. Autoriser un projet et une feuille de test distincts, puis renseigner leurs
   identifiants uniquement dans la liaison privée et les propriétés du projet.
4. Valider les tests sur données fictives et autoriser séparément tout envoi,
   fusion ou déploiement ultérieur. Cette préparation n'autorise aucune de ces actions.
