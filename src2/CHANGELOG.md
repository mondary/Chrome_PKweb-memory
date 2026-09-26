# Changelog — Sessions

Version indépendante de l’extension Favoris située dans `../extension/`.

## [2026.09.1] - 2026-09-26

### Added

- Extension Chrome Manifest V3 autonome, sans compilation ni dépendance.
- Timeline de fenêtres ouvertes et de collections enregistrées, navigation par favoris, tags, archives et sauvegardes automatiques.
- Recherche dans les titres, URL, tags et notes ; vues détaillée/compacte ; thèmes clair, sombre et système.
- Sauvegarde de toutes les fenêtres, d’une fenêtre ou d’une sélection, fermeture facultative après persistance et conservation des onglets épinglés.
- Restauration dans de nouvelles fenêtres avec groupes natifs, épingles et onglet actif.
- Notes par session et par onglet, déplacement entre collections, dédoublonnage exact et copies restaurables avant retrait/modification d’onglets.
- Sauvegarde automatique toutes les cinq minutes, conservation de vingt versions distinctes, instantané manuel et protection des favoris contre la rotation automatique.
- Mise en veille manuelle ou après 15, 30 ou 60 minutes, excluant les onglets actifs, épinglés et audibles.
- Export/import JSON validé sans remplacement des données présentes, copie d’URL ou de Markdown.
- Tests Node sans dépendance et aperçu interactif explicite `?demo` utilisant uniquement des données fictives.
