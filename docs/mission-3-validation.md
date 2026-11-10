# Mission 3 — intégration du backend réel

Base : `origin/main` au commit `b5d72ed2f4862155152e858dc0387a67e6f929ca`,
missions 1 et 2 fusionnées. Branche : `chore/mission-3-backend-apps-script`.

Sources : fichier complet Code.gs et manifeste fournis dans la conversation.
Aucune reconstruction depuis le frontend. La seule adaptation exécutable du
backend est la lecture de SPREADSHEET_ID dans les propriétés du script ; les
commentaires de configuration et espaces ont été adaptés. Les contrats et
risques conservés sont détaillés dans `apps-script/src/README.md`.

## Fichiers

Ajouts : `apps-script/src/Code.gs`, `apps-script/src/appsscript.json`,
`scripts/check-apps-script.mjs`, ce compte rendu.
Modifications : les deux README Apps Script et `scripts/check-js.mjs`, étendu
aux fichiers `.gs`. Aucun fichier de l'application actuelle n'est modifié.

## Contrôles exécutés

Avec Node.js 24.22.1, sans installation npm :

- `node scripts/check-js.mjs` : sept sources analysées, succès, dont Code.gs.
- `node scripts/check-apps-script.mjs` : succès. Manifeste exact et contrats
  GET/POST, JSON/JSONP, lecture/ajout, trois configurations, erreurs et sélection
  du classeur vérifiés sur doublures en mémoire et données fictives.
- `git diff --check` : succès.
- Revue du diff et des fichiers candidats : aucun identifiant réel Google,
  mot de passe, jeton, clé privée ou URL de production ajouté. Recherche locale
  des motifs sensibles sur les nouveaux fichiers et documentation modifiée.
- Comparaison des branches appelées par le frontend avec le backend fourni :
  contrats correspondants, sans appel distant.

Les tests n'exécutent ni Google Apps Script réel, ni service Google, ni frontend.
Ils ne valident pas les permissions, portées OAuth effectives ou déclencheurs.
Aucune migration, aucune donnée modifiée. Aucun `clasp push`, accès Sheets,
appel de production, fusion ou déploiement. L'accès anonyme historique reste un
risque documenté, sans prétention de sécurisation.
