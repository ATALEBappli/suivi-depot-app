# Recette intégrée — Saisie des locations TEST REC

Préparation du 18 novembre 2026. Aucun déploiement ni appel Google réel.

## Branches examinées

| Composant | PR | Commit examiné |
|---|---|---|
| Interface Saisie + Synthèse TEST REC | `suivi-depot-demo#5` | `75a1bc7ef42dc4f49e8719f4403a41b558777177` |
| Liste blanche des modules front | `suivi-depot-app#26` | `b95b616a7c8952a6bbc821b6f810ea0b1ceab058` |
| API `rec.testTransaction.create/list` | `suivi-depot-app#27` | `b4ed7f93d386da037d824c1b37b848c050ac4341` |

Les deux branches backend ont été assemblées **uniquement dans une copie locale**, sans commit publié. Fusion sans conflit. Le frontend a été exporté à partir du SHA complet ; manifeste des assets et intégrité vérifiés par `rec-worker/prepare.mjs`. Les quatre nouveaux modules (`location-entry`, `location-entry-view`, `rec-test-summary`, `rec-test-summary-view`) ont été servis avec statut 200 par un Worker simulé ; accès `/.env` refusé (404).

## Résultats

- Tests ciblés frontend : 7 réussis.
- Tests backend API et sécurité précédemment exécutés : 127 réussis sur la branche préparatoire.
- Test `rec-server/site.test.mjs` sur l'assemblage : 2 réussis.
- **Suite complète de publication Worker non verte dans l'assemblage** : `WRONG_FRONTEND_SOURCE` attendu car l'empreinte du frontend autorisé dans `rec-worker/release.mjs` reste fixée à `0ee316d7...`, et dépendances `wrangler`/`miniflare` absentes dans la copie locale. Ne pas présenter ceci comme une recette complète validée.

## Verrous bloquants avant la publication

1. Revue et fusion explicites, dans l'ordre compatible, des PR #26, #27 et demo#5. Une fusion ne suffit pas à publier les Apps Script ou le frontend.
2. Après approbation de la version UI exacte, mettre à jour **dans une PR distincte revue** `target.frontendSha` dans `rec-worker/release.mjs`, à partir du SHA réellement fusionné de `suivi-depot-demo` ; ne jamais contourner `WRONG_FRONTEND_SOURCE`.
3. Faire passer la suite complète `tests/rec-worker`, y compris dry-run Wrangler, sur un environnement où les dépendances verrouillées sont installées ; générer et vérifier le reçu de release complet. Ne pas effectuer de publication tant que ces tests échouent.
4. Vérifier la compatibilité de l'API Apps Script et la voie de mise à jour du déploiement REC privé existant. Ne pas créer un nouveau Web App ou rendre le transport public sans autorisation dédiée. Contrôler l'état de la session Google Hotmail et les empreintes REC.
5. Le Worker publié a `REC_BACKEND_ENABLED='false'` par défaut et bloque les API métier. Son activation nécessite une décision d'exploitation **distincte**, avec vérification des identités, secrets, cibles, protections et risque/coût. Ne pas l'activer par une simple modification de la configuration publique.
6. La propriété Apps Script `REC_TEST_TRANSACTIONS` est absente par défaut. Après validation de l'isolation du classeur REC et du référentiel V2, l'activer à `1` **seulement en REC**, avec accord explicite, et conserver la possibilité de la remettre à `0`.

## Scénarios de recette après déverrouillage

| Cas | Attendu |
|---|---|
| Anonyme / PIN fictif seul | Aucun accès au référentiel ou au journal TEST REC |
| Compte Google non autorisé | Refus de connexion REC |
| Lecteur REC | Lecture du référentiel et de la Synthèse TEST, écriture refusée |
| Administrateur avec drapeau OFF | Bouton Enregistrer désactivé ; aucune feuille test créée |
| 12 appartements réels en REC | Les appartements et loyers accessibles proviennent exclusivement de `v2.read`, pas d'une fixture embarquée |
| Bail clos, logement inactif, changement de loyer | Sélection et loyer contrôlés à la date de saisie |
| Création TEST REC | Une seule ligne dans `rec_test_transactions`, jamais dans `transactions` |
| Rejeu même `requestId` | Réponse idempotente, sans ligne supplémentaire |
| Rejeu même ID et corps différent | Refus ; aucun doublon |
| Filtre par mois de saisie / logement | Total = somme des opérations fictives filtrées, ventilation espèces/banque cohérente |
| Historique vide | Totaux zéro, absence de faux encaissement |
| Après déconnexion / expiration | Accès au journal refusé sans nouvelle authentification |
| Vérification PROD | Aucune opération, aucune modification du classeur ou des paramètres PROD |

## Décision de publication

**NON AUTORISÉE à ce stade.** Les PR restent en brouillon, l'API REC publiée reste désactivée, et aucun test sur le vrai référentiel des 12 appartements n'a été exécuté. Obtenir les validations et faire passer la release complète avant la recette réelle.
