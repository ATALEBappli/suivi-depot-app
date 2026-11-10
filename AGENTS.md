# Développement de Suivi Dépôt

## Périmètre et méthode

- Travailler exclusivement dans `ATALEBappli/suivi-depot-app`.
- Utiliser le checkout existant et une branche dédiée par mission. Chaque tâche cloud est isolée ; ne créer un worktree que sur demande explicite.
- Lire [l’architecture](docs/architecture.md) et [les règles métier](docs/regles-metier.md) avant une évolution.
- Proposer des changements limités, compréhensibles et validés dans une Pull Request. Attendre la validation du propriétaire avant toute fusion, publication ou déploiement.
- Pour la mission 1, ajouter uniquement les fichiers de préparation : ne modifier aucun fichier applicatif existant. Ne pas corriger un défaut découvert hors périmètre ; le signaler séparément.

## Protection de la production

- Ne pas accéder au Google Sheets de production ni appeler son API Apps Script pendant les contrôles de préparation.
- Ne pas modifier le projet Apps Script de production, déployer, fusionner ou activer une publication automatique sans autorisation explicite pour cette action.
- Ne jamais versionner secrets, mots de passe, clés privées, comptes de service, jetons OAuth, identifiants Google ou données réelles. Ne pas recopier l’URL de production dans la documentation.
- Le code Apps Script n’est pas encore fourni : ne pas l’inventer. Suivre `apps-script/README.md` lors de sa future intégration.
- Pour les futures validations fonctionnelles, employer un environnement distinct et des données fictives. Un serveur local chargeant l’interface actuelle appelle la production : ne pas le considérer comme un bac à sable.

## Validation et compte rendu

- Prérequis du contrôle : Node.js 24, sans installation npm.
- Exécuter `node scripts/check-js.mjs` depuis la racine et `git diff --check`.
- Vérifier `git diff --name-status main...HEAD` (ou la référence de base de la PR) : la mission 1 doit contenir uniquement des ajouts autorisés.
- Le contrôle analyse les fichiers JavaScript et les scripts intégrés à `index.html` sans les exécuter. Il ne valide ni les permissions, ni le DOM, ni les échanges Google.
- Documenter dans la PR les fichiers ajoutés, commandes réellement exécutées, résultats et limites. Ne jamais présenter un contrôle de syntaxe comme un test fonctionnel.
- Pour les missions suivantes, adapter les tests aux changements et appliquer les autorisations côté serveur ; masquer un bouton ne protège pas les données.
