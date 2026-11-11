# Backend REC — garde-fous Mission 8

Code réservé à REC ; aucun déploiement ou accès Google effectué par cette PR.
Les données et les quatre onglets doivent déjà exister. Aucune initialisation,
migration, création d'onglet ou écriture n'a lieu pendant une lecture.

## Configuration privée obligatoire

Propriétés du projet backend, hors Git :

- `APP_ENV` : exactement `REC`.
- `SPREADSHEET_ID` : cible à ouvrir, obligatoire, sans espaces périphériques.
- `REC_SPREADSHEET_ID` : cible autorisée, obligatoire et égale à la précédente.

L'identité retournée par le classeur est également vérifiée. Aucun repli actif.
Ces deux propriétés sont un contrôle de cohérence, pas une frontière contre un
éditeur malveillant : un éditeur peut changer les deux. Le compte REC doit rester
sans accès PROD. Aucun identifiant privé ne doit apparaître dans les logs ou Git.

Chaque accès contrôle les quatre onglets : existence, présence de la ligne
d'en-tête, largeur utilisée exacte et noms/ordre exacts des en-têtes.

| Onglet | Colonnes dans l'ordre |
| --- | --- |
| transactions | type, date, montant, sous_bloc, description, local, locataire, fournisseur, periode, moyen, personne |
| config_logements | num, type, locataire, loyer |
| config_locaux | code, nom, locataire, loyer |
| config_hedam | code, nom |

Des colonnes utilisées supplémentaires, même ailleurs sous l'en-tête, bloquent
l'accès. Les colonnes physiquement vides à droite ne comptent pas. Les données
historiques ne sont ni réécrites ni assainies par les lectures.

## Contrat et validations avant écriture

Conservation des enveloppes `{ok:true,rows}`, `{ok:true,config}`, `{ok:true}` et
`{ok:false,error}`. Les routes GET/JSONP historiques restent présentes à ce stade,
ainsi que POST JSON pour ajouter une transaction. Ce code n'est pas une API
publique sécurisée : aucune authentification métier n'est ajoutée ici.

Corrections justifiées :

- POST absent, malformé, null, tableau ou champs inconnus : refus, aucune ligne vide.
- Date obligatoire ISO `YYYY-MM-DD`, calendrier réel vérifié.
- Type textuel non vide ; les catégories métier ne sont pas redéfinies ici.
- Montants/loyers : nombres finis ou chaînes décimales à point, zéro conservé,
  non négatifs, au plus deux décimales, plafond technique de 1 milliard.
  Les montants négatifs et le plafond nécessitent confirmation métier avant usage.
- Textes facultatifs absents : chaîne vide ; null, objets et autres types refusés.
  Maximum 2000 caractères par texte ; préfixes de formule `= + - @`, même après
  espaces/contrôles, refusés. Certains textes légitimes préfixés seront donc rejetés.
- Configurations : tableaux de 5000 objets maximum, colonnes connues, identifiant
  non vide et unique. Payload absent refusé ; tableau vide explicite conserve la
  sémantique d'effacement. Tous les éléments sont validés avant toute écriture.
- Remplacement de configuration par un seul `setValues` rectangulaire ; anciennes
  lignes excédentaires vidées, en-tête conservé. Aucun `clearContents` préalable.
- Erreurs publiques fixes, sans exception brute ni écho de paramètres ; debug désactivé.
- Callback JSONP validé entièrement plutôt que transformé silencieusement.

## Accès et limites

Le manifeste candidat passe de `ANYONE_ANONYMOUS` à `MYSELF` : propriétaire seul.
Il ne modifie aucun déploiement existant et ne fournit pas une connexion par mot
de passe. Ne pas déployer anonymement. Le frontend actuel n'est pas raccordable
à ce backend privé sans l'architecture d'authentification à valider séparément.

La Mission 9 adapte séparément `REC-Synchronisation` : seuls ce manifeste MYSELF
et le contrat historique exact sont autorisés, y compris lors d'une restauration.
Voir [les prérequis et risques](../../docs/mission-9-validation.md), notamment
le partage depuis le propriétaire initial et l'absence de preuve d'accès web REC.

Pas encore de rôles, propriétaire de transaction, historique, verrouillage,
idempotence ou transaction atomique multi-onglets. Les éditeurs Sheets restent
capables de modifier les données directement. Les requêtes répétées peuvent
ajouter des doublons. Le résultat d'une écriture interrompue peut être incertain :
pas de nouvel essai automatique. Les limites de cellules, quotas et droits Google
ne sont pas certifiés par les mocks.

## Validation hors réseau

`node scripts/check-apps-script.mjs` charge le vrai Code.gs dans node:vm avec des
classeur/onglets fictifs et sans service réseau disponible. Il remplace les tests
historiques qui attendaient précisément les comportements dangereux corrigés.
`node tests/rec-synchronisation.mjs` utilise le candidat MYSELF par défaut,
conserve une fixture historique explicite et teste les refus et restaurations.
