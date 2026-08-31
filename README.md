# Radar IA

Dashboard de veille automatique des derniers outils IA, classes par usage (design, voix, finance, ecriture, video...).

**Site en ligne :** https://marouaneozl.github.io/ai-tools-dashboard/

## Fonctionnement

- `scripts/fetch-tools.mjs` interroge l'API Product Hunt (topic `artificial-intelligence`) et regenere `data.json`.
- Le workflow `.github/workflows/update.yml` execute ce script chaque jour via GitHub Actions et commit le resultat automatiquement. Zero intervention manuelle necessaire.
- `index.html` + `assets/app.js` lisent `data.json` cote client : recherche, filtres par tag, badges pricing, et lecteur video pour les outils ayant un lien YouTube renseigne.

## Limite connue

Product Hunt ne fournit pas d'information de pricing structuree. Chaque outil est marque "A verifier" par defaut — verifiez toujours le site officiel avant de renseigner une carte bancaire. Vous pouvez forcer un pricing verifie a la main dans `data.json` en ajoutant `"pricing_manual": true` sur une fiche : le script d'automatisation ne l'ecrasera plus.

## Ajouter une video explicative a la main (optionnel)

Dans `data.json`, ajoutez `"youtube": "<id ou URL de la video>"` sur la fiche de l'outil concerne.

## Configuration requise (une seule fois)

Dans les parametres du repo GitHub :
1. `Settings > Secrets and variables > Actions` : ajouter un secret `PRODUCT_HUNT_TOKEN` (Developer Token genere sur https://api.producthunt.com/v2/oauth/applications).
2. `Settings > Pages` : source = branche `main`, dossier `/ (root)`.
