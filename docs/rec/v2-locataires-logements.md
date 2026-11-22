# REC — Référentiel locataires et logements (préparation)

Cette évolution ne fusionne pas et ne publie pas le code ; elle ne déclenche aucune migration. Les tests utilisent uniquement des données fictives.

## Migration unique et contrôlée

- Le tableau historique `config_logements` reste intact ; les transactions historiques ne sont **jamais** importées.
- Depuis l'interface REC, l'administrateur ouvre `Paramétrage > Logements et locataires` puis **Prévisualiser les fiches existantes**.
- L'aperçu lit les 12 fiches existantes via `rec.reference`, contrôle les 12 numéros uniques et leur étage (05, 06, 09, 10, 11, 12 = 1er ; 15, 16, 18, 19, 20 = 2e ; 21 = toit), puis utilise `v2.simulate` sans écriture.
- Le bouton de confirmation passe par le `v2.import` existant (révision attendue, empreinte d'aperçu, idempotence, rôle administrateur et journal additif). Une V2 déjà renseignée bloque cette migration.
- Après succès, le référentiel V2 devient la source utilisée par le backend REC ; vérifier les 12 entrées avant de modifier les fiches. Conserver la sauvegarde REC antérieure et le reçu du workflow pour une éventuelle reprise.
- La confirmation réelle de migration nécessite une **autorisation distincte** après publication REC.

## Règles

- **Locataires en premier**, puis **Logements**. Numéro abrégé `App`, sans perte des zéros initiaux. F2 bleu, F3 vert et F4 orange clairs. Tableaux à défilement horizontal sur mobile.
- `Actif` signifie qu'un bail est en cours à la date de consultation. Après clôture du bail (statut `terminé` et date de sortie), le locataire apparaît `Inactif` ; on conserve tous ses anciens baux.
- Le logement est `Occupé` si un bail est en cours, sinon `Travaux` si sa disponibilité est marquée ainsi, sinon `Libre`. Il est interdit de marquer `Travaux` si un bail reste actif et d'attribuer un nouveau bail à un logement en travaux.
- Le loyer de référence du **logement** est indépendant de la chronologie des loyers appliqués aux **baux**. Modifier le loyer de référence ne réécrit pas les montants historiques.
- La caution contractuelle reste `null` tant qu'elle n'est pas confirmée. L'interface affiche un montant *indicatif* (loyer − 2 000 DA) et propose cette valeur par défaut sur le formulaire de création du bail. Aucun encaissement n'est déduit de ce calcul.
- `Supprimer` est une **mise en archive** non destructive. Une fiche associée à un bail actif ne peut pas être archivée ; il faut d'abord clôturer le bail. Les relations, le journal d'historique et les transactions restent inchangés.
- `v2.write` et `v2.import` restent soumis à l'autorisation administrateur du serveur. Aucune nouvelle URL ou secret n'est exposé au navigateur.

## Limites

- La migration ne déduit pas les anciennes dates ni les cautions réelles ; elles sont à renseigner manuellement.
- La suppression définitive d'une donnée possédant un historique n'est pas proposée.
- La publication REC et l'exécution de la migration sont deux opérations séparées, à autoriser ultérieurement.