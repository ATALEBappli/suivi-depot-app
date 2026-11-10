# Mission 4 — Environnement de recette préparé

## Architecture et limites

```text
PROD actuel : GitHub Pages (racine historique) → Apps Script PROD → Sheets PROD
REC futur   : Cloudflare Pages (dist généré)   → Apps Script REC  → Sheets REC
PR future   : preview Cloudflare (dist)        → Apps Script REC  → Sheets REC
CI          : Node et doublures en mémoire ; aucun appel Google
```

Choix Cloudflare Pages et externalisation validés par le propriétaire. Aucune
connexion Cloudflare, création Google, modification des permissions, publication,
migration ou fusion réalisée. Le build ne contient aucune commande de déploiement.

La racine historique `index.html`, `app.js`, `sw.js` et `manifest.json` reste
inchangée. Son URL API existante reste présente conformément à la consigne : ce
chemin historique n'est PAS un environnement de test. Ne pas ouvrir sa page pour
tester localement. Aucun nouvel identifiant PROD n'est ajouté. L'historique Git
contient toujours l'ancienne configuration ; cette mission ne le réécrit pas.

Audit du code : API lue depuis `window.API_URL`, transport par script JSONP,
lecture et écritures GET (ajout et trois sauvegardes de configuration). Le contrôle
initial d'URL manquante ne couvre pas toutes les actions. Le SW historique sert
le cache avant le réseau, ignore les domaines externes, utilise un nom de cache
fixe et supprime les autres caches de son origine. Les métadonnées anti-cache du
HTML ne neutralisent pas ce SW. La configuration effective de Pages n'a pas été
vérifiée : confirmer branche/répertoire de publication avant toute fusion.

## Build isolé

Node 24, aucune dépendance npm :

```sh
APP_ENV=REC node scripts/build-frontend.mjs
```

Le résultat est exclusivement `dist/`, ignoré par Git. Le build ne publie rien.
Définir REC_API_URL dans l'environnement de build lorsque le backend REC sera
créé et sa cible contrôlée manuellement. Format accepté : URL HTTPS Apps Script
`/macros/s/<identifiant>/exec`, sans query, fragment ou identifiants de connexion.
Une URL REC invalide fait échouer le build ; une valeur absente produit une page
avec erreur explicite et tous les transports API bloqués. PROD_API_URL est ignoré
en mode REC. L'identifiant du déploiement PROD historique est refusé en REC.

