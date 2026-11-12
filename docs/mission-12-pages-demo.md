# Mission 12 — Préparation GitHub Pages indépendante

## Décision à valider avant publication

Publier exclusivement le contenu de `demo/` dans un **nouveau dépôt public gratuit** : `ATALEBappli/suivi-depot-demo`.

**URL HTTPS prévue : `https://atalebappli.github.io/suivi-depot-demo/`.**

Cette URL est prévisionnelle, pas une livraison en ligne. Le dépôt cible n’était pas accessible lors du contrôle (404), il n’a pas été créé. Aucun réglage Pages n’a été changé, aucun contenu n’a été publié, aucune fusion effectuée. Le contrôle en lecture des réglages Pages du dépôt actuel a été refusé par l’API ; aucun changement de ces réglages n’est nécessaire ni prévu.

GitHub Pages n’héberge qu’un site par dépôt : utiliser les réglages Pages de `suivi-depot-app` risquerait de remplacer le site existant. Le nouveau dépôt évite ce risque. Ne pas utiliser une branche `gh-pages` ni un nouveau workflow de déploiement dans le dépôt applicatif.

Les sites de projet Pages d’un même compte partagent l’origine `atalebappli.github.io`, avec des chemins distincts. Il ne s’agit donc pas d’une isolation entre origines. La PWA versionnée s’enregistre avec `./sw.js`, sans scope élargi : sur Pages son périmètre est `/suivi-depot-app/`, distinct de `/suivi-depot-demo/`. La démo n’enregistre aucun worker, n’utilise ni stockage persistant ni CacheStorage et ne désinscrit jamais les workers existants. Si GitHub indique un domaine hérité ou un worker couvrant la racine lors du contrôle final, arrêter et faire valider l’URL ou une origine distincte avant de communiquer le lien ; ne pas modifier la PWA de production.

## Ce que prépare la PR

- `demo/.nojekyll` : fichier vide pour publier les fichiers statiques sans transformation Jekyll.
- `scripts/prepare-demo-pages.mjs` : export exact des **11 fichiers** de `demo/` dans `work/pages-demo/`, avec liste fermée et empreintes SHA-256 affichées dans les logs. Refuse les liens symboliques, fichiers manquants/supplémentaires, CNAME, manifest, worker, configuration ou backend ajoutés. Refuse une CSP essentielle absente, la disparition du bandeau et les références réseau/API/stockage interdites. Ne remplace pas un dossier de sortie existant.
- `.github/workflows/prepare-demo-pages.yml` : lancement **manuel uniquement**, produit le ZIP `suivi-depot-demo-pages` téléchargeable dans Actions pendant 7 jours. Node est exécuté sur GitHub, **aucune installation sur le PC**. Permissions `contents: read` uniquement, aucun secret personnel, accès à un autre dépôt, environnement Pages, `pages: write`, `id-token: write` ou action de déploiement. Le ZIP ne contient ni scripts de préparation/tests, ni `.github/`, ni fichiers applicatifs historiques.
- `tests/demo-pages.mjs` et `tests/demo-pages-browser.mjs` : export, refus des contenus non autorisés, exécution au chemin Pages et compatibilité avec une PWA fictive voisine. Le workflow de tests existant inclut les quatre nouveaux tests unitaires.

La fusion éventuelle de cette PR **ne publie rien**. Le workflow de préparation ne s’exécute pas lors d’un push ou d’une PR.

## Étapes après autorisation explicite de publier

Ces opérations seront faites après validation, par l’agent ou depuis le navigateur GitHub. Elles ne nécessitent aucun droit administrateur Windows ni logiciel local ; seuls les droits GitHub sur le nouveau dépôt sont nécessaires.

