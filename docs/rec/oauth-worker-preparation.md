# Préparation OAuth du Worker REC — sans activation

La préparation autorise **uniquement quatre liaisons privées supplémentaires** sur le Worker existant :

| Nom | Type Cloudflare requis | Contrôle |
| --- | --- | --- |
| `REC_OAUTH_CLIENT_ID` | Variable texte | Format du client OAuth Google Web |
| `REC_OAUTH_CLIENT_SECRET` | Secret | Jamais en texte public |
| `REC_APPS_SCRIPT_URL` | Variable texte | Déploiement Apps Script REC déjà épinglé |
| `REC_GATEWAY_KEY` | Secret | Jamais en texte public |

Le contrôle de publication accepte soit **aucun** de ces paramètres, soit **les quatre**. Un ensemble incomplet arrête le déploiement avant tout remplacement. Aucun identifiant ou secret n'est inscrit dans Git.

La configuration de publication reste verrouillée sur `REC_BACKEND_ENABLED=false` et `REC_USER_ALLOWLIST=[]`. Les changements d'accès, de rôle et de drapeau métier nécessitent une autre autorisation. Un client OAuth créé dans Google Cloud et un utilisateur déclaré comme testeur OAuth ne suffisent pas à ouvrir l'accès métier.

La vérification post-publication reste différente selon la configuration :

- Sans OAuth : `/api` et `/auth/start` doivent refuser faute de configuration (`503`).
- Avec OAuth : des requêtes **GET** invalides sur ces chemins doivent être refusées (`400`), sans appel Apps Script et sans création de session. La vérification ne déclenche pas de connexion Google.

Avant toute opération réelle : vérifier l'identité du projet Google Cloud REC et l'URI de callback du Worker, la cible Apps Script REC privée, les secrets dans Cloudflare, les règles de journalisation OAuth et l'absence de lien PROD. Ne pas saisir de secret dans une PR, une issue ou le chat. Contrôler la conservation des secrets après toute publication ; ne pas relancer aveuglément en cas d'échec.

**Limite :** cette PR ne configure pas Cloudflare, ne connecte aucun utilisateur, ne valide pas Google en conditions réelles et n'autorise ni lecture du référentiel réel ni écritures. La recette Google/12 appartements devra faire l'objet de contrôles distants distincts après validation de la configuration privée.