Le HTML généré charge environment.js avant app.js, remplace intégralement le bloc
historique et ne contient pas l'URL PROD en REC. API_URL est non modifiable ; le
transport JSONP généré vérifie à chaque appel origine et chemin exacts avant de
créer le script, y compris pour les écritures. Aucun repli vers PROD. Il n'y a
ni manifeste PWA ni enregistrement de SW en REC. Employer un nouveau projet et
une origine dédiée, jamais une origine précédemment contrôlée par un SW PROD.
Les en-têtes Cloudflare demandent no-store et noindex (ce dernier n'est pas une
protection d'accès).

Les URL injectées sont publiques dans le navigateur : jamais de mots de passe,
clé privée, jeton ou données personnelles. L'isolation frontend ne remplace pas
une autorisation serveur. Un autre déploiement pointant par erreur vers le Sheet
PROD ne peut pas être détecté depuis son URL : vérifier la propriété du projet REC
avant tout test. Les futurs changements de déploiement PROD doivent actualiser
le garde-fou du build ; ne pas ajouter de nouvel alias PROD sans cette revue.

## Hébergement recommandé

Cloudflare Pages, projet exclusivement REC : frontend HTML/CSS/JS sans Functions,
répertoire de sortie dist, commande de build ci-dessus, APP_ENV=REC dans les
contextes stable et preview. Définir REC_API_URL séparément dans ces deux contextes.
Ne fournir aucune configuration PROD à ce projet. Branche stable recommandée :
`recette`, créée seulement lors de l'activation autorisée ; previews des branches
PR. Désactiver les publications automatiques tant qu'elles ne sont pas autorisées.
Ne pas sélectionner main comme branche de production du projet REC.

Avantages : origines distinctes de GitHub Pages, previews par branche/PR et build
statique sans serveur supplémentaire. Offre gratuite a priori suffisante ; vérifier
les conditions et quotas Cloudflare au raccordement (builds, temps de build,
projets). Domaine personnalisé facultatif et potentiellement payant. Fonctions,
services de protection ou dépassements éventuels sont hors périmètre. Les previews
peuvent être publiques ; ne charger que les données fictives. Les PR partageant le
backend REC partagent aussi ses écritures : tests séquentiels et remise à zéro
manuelle de REC, ou backend dédié ultérieur si nécessaire. Ne pas exposer de
configuration sensible aux builds de contributions non fiables.

## Création Google future — manuelle, après autorisation

1. Sur votre compte Google, créer un classeur vierge « Suivi Dépôt REC ». Ne pas
   dupliquer le classeur PROD (valeurs, noms, historique, liens ou scripts).
2. Créer les quatre onglets de fixtures/rec/sheets.json et copier leurs tableaux,
   première ligne comprise. Ce sont uniquement des identités et montants inventés.
   Conserver l'ordre des colonnes ; les codes avec zéros éventuels sont du texte.
3. Créer un projet Apps Script REC neuf, distinct et clairement nommé. Y importer
   uniquement apps-script/src/Code.gs et son manifeste après revue. Aucun clasp
   relié à PROD, aucun déclencheur ou propriété copié depuis PROD.
4. Dans les propriétés de CE projet REC, renseigner SPREADSHEET_ID avec le nouveau
   classeur et vérifier visuellement son identité. Ne pas utiliser le repli vers
   le classeur actif pour ce projet autonome. Ne pas versionner cet identifiant.
5. Avant le futur déploiement, valider séparément les autorisations et l'exposition
   souhaitées. Le manifeste actuel autorise l'anonyme sous l'identité du déployeur ;
   GET/JSONP peut écrire sans authentification. Cette mission ne corrige ni ne
   certifie cette sécurité. Aucun déploiement n'est réalisé ici.
6. Après autorisation seulement, déployer CE projet REC, contrôler sa cible puis
   saisir son URL dans REC_API_URL hors Git, dans les deux contextes Cloudflare.

## Circuit depuis le téléphone, similaire à DZKoora

Branche de mission depuis main à jour → PR vers main → contrôles syntaxe,
contrats Apps Script et isolation → preview REC du commit → validation du
propriétaire → fusion et déploiement explicitement autorisés. Aucun paramétrage
spécifique du dépôt DZKoora n'a été supposé ou copié.

Exiger les contrôles dans les règles de branche et désactiver l'auto-merge. Ces
réglages sont manuels, non modifiés ici. La preview actuelle n'existe pas : après
raccordement autorisé, ouvrir son URL depuis la PR, vérifier le bandeau REC,
l'absence de SW et les écritures uniquement sur les données fictives. Une mise à
jour de branche nécessite une nouvelle validation du commit et de sa preview.

## Future publication PROD, distincte

Seulement lors d'une intervention autorisée : APP_ENV=PROD et PROD_API_URL fournie
par l'environnement de publication, puis build et revue de dist. PROD sans URL
échoue. Publier exclusivement cet artefact, après validation de la cible, du
workflow et de la transition du SW historique (qui peut conserver l'ancien HTML).
Le build conserve le SW en PROD ; sa stratégie de mise à jour devra être validée
avant activation. Ne pas changer maintenant la source GitHub Pages et ne pas
activer de workflow Pages. Cette PR préserve la publication historique ; elle ne
bascule pas la production sur ce nouvel artefact.

## Vérification et reste à faire

Commandes exécutées : node tests/isolation.mjs, node scripts/check-js.mjs,
node scripts/check-apps-script.mjs et git diff --check. Toutes réussissent avec
Node 24. Tests sans réseau : refus des configurations invalides et PROD en REC,
absence de repli même si PROD_API_URL est présent, API_URL immuable, contrôle du
vrai transport JSONP généré pour lecture/ajout/trois sauvegardes, zéro script émis
lorsque REC est absent, SW absent en REC et présent en PROD, structure des fixtures.
Contrats backend exécutés sur doublures en mémoire. Aucun test navigateur ni test
Google réel effectué ; ces contrôles ne prouvent pas les permissions Google.

Avant recette fonctionnelle : confirmer Pages, approuver la PR, créer les ressources
REC vierges, valider la cible et les droits, autoriser séparément le déploiement REC
et le raccordement Cloudflare, configurer ses deux contextes, puis valider le
parcours sur téléphone. Ne pas fusionner cette PR sans validation du propriétaire.
