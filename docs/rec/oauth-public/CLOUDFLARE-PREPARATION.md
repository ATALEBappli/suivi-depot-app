# Préparation Cloudflare Pages — OAuth REC (aucune publication)

## État et périmètre

- Sources : `index.html`, `confidentialite.html`, `conditions.html` sous `docs/rec/oauth-public/`.
- Cible **envisagée**, non créée : un projet statique Cloudflare Pages séparé, nommé `rec-oauth-public` si disponible.
- Workflow GitHub **manuel**, lecture seule : `Préparer pages OAuth REC Cloudflare (sans publication)`.
- Résultat : artefact `rec-oauth-cloudflare-brouillon`, contenant seulement les trois pages et `PREPARATION_NON_PUBLIABLE.txt`.
- Aucun appel à Cloudflare, aucune création de service, aucun secret, aucune permission `pages: write`, aucun changement du Worker REC ni de PROD.

## Prérequis non satisfaits — blocage de la publication

1. Dans `confidentialite.html`, faire préciser et valider l'identité du responsable des traitements, les finalités exactes, les éventuels sous-traitants, les durées de conservation et les droits de la personne. Les textes actuels comportent les mentions « version de préparation » et « à compléter » : **ne pas publier ces versions comme définitives**.
2. Confirmer que les scopes réels du client technique Google correspondent aux explications publiques (API Apps Script, Drive, identité). Ne pas demander de nouveaux scopes ici.
3. Une adresse `*.pages.dev` gratuite peut servir à tester l'hébergement. **Elle n'est pas présumée recevable comme domaine possédé et vérifié pour Google OAuth**. La validation Google du domaine peut imposer un nom de domaine distinct appartenant à l'utilisateur. Ne pas annoncer de lien comme accepté sans vérification.
4. Obtenir une autorisation séparée avant toute création Cloudflare Pages, mise en ligne, vérification Search Console, changement du consentement OAuth ou remplacement du secret GitHub `REC_GOOGLE_OAUTH`.

## Contrôle Google Search Console — procédure future, pas exécutée

1. Après autorisation et **uniquement une fois le site statique effectivement publié**, accéder à https://search.google.com/search-console/ avec le compte administrateur Google REC.
2. Ajouter la propriété « Préfixe d'URL » **exacte** du site HTTPS publié, puis choisir l'une des méthodes proposées : fichier HTML (à la racine du site) ou balise `<meta>` sur la page d'accueil. Il faut un nouveau paquet préparé pour intégrer le fichier ou la balise fournie par Google ; ne jamais inventer ces valeurs.
3. Vérifier la propriété dans Search Console et conserver le moyen de validation en place. Attention : cette validation de préfixe d'URL ne garantit pas l'acceptation du domaine dans Google Auth Platform.
4. Si Google refuse le domaine `pages.dev` (ou exige la propriété d'un domaine contrôlé), **arrêter sans modifier OAuth** et proposer un domaine personnel vérifiable. Ne pas substituer celui de PROD.
5. Une fois le domaine accepté et les mentions juridiques validées, saisir les URL définitives dans Google Auth Platform → Branding, avec autorisation distincte. La sortie du mode « Test », le renouvellement du jeton et la modification du secret GitHub REC sont des opérations ultérieures, chacune conditionnée à une autorisation dédiée.

## Adresses possibles, non créées et non valables pour Google à ce stade

Si Cloudflare attribue réellement `rec-oauth-public.pages.dev` :

| Usage | Adresse envisagée |
| --- | --- |
| Accueil | `https://rec-oauth-public.pages.dev/` |
| Confidentialité | `https://rec-oauth-public.pages.dev/confidentialite.html` |
| Conditions d'utilisation | `https://rec-oauth-public.pages.dev/conditions.html` |

**Ce ne sont pas des liens opérationnels et ils ne doivent pas être copiés dans Google Cloud.** Le nom réel est fixé seulement à la création de Pages.

Documentation officielle :

- Cloudflare Pages : https://developers.cloudflare.com/pages/get-started/direct-upload/
- Cloudflare Pages — domaines : https://developers.cloudflare.com/pages/configuration/custom-domains/
- Google Search Console — vérification : https://support.google.com/webmasters/answer/9008080
- Google OAuth — règles de branding : https://support.google.com/cloud/answer/15549049
