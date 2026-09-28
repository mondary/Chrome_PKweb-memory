# Favoris

![Bannière Favoris — votre web a une mémoire](store/assets/banner-1544x500.png)

<img src="icon.png" width="88" alt="Icône Favoris">

[🇫🇷 Français](README.md) · [🇬🇧 English](README.en.md)

Retrouvez, nettoyez et sauvegardez vos favoris Chrome. **Extension sans build step ni dépendance.** Version **2026.09.59**.

## Aperçu

![Recherche globale façon palette avec résultats visuels](store/screenshots/02-recherche.png)

![Session en cours, navigation par jour et instantanés restaurables](store/screenshots/06-sessions.png)

## Installation (mode développeur)

1. Ouvre `chrome://extensions`
2. Active **Mode développeur** (en haut à droite)
3. Clique **Charger l'extension non empaquetée** → sélectionne le dossier `extension/`
4. Clique l'icône de l'extension dans la barre d'outils → le dashboard s'ouvre

## Fonctionnalités

| Onglet | Ce que ça fait |
|---|---|
| **Recherche globale** | ⌘K ou n'importe quelle frappe : palette façon Spotlight qui cherche dans les favoris, l'historique et les onglets ouverts ; ↵ ouvre le site ou retrouve son onglet |
| **Inventaire** | Totaux, classement des chemins de dossiers et des domaines, avec barres de fréquence et favicons |
| **Galerie** | Miniatures mshots avec recherche, filtre, choix des colonnes et cache local de 30 jours |
| **Doublons** | 3 niveaux : 1 · URL stricte · 2 · sans tracking (utm, fbclid…) · 3 · sans http/https, www et params |
| **Liens morts** | Scan parallèle ; seuls les HTTP 404/410 confirmés sont morts, les erreurs temporaires restent à vérifier |
| **Sessions** | Timeline fusionnée façon Tablerone : session en cours toujours dépliée, croix par ligne (fermer l'onglet ou retirer le lien, annulable), aperçu de page au survol, vue élargie au clic, enregistrement & fermeture, enregistrement de sélection, carte « Reprendre » à tab zéro, export URL/titres/Markdown/HTML/CSV/JSON (copie ou fichier), sauvegarde auto 5 min, mise en veille des onglets inactifs |
| **Backup** | Exports JSON/HTML des favoris actifs, historique local d'instantanés reliés, gestion de la quarantaine |
| **Pastille icône** | Nombre d'onglets ouverts ou d'onglets en double affiché sur l'icône (au choix dans les réglages) |
| **Page d'accueil** | Ctrl+T ouvre l'extension sur la section choisie (sessions, galerie, historique…) |

## Sécurité

Les captures de la galerie sont demandées à WordPress.com mshots ; l’URL du site est transmise à ce service. Les images récupérées sont conservées dans le stockage local de l’extension pendant 30 jours (maximum 60 entrées), puis régénérées à la demande. Certaines favicônes de secours utilisent Google S2 ; les scans de liens contactent les sites vérifiés sans transmettre leurs cookies.

Les sessions et réglages sont stockés localement. Consultez la [politique de confidentialité](store/privacy-policy.html) et la [fiche Chrome Web Store](store/description-store.md) pour le détail des traitements et permissions.

Les liens ne sont proposés à la quarantaine qu’après 30 jours avec un statut 404/410 confirmé. Un rescannage qui les trouve vivants ou échoue temporairement réinitialise le délai. Les nettoyages déplacent les bookmarks vers `Quarantaine — Bookmarks Sorter`, avec motif et statut. Un lien mort est supprimé automatiquement après 30 jours en quarantaine ; s’il répond de nouveau pendant ce délai, il est signalé pour restauration. Les doublons restent restaurables jusqu’à une purge manuelle.

Chaque export, nettoyage, restauration ou purge conserve un instantané local dans l’historique (jusqu’à 30 versions), relié au précédent. Restaurer un instantané rétablit les favoris manquants sans supprimer les favoris plus récents. Les exports JSON/HTML sont des fichiers téléchargés par Chrome, séparés de cet historique.

Les doublons gardent toujours le bookmark le plus ancien. Les pages `chrome://` et fichiers locaux ne sont jamais scannées.

## Structure

```
extension/    ← l'extension Chrome (manifest.json, index.html, style.css, app.js, sw.js)
store/        ← fiche Chrome Web Store, assets promo, captures fictives, politique de confidentialité
src/          ← pipeline Python complémentaire (stdlib : stats + dédoublonnage CLI)
src3/         ← référence temporaire de la fusion Sessions (timeline autonome, à supprimer après validation)
data/         ← exports et fichiers de travail
backups/      ← archives horodatées
```

## Conventions

- Zéro dépendance : vanilla JS côté extension, stdlib Python côté CLI.
- Racine minimale, pas de `node_modules`, pas de build.
- Chaque dump destiné à être testé reçoit une nouvelle version `YYYY.MM.N`, même pour une petite modification. Lance `python3 scripts/bump_version.py`, puis recharge l'extension non empaquetée dans `chrome://extensions`.
- Chrome exige une version numérique sans zéro initial dans le manifest : `version` utilise donc `YYYY.M.N` (par exemple `2026.9.4`). `version_name` conserve l'affichage lisible `YYYY.MM.N` (par exemple `2026.09.4`), montré dans l'en-tête de l'extension. Voir `CHANGELOG.md` pour l'historique.
- Voir le [CHANGELOG](CHANGELOG.md) pour l'historique complet.
