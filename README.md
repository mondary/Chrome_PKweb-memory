# Chrome Bookmarks Sorter

Nettoie, dédoublonne, visualise et sauvegarde des milliers de bookmarks Chrome accumulés depuis 15 ans. **Extension Chrome, zéro build step, zéro dépendance.**

## Installation (mode développeur)

1. Ouvre `chrome://extensions`
2. Active **Mode développeur** (en haut à droite)
3. Clique **Charger l'extension non empaquetée** → sélectionne le dossier `extension/`
4. Clique l'icône de l'extension dans la barre d'outils → le dashboard s'ouvre

## Fonctionnalités

| Onglet | Ce que ça fait |
|---|---|
| **Inventaire** | Total, dossiers, domaines, arborescence, top domaines |
| **Galerie** | Grille de miniatures (screenshots) avec recherche et filtre par dossier |
| **Doublons** | 3 niveaux : 1 · URL stricte · 2 · sans tracking (utm, fbclid…) · 3 · sans http/https, www et params |
| **Liens morts** | Scan parallèle des URLs, statut persisté, `down depuis N jours`, corbeille des morts > 30 j |
| **Backup** | Export JSON + export HTML réimportable dans Chrome, gestion de la corbeille |

## Sécurité

**Rien n'est jamais supprimé automatiquement.** Tout nettoyage déplace les bookmarks vers un dossier `Corbeille — Bookmarks Sorter`. Seule la corbeille peut être vidée, manuellement, avec confirmation.

Les doublons gardent toujours le bookmark le plus ancien. Les pages `chrome://` et fichiers locaux ne sont jamais scannées.

## Structure

```
extension/    ← l'extension Chrome (manifest.json, index.html, style.css, app.js, sw.js)
src/          ← pipeline Python complémentaire (stdlib : stats + dédoublonnage CLI)
data/         ← exports et fichiers de travail
backups/      ← archives horodatées
```

## Conventions

- Zéro dépendance : vanilla JS côté extension, stdlib Python côté CLI.
- Racine minimale, pas de `node_modules`, pas de build.
- Version `YYYY.MM.PATCH` — voir `CHANGELOG.md`.
