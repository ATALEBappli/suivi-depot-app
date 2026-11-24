# Pages publiques de préparation OAuth REC

Ces **trois pages HTML autonomes** sont un brouillon pour le consentement Google de `REC-Synchronisation` :

- `index.html` — accueil ;
- `confidentialite.html` — information sur les accès Google ;
- `conditions.html` — conditions d'utilisation.

**Cette PR ne publie aucune page.** Les fichiers sont conservés sous `docs/rec/oauth-public/` afin de ne pas modifier le bundle du Worker REC ni le site historique. Aucune URL publique n'est encore prête à être saisie dans Google Cloud.

## Vérifications obligatoires avant publication distincte

1. Valider l'identité/les coordonnées du responsable du traitement et les durées réelles de conservation des données techniques. Les mentions **« à compléter »** et **« version de préparation »** ne doivent pas rester dans une politique définitive.
2. Faire valider la portée exacte des accès OAuth et le texte de confidentialité. Les scopes utilisés par l'automatisation incluent `script.projects`, `script.deployments`, `drive.metadata.readonly`, `drive.file` et des informations d'identité.
3. Choisir **un hébergement public séparé** de PROD et du Worker REC privé, avec trois URL HTTPS accessibles sans authentification et une politique de confidentialité réelle. Vérifier le domaine autorisé Google et les exigences de Google Search Console avant de saisir les liens.
4. Autoriser séparément toute publication de ces pages et toute modification Google Cloud, puis seulement le renouvellement du jeton OAuth et du secret GitHub **environnement REC**.

Ces pages n'activent aucun appel réseau, n'affichent aucune donnée de locataire, ne demandent aucun mot de passe et n'introduisent aucune collecte analytique.
