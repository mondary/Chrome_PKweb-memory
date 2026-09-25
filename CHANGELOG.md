# Changelog
## [2026.09.47] - 2026-09-25

### Changed

- Identité visuelle : les icônes de l'extension et de la page À propos utilisent désormais l'icône PK officielle.
- Préparation Chrome Web Store : fiche FR/EN, justifications de permissions et politique de confidentialité bilingue ajoutées ; README synchronisés avec bannière, icône et captures récentes.
- Fiche de présentation : nom unifié « Favoris », recherche globale et sessions par jour mises en avant ; groupes d'onglets retirés de la promotion store en attendant leur reprise.
## [2026.09.46] - 2026-09-25

### Changed

- Sessions refondues façon Workona/Tablerone : la session en cours affiche directement toutes les favicônes des onglets ouverts (le volume se voit d'un coup d'œil) ; nouvelle section « Par jour » — les 14 derniers jours de navigation reconstruits depuis l'historique, une favicône cliquable par page vue et « Rouvrir le jour » qui relance toute la journée dans une fenêtre ; les instantanés manuels et automatiques passent en section repliée avec leur compteur.

## [2026.09.45] - 2026-09-25

### Changed

- Recherche globale : palette centrée en largeur en verre dépoli, fond d'écran flouté à l'ouverture, et rangée de résultats façon dock macOS — la loupe en vague grossit l'icône survolée et ses voisines, la tuile active suit la sélection ↑↓.
- Sessions : une favicône par onglet dans l'aperçu des sessions (55 onglets = 55 favicônes, compteur en tête de rangée), fini le dédoublonnage par domaine.

## [2026.09.44] - 2026-09-25

### Added

- Recherche globale façon Spotlight : ⌘K ou n'importe quelle frappe au clavier ouvre une palette alignée à gauche qui cherche en même temps dans les favoris, l'historique et les onglets ouverts (miniature, favicon, titre, URL, badges) ; ↑↓ pour choisir, ↵ pour ouvrir le site ou retrouver son onglet déjà ouvert.
- Groupes d'onglets : capture automatique en bibliothèque locale — Chrome n'expose aucun accès aux groupes enregistrés fermés, chaque groupe ouvert et nommé est donc capturé par le service worker (même extension fermée), puis modifiable, rouvrable et supprimable sans jamais le rouvrir ; réglage « Capture automatique » et bouton « Capturer maintenant ».

### Changed

- Renommage « Bookmarks Sorter » → « Favoris » (manifeste, titres, en-têtes) : l'extension ne trie pas encore les favoris, son nom ne devait pas le promettre.
- Sessions : affichage permanent de la session Chrome en cours, actualisé lors des changements d'onglets, puis séparation claire avec l'historique des sessions sauvegardées.
- Sessions : le compteur « ignorés » devient « non enregistrables » et explique les pages internes, les onglets vierges et les schémas impossibles à restaurer ; les onglets suspendus avec une URL web récupérable restent inclus.

## [2026.09.43] - 2026-09-25

### Changed

- Heatmap de l'historique : année déplacée dans l'en-tête, colonne des jours de semaine retirée pour éviter le décalage avec les dates et gagner de la largeur ; le calcul du nombre de mois s'adapte à cette largeur libérée.

## 2026.09.42 — 2026-09-25

- UI: heatmap de l'historique — calendrier centré et espacement entre les mois porté à 18 px ; le calcul du nombre de mois disponibles tient compte de cet écart pour conserver l'affichage sans débordement.
## 2026.09.41 — 2026-09-25

