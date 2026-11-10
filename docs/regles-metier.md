# Règles métier à concevoir et valider

Ces règles décrivent la cible demandée par le propriétaire. Cette mission les documente sans modifier le comportement actuel ni certifier leur implémentation.

- Application web accessible par lien, utilisée par 3 à 4 personnes.
- Données conservées dans le Google Sheets du propriétaire.
- Deux rôles : Administrateur et Utilisateur.

| Action | Administrateur | Utilisateur |
| --- | --- | --- |
| Consultation et filtres | Oui | Oui |
| Saisie d’opérations | Oui | Oui |
| Modification et suppression | Toutes les opérations | Ses propres opérations uniquement |
| Paramétrage | Oui | Non |
| Gestion des utilisateurs | Oui | Non |

Le périmètre de consultation des opérations des autres utilisateurs reste à préciser avant implémentation ; la restriction explicite aux opérations propres concerne la modification et la suppression.

## Exigences pour les missions suivantes

- Concevoir une authentification sécurisée par identifiant et mot de passe : stockage de mots de passe sous forme de dérivés cryptographiques adaptés, sessions, expiration, déconnexion et limitation des tentatives. Aucun mot de passe ou secret dans le frontend ou dans Git.
- Vérifier l’identité et les permissions côté serveur à chaque action, y compris les appels directs contournant l’interface. Associer les opérations à une identité stable attribuée par le serveur.
- Prévoir une suppression réversible : conserver une trace de suppression et définir les droits de restauration avec le propriétaire.
- Prévoir un historique des modifications avec auteur, date et changements, protégé contre les modifications ordinaires.
- Définir les scénarios de tests sur données fictives : utilisateur anonyme refusé, restrictions de propriété, accès administrateur, restauration et historique.

Le choix technique et les détails de ces mécanismes nécessitent une mission de conception, puis une PR spécifique. Ne pas considérer la connaissance du lien web ou de l’URL API comme une authentification.
