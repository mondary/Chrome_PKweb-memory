# Changelog
## v25.0.0 — 2026-09-24

- UI: passage à un versionnage incrémental (v25.0.0) - chaque livraison bumpte la version et est taguée
- ADD: bouton « Réanalyser » dans l'en-tête — relit l'arbre des favoris et purge les données de scan obsolètes (URL qui n'existent plus) pour que doublons et liens morts reflètent l'état réel
- ADD: resynchronisation automatique quand les favoris changent dans Chrome ; indicateur « Synchronisé à HH:MM » dans l'en-tête
- UI: inventaire, galerie, doublons et liens morts recalculés immédiatement après chaque resynchronisation
- UI: rail latéral gauche à deux sections — Favoris et Historique de navigation — recentré verticalement, remplaçant la navigation par onglets du haut ; en-tête contextuel par section sur deux niveaux — marque et actions export/réanalyse en ligne 1, navigation de la section en ligne 2 (onglets Inventaire, Galerie, Doublons, Liens morts, Archives, Backup pour les Favoris ; barre de recherche pour l'Historique)
- ADD: vue « Historique de navigation » — lecture de chrome.history, liste groupée par jour, recherche en direct, bouton étoile pour ajouter une page aux favoris en un clic, compteur pages/visites et ouverture de chrome://history
- UI: historique de navigation épuré — en-têtes de jour épinglés pendant le défilement, lignes fines favicon + titre + URL + heure + compteur de visites, étoile d'ajout aux favoris visible au survol et remplie une fois la page ajoutée
- UI: historique de navigation en timeline façon git-graph sur 14 jours — courbes reliant chaque visite à la page d'où vous venez (rebonds d'onglets en couloirs), pastille du type de navigation, cartes visites aujourd'hui/hier/pages/domaines, panneaux Timeline/Pages, titre de l'app qui suit la section active et pastille de version fixe en bas à droite
- ADD: bouton Réglages épinglé en bas du rail ouvrant une page À propos — présentation des fonctionnalités, version affichée, liens Ko-fi et GitHub (URL provisoires à confirmer)
- ADD: bouton sur chaque carte de la galerie pour envoyer un favori vers un dossier Chrome dédié
- ADD: onglet « Archives » (ex-« Historique ») — consultation des favoris archivés et restauration à l'emplacement d'origine en un clic ou en bloc
- UI: filtre à dossiers de la galerie refait en menu déroulant — libellé courant, compteurs de favoris par dossier, fermeture par clic extérieur ou Échap
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