- ADD: historique instantané — les visites collectées sont persistées dans le stockage local ; l'ouverture de la section affiche immédiatement le cache (stale-while-revalidate) pendant qu'une re-collecte discrète rafraîchit et re-persiste en arrière-plan ; la recherche filtre désormais côté client (titre + URL) : plus aucun re-balayage par requête, recherche instantanée
- ADD: lazy load du panneau Pages — sections par jour créées au fil de lots de 150 lignes via IntersectionObserver (même mécanique que la timeline), fin du rendu en bloc de milliers de lignes
- UI: heatmap sans scroll horizontal — seuls les mois qui TIENNENT dans la largeur sont affichés (~138 px/mois au pire cas), année civile complète quand 12 mois rentrent ; la bande ne déborde plus jamais en usage normal (seul un jour sélectionné très ancien peut l'étendre)
## 2026.09.40 — 2026-09-25

- CHG: heatmap élargie — au moins 8 mois affichés même vides, jusqu'à 12 selon la largeur disponible ; sur très grand écran l'année civile complète janvier → décembre (jours futurs désactivés), recalcul au redimensionnement de la fenêtre, le jour sélectionné ancien étend toujours la plage jusqu'à son mois
## 2026.09.39 — 2026-09-25

- FIX: bannières de « Mes autres extensions » — vraies captures 1280×800 du Chrome Web Store pour PK New Tab, PK Sticky Notes, SimpleGmail, Screenshot Resizer et PK Chrome Shortcuts
- UI: « Mes autres extensions » refait en liste détaillée — une fiche pleine largeur par extension (bannière à gauche, description française complète) avec liens explicites « Chrome Web Store ↗ » et « GitHub ↗ » en boutons, plus de mini-cartes aux icônes de lien seules
## 2026.09.38 — 2026-09-25

- UI: cartes de session — toutes les favicônes dédupliquées par domaine sont affichées (retour à la ligne), plus de « +N » au-delà de 12
- UI: aperçu d'une session — la favicône de chaque onglet apparaît avant le titre et l'URL
## 2026.09.37 — 2026-09-25

- ADD: heatmap calendrier dans l'historique — bande continue façon contributions GitHub sous le bandeau de jours : tous les mois de la fenêtre côte à côte (année glissante, 12 mois max), une colonne par semaine (L-D), pastille par jour colorée par intensité de visites (5 niveaux de bleu calibrés sur le maximum de la plage), numéro du jour visible, clic direct pour filtrer la timeline, scroll horizontal avec lettres L-D restées visibles et défilement automatique vers le jour sélectionné ; remplace le calendrier popover qu'il fallait ouvrir via le libellé
- CHG: panneau Pages segmenté par jour — mêmes sections titrées que la timeline (Aujourd'hui / Hier / date longue, compte de pages), regroupement par page conservé, heure seule en colonne (la date est portée par le titre du jour)
- FIX: sessions incomplètes (« 4 onglets, 2 fenêtres » au lieu de 65) — cause racine : l'alarme d'auto-save se déclenche au démarrage de Chrome avant la fin de la restauration de session ; la capture (page et service worker) attend désormais un paysage d'onglets stable (nombre d'onglets et de fenêtres inchangé entre deux relevés)
- FIX: déballage des onglets suspendus élargi — tout paramètre url= ou uri= (query ou hash, encodé ou brut) est reconnu, pas seulement susp(end)ed.html?url= : The Marvellous Suspender (#uri=) et autres gestionnaires passent
- CHG: capture de session unifiée dans sessionlib.js (page + service worker + groupes d'onglets, qui partagaient trois copies du déballage) ; les sessions stockent leur compte d'onglets ignorés, affiché sur la carte (« · N ignoré(s) ») pour distinguer une capture partielle
## 2026.09.36 — 2026-09-24

- FIX: comptes de la galerie — chaque dossier (racine incluse) affiche ses favoris directs, plus le sous-arbre entier ; « Racine » montre enfin 209 et non 5163, cohérent avec le filtre et les cartes affichées
- FIX: historique instantané — les visites collectées sont mises en cache ; navigation par jour, recherche et retour de focus rejouent le rendu sans re-balayer l'historique (les événements de navigation invalident le cache) ; panneau Pages re-rendu seulement si les données changent
- UI: bandeau de navigation par jour refait en contrôle segmenté (‹ jour + compteur ›, chevrons SVG, « Tout » en pastille) — fin des boutons navigateur bruts
- FIX: sessions et groupes d'onglets morts — cause racine : les 59 onglets suspendus par Tablerone sont des pages chrome-extension:// et étaient comptés « ignorés » (capture à 3 onglets sur 60) ; l'URL et le titre réels sont déballés du paramètre ?url= des pages de suspension (capture, auto-save du service worker, groupes ouverts)
- ADD: garde-fou permission « onglets » — bannière globale si elle est désactivée dans Chrome (Détails de l'extension) et garde-fou à la capture avec toast actionnable
- ADD: purge des sessions automatiques — autos supprimées après 7 jours (12 max, jamais aux dépens des manuelles plafonnées à 28), capture auto identique à la précédente non réenregistrée, bouton « Purger les auto » ; le service worker capture désormais les groupes d'onglets
## 2026.09.35 — 2026-09-24

- UI: « À propos » refait en hero centré — grand logo, version en badge, tagline, fonctionnalités en pastilles, boutons centrés
- ADD: vraies captures des applications dans « Mes autres extensions » — screenshots authentiques 01-live de chaque projet (New Tab, Sticky Notes, Highlighter, Traduction, Session, Shortcuts) embarqués dans assets/ext, icônes officielles ; SimpleGmail et Screenshot Resizer servies depuis le store
- ADD: icônes SVG discrètes pour chaque section des réglages (général, scan, quarantaine, galerie, données)
## 2026.09.34 — 2026-09-24

- FIX: géométrie des branches — la zone des couloirs (largeur dynamique) ne peut plus chevaucher les favicônes de la timeline, quel que soit le nombre de branches
- ADD: navigation par jour refondue — bandeau ‹ jour › + calendrier git-calendar (jours visités avec compte, clic direct), contenu vertical du jour, bouton « Tout » ; lazy load de la timeline par lots de 150 lignes (fin du chargement en bloc)
- FIX: sessions et groupes enfin réactifs (câblage des boutons tué par un ui=null, toast mort) — « Enregistrer la session » affiche un toast chiffré et la carte en tête ; réglage auto-save intégré en haut de la liste ; re-render automatique à chaque sauvegarde du service worker
- CHG: Groupes d'onglets en page unique — groupes ouverts détaillés onglet par onglet (cliquables), groupes enregistrés en dessous en cartes compactes ; plus d'onglets Enregistrés/auto
- ADD: quarantaine consultable et actionnable — titre/URL ouvrables dans un nouvel onglet, statut de vie réservé aux liens morts, « Supprimer définitivement » (part au cimetière) ; croix ✝ sur les favicônes du cimetière, sync 2026.09.34
## 2026.09.33 — 2026-09-24

- FIX: timeline et Pages affichent désormais toute la fenêtre d'historique (cap des 600 visites supprimé, chrome.history illimité)
- ADD: navigation par jour dans l'historique — chips Aujourd'hui/Hier/jours précédents + sélecteur de date, la timeline se filtre sur la journée choisie
- FIX: pastille ×N des Pages déplacée avant la colonne heure — plus de décalage de la dernière colonne ; dendrites redessinées sous les contenus de lignes (points avec halo) : plus aucune icône sous une branche
- CHG: onglet Archives remplacé par « Cimetière » — regroupement par domaine des favoris supprimés (doublons, liens morts, quarantaine expirée), réajout en un clic, plus aucun dossier Chrome ni « tout restaurer »
- ADD: comptes de favoris unifiés (même total partout, bug 209/216 corrigé) et affichés sur chaque section de la galerie ; relance du scan liens morts depuis son onglet ; revérification des liens en quarantaine (par lien ou en lot) ; catégorie « Autres/anciens » supprimée ; recherche de la galerie poussée à droite, sync 2026.09.33
## 2026.09.32 — 2026-09-24

- UI: onglet « Mes autres extensions » refait en fiches type store — bannière de capture, icône de l'application, nom, description et liens Store/GitHub pour les 8 extensions PK
- ADD: visuels officiels récupérés du Chrome Web Store (captures 550x350 et icônes) ; PK Session illustrée par ses assets locaux
## 2026.09.31 — 2026-09-24

- ADD: page Réglages complète en grille trois colonnes (libellé, description, contrôle) — général, scan, quarantaine, galerie, données locales
- ADD: réglages effectifs : connexions parallèles, délai d'expiration, re-vérification des vivants, confirmations, durée de quarantaine, mode miniatures 100 % local (favicons seules), colonnes de galerie
- ADD: vérification au démarrage — re-scanne silencieusement les 40 liens les plus anciennement vérifiés à l'ouverture
- ADD: onglet « Mes autres extensions » avec liens Chrome Web Store et GitHub vérifiés des 8 extensions PK
- UI: « À propos » déplacé en dernier onglet ; interrupteurs switch sobres ; boutons vider le cache miniatures et réinitialiser l'extension
## 2026.09.30 — 2026-09-24

- FIX: capture de session complète (toutes fenêtres/onglets via tabs.query, exclusions limitées aux pages internes) — fini le « 3 onglets » avec 60 ouverts
- ADD: aperçu favicônes sur chaque carte de session et enregistrement automatique programmable (15 min à 1×/jour) via alarme du service worker, même extension fermée
- CHG: section Groupes d'onglets réécrite sur les groupes natifs Chrome — groupes ouverts (pastille couleur, strip favicônes, bouton Focus) + dossiers/groupes enregistrés de la barre de favoris (réouverture en groupe) ; suppression du stockage maison et du « rangement de la barre »
- UI: barres d'en-tête Groupes/Sessions alignées sur le modèle favoris/historique (onglets + actions contextuelles, boutons favoris masqués) ; top 3 domaines cliquables dans les quatre tuiles historique (filtre la recherche) ; icônes et puces de la timeline peintes au-dessus des branches (fix 🔥 sous dendrite), sync 2026.09.30
## 2026.09.29 — 2026-09-24

- ADD: section « Groupes d'onglets » — groupes ouverts (sauvegarde, réouverture avec titre et couleur), bibliothèque de groupes dans l'app, et rangement de la barre de favoris par correspondance nom + URLs (déplacement réversible vers « Groupes d'onglets — Bookmarks Sorter »)
- ADD: section « Sessions » — capture de toutes les fenêtres/onglets (groupes inclus), sessions datées restaurables (40 max), renommage, suppression et création d'une session depuis un groupe sauvegardé
- CHG: permissions « tabs » et « tabGroups » ajoutées ; groupes et sessions stockés uniquement dans le stockage local de l'extension
- DOC: enquête sur le stockage réel des groupes d'onglets sauvegardés de Chrome (docs/tabgroups-storage.md)
## 2026.09.28 — 2026-09-24

- CHG: suppression du filtre de période de la barre historique (les tuiles Aujourd'hui / 7 jours / Ce mois / Cette année suffisent), timeline remise sur toute la fenêtre de scan
- ADD: option « Illimité » (par défaut) pour la fenêtre d'historique — scan de tout l'historique Chrome, compteur affichant « illimité »
- UI: compteur de visites et bouton « Historique Chrome » remontés dans la première barre ; la recherche historique respire seule à droite de la deuxième barre
## 2026.09.27 — 2026-09-24

- ADD: historique vivant — les compteurs écoutent chaque nouvelle visite (et suppression) et se rafraîchissent en direct ; les tuiles ne sont plus plafonnées à 600 (lecture portée à 10 000 résultats, format fr-FR)
- ADD: tuiles de statistiques Aujourd'hui / 7 jours / Ce mois / Cette année, et navigation par année (‹ 2026 ›) sur la timeline
- UI: en-têtes de même hauteur dans les trois sections (barres secondaires calées à 44 px, décalages sticky unifiés via --header-h)
- UI: barre historique réorganisée — onglets, sélecteur de période, navigation d'année, recherche confortable à droite sur une seule ligne
- ADD: Réglages en onglets — À propos, Réglages (langue FR/EN, fenêtre d'historique 7 j → 1 an) et Mes autres extensions
- UI: recherche de la galerie épinglée sous l'en-tête pendant le défilement
- FIX: cliquer une page déjà ouverte dans un onglet actif met cet onglet au premier plan au lieu d'en ouvrir un nouveau
## 2026.09.26 — 2026-09-24

- UI: en-tête dédié à chaque section — icône de marque propre (horloge pour l'historique, engrenage pour les réglages) et actions favoris (exports JSON/HTML, réanalyser, statut de sync) masquées hors de la section Favoris
- FIX: en-tête épinglé en permanence pendant le défilement, dans Favoris comme dans l'Historique (le corps n'a plus de hauteur fixe d'un écran)
- UI: barre Timeline/Pages calée à ras du bas de l'en-tête comme celle des Favoris, recherche souple, bouton « Historique Chrome » sur une ligne avec l'icône d'ouverture externe
- ADD: un clic sur une ligne de l'historique (timeline ou pages) rouvre la page dans un nouvel onglet
- FIX: historique déparasité et dédoublonné — les visites automatiques (iframes, annonces) et les doublons stricts même URL même horodatage disparaissent ; cartes de stats et panneaux Timeline/Pages calculés sur le même jeu de données filtré, chiffres réels
- UI: Réglages avec barre d'onglets « À propos », liens réels Ko-fi (ko-fi.com/pouark) et GitHub avec leurs icônes
## 2026.09.25 — 2026-09-24

- FIX: versionnage — retour au CalVer (2026.09.25) comme le fait scripts/bump_version.py ; le v25.0.0 était une erreur
- ADD: bouton « Réanalyser » dans l'en-tête — relit l'arbre des favoris et purge les données de scan obsolètes (URL qui n'existent plus) pour que doublons et liens morts reflètent l'état réel
- ADD: resynchronisation automatique quand les favoris changent dans Chrome ; indicateur « Synchronisé à HH:MM » dans l'en-tête
- UI: inventaire, galerie, doublons et liens morts recalculés immédiatement après chaque resynchronisation
- UI: rail latéral gauche à deux sections — Favoris et Historique de navigation — recentré verticalement, remplaçant la navigation par onglets du haut ; en-tête contextuel par section sur deux niveaux — marque et actions export/réanalyse en ligne 1, navigation de la section en ligne 2 (onglets Inventaire, Galerie, Doublons, Liens morts, Archives, Backup pour les Favoris ; barre de recherche pour l'Historique)
- ADD: vue « Historique de navigation » — lecture de chrome.history, liste groupée par jour, recherche en direct, bouton étoile pour ajouter une page aux favoris en un clic, compteur pages/visites et ouverture de chrome://history
- UI: historique de navigation épuré — en-têtes de jour épinglés pendant le défilement, lignes fines favicon + titre + URL + heure + compteur de visites, étoile d'ajout aux favoris visible au survol et remplie une fois la page ajoutée
- UI: historique de navigation en timeline façon git-graph sur 14 jours — courbes reliant chaque visite à la page d'où vous venez (rebonds d'onglets en couloirs), pastille du type de navigation, cartes visites aujourd'hui/hier/pages/domaines, panneaux Timeline/Pages, titre de l'app qui suit la section active et pastille de version fixe en bas à droite
- FIX: timeline historique — plus d'effet escalier : les couloirs sont réutilisés dès qu'une ligne est terminée, les visites sans lien de filiation restent collées à gauche
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
