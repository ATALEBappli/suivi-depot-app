# Conservation OAuth REC — décision documentaire, non appliquée

Statut : **préparation uniquement**. Validé par Amine Taleb à titre personnel le 24 novembre 2026. Cette note ne change aucun paramètre GitHub, Google, OAuth, secret, Worker ou PROD.

## Durées cibles

| Catégorie | Point de départ | Durée maximale cible | Support |
| --- | --- | --- | --- |
| Journaux d'exécution REC | Fin de l'exécution | 90 jours | GitHub Actions |
| Reçus techniques REC | Création du reçu | 180 jours | Google Drive privé REC |
| Sauvegardes techniques REC | Création de la sauvegarde | 180 jours | Google Drive privé REC |

Les durées ci-dessus sont une **politique souhaitée, pas un état constaté**. La suppression effective n'a pas été implémentée ni vérifiée. Un incident ou une opération en attente peut nécessiter une conservation exceptionnelle documentée et réévaluée avant purge, sans suppression aveugle des éléments indispensables à la récupération.

## Données d'identité et jetons

- Adresse e-mail et identifiant Google : utilisés pour confirmer l'identité autorisée ; vérifier s'ils figurent dans les reçus/journaux, puis leur appliquer la durée correspondante.
- Jeton d'accès : temporaire, uniquement en mémoire d'exécution ; ne pas le journaliser ni l'archiver.
- Jeton de renouvellement et secret client : stockage secret pendant la nécessité opérationnelle ; révocation et suppression lors de l'arrêt de la synchronisation ou en cas de compromission. Ne pas fixer arbitrairement une rotation à 90/180 jours qui interromprait la synchronisation.

## Conditions avant de déclarer la politique effective

1. **GitHub** : relever en lecture seule les paramètres de rétention des journaux et vérifier que 90 jours sont effectivement appliqués ; modifier ces réglages seulement sur autorisation séparée.
2. **Google Drive REC** : recenser les sauvegardes et reçus privés ; définir une purge ciblée par type/date avec simulation, sauvegarde/récupération et garde-fous pour les reçus `pending` ; ne pas exécuter de suppression sans autorisation distincte.
3. **Contrôle** : vérifier qu'aucun token, secret, email non nécessaire ou contenu locatif n'est divulgué dans les journaux ou artefacts.
4. **Publication** : vérifier les scopes réels, destinataires, transferts éventuels, base juridique et hébergement des pages OAuth. Les pages restent des brouillons non publiables tant que ces informations sont en attente.

Aucune transaction historique ni donnée PROD ne relève de cette politique.

Références : [CNIL — durées de conservation](https://www.cnil.fr/fr/passer-laction/les-durees-de-conservation-des-donnees), [GitHub — conservation des journaux et artefacts](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository).
