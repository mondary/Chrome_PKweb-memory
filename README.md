# PK Web Memory

![Bannière PK Web Memory — votre vie web, organisée](store/assets/banner-1544x500.png)

<img src="icon.png" width="88" alt="Icône PK Web Memory">

[🇫🇷 Français](README.md) · [🇬🇧 English](README.en.md)

Votre vie web, organisée : **favoris, historique et sessions réunis dans un seul espace.** Extension Chrome sans build step ni dépendance. Version **2026.09.71**.

## Aperçu

![Recherche globale — interface réelle, données de démonstration](store4/screenshots/02-recherche.png)

![Timeline de sessions — interface réelle dans un profil Chrome jetable](store4/screenshots/06-sessions.png)

La [vitrine store4](store4/index.html), copiée depuis `store3` sans modifier l'original, propose huit captures réelles agrandissables et un playground pleine largeur qui reconstitue le tableau de bord réel avec des données fictives : palette de recherche ⌘K groupée par source, inventaire, galerie, doublons avec quarantaine annulable, sessions (fermeture d'onglet, enregistrement & fermeture, restauration sans doublons), historique complet (tuiles de visites, calendrier heatmap cliquable, navigation par jour) et instantanés. Miniatures et favicônes réelles via mshots et Google S2, comme l'extension ; le reste reste en mémoire dans la page — ce n'est pas l'extension embarquée.

Pour la consulter : `python3 -m http.server 4174 --bind 127.0.0.1`, puis ouvrir `http://127.0.0.1:4174/store4/`.

Régénération des captures : `node store4/tools/capture.mjs` (Node 22+ et Chrome for Testing ; chemin configurable avec `CHROME_BIN`). Le script charge `extension/` dans un profil headless jetable, crée des favoris, visites et sessions de démonstration via les API Chrome, puis capture l'interface sans retouche du DOM, des styles ou des images. Galerie en mode favicônes ; liens morts avant scan, sans faux résultats. Les exports de sauvegarde restent dans le profil temporaire, supprimé à la fin. Le [rapport de provenance](store4/tools/capture-report.json) conserve les dimensions, la version et les empreintes des sources et PNG.

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
| **Galerie** | Miniatures mshots ou liste compacte inspirée du gestionnaire de favoris Chrome, avec recherche, filtre par dossier, compteur affichés/total, choix des colonnes et cache local de 30 jours |
| **Doublons** | 3 niveaux : 1 · URL stricte · 2 · sans tracking (utm, fbclid…) · 3 · sans http/https, www et params |
| **Liens morts** | Scan parallèle ; seuls les HTTP 404/410 confirmés sont morts, les erreurs temporaires restent à vérifier |
| **Sessions** | Timeline fusionnée façon Tablerone : session en cours toujours dépliée, croix par ligne (fermer l'onglet ou retirer le lien, annulable), aperçu de page au survol, vue élargie au clic, enregistrement & fermeture, enregistrement de sélection, dédoublonnage des onglets ouverts (annulable), carte « Reprendre » à tab zéro, export URL/titres/Markdown/HTML/CSV/JSON (copie ou fichier), sauvegarde auto 5 min, mise en veille des onglets inactifs (URL d'origine conservée, badge Zzz, récap et réveil en un clic) |
| **Backup** | Exports JSON/HTML des favoris actifs, historique local d'instantanés reliés, gestion de la quarantaine |
| **Pastille icône** | Nombre d'onglets ouverts ou d'onglets en double affiché sur l'icône (au choix dans les réglages) |
| **Page d'accueil** | Ctrl+T ouvre l'extension sur la section choisie (sessions, galerie, historique…) |

## Sécurité

Les captures de la galerie sont demandées à WordPress.com mshots ; l’URL du site est transmise à ce service. Les images récupérées sont conservées dans le stockage local de l’extension pendant 30 jours (maximum 60 entrées), puis régénérées à la demande. Certaines favicônes de secours utilisent Google S2 ; les scans de liens contactent les sites vérifiés sans transmettre leurs cookies.

Les sessions et réglages sont stockés localement. Consultez la [politique de confidentialité](store/privacy-policy.html) et la [fiche Chrome Web Store](store2/description-store.md) pour le détail des traitements et permissions.

Les liens ne sont proposés à la quarantaine qu’après 30 jours avec un statut 404/410 confirmé. Un rescannage qui les trouve vivants ou échoue temporairement réinitialise le délai. Les nettoyages déplacent les bookmarks vers `Quarantaine — Bookmarks Sorter`, avec motif et statut. Un lien mort est supprimé automatiquement après 30 jours en quarantaine ; s’il répond de nouveau pendant ce délai, il est signalé pour restauration. Les doublons restent restaurables jusqu’à une purge manuelle.

Chaque export, nettoyage, restauration ou purge conserve un instantané local dans l’historique (jusqu’à 30 versions), relié au précédent. Restaurer un instantané rétablit les favoris manquants sans supprimer les favoris plus récents. Les exports JSON/HTML sont des fichiers téléchargés par Chrome, séparés de cet historique.

Les doublons gardent toujours le bookmark le plus ancien. Les pages `chrome://` et fichiers locaux ne sont jamais scannées.

## Structure

```
extension/    ← l'extension Chrome (manifest.json, index.html, style.css, app.js, sw.js)
store/        ← fiche Chrome Web Store, assets promo, captures fictives, politique de confidentialité
store2/       ← kit web v2 (page vitrine) — base du prochain store
store3/       ← landing page premium (from scratch, direction ciel pixelisé)
store4/       ← variante de store3 : captures réelles, playground interactif, présentation détaillée
src/          ← pipeline Python complémentaire (stdlib : stats + dédoublonnage CLI)
archive/      ← anciennes versions : src3 (fusion sessions), premier site du store
data/         ← exports et fichiers de travail
backups/      ← archives horodatées
```

## Conventions

- Zéro dépendance : vanilla JS côté extension, stdlib Python côté CLI.
- Racine minimale, pas de `node_modules`, pas de build.
- Chaque dump destiné à être testé reçoit une nouvelle version `YYYY.MM.N`, même pour une petite modification. Lance `python3 scripts/bump_version.py`, puis recharge l'extension non empaquetée dans `chrome://extensions`.
- Chrome exige une version numérique sans zéro initial dans le manifest : `version` utilise donc `YYYY.M.N` (par exemple `2026.9.4`). `version_name` conserve l'affichage lisible `YYYY.MM.N` (par exemple `2026.09.4`), montré dans l'en-tête de l'extension. Voir `CHANGELOG.md` pour l'historique.
- Voir le [CHANGELOG](CHANGELOG.md) pour l'historique complet.

## Soutenir

Un café aide à faire vivre le projet : [Ko-fi](https://ko-fi.com/pouark).
