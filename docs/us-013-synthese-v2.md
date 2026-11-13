# US-013 — Synthèse financière V2

L’écran est intégré au prototype existant `demo/`, via l’onglet Synthèse après la connexion fictive. Aucun changement du frontend historique, des backends, de l’authentification ou des configurations REC/PROD.

## Deux sélections indépendantes

Chaque ouverture de `#synthese` crée une instance de `createFinanceState` et recrée les fixtures au jour courant Europe/Paris. Le cycle de caisse et la période d’analyse commencent tous les deux au dernier contrôle figé et se terminent aujourd’hui. Cette initialisation se répète en quittant puis en rouvrant la Synthèse, ou en rechargeant la page ; les modifications d’un dialogue ne réinitialisent jamais l’autre filtre.

La section Situation de la caisse possède son filtre de cycle. Seuls les cycles délimités par les contrôles figés sont proposés : cycle actif et tous les cycles clôturés disponibles. Aucun champ de date libre. Le calcul n’inclut que les espèces après le contrôle initial, jusqu’au contrôle de clôture lorsqu’il existe, en distinguant explicitement les opérations avant/après comptage le même jour. Le cycle actif n’a aucun écart déterminé ; un cycle clôturé affiche son comptage réel et son écart par rapport au solde théorique du même cycle.

Le filtre d’analyse possède les choix Cycle en cours, Mois en cours, Mois précédent, Année en cours, Année précédente et Période personnalisée. Les choix complémentaires Choisir un mois et Choisir une année conservent la consultation libre auparavant disponible avec les champs correspondants. Seuls les indicateurs et les quatre activités changent. La période est rappelée dans chacune des sections concernées. Les dates calendaires sont inclusives et les opérations futures exclues.

Les dialogues utilisent un groupe radio HTML dans un `fieldset` avec `legend`, une indication visuelle de sélection, des champs complémentaires activés uniquement si pertinents, Annuler et Valider. Il n’y a plus de `select` natif dans ces dialogues. Les touches fléchées changent le radio, Tab/Maj+Tab restent dans le formulaire ; Échap annule via le dialogue natif. Le focus revient au filtre après annulation ou validation, et sur l’erreur si les dates sont invalides. Seule la validation modifie l’état de l’écran.

## Fichiers et règles

- `demo/finance-data.mjs` : fixtures de trois contrôles et plusieurs mois, quatre activités et natures explicites. Le dernier contrôle fictif précède aujourd’hui de sept jours.
- `demo/finance-model.mjs` : `cashCycles`, `cashSituation`, `analyze` et `createFinanceState` séparent les deux domaines ; `totals` conserve les mouvements par nature.
- `demo/finance-view.mjs`, `demo/styles.css` : interface responsive et listes radio intégrées aux dialogues existants ; aucun nouveau composant externe.
- `demo/app.mjs` : route et navigation existantes, aucun changement de connexion/permissions.
- `scripts/prepare-demo-pages.mjs` : inventaire strict de 14 fichiers du paquet, incluant les trois modules financiers, sans publication.
- `tests/finance.mjs`, `tests/finance-browser.mjs` : tests des calculs, de l’indépendance, des dialogues et du responsive. La CI existante exécute les tests de modèle.

Le cycle actif produit 340 000 DA d’entrées espèces et 115 000 DA de sorties espèces, soit une caisse théorique de 85 000 + 225 000 = 310 000 DA. Le cycle précédent avait une caisse théorique de 87 000 DA, un comptage de clôture de 85 000 DA et un écart de −2 000 DA. Cet écart historique ne qualifie pas le cycle actif, qui reste non vérifié.

Les natures `income`, `expense`, `loan`, `deposit`, `repayment` restent séparées dans `byNature`. Les indicateurs mesurent les flux de trésorerie, sans calcul de bénéfice. Les mouvements bancaires contribuent à l’analyse mais jamais à la caisse physique. Les charges communes sont indépendantes dans l’analyse et toutes les activités utilisent la même caisse physique.

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

Les 24 tests unitaires/de paquet passent, dont 12 tests financiers : initialisation, indépendance dans les deux sens, réouverture, cycles historiques, avant/après comptage, périodes mensuelles/annuelles/personnalisées, année bissextile, janvier vers décembre, état vide, dates invalides, mouvements bancaires et opérations futures.

Les tests Chromium passent à 1440, 390 et 320 px : parcours existants connexion/utilisateurs/création/permissions et nouveaux dialogues, première ouverture/réouverture, validation/annulation/Échap, navigation radio/clavier, restitution et confinement du focus, conservation de l’autre filtre, retour à la Synthèse, absence de dépassement horizontal, d’erreurs JS et de requêtes externes.

Playwright est fourni par l’environnement de test ; aucune dépendance n’est ajoutée au site. `DEMO_WEBKIT=1 node tests/finance-browser.mjs` active les mêmes scénarios WebKit si ce navigateur est disponible. Ici WebKit n’est pas installé et sa tentative d’installation a échoué avec `403 Domain forbidden` sur les domaines officiels Playwright. La validation Safari/iOS réelle reste donc à effectuer ; les tests Chromium avec viewport tactile ne sont pas présentés comme des tests Safari.

Frontend natif : pas de compilation npm ni de configuration lint/typage. Le paquet Pages est généré et contrôlé localement sans déploiement. La CSP conserve `connect-src 'none'`.

## Limites volontaires

Données et connexion entièrement fictives. Aucun contrôle physique, clôture, figement, déblocage, enregistrement réel, backend ou accès Google Sheets. Le bouton de comptage explique le futur module sans simuler une sauvegarde. Aucun ajout d’alertes, de mouvements récents, de tops ou de recouvrement. Les synchronisations REC passent par une PR distincte ; aucune fusion ni publication sans accord explicite du propriétaire.
