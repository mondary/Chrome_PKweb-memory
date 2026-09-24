# Changelog
## 2026.09.12 — 2026-09-24

- Doublons : le second bandeau de niveaux ne reste plus collé pendant le défilement ; le compteur discret reste en haut à droite.
- Doublons : le filtre par dossier est affiché sous les niveaux de détection et filtre les groupes où le dossier apparaît.
## 2026.09.11 — 2026-09-24

- UI: filtre des doublons par dossier ; les groupes restent visibles si le favori conservé ou un doublon se trouve dans le dossier choisi
## 2026.09.10 — 2026-09-24

- UI: compteur des groupes et doublons restants dans une pastille discrète pendant le défilement ; masquée dès qu’on quitte l’onglet
## 2026.09.9 — 2026-09-24

- UI: lignes concernées mises en évidence pendant le dédoublonnage puis animées avant leur retrait de la liste
## 2026.09.8 — 2026-09-24

- FIX: retrait des branchements d’export vers les anciens boutons Backup ; leur absence bloquait tout le démarrage de l’interface
## 2026.09.7 — 2026-09-24

- UI: galerie réglée sur Auto par défaut avec préférence mémorisée ; inventaire adapté à la hauteur disponible
- UI: dédoublonnage avec état de progression et confirmation ; doublons de quarantaine regroupés par URL exacte
- UI: exports regroupés dans l’en-tête et historique clarifié sur les détails réellement conservés
## 2026.09.6 — 2026-09-24

- UI: niveaux de détection et compteur des doublons restent visibles ensemble pendant le défilement
## 2026.09.5 — 2026-09-24

- UI: galerie élargie, recherche titre/URL plus visible et réglage Auto pour adapter les colonnes à l’espace disponible
## 2026.09.4 — 2026-09-24

- UI: tuiles d'inventaire actionnables et version chargée visible dans l'en-tête
- FIX: quarantaine catégorisée avec origine et statut ; résultat du scan maintenu à l'écran
- UI: galerie et doublons clarifiés, choix du bookmark conservé stabilisé
- UI: mise en page de Backup resserrée avec historique dans une colonne dédiée

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
