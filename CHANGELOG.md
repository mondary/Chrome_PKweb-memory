# Changelog

## 2026.09.3 — 2026-09-24

- FIX: doublons recalculés après mise en quarantaine ; choix explicite du bookmark à conserver
- FIX: liste « liens morts » limitée aux bookmarks actifs ; quarantaines visibles avec leur motif et statut
- ADD: scan distingue 404/410 confirmés des échecs temporaires et réinitialise le délai après nouveau scan
- ADD: cache local des miniatures mshots pendant 30 jours, choix du nombre de colonnes
- ADD: historique local de 30 instantanés avec parenté et restauration non destructive
- UI: inventaire comparatif à barres et favicons ; analyse des doublons instantanée par niveau

## 2026.09.2 — 2026-09-24

- ADD: extension Chrome MV3 — dashboard complet (inventaire, galerie thumbnails, doublons 3 niveaux, scan liens morts avec down_since, backup JSON/HTML, corbeille de sécurité)
- ADD: icône générée + clé d'extension fixe (ID stable)
- MAJ: README centré sur l'extension, pipeline Python en outil complémentaire

## 2026.09.1 — 2026-09-24

- ADD: parseur d'export Chrome (HTML Netscape + JSON) → liste unifiée
- ADD: inventaire `stats` (total, par dossier, domaines dominants)
- ADD: dédoublonnage `dedupe` à 3 niveaux paramétrables (stricte / sans tracking / sans params)
- ADD: backup horodaté dans `backups/`