1. Valider cette PR, puis autoriser explicitement la création du dépôt de démo et sa publication. La validation technique ou la fusion seule ne vaut pas autorisation de publier.
2. Depuis `suivi-depot-app` → **Actions → Préparer le ZIP Pages de démonstration (sans publication) → Run workflow**, sélectionner `main` après fusion. Relever le SHA source dans les logs et vérifier les tests. Télécharger l’artefact `suivi-depot-demo-pages`. Le ZIP doit contenir directement `index.html`, `.nojekyll`, `app.mjs`, `model.mjs`, `styles.css` et `assets/`, sans dossier parent `demo/`.
3. Créer le dépôt **public** `ATALEBappli/suivi-depot-demo`, sans modèle, licence, README ou domaine personnalisé générés. Ne changer aucun réglage du dépôt `suivi-depot-app`. La visibilité publique permet l’usage gratuit de Pages avec GitHub Free ; ne sélectionner aucun abonnement payant.
4. Dans le nouveau dépôt, charger uniquement les fichiers extraits du ZIP à la racine de `main`, en conservant `assets/` et les polices binaires. Via le navigateur : extraire le ZIP avec l’outil standard du PC puis **Add file → Upload files** ; ne pas téléverser le ZIP lui-même. Vérifier `.nojekyll` dans la liste ; s’il est masqué par le système, créer ce fichier vide avec **Add file → Create new file**. Ne pas recopier la racine du dépôt applicatif ni ajouter de workflow au dépôt de publication.
5. Dans **le nouveau dépôt seulement**, **Settings → Pages → Build and deployment** :

   | Réglage | Valeur |
   | --- | --- |
   | Source | Deploy from a branch |
   | Branch | `main` |
   | Folder | `/ (root)` |
   | Custom domain | vide |
   | Enforce HTTPS | activé dès que disponible |

   Enregistrer cette source déclenche la première publication : cette étape attend l’autorisation. Aucun token personnel, secret ou compte de service à configurer. Si l’URL affichée diffère de l’URL prévue, faire valider l’adresse avant de poursuivre.
6. Attendre la fin du build Pages, vérifier les fichiers servis, le type JavaScript des modules `.mjs`, les quatre écrans, le bandeau et le trafic réseau. Le contrôle doit réussir avant de déclarer la démonstration livrée.
7. Fournir l’URL HTTPS validée. Sur PC et Safari iPhone : ouvrir directement le lien, sans installation, sans Node, sans serveur local ni Wi-Fi commun obligatoire. Entrée de démonstration : `ahmed.admin` / `123456` ; données fictives uniquement, modifications perdues au rechargement. Le site est public ; le PIN est un simple scénario, pas une protection.

Toute mise à jour ultérieure de la branche publiée du dépôt de démo déclenchera Pages. Ne pas ajouter de synchronisation automatique depuis le dépôt applicatif ; toute nouvelle publication doit rester explicitement autorisée. Pour retirer la démo, utiliser **Unpublish site** dans les réglages Pages du dépôt de démo exclusivement.

## Réseau et vérification avant/après publication

Le HTML embarque déjà la CSP : connexions interdites (`connect-src 'none'`), scripts/styles/polices/images locaux, workers et formulaires externes interdits. Les liens relatifs et la navigation par fragment fonctionnent à `/suivi-depot-demo/` sans réécriture serveur. Aucun CDN, Google Fonts, analytics, manifest, backend ou API d’authentification réelle. L’espace de noms XML présent dans le SVG n’est pas une requête réseau.

GitHub Pages n’applique pas les en-têtes personnalisés du serveur local ; le test Pages sert donc le paquet **sans ajouter de CSP HTTP**, afin de vérifier la CSP réellement incluse dans le HTML.

Contrôles exécutés sur cette PR :

- `node --test tests/demo.mjs tests/demo-pages.mjs` : **12 tests réussis**, dont quatre dédiés au paquet et au workflow manuel.
- `DEMO_CHROMIUM_PATH=/usr/bin/chromium node tests/demo-pages-browser.mjs` : paquet exporté au chemin `/suivi-depot-demo/`, quatre écrans, modules avec MIME JavaScript et fichiers identiques à la source ; **aucune requête externe ni erreur JavaScript**. PWA voisine simulée à `/suivi-depot-app/` : worker toujours enregistré, cache et stockage conservés, démo non contrôlée par le worker. Rejoue aussi les parcours complets à **1440×1000, 390×844 et 320×720**.
- `node scripts/check-js.mjs` et `git diff --check` : contrôles requis ; aucune exécution de l’interface historique.

Après la publication autorisée, exécuter côté développement cloud (rien à installer sur le PC de l’utilisateur) :

```sh
DEMO_PUBLISHED_URL=https://atalebappli.github.io/suivi-depot-demo/ DEMO_CHROMIUM_PATH=/usr/bin/chromium node tests/demo-pages-browser.mjs
```

Ce mode est restreint à l’URL prévue. Il bloque et signale toute tentative de requête vers une autre origine ou hors du chemin de la démo, compare les ressources publiques avec `demo/`, vérifie les modules et les quatre écrans. Il ne charge aucune page de production, ne modifie aucun stockage externe et ne teste pas de worker fictif sur le site public. Le marqueur `.nojekyll` est contrôlé dans le paquet sans exiger qu’un fichier caché soit servi par Pages.

**Limites actuelles : aucun site n’étant publié, la vérification réseau de la version HTTPS reste à effectuer après autorisation.** Le résultat local ne constitue pas une validation du site publié ni de Safari physique. Le contrôle Safari iPhone final se fera en ouvrant le lien HTTPS et en parcourant les quatre écrans. Aucun service payant ni droit administrateur PC nécessaire.
