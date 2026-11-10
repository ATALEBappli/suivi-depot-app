# Google Apps Script — intégration à venir

Ce dossier prépare le versionnement du backend existant. Aucun code Apps Script n’a été fourni ou inventé. Aucun projet Google, déploiement ou Google Sheets de production n’a été consulté ou modifié pour cette mission.

## Versionner le code réel lors d’une prochaine mission

1. Obtenir du propriétaire un export du code réel et du manifeste `appsscript.json`, après autorisation. L’export peut être manuel depuis l’éditeur ou réalisé avec l’outil officiel `clasp` dans un espace local privé.
2. Examiner cet export avant tout ajout à Git. Retirer les secrets, identifiants Google, données personnelles et références de production ; prévoir une configuration externe pour les valeurs nécessaires. Ne pas ajouter `.clasp.json`, `.clasprc.json`, comptes de service ou jetons OAuth. Les identifiants de projet et de feuille restent hors du dépôt.
3. Ajouter uniquement les sources nettoyées et le manifeste vérifié dans ce dossier, dans une nouvelle branche et une PR. Documenter alors les points d’entrée réels, les contrats API, les portées OAuth et les versions d’outils retenues.
4. Créer, avec autorisation, un projet Apps Script de test et une feuille distincte contenant des données fictives. Vérifier les droits et l’authentification avant toute intégration avec le navigateur.

Référence : [documentation officielle clasp](https://developers.google.com/apps-script/guides/clasp). Les fichiers d’authentification et de liaison locaux doivent être conservés hors du checkout ; aucune automatisation `clasp` n’est configurée dans cette mission.

## Déploiement futur, uniquement après validation explicite

La fusion Git ne déploie pas automatiquement Apps Script. Après revue du code réel et tests sur l’environnement séparé, le propriétaire devra autoriser la cible, les droits d’exécution et le public autorisé. Préparer une version Apps Script immuable, puis créer ou mettre à jour le déploiement autorisé depuis l’éditeur ou avec la version validée de `clasp`.

Conserver dans un registre privé l’association entre commit Git, version Apps Script et déploiement. Préparer un retour à la version précédente. Toute modification d’URL de l’interface nécessite une PR distincte et une autorisation de publication GitHub Pages. Les contrôles après déploiement devront faire l’objet d’une autorisation précisant les données et opérations permises.

La présente PR n’autorise aucune de ces actions et ne fournit aucun faux backend.
