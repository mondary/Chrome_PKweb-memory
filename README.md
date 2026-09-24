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
| **Inventaire** | Totaux, classement des chemins de dossiers et des domaines, avec barres de fréquence et favicons |
| **Galerie** | Miniatures mshots avec recherche, filtre, choix des colonnes et cache local de 30 jours |
| **Doublons** | 3 niveaux : 1 · URL stricte · 2 · sans tracking (utm, fbclid…) · 3 · sans http/https, www et params |
| **Liens morts** | Scan parallèle ; seuls les HTTP 404/410 confirmés sont morts, les erreurs temporaires restent à vérifier |
| **Groupes d'onglets** | Capture, réouverture et rangement dans la barre de favoris |
| **Sessions** | Sessions datées restaurables : capture et restauration |
| **Backup** | Exports JSON/HTML des favoris actifs, historique local d'instantanés reliés, gestion de la quarantaine |

## Sécurité

Les captures de la galerie sont demandées à mshots ; l’URL du site est transmise à ce service. Les images récupérées sont conservées dans le stockage local de l’extension pendant 30 jours (maximum 60 entrées), puis régénérées à la demande.

Les groupes d'onglets et les sessions sont stockés uniquement dans le stockage local de l'extension ; rien n'est envoyé.

Les liens ne sont proposés à la quarantaine qu’après 30 jours avec un statut 404/410 confirmé. Un rescannage qui les trouve vivants ou échoue temporairement réinitialise le délai. Les nettoyages déplacent les bookmarks vers `Quarantaine — Bookmarks Sorter`, avec motif et statut. Un lien mort est supprimé automatiquement après 30 jours en quarantaine ; s’il répond de nouveau pendant ce délai, il est signalé pour restauration. Les doublons restent restaurables jusqu’à une purge manuelle.

Chaque export, nettoyage, restauration ou purge conserve un instantané local dans l’historique (jusqu’à 30 versions), relié au précédent. Restaurer un instantané rétablit les favoris manquants sans supprimer les favoris plus récents. Les exports JSON/HTML sont des fichiers téléchargés par Chrome, séparés de cet historique.

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
- Chaque dump destiné à être testé reçoit une nouvelle version `YYYY.MM.N`, même pour une petite modification. Lance `python3 scripts/bump_version.py`, puis recharge l'extension non empaquetée dans `chrome://extensions`.
- Chrome exige une version numérique sans zéro initial dans le manifest : `version` utilise donc `YYYY.M.N` (par exemple `2026.9.4`). `version_name` conserve l'affichage lisible `YYYY.MM.N` (par exemple `2026.09.4`), montré dans l'en-tête de l'extension. Voir `CHANGELOG.md` pour l'historique.
