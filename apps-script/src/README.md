# Backend historique versionné — Mission 3

`Code.gs` provient du fichier intégral fourni par le propriétaire dans la
conversation. `appsscript.json` reprend le manifeste fourni. Aucun export Google
ni accès au projet ou aux données de production n'a été effectué.

La seule adaptation exécutable du backend est la déclaration de `SHEET_ID`, qui
lit désormais `PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID')`.
Les deux commentaires associés ont été adaptés et les espaces d'indentation
normalisés. Aucun identifiant réel ni le marqueur masqué reçu n'est inclus.

Si cette propriété est absente ou vide, le repli historique vers
`SpreadsheetApp.getActiveSpreadsheet()` est conservé. Pour un script autonome,
la propriété doit désigner le classeur autorisé ; aucune valeur par défaut ni
validation supplémentaire n'a été ajoutée. Ce comportement diffère du modèle
strict `templates/Config.gs.example`, qui n'est ni importé ni exécuté.
Ne pas modifier les propriétés du projet de production dans cette mission.

## Contrats conservés

- `doGet` sans action (ou action inconnue) : `{ok:true, rows:[...]}` ; erreurs de
  lecture : `{ok:false,error:...}`.
- `ping=1` : texte `pong`, ou callback JSONP recevant `"pong"`.
- `action=add` : ajout d'une transaction puis `{ok:true}`. Les erreurs de cette
  branche restent non interceptées, conformément au code historique.
- `doPost` : ajout depuis le corps JSON, réponse `{ok:true}` ou `{ok:false,error}`.
- `action=config&what=all` : `{ok:true,config:{logements,locaux,hedam}}`.
- `action=config&save=logements|locaux|hedam&payload=...` : remplacement de la
  configuration ciblée, payload décodé puis analysé comme JSON ; `{ok:true}` ou
  `{ok:false,error}`. Payload absent : tableau vide.
- `action=config&debug=1` : renvoie les paramètres reçus.
- `callback` : JSONP, nom filtré avec l'expression historique ; sans callback,
  réponses JSON sauf le ping texte.

Les appels observés dans `app.js` (lecture, ajout GET, lecture globale et trois
sauvegardes de configuration, callback) correspondent à ces branches. Aucun
changement frontend n'est nécessaire ni inclus.

Feuilles et colonnes conservées :

| Feuille | Colonnes, dans l'ordre |
| --- | --- |
| `transactions` | type, date, montant, sous_bloc, description, local, locataire, fournisseur, periode, moyen, personne |
| `config_logements` | num, type, locataire, loyer |
| `config_locaux` | code, nom, locataire, loyer |
| `config_hedam` | code, nom |

L'initialisation historique des feuilles et les neuf entrées Hedam sont
conservées. Aucun script de migration n'est ajouté. Les sauvegardes de
configuration existantes utilisent `clearContents()` ; elles ne doivent pas
être exécutées en production pendant cette mission.

## Risques historiques conservés

Le manifeste autorise `ANYONE_ANONYMOUS` avec `USER_DEPLOYING` : une personne
anonyme peut appeler le backend sous l'identité du déployeur, dans la limite des
autorisations de ce dernier. Le code fourni ne vérifie ni identité ni rôle, y
compris pour les écritures et remplacements de configuration via GET/JSONP.
Cette configuration n'est pas sécurisée. Le filtrage du callback et l'extraction
de l'identifiant vers les propriétés ne constituent pas une authentification.
Aucun mécanisme improvisé ni changement d'accès n'est introduit ; leur évolution
nécessite une conception et une validation séparées.

Autres comportements conservés : corps POST malformé accepté comme objet vide,
zéro numérique remplacé par une chaîne vide via `||`, absence de validation
métier renforcée. Aucun correctif hors périmètre n'est inclus.

Le manifeste garde Europe/Paris, V8, STACKDRIVER et les dépendances vides, sans
ajout de portées OAuth explicites. Les portées effectives, déclencheurs et droits
du projet Google n'ont pas été interrogés. Les tests Node ne certifient pas le
fonctionnement dans Apps Script ni les permissions Google.
