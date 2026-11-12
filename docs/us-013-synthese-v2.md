# US-013 — Synthèse financière V2

L’écran est intégré au prototype existant `demo/`, via l’onglet Synthèse après la connexion fictive. Aucun changement du frontend historique, des backends, de l’authentification ou des configurations REC/PROD.

## Fichiers et règles

- `demo/finance-data.mjs` : fixtures de trois contrôles et plusieurs mois, dates relatives au jour courant Europe/Paris, quatre activités et natures de mouvements explicites. Le dernier contrôle précède aujourd’hui de sept jours. Les données sont recréées au chargement.
- `demo/finance-model.mjs` : sélection des cinq types de période, sommes et analyse par activité, calcul de caisse espèces et écart historique. Les dates sont inclusives ; les cycles utilisent en plus la position métier avant/après contrôle pour les opérations du même jour. Aucune heure de saisie n’est utilisée.
- `demo/finance-view.mjs`, `demo/styles.css` : interface responsive inspirée des maquettes Stitch, filtres dans le dialogue existant, état vide, explication du futur module de comptage.
- `demo/app.mjs` : route `#synthese` et navigation, sans changement du parcours de connexion.
- `scripts/prepare-demo-pages.mjs`, `tests/demo-pages.mjs` : ajout des trois modules à l’inventaire strict du paquet local. Aucune publication.
- `tests/finance.mjs`, `tests/finance-browser.mjs`, `.github/workflows/demo-tests.yml` : tests de calcul, validation navigateur et inclusion des calculs dans la CI existante.

Le cycle actif produit 340 000 DA d’entrées et 115 000 DA de sorties, soit +225 000 DA. La caisse théorique vaut 85 000 + 225 000 = 310 000 DA. Le contrôle précédent avait une caisse théorique de 87 000 DA, un comptage réel de 85 000 DA et un écart de −2 000 DA. Cet écart historique ne qualifie jamais le cycle actif, qui reste non vérifié. Pour une période calendaire, seule l’analyse des mouvements change ; la caisse actuelle reste ancrée au dernier comptage. Le cycle précédent présente sa propre caisse théorique et son comptage de clôture.

Les natures `income`, `expense`, `loan`, `deposit`, `repayment` restent séparées dans les agrégats `byNature`. Les indicateurs mesurent tous les flux de trésorerie et aucun bénéfice n’est calculé. Le modèle distingue aussi le mode de règlement : seuls les espèces interviennent dans la caisse physique.

## Validation locale

Démarrer uniquement `node scripts/serve-demo.mjs`, puis :

```sh
node --test tests/demo.mjs tests/demo-pages.mjs tests/finance.mjs
node scripts/check-js.mjs
git diff --check
DEMO_CHROMIUM_PATH=/usr/bin/chromium node tests/demo-browser.mjs
node tests/finance-browser.mjs
DEMO_CHROMIUM_PATH=/usr/bin/chromium node tests/demo-pages-browser.mjs
```

Playwright est une dépendance de test fournie par l’environnement, aucune bibliothèque n’est ajoutée au site. Les contrôles navigateur couvrent Chromium à 1440, 390 et 320 pixels, filtres réellement recalculés, état vide, dates inversées, navigation, absence de dépassement horizontal, d’erreur JavaScript et de requêtes externes. Le test Pages prépare le paquet statique et vérifie ses modules à un sous-chemin local ; aucune compilation npm n’existe pour ce frontend natif, ni configuration de lint/typage. La CSP conserve `connect-src 'none'`.

## Limites volontaires

Données et connexion entièrement fictives. Aucune écriture réelle, contrôle physique, clôture, figement, déblocage ou branchement backend. Le bouton de comptage explique le futur module sans simuler un enregistrement. Aucun ajout d’alertes, mouvements récents, tops ou recouvrement. Aucun déploiement et aucune modification du dépôt public de démonstration. Les validations mobiles utilisent Chromium ; aucun appareil Android physique n’a été utilisé.
