# Changelog
## [2026.10.56] - 2026-10-26

### Added

- **Pastille « mode Respiration »** : troisième choix dans Réglages → Pastille de l'icône. Elle affiche **▶** (fond vert) quand la tournée tourne, **⏸** (fond orange) quand elle est en pause, et rien sans tournée. Rafraîchie à chaque changement d'état (démarrage, pause, reprise, fin, remplissage) en plus des événements d'onglets. La portée « fenêtre de la tournée / toutes les fenêtres » reste propre aux deux compteurs.

## [2026.10.55] - 2026-10-23

### Fixed

- **Réouverture suspendue sans pages blanches** : `chrome.tabs.discard()` était appelé avant que la navigation soit réellement engagée ; l'onglet perdait son URL et restait blanc. Le bouton attend maintenant `status === "complete"` et une URL web avant de suspendre, par lots de trois pages pour limiter la mémoire, puis rapporte le nombre réellement suspendu/chargé.

### Added

- **Réparer les onglets suspendus vides** : si des onglets déjà rouverts sont restés blancs, le panneau affiche **« Réparer N onglet(s) suspendu(s) vide(s) »**. Le bouton remet l'URL de la file dans chaque onglet, attend le chargement puis le suspend, par lots de trois.

## [2026.10.54] - 2026-10-23

### Fixed

- **Réouverture suspendue réellement suspendue** : `chrome.tabs.discard()` refuse souvent un onglet encore en cours de chargement ; les pages rouvertes restaient donc chargées. Le bouton attend maintenant que chaque page soit suspendable (nouvelles tentatives), rapporte le nombre réellement suspendu/chargé, et ajoute les pages **après** les onglets ouverts — ouverts en haut, suspendus en bas, comme dans Chrome.
- **Bouton dans la section À revenir** : « Rouvrir N page(s) à revenir en suspendu » est déplacé au bas de la section **À revenir · N** du panneau, et disparaît dès que la réserve est vide. En mode suspendu, le panneau affiche aussi les onglets chargés en tête et les suspendus en dessous.

## [2026.10.53] - 2026-10-23

### Added

- **Bouton de réouverture suspendue dans le panneau** : quand des pages sont « à revenir », le panneau latéral affiche **« Rouvrir N page(s) à revenir en suspendu »**. Un clic recrée les onglets dans Chrome, les suspend immédiatement et garde les onglets courants chargés. Le bouton existe aussi dans la carte Respiration de Sessions, mais plus besoin d'aller la chercher.

## [2026.10.52] - 2026-10-23

### Added

- **Rouvrir en mode Suspendre** : la carte Respiration propose désormais **« Rouvrir en mode Suspendre »** quand des pages sont « à revenir ». Le bouton les recrée dans Chrome, les suspend immédiatement via `chrome.tabs.discard()` et garde les onglets courants chargés en les insérant après les pages rouvertes. Plus besoin de passer par une session pour retrouver les onglets fermés en mode grisé.
- **Pastille réglable dans le panneau** : mode (onglets / doublons / aucune), portée (fenêtre de la tournée / toutes les fenêtres) et diagnostic en direct — « 10 onglets web dans la fenêtre, 12 dans toutes les fenêtres normales » — pour comprendre l'écart sans quitter le panneau.

### Fixed

- **Réglages : colonne de description écrasée** : le conteneur était plafonné à 720 px, ce qui comprimait la colonne du milieu même sur grand écran. Il passe à 1120 px, la grille garantit 320 px à la description et bascule en une colonne sous 900 px.
- **Pastille de l'icône** : elle suit par défaut la **fenêtre de la tournée** (comme le panneau), ne compte que les onglets web et exclut pages internes, PWA, popups et fenêtres privées. La portée « toutes les fenêtres » reste disponible.

## [2026.10.51] - 2026-10-23

### Added

- **Réglages dans le panneau latéral** : un pictogramme réglages (curseurs) ouvre une vue dédiée avec la case **Rail favicon sur les pages**, le sélecteur **Mode Respiration**, un bouton **Fermer le panneau** et le lien vers tous les réglages. Le mode rappelle qu'il s'applique à la prochaine tournée et que les pages déjà fermées restent dans les sessions.

### Fixed

- **Pastille de l'icône** : elle ne compte plus les pages internes de l'extension (dashboard, réglages, nouvel onglet), les fenêtres PWA/app, les popups ni les fenêtres privées. Seuls les onglets web des fenêtres Chrome normales sont comptés, ce qui la fait correspondre au panneau au lieu d'afficher 12 pour 10 onglets visibles.

## [2026.10.50] - 2026-10-23

### Added

- **Mode Respiration « Suspendre » (Chrome natif)** : nouvelle option dans **Réglages → Sessions & onglets** et dans la boîte d'activation. Les onglets restent tous dans Chrome, avec leur vrai titre, favicon et URL ; seuls les **N plus récents restent chargés**, les autres passent par **`chrome.tabs.discard()`** (renderer libéré, rechargement au clic). Aucune page n'est fermée. L'onglet actif, les épinglés et les lectures sont protégés et peuvent dépasser la cible d'une unité. La sauvegarde de session reste créée. Le mode **Fermer** reste le défaut. Tests : 12 onglets/cible 4 → 8 suspendus sans fermeture ; clic sur un suspendu le recharge et en suspend un autre ; test navigateur réel avec `discard`.

## [2026.10.49] - 2026-10-23

### Fixed

- **Mosaïque du panneau latéral restaurée** : le segmented liste/favicons ne pilote plus le rail de page mais le **panneau lui-même**. Le mode mosaïque affiche une grille de favicons groupée par état — ouverts, à revenir, fermés — avec le titre et l'URL au survol et la même vignette que la liste ; le mode liste reste détaillé. Le choix est mémorisé (`settings.panelView`) et le rail de page reste indépendant, contrôlé par sa case des Réglages.

## [2026.10.48] - 2026-10-23

### Changed

- **Rail favicon désactivé par défaut** : la colonne de favicons n'est plus affichée sur les pages tant que l'option **Réglages → Sessions & onglets → Rail favicon sur le bord des pages** n'est pas cochée. Le segmented liste/favicons du panneau latéral reste synchronisé. Ce changement évite le décalage de page de 30 px qui perturbait certaines interfaces (LinkedIn, messageries web, applications plein écran) ; le panneau latéral reste disponible dans tous les cas.

## [2026.10.47] - 2026-10-23

### Fixed

- **La tournée ne reste plus en pause après un rechargement** : `init()` forçait `paused = true` dès que `storage.session` était vide (rechargement de l'extension ou redémarrage de Chrome), même si la fenêtre d'origine et ses onglets étaient intacts. La file se réconcilie et **reprend seule** ; une pause demandée avec le bouton Pause reste conservée, tout comme une pause due à une erreur. Une opération interrompue (`opening`/`parking`) est réparée puis reprise automatiquement si la fenêtre est toujours là. Tests : reprise après rechargement, pause manuelle conservée, opérations interrompues récupérées.

## [2026.10.46] - 2026-10-23

### Fixed

- **Rail hors des fenêtres sans onglets Chrome** : le rail favicon s'affichait aussi dans les applications installées (PWA) et les popups, où il ne peut pas piloter la tournée — un clic y aurait renvoyé vers la fenêtre Chrome normale. Il reste désormais masqué dans ces fenêtres (type `app`/`popup` fourni par le worker, repli sur `display-mode`), sans décaler la page. Une option **Réglages → Sessions & onglets → Rail favicon dans les fenêtres d'application** permet de l'y réafficher. Test navigateur : popup réel avec rail absent, page non décalée.

## [2026.10.45] - 2026-10-23

### Added

- **Plein écran depuis le rail** : Chrome n'expose aucune API pour masquer seulement sa barre d'onglets, même en mode vertical. Le bouton **⛶** de l'en-tête bascule la fenêtre en plein écran — toute l'interface du navigateur disparaît (barre d'onglets, barre d'adresse) et le rail reste dans la page. Le même bouton, F11 ou ⌃⌘F rétablit la barre. Test navigateur : passage réel en `fullscreen` puis retour en `normal`.

## [2026.10.44] - 2026-10-23

### Fixed

- **Toute la réserve dans le rail favicon** : le rail s'arrêtait à 24 pages « à revenir », puis affichait « … — ouvrir le panneau ». Il rend désormais toutes les pages, ouvertes puis à revenir, dans une liste défilante ; l'en-tête (⇄ pour changer de côté) et le pied (☰) restent fixes, et la position de défilement est conservée lors d'un rafraîchissement. Le rail se comporte comme une vraie barre d'onglets verticale, même avec plusieurs centaines de pages.
- **☰ du rail** : l'ouverture du panneau natif passait par la file sérialisée du worker ; Chrome perdait le geste utilisateur et répondait « sidePanel.open() may only be called in response to a user gesture ». L'appel part maintenant immédiatement dans le gestionnaire de message, pendant le clic ; en cas de refus, le rail explique quoi faire au lieu d'afficher l'erreur anglaise. Test navigateur : clic réel sur ☰ sans toast d'erreur, et 30 pages ajoutées rendues sans « … ».

## [2026.10.43] - 2026-10-22

### Fixed

- **Fond du rail resserré** : à 38 px pour des favicons de 18 px, le fond clair faisait environ deux fois la largeur utile de la colonne — une bande blanche inutile en bord de page. Le rail passe à 30 px (boutons 26 px, icônes 18 px, séparateur et contrôles compactés), le décalage de la page suit (30 px), et une constante unique `RAIL_W` pilote fond, décalage et écart des cartes (toast, vignette) pour qu'ils restent toujours cohérents.

## [2026.10.42] - 2026-10-22

### Fixed

- **Le rail était embarqué dans son propre décalage** (v2026.10.41) : le `transform` sur `html` fait de lui le bloc conteneur de tous ses descendants en `position: fixed` — y compris le rail, qui se retrouvait décalé hors de son trou de 38 px, collé au contenu, ancré au document (il suivait le scroll et remontait hors de l'écran). Le rail monte désormais dans la **couche supérieure** (`popover="manual"`, même mécanisme que la carte d'aperçu) : ancré au viewport quoi que fassent les transforms des ancêtres, rendu au-dessus de tout. Le décalage de la page reste sur `html`. Assertions d'intégration : page poussée à 38 px **et** rail resté à 0, extinction propre des deux.

## [2026.10.41] - 2026-10-22

### Fixed

- **Le rail favicon pousse la page au lieu de la recouvrir** : en surcouche pure, il masquait le bord gauche du contenu sur la moitié des sites. `html` est désormais décalé et rétréci de la largeur du rail (38 px) — le transform fait de `html` le bloc conteneur des éléments `position: fixed`, qui suivent le décalage au lieu de rester sous le rail ; le CSSOM (`setProperty`) reste insensible aux CSP des sites, les styles d'origine sont restaurés à l'arrêt. Le décalage s'applique côté rail (gauche ou droite après ⇄), disparaît en plein écran, à l'impression et quand la tournée s'arrête. Limite connue : les rares sections en `100vw` peuvent déborder de 38 px (scrollbar horizontale fine) — éteindre le rail est l'échappatoire.

## [2026.10.40] - 2026-10-22

### Fixed

- **Le badge de l'icône reste vide après un rechargement** : l'appel initial à `updateBadge()` partait avant la déclaration de `LIB_KEY` (ReferenceError « Cannot access before initialization », avalée par le catch) — le nombre d'onglets ne revenait qu'au prochain onglet créé ou fermé. L'appel initial vit désormais après la déclaration ; une assertion d'intégration vérifie désormais le badge au démarrage du worker.

## [2026.10.39] - 2026-10-22

### Added

- **Rail favicon en surcouche des pages** : le panneau latéral de Chrome a une largeur minimale (~300 px) qu'aucune API ne peut abaisser — la colonne de favicons de la v2026.10.38 ne pouvait donc pas rendre le rail fin attendu. Le rail vit désormais DANS les pages : un strip vertical fixe de 38 px sur le bord de la fenêtre, côté gauche par défaut, déplaçable à droite d'un clic (⇄ en pied de rail, mémorisé dans les préglages). Ouverts en haut, « À revenir » en atténué dessous (24 affichées, le reste via le panneau), onglet actif marqué du côté fenêtre, point vert sur les lectures en cours, vignette au survol (capture locale, puis service de miniatures si activé — aucun onglet réveillé), clic = même échange LRU que le panneau. Caché en plein écran et à l'impression, retiré des iframes, Shadow DOM isolé, favicons via l'API native avec repli sur la première lettre du domaine (aucune requête externe). Visible pendant une tournée active uniquement ; le segmented du panneau (liste ↔ favicons) l'allume et l'éteint ; les pages déjà ouvertes le reçoivent au rechargement de l'extension, comme le raccourci ⌘⌥W.
- **Barre de recherche + navigation** (v2026.10.38 affinée) : la barre permanente garde la recherche et les seuls pictogrammes Respiration / Ressources ; pause et segmented « liste / rail » restent dans l'en-tête de la réserve. `version_name` du manifest était resté en retrait lors du bump manuel précédent — les deux champs sont désormais pilotés par `scripts/bump_version.py`.

## [2026.10.38] - 2026-10-22

### Added

- **Barre permanente dans le panneau latéral** : la recherche quitte la vue Respiration pour une barre fixe au-dessus des vues, toujours visible, accompagnée des seules bascules de navigation Respiration / Ressources réduites à des pictogrammes. Chercher depuis la vue Ressources ramène automatiquement à la réserve. Pause et mode d'affichage ne relèvent pas de la navigation : ils restent dans la vue Respiration.
- **Colonne de favicons dans le panneau latéral** : la liste détaillée (favicon + titre + domaine, vignette au survol) reste la vue par défaut ; un segmented « liste / favicons » dans l'en-tête de la réserve réduit celle-ci à une seule colonne d'icônes, calée à gauche comme une barre d'onglets verticale — ouverts en haut, « À revenir » en dessous en atténué. Clic (échange LRU), survol (vignette) et états actif/lecture identiques. Le pause/reprendre de la tournée rejoint ce même en-tête, près du compteur (état « en pause » affiché). Le choix d'affichage est mémorisé dans les réglages ; toute recherche rouvre la liste détaillée le temps de filtrer. Chrome ne permet pas de piloter la largeur du panneau par code : c'est le panneau qu'on réduit à la main, la colonne est conçue pour ça.

## [2026.10.37] - 2026-10-22

### Fixed

- **Le raccourci demandé est bien ⌘⌥W** : les versions précédentes avaient livré d’autres combinaisons. La restriction `Command+Alt` concerne l’API `commands` de Chrome ; l’affirmation d’une impossibilité générale était erronée. Un content script isolé reçoit maintenant exactement Commande + Option + W dans les pages HTTP(S) et leurs cadres, puis transmet au worker uniquement l’action « à revenir », avec l’onglet identifié par Chrome. Aucun remplacement par Ctrl/Shift et aucune permission supplémentaire.
- **Mise à jour sans recharger chaque page** : réinjection idempotente dans les onglets déjà ouverts au rechargement de l’extension, répétitions clavier ignorées, message visible si l’action est impossible. Les commandes de gestion des sessions restent réservées aux pages de l’extension. Le focus doit être dans la page, pas dans la barre d’adresse ni une page interne/protégée de Chrome.
- **Rotation effective** : retour en fin de réserve, même entre plusieurs lots ; pas de réouverture immédiate de la page rangée. La page suivante est créée avant la fermeture pour préserver une fenêtre à un seul onglet ; si l’ouverture échoue, l’onglet courant reste ouvert. Les lectures en cours et la pause sont respectées. Les événements sont liés à l’onglet d’origine, sans fermeture d’un autre onglet après changement de focus.

## [2026.10.36] - 2026-10-22

### Fixed

- **Tentative de correction du raccourci Mac** : la suggestion `Ctrl+Shift+W` sans clé `mac` était auto-convertie en ⌘⇧W (« fermer la fenêtre »). Le défaut mac a été remplacé par **⌥⇧W**, dont seul l’enregistrement dans Chrome avait été vérifié. Cette version ne fournissait donc pas le ⌘⌥W demandé ; correction en 2026.10.37.

## [2026.10.35] - 2026-10-21

### Added

- **Action « fermer à revenir »** : ferme l’onglet actif de la tournée vers la réserve, sans le marquer traité, puis rappelle la suivante. Le raccourci annoncé ⌃⇧W était mal déclaré sur Mac ; la v2026.10.37 fournit le ⌘⌥W demandé et vérifie son déclenchement réel.

### Fixed

- **L'extension ne disparaît plus au redémarrage de Chrome** : la `key` du manifest donnait à la version locale l'ID exact de la fiche Chrome Web Store ; la fiche étant aussi installée dans le profil, Chrome arbitrait au démarrage en faveur de la version store et retirait silencieusement l'extension non empaquetée. Clé retirée, comme sur les cinq autres extensions PK : l'ID local devient distinct et stable (dérivé du dossier), le store conserve son propre ID à la publication. Premier chargement après mise à jour = réglages locaux remis à neuf, une seule fois. Les tests navigateur découvrent désormais l'ID au runtime via le service worker réveillé, indépendamment de toute clé.

## [2026.10.34] - 2026-10-20

### Added

- **Section Mots de passe Google** : nouvelle entrée dans le rail latéral (icône clé) qui affiche un panneau de lancement dans la fenêtre principale. Chrome interdit l'intégration des pages internes et des mots de passe dans une iframe : le bouton principal ouvre donc le gestionnaire natif (`chrome://password-manager/passwords`) dans un nouvel onglet, la page restant ouverte en dessous ; « passwords.google.com » ouvre la version web. Raccourci de section paramétrable dans les Réglages, en-tête et titre traduits FR/EN.
- **Soumission store 2026.10.34** : justification de la permission `contextMenus` ajoutée dans l'onglet Confidentialité (bloquait l'envoi), description de la fiche alignée sur la règle deux sites (bullet « Mots de passe » + ligne standard apps.pouark.com / mondary.design en clôture). En attente d'examen, publication automatique après approbation.

## [2026.10.33] - 2026-10-18

### Changed

- **Accès rapide au panneau Respiration** : le clic gauche sur l’icône de l’extension ouvre directement le panneau latéral. Le clic droit ajoute « Ouvrir le panneau Respiration », « Ouvrir la page complète » et « Nouvel onglet · Sessions ». ⌘T/Ctrl+T continue d’utiliser la page nouvel onglet configurée (Sessions par défaut), et le lien « Gérer la tournée dans Sessions » reste disponible depuis le panneau.
- **Landing FR/EN** : le descriptif Respiration passe en version locale 2026.10.33 — panneau latéral d’un clic sur l’icône, roulement manuel d’une page de la réserve — et l’étape d’installation décrit le nouveau geste (clic gauche, clic droit, ⌘T).

## [2026.10.32] - 2026-10-18

### Added

- **Roulement manuel Respiration** : choisir une page depuis les icônes, la liste détaillée ou le panneau latéral l’active et remet l’onglet le moins récemment utilisé en réserve. La cible reste respectée (lectures audio/vidéo en plus), la page échangée n’est pas marquée traitée ; ⌘W conserve son retour automatique en arrière-plan. Une ouverture échouée ne ferme aucun onglet existant ; les opérations sont sérialisées et persistées.
- **Panneau latéral Respiration** : recherche titre/URL, pages ouvertes et à revenir, pages traitées repliées, pause/reprise, aperçus titre/URL/vignette partagés avec Sessions. Bouton « Panneau latéral » dans la tournée ; le moniteur de ressources reste accessible dans son propre onglet et ne sonde les pages que lorsqu’il est affiché.

## [2026.10.31] - 2026-10-18

### Changed

- **Kit média et landing régénérés** depuis l'extension 2026.10.30 : 5 captures 1280×800 pour la fiche Chrome Web Store, 9 scènes 1440×1000 pour la landing, tuile/marquee/bannière/carte OG, GIF large + compact et MP4 ; captures de la landing `store/website/` également régénérées (la scène galerie reste volontairement non recapturée).
- **Landing et hub publiés** : `https://mondary.design/apps/Chrome_PKweb-memory/` passe en 2026.10.30 (Respiration : sections par état, toutes les favicônes, survol) et le hub `https://mondary.design/apps/` (alias `apps.pouark.com`) présente Respiration en FR et EN avec une capture du panneau.
- **Version locale 2026.10.31** après la soumission de la 2026.10.30 au Chrome Web Store (en attente d'examen, publication automatique après approbation).

## [2026.10.30] - 2026-10-18

### Added

- **Aperçu au survol des favicônes** : titre complet, URL et vignette dans une carte près de l’icône, également au focus clavier dans Respiration. Capture locale prioritaire, service de miniatures selon le réglage existant, indication explicite si indisponible. Chargement à la demande sans rouvrir les onglets ; carte survolable, fermeture avec Échap, position adaptée aux bords de la fenêtre.

## [2026.10.29] - 2026-10-18

### Changed

- **Fini les capsules dans Respiration** : les trois sections (Ouverts / Fermés, à revenir / Fermés par vous) sont toute la vue. Une ligne indique la **prochaine page qui revient au ⌘W** ; l'ordre de retour n'apparaît que s'il y a plusieurs lots, dans un repli expliqué en une phrase. « Capsule suivante » devient « Lot suivant » et n'apparaît que s'il a un sens (deux lots ou plus).
- **Plus de doublon « Pages ajoutées à la fenêtre »** : les pages ouvertes après le lancement rejoignent le lot « Onglets de la fenêtre » ; les anciennes files sont fusionnées au rechargement de l'extension (les pages ne changent pas, seul le regroupement est unifié). La copie de sécurité de ces pages reste créée avant fermeture.

### Fixed

- Le repli de l'ordre de retour ne casse plus le rendu quand il n'y a qu'un seul lot.

## [2026.10.28] - 2026-10-18

### Changed

- **Respiration : trois sections lisibles par état** — le panneau affiche les grilles de favicônes des onglets **Ouverts dans la fenêtre**, des pages **Fermées, à revenir** et des pages **Fermées par vous**. Toutes les pages sont affichées (fini l'échantillon de 24) ; survol = titre et état, clic = active l'onglet ouvert ou rouvre la page. L'ordre de retour (capsules) est replié sous « ordre du prochain retour et organisation » ; « Voir toutes les pages » reste le panneau détaillé (titre, URL, filtres, recherche).
- **Onglet Sessions fluide pendant une restauration massive** : les événements d'onglets sont regroupés par lots (une écriture au lieu d'une par onglet) et la page lit les fenêtres vivantes directement, sans passer par la file d'écritures du service worker. « Tout rouvrir » affiche un bandeau « Ouverture de N onglets… », un squelette de chargement remplace l'écran vide au premier affichage, et les données apparaissent sans changer d'onglet et revenir.

### Fixed

- **Le budget Respiration ne coupe plus une restauration en cours** : les pages ouvertes manuellement sont contrôlées par le cycle périodique (30 s) — sauvegardées puis réduites — au lieu d'une fermeture déclenchée au milieu de l'ouverture de 106 onglets.

## [2026.10.27] - 2026-10-18

### Added

- **Script `scripts/dev.sh`** : synchronise `extension/` vers un dossier dev stable hors du dépôt (`~/dev/pk-web-memory-extension`, surchargeable par `PK_WEB_MEMORY_DEV_DIR`, tests et zip exclus). C'est ce dossier qu'on charge une fois dans `chrome://extensions`. Les fichiers du dépôt (git, tests, éditeur) ne touchent plus le dossier chargé : Chrome ne désactive plus l'extension au redémarrage.

### Changed

- **READMEs FR/EN** : procédure de développement documentée — `bash scripts/dev.sh` puis ↻ Recharger sur PK Web Memory, sans quitter Chrome.

## [2026.10.26] - 2026-10-18

### Changed

- **Respiration : 10 onglets ouverts, un point c'est tout** — l'onglet actif, épinglé, en chargement, le formulaire modifié, l'éditeur rempli et les sites autrefois « exclus » ne sont plus protégés : seuls les N derniers onglets web de la fenêtre restent ouverts, et la **seule exception est une lecture en cours (vidéo ou audio)**, conservée en plus de la cible puis fermée à l'arrêt. Une page ouverte manuellement au-delà de la cible est sauvegardée dans une capsule « Pages ajoutées à la fenêtre » et la réduction reprend (contrôle à chaque chargement de page et toutes les 30 s). Le champ « sites à toujours garder » disparaît du formulaire.

### Fixed

- **« Commande Respiration inconnue »** : un dashboard resté ouvert sur une ancienne version affiche désormais une consigne de rechargement explicite au lieu d'une erreur cryptique.
- **Comptes illisibles** : « 58 ouverts · 43 en attente · 5 traités » devient trois compteurs dédiés — **Onglets ouverts** (x / cible, lectures en cours en plus), **Fermés, à revenir** (sauvegardés puis fermés, reviennent à chaque ⌘W) et **Fermés par vous** (retirés sans retour automatique).
- **« Voir les pages » redevient lisible** : grand panneau proportionné à la fenêtre (88 %), une ligne par page avec favicône, titre et URL complète, code couleur par état (bordure pleine = ouverte, tirets = à revenir, double = fermée par vous), filtre par état et recherche ; la liste se met à jour en direct, un clic sur une page ouverte active son onglet.
- **Réduction vraiment tenue** : l'échec d'injection ne protège plus une page ; si une fermeture échoue, le statut l'explique et « Réduire à N onglets » réessaie.

### Removed

- Capture `respiration-protections.png` remplacée par `respiration-pages.png` (nouveau panneau des pages).

## [2026.10.25] - 2026-10-18

### Fixed

- **Respiration ferme réellement les pages ordinaires** : une iframe (publicité, vidéo intégrée non lue…), un éditeur vide, un champ caché dynamique ou la sélection implicite d’un menu ne sont plus assimilés à une saisie. Le réglage Chrome `autoDiscardable` n’est plus utilisé comme preuve de données non enregistrées. Les formulaires modifiés, éditeurs contenant du texte, médias en cours et exclusions explicites restent protégés.
- **Réparer une tournée existante** : « Reprendre » et « Réduire à 10 onglets » réappliquent la réduction aux pages déjà enregistrées sans recréer la file ni perdre les pages en attente. Après rechargement de l’extension, la fenêtre d’origine est conservée lorsque ses onglets sont encore identifiables.
- **Résultat explicite** : statut « Réduction incomplète » si la cible n’est pas atteinte, nombre de fermetures réelles et raisons de conservation consultables par page. Les pages en attente sont libellées « fermés en attente ».
- **Régressions couvertes** : cas 90 ouverts + 16 en attente, réparation après rechargement, pages réelles contenant iframe/éditeur vide/select/champ caché, et protection d’un brouillon dans une iframe.

## [2026.10.24] - 2026-10-18

### Added

- **Respiration** dans Sessions : gardez les 10 derniers onglets web d’une fenêtre (cible réglable de 1 à 30), sauvegardez les précédents en capsules puis fermez-les. Chaque fermeture avec ⌘W / Ctrl+W fait revenir la prochaine page à gauche, en arrière-plan, dans l’ordre inverse de la pile ; les pages traitées restent retrouvables sans revenir automatiquement.
- **Tournée de capsules** : groupes Chrome conservés comme capsules, ajout de sessions enregistrées, ordre modifiable, capsule suivante, pause/reprise, recherche des pages ouvertes/en attente/traitées. La file complète et sa progression persistent localement et dans la sauvegarde SQLite existante.
- **Protections et reprise** : sauvegarde relue avant fermeture, protection des onglets actifs, épinglés, audibles, sites exclus, formulaires modifiés et éditeurs détectés ; pause après redémarrage, fermeture de fenêtre, déplacement ou fermeture groupée. Aucun remplissage au démarrage, aucune création automatique de fenêtre. Les pages internes sont exclues ; la cible peut être dépassée par les pages protégées et les ouvertures manuelles.

## [2026.10.23] - 2026-10-17

### Changed

- **Pied de description à deux sites** : la fin de la description passe à « Plus d'applications créées par PK-Labs sur https://apps.pouark.com. Découvertes d'outils numériques et pépites design sur https://mondary.design. » — `apps.pouark.com` présente les apps PK, `mondary.design` les outils numériques découverts. Standard repris dans `store/regle-recherche-store.md` et la skill `publish-chrome-web-store` (v3.1.1), avec la note : fiche verrouillée pendant l'examen. Sera soumis avec la prochaine mise à jour de la fiche, la 2026.10.22 étant en cours d'examen.

## [2026.10.22] - 2026-10-17

### Added

- **Règle de marque pour la recherche du Store** (`store/regle-recherche-store.md`) : bloc marque obligatoire — résumé avec « PK-Labs » et/ou « mondary.design », ligne standard unique en fin de description, « URL officielle » `https://mondary.design/` + « URL de la page d'accueil » `https://mondary.design` sur la fiche — pour que toute extension PK ressorte sur les recherches « mondary » et « pk-labs ». Documente l'état vérifié des sept fiches et les commandes de contrôle ; règle aussi ajoutée à la skill `publish-chrome-web-store` (v3.1.0) pour les prochaines soumissions. Constat fondateur : la recherche matche le texte de la fiche, pas le compte développeur (« Proposé par cmondary » affiché depuis le début sans jamais faire ressortir Web Memory).

### Changed

- **Résumé du paquet aligné sur le standard PK-Labs + URL officielle** : « Toute votre vie web organisée par mondary.design : favoris, historique, sessions. Made by PK-Labs. » Sur la fiche, « URL officielle » passe de « Aucune » à `https://mondary.design/` (l'URL de la page d'accueil était déjà remplie) — le lien Développeur qu'affichent les six autres fiches. La 2026.10.20 (résumé + description « mondary.design ») est publiée depuis le 17/10, l'index de recherche suit avec son délai habituel. Paquet + fiche 2026.10.22 envoyés pour examen (publication automatique cochée).

## [2026.10.21] - 2026-10-16

### Fixed

- **Refus automatique de la fiche corrigé** : la première soumission de la mise à jour a été refusée par le contrôle automatique (« Spam et position sur le Chrome Web Store — trop de mots clés dans la description »), phrase visée : « URL, titres, Markdown, HTML, CSV et JSON ». La description a été reformulée (liste de formats supprimée, ligne de marque réduite à une seule URL) et resoumise le jour même ; le paquet et la fiche **2026.10.20** sont en attente d'examen, la version publiée 2026.10.18 reste en ligne. Copie de référence à jour : `store/v4/description-store.md`.

## [2026.10.20] - 2026-10-16

### Changed

- **Découvrabilité « mondary » dans la recherche du Store** : le résumé du paquet cite désormais `mondary.design` (« … organisée par mondary.design … »), comme les six autres extensions PK — la recherche « mondary » ne renvoyait pas PK Web Memory, la plus récente. La description longue de la fiche et le champ « Site web » de la fiche reçoivent la même mention. Copie de référence : `store/v4/description-store.md`.

## [2026.10.19] - 2026-10-16

### Added

- **Kit média v4** (`store/v4/`) : cinq captures 1280×800 pour la fiche Chrome Web Store, neuf scènes 1440×1000 pour la landing, tuile 440×280, marquee 1400×560, bannière 1544×500, carte OG 1200×630, GIF large + compact et un MP4 de démonstration (boucle « recherche ⌘K ») — produits depuis l'interface réelle (extension non empaquetée, profil Chrome for Testing jetable) avec un jeu de données fictif curé : 51 favoris, 9 sessions nommées, archive de visites sur 8 mois. Les kits v1–v3 et la landing actuelle restent en place.
- **Outils de capture reproductibles** : `store/v4/tools/capture-v4.mjs` (scènes, boucle animée, assets ; injections cosmétiques documentées — favicônes Google S2, miniatures réelles ou SVG, curseur incrusté), `store/v4/tools/build-media.sh` (GIF/MP4 via ffmpeg) et `store/v4/media-kit/README.md` (méthode, limites, régénération).

### Fixed

- **Liens de captures des README** : la bannière et les deux captures pointaient vers `store/assets/` (inexistant) — ils utilisent le kit v4 ; le lien « fiche Chrome Web Store » visait `store2/description-store.md` (inexistant) et ouvre désormais la fiche publiée.

## [2026.10.18] - 2026-10-16

### Changed

- **Sauvegarde durable en SQLite** : la sauvegarde automatique ne crée plus de JSON dans le dossier de téléchargements de Chrome (qui peut être le Bureau). L'utilisateur choisit une fois un dossier via le sélecteur système ; l'extension y garde une seule base SQLite et la met à jour après les actions manuelles, au plus une fois par heure pour l'autosauvegarde et au démarrage. La base contient les visites archivées, les pages et les sessions. L'export quotidien JSON dans Téléchargements reste une option distincte, désactivée par défaut, pour l'échange ou une copie manuelle.
- **Restauration depuis SQLite** : après réinstallation, reconnecter le même fichier restaure la bibliothèque de sessions vide depuis sa base avant de la synchroniser. Les nouvelles visites continuent à s'ajouter à l'archive, au-delà de la période conservée par Chrome.
- **Base récupérée préremplie** : `~/Library/Application Support/PK Web Memory/PK Web Memory.sqlite` contient les 52 863 visites (17 juillet–16 octobre 2026), 25 988 pages et 37 sessions (3 090 onglets) extraites de l'ancienne extension. En choisissant `~/Library/Application Support` dans le sélecteur, l'extension reprend cette base au même emplacement.
- **SQLite/WebAssembly local** : ajout de sql.js 1.15.0 et de sa licence MIT dans `extension/vendor/`; aucun code n'est chargé depuis Internet.

## [2026.10.17] - 2026-10-16

### Changed

- **Copie de secours assagie** : `sessions-backup.json` reste un fichier unique écrasé, mais il ne se réécrit plus 2 minutes après chaque changement automatique — au plus une fois par heure pour les sauvegardes auto, toujours 2 minutes après une action manuelle (enregistrement, édition, import), et au démarrage de Chrome si nécessaire.

## [2026.10.16] - 2026-10-16

### Added

- **Copie de secours anti-disparition des sessions** : désinstaller l'extension efface son stockage local — toute la bibliothèque est donc aussi écrite dans `PK Web Memory/sessions-backup.json` (dossier de téléchargements, fichier unique écrasé, mise à jour débouncée 2 min après chaque changement et vérifiée au démarrage). Réglage dédié dans Réglages › Sessions & onglets, actif par défaut.
- **Récupération des fenêtres et onglets récemment fermés** : le bouton « Onglets fermés » de l'en-tête Sessions transforme les 25 dernières entrées « récemment fermés » de Chrome (nouvelle permission `sessions`) en une session de la bibliothèque — de quoi repartir après un accident.
- **Import de sauvegarde enfin branché** : « Importer une sauvegarde » (en-tête Sessions) relit tout fichier `pk-sessions` (export quotidien ou copie de secours) et ajoute ses sessions à la bibliothèque sans écraser l'existant.

### Fixed

- **Fausse promesse de ré-import** : la description de l'export quotidien annonçait un ré-import « dans l'onglet Sauvegardes » qui n'existait pas ; il se fait désormais dans la section Sessions.

## [2026.10.15] - 2026-10-14

### Added

- **Script de publication Chrome Web Store** (`scripts/publish-cws.sh`) : empaquète `extension/` (tests exclus), demande le jeton OAuth, uploade via l'API v2, publie et relit le statut — même protocole que Chrome_PKshortcuts. Identifiants attendus dans `secrets/.env` (ignoré par git), ID d'extension prérempli (`bpbbglmebdopkbmgpehloggencjmfbcd`).

### Fixed

- **Clé publique du manifest alignée sur l'item store** : l'ancienne clé produisait un ID différent de l'extension publiée — les mises à jour ciblent désormais le bon item `bpbbglmebdopkbmgpehloggencjmfbcd`.
## [2026.10.14] - 2026-10-14

### Changed

- **Barre de rappel épinglée en bas de l'écran** : la ligne discrète du tableau de bord ne suit plus la grille — elle reste collée au bas de la fenêtre pendant le défilement (fond translucide, filet supérieur), centrée comme une barre d'état ; la réserve de scroll sous la grille évite qu'une boîte passe dessous.

## [2026.10.13] - 2026-10-14

### Changed

- **Poignée d'élargissement de retour en vue Liste** : la largeur mémorisée par catégorie s'applique aux deux affichages — boîtes de l'index comme cartes — et une boîte seule occupe toujours toute la largeur.
- **Rappel discret en pied de page** : le pavé explicatif qui ouvrait le tableau de bord (préfixes de nom, dossier à plat, gestes) devient une ligne discrète sous la grille, en petit et atténuée.

### Added

- **Raccourcis pour chaque onglet du rail** : Sessions, Ressources et Réglages rejoignent Tableau de bord, Favoris et Historique dans Réglages › Sessions & onglets — six boutons de capture au lieu de trois, sans défaut imposé pour les nouveaux. Au survol d'un onglet, l'infobulle montre la combinaison en vigueur ou « sans raccourci (réglable) ».

## [2026.10.12] - 2026-10-14

### Added

- **Deux affichages pour le Tableau de bord** : « Liste » devient le défaut — un index typographique dense inspiré de designengineer.tools, catégories en boîtes au filet hairline, liens favicon + titre soulignés en transparence qui s'assombrissent à l'arrivée du pointeur, colonnes étroites auto-fit ; « Cartes » conserve la vue précédente (largeur partagée, poignée d'élargissement, titre tiré pour déplacer). Le sélecteur vit dans la barre du tableau de bord et le choix est mémorisé ; glisser-déposer, aperçu au survol, menus et liens morts barrés restent identiques dans les deux modes.

## [2026.10.11] - 2026-10-14

### Added

- **Raccourcis de section paramétrables** : les combinaisons du rail (Tableau de bord / Favoris / Historique) se règlent dans Réglages › Sessions & onglets — clic sur le bouton puis combinaison au clavier, Échap annule, Effacement arrière désactive, et une combinaison déjà attribuée à une autre section est déplacée. Défaut inchangé ⌥⇧D / ⌥⇧B / ⌥⇧H, modifiable quand ⌥⇧ est déjà pris par macOS, Chrome ou une extension ; les info-bulles du rail suivent le réglage.

## [2026.10.10] - 2026-10-14

### Added

- **Raccourcis de navigation entre sections** : `⌥⇧D` ouvre le Tableau de bord, `⌥⇧B` les Favoris et `⌥⇧H` l'Historique ; ils sont ignorés pendant la saisie dans un champ.
- **Archive locale de l'historique Chrome**, activée par défaut : à la première consultation, l'extension importe les visites encore accessibles à Chrome (environ 90 jours selon le profil), puis copie les visites futures au fil de l'eau. Elles restent consultables au-delà de la fenêtre de Chrome ; le réglage permet de suspendre la collecte ou d'effacer l'archive. Les visites déjà supprimées avant l'activation ne sont pas récupérables. Politique de confidentialité et landing FR/EN mises à jour.

## [2026.10.9] - 2026-10-14

### Added

- **Aperçu de la page au survol d'un lien du Tableau de bord** : un panneau flottant montre la miniature du site — même service mshots et même cache local de 30 jours que la galerie, avec repli favicon si le pont manque ou en mode « favicons uniquement » — accompagnée du titre et de l'adresse. Il se place à droite de la ligne (à gauche s'il n'y a pas la place) et disparaît au clic, au défilement, à l'Échap, au glisser-déposer ou quand le pointeur s'en va ; ignoré sur écran tactile. Test navigateur : apparition, contenu et disparition vérifiés, capture d'aperçu facultative via `DASHBOARD_SHOTS`.

## [2026.10.8] - 2026-10-14

### Changed

- **Largeur des cartes optimisée par défaut** : la grille s'adapte au nombre de cartes — deux cartes se partagent la largeur en deux, trois en trois, et quand elles ne tiennent plus on passe à la ligne ; fini les pistes vides qui laissaient des cartes minuscules tassées à gauche (passage d'auto-fill à auto-fit). La poignée et le menu ⋯ continuent de forcer une largeur précise par-dessus ce défaut, et le calcul des colonnes ignore désormais les pistes repliées.

### Added

## [2026.10.7] - 2026-10-14

### Added

- **Cartes à la carte** : chaque catégorie s'élargit à la demande — poignée sur le bord droit, la carte s'étale sur 2, 3 colonnes ou toute la largeur, un badge nomme la largeur visée et elle est mémorisée par catégorie ; une catégorie seule occupe d'emblée toute la largeur, plus de carte minuscule perdue dans un coin. Le menu ⋯ propose « Carte plus large / plus étroite » pour le faire au clic.
- **Ordre des cartes à la main** : une carte se déplace en tirant son titre devant ou derrière une autre (la carte « Sans catégorie » reste en tête), l'ordre est mémorisé localement et les flèches du menu ⋯ restent disponibles.
- La ligne de rappel du tableau de bord et l'écran de configuration mentionnent les deux gestes (poignée, titre tiré) ; README FR/EN, description du réglage et vitrine FR/EN synchronisés. Trois tests navigateur de plus : élargissement par poignée mémorisé et conservé après rechargement, réordonnancement en tirant le titre (ordre persisté), carte unique pleine largeur.

## [2026.10.6] - 2026-10-13

### Changed

- **Catégories = préfixes de nom, le dossier reste à plat** : plus de sous-dossiers dans le Tableau de bord — « Travail — GitHub » range le lien dans la catégorie « Travail », sans préfixe il reste en « Sans catégorie ». Les sous-dossiers hérités sont aplatis automatiquement au premier affichage (le nom du dossier devient le préfixe) ; renommer une catégorie réécrit le préfixe de chacun de ses liens, la supprimer ne retire que le préfixe — les liens restent dans le dossier. L'ordre des cartes et les catégories vides vivent en stockage local, la liste des liens reste exactement celle du gestionnaire de favoris Chrome.

### Added

- **Petit favicon pour le dossier du tableau de bord** : la puce d'en-tête et le bouton de création portent le quadrillage de la section — le dossier hôte se reconnaît au premier coup d'œil (Chrome ne permet pas de poser un vrai favicon sur un dossier de favoris).
- **Tableau de bord plus lisible** : une ligne de rappel au-dessus de la grille nomme le dossier affiché et pose la règle une fois pour toutes (« chaque catégorie est un préfixe de nom ») et signale que les actions apparaissent au survol d'une carte.
- **Crayon visible pour renommer une catégorie** : le bouton ✏️ s'ajoute entre « ajouter l'onglet » et le menu ⋯ de chaque carte (le double-clic sur le titre reste valable) ; au survol du titre, l'infobulle nomme le préfixe correspondant au lieu d'une consigne.
- **État vide du dossier** : un dossier sans aucun enfant affiche un message qui indique par où commencer (« Nouvelle catégorie » ou « Onglet courant ») au lieu d'une grille vide.
- Le bouton d'en-tête devient « Nouvelle catégorie » avec une infobulle qui rappelle la règle du préfixe, et « Onglet courant » précise qu'il pose le lien dans la carte « Sans catégorie ». Test navigateur réécrit pour le modèle à plat : préfixes, aplatissement d'un sous-dossier hérité, réécriture des préfixes au renommage et au changement de catégorie, puce-favicon, glisser-déposer et sémantique de position de `chrome.bookmarks.move` vérifiés.

## [2026.10.5] - 2026-10-13

### Added

- Capture réelle du **Tableau de bord** dans la vitrine (`store/website/screenshots/09-dashboard.png`) : le jeu de démonstration range désormais ses 19 favoris dans un dossier « Dashboard » en quatre catégories, si bien que la capture, l'inventaire et le tableau de bord racontent la même histoire. Le rapport de provenance suit `dashboard.js` et `dashboard.css`.
- Test navigateur `extension/tests/dashboard.browser.test.mjs` : charge la vraie extension dans un profil Chrome jetable et vérifie le rendu (catégories, dossiers imbriqués, catégorie vide, liens racine), l'ouverture par le réglage « Page d'accueil », les écritures (onglet courant, lien manuel, création, renommage, suppression vers la poubelle), le filtre et la sémantique de position de `chrome.bookmarks.move` sur laquelle repose le glisser-déposer. Ignoré sans Chrome for Testing ; captures facultatives via `DASHBOARD_SHOTS`.

### Fixed

- `store/website/tools/capture.mjs` ne trouvait plus ses chemins depuis la réorganisation de `store/` : la racine visait `store/` au lieu du dépôt, rendant tout le script inutilisable. Corrigé, et les captures redeviennent déterministes : la section Favoris est imposée avant la première image (le service worker réécrit le réglage de page d'accueil en « sessions ») et la capture du tableau de bord passe en dernier, la section Backup ayant besoin de revenir sur les favoris.

### Changed

- Landing bilingue et hub des apps synchronisés avec le Tableau de bord : nouvelle carte dans la section « Tout le terrain de jeu » avec la capture réelle (FR et EN), mention dans le texte d'accroche, dans la carte « Page d'accueil » et dans l'entrée `Web_HubApps` — accroche, description et points de feature mis à jour dans les deux langues.
- README FR/EN : ligne « Tableau de bord » dans le tableau des fonctionnalités, portée du produit, note sur le stockage et commande de test. Le README anglais récupère au passage les deux conventions de version qui n'y figuraient pas.

## [2026.10.4] - 2026-10-13

### Added

- Nouvelle section **Tableau de bord** : une page de liens utiles adossée à un dossier de favoris Chrome choisi dans les réglages (détection automatique d'un dossier « Dashboard », « Tableau de bord » ou « Liens utiles » au premier lancement, création en un clic dans « Autres favoris » sinon). Chaque sous-dossier devient une catégorie, chaque favori un lien avec son favicon — le favicon cède la place à une flèche au survol, un lien mort confirmé par le scan est barré.
- **Édition complète depuis la page** : ajout de l'onglet courant dans une catégorie (avec repli sur le dernier onglet web si le tableau de bord est la page « nouvel onglet »), création d'une catégorie, ajout d'un lien à la main (`https://` ajouté automatiquement), renommage en place d'un lien ou d'une catégorie par double-clic, réordonnancement et changement de catégorie par glisser-déposer, filtre de recherche. Les favoris supprimés partent à la poubelle de l'app, restaurables dans Sauvegardes ; les dossiers de catégorie sont modifiés via l'API Chrome, donc visibles à l'identique dans le gestionnaire de favoris.
- Bloc de réglages **Tableau de bord** : choix du dossier de favoris affiché (tous les dossiers, avec leur chemin) et mode d'ouverture des liens (nouvel onglet ou onglet courant, comme une page d'accueil).
- Le Tableau de bord rejoint les sections proposées par le réglage **Page d'accueil (nouvel onglet)** : Ctrl+T peut désormais ouvrir directement les liens utiles.

## [2026.10.3] - 2026-10-02

### Changed

- Réorganisation du dossier `store/` : les anciennes itérations de la vitrine sont archivées (`store/v1/` assets Chrome Web Store, `store/v2/` et `store/v3/` landings précédentes) et les doublons de `store4/` sont supprimés, son contenu vivant désormais dans `store/website/` (landing bilingue FR/EN). Aucun changement de comportement de l'extension.

## [2026.10.2] - 2026-10-01

### Added

- Landing synchronisée FR/EN avec détection de la langue préférée du navigateur et bascule manuelle mémorisée ; liens GitHub et Ko-fi présents en desktop et mobile. Les captures et la démo indiquent explicitement que l'interface produit reste en français.

## [2026.10.1] - 2026-10-01

### Added

- **Soutien mis en avant** : l'encart « Soutenir sur Ko-fi » passe en tête de l'onglet Réglages et en tête de l'onglet « Mes autres extensions », avec un vrai bouton aux couleurs Ko-fi (#FF5E5B) — le même style pour le bouton de « À propos ». Chaque encart gagne une vignette café + cœur, masquée sous 640 px.
- **En-têtes illustrés** pour les six blocs de l'onglet Réglages (Général, Scan des liens morts, Quarantaine, Galerie & miniatures, Sessions & onglets, Données locales) : chaque titre de bloc gagne une vignette SVG inline en en-tête — interrupteurs, loupe de scan, étagère de quarantaine, planche de miniatures, fenêtre de session, base de données. Aucune image ajoutée, aucun impact sur la taille de l'extension ; les vignettes se masquent sous 720 px.

## [2026.09.75] - 2026-09-30

### Added

- **Intervalle de rafraîchissement réglable** dans le moniteur Ressources : 1 s / 2 s / 5 s / pause, persisté localement (`bs.resources`), partagé entre la section et le panneau latéral. En pause, la pastille « live » devient grise et le dernier relevé reste affiché.

### Fixed

- La section Ressources n'affiche plus les boutons favoris (Export JSON/HTML, Réanalyser, statut de synchronisation), comme les autres sections non-favoris.
- Le bouton **Rechercher** (⌘K) est désormais toujours le dernier élément en haut à droite de l'en-tête, quelle que soit la section ; les autres contrôles s'organisent à sa gauche.

## [2026.09.74] - 2026-09-30

### Added

- Colonne **réseau** par onglet : octets téléchargés depuis le chargement de la page (`PerformanceResourceTiming.transferSize`, navigation incluse), total consolidé dans l'en-tête. Le buffer de resource timing est porté à 10 000 entrées au premier relevé pour limiter le sous-comptage. Zéro permission supplémentaire.

### Changed

- **Position de défilement conservée** : le rafraîchissement de 2 s met à jour les lignes en place (réutilisation par onglet) au lieu de reconstruire la liste — plus de retour en haut.
- Le pied de liste et le survol précisent la mesure : heap JS = objets JavaScript, l'empreinte mémoire de Chrome (Maj+Échap) inclut en plus DOM, images et GPU (environ 2 à 3× ce heap).

## [2026.09.73] - 2026-09-30

### Added

- Nouvelle section **Ressources** : heap JavaScript live par onglet (échantillon toutes les 2 s), barre de poids relative, tendance ↗/↘/→ et activation de l'onglet au clic. Le survol d'une ligne détaille heap utilisé / alloué / limite et l'évolution depuis le relevé précédent.
- **Panneau latéral Chrome** (clic droit sur l'icône PK Web Memory → « Ouvrir le panneau latéral ») : le même moniteur en continu, avec le heap de la vue PK Web Memory elle-même en tête de liste. Le relevé se met en pause quand le panneau est masqué.
- Onglets endormis/gelés et pages non injectables (chrome://, Web Store, autres extensions) listés mais explicitement non mesurables — jamais réveillés pour la mesure.
- Permissions « scripting » et « sidePanel » : lecture ponctuelle de `performance.memory` via `chrome.scripting.executeScript`, sans content script permanent (hôtes déjà couverts par `http/https`).

## [2026.09.72] - 2026-09-30

### Added

- Rappel des réglages en tête d'onglet : Sessions affiche le planning actif (« Session quotidienne : tous les jours à 07:00 · export fichier · sauvegarde 5 min »), Historique sa fenêtre de balayage, Galerie sa source de miniatures et ses colonnes. Un clic ouvre Réglages sur le bloc concerné, brièvement mis en évidence.
- Export fichier quotidien (optionnel) : la session quotidienne est déposée en JSON dans le dossier de téléchargements de Chrome, sous-dossier « PK Web Memory », au format ré-importable dans l'onglet Sauvegardes. Les sessions ne vivant sinon que dans le stockage local de l'extension (LevelDB du profil Chrome, inutilisable par lien symbolique), ce fichier est la voie de sauvegarde externe : pointez le dossier de téléchargements vers votre Google Drive pour une copie automatique. Nouvelle permission « downloads ».

### Changed

- « Session quotidienne » est cochée par défaut (heure 07:00) : les installations existantes qui n'y ont jamais touché basculent une seule fois ; toute désactivation ultérieure est respectée.

## [2026.09.71] - 2026-09-29

### Changed

- Vue Liste de la galerie refondue sur le modèle du gestionnaire de favoris Chrome : carte plate, lignes de 40 px, favicon de 16 px, titre aéré, URL révélée au survol ou au focus et menu ⋮ toujours accessible. « Supprimer » est désormais une action explicite du menu au lieu d’être déclenchée directement par l’icône.

## [2026.09.70] - 2026-09-29

### Fixed

- Galerie réparée : la déclaration `galleryFolder` avait été perdue lors du refactor 2026.09.68 — `galleryApply()` jetait une exception, la galerie restait vide et le reste du recalcul (liens morts, poubelle, statut) était sauté. La bascule Miniatures / Liste, absente du markup pour la même raison, est réinjectée.

### Added

- Poubelle : une ligne par URL — les copies successives du même lien se regroupent (×N) ; « Réajouter » recrée un seul favori et retire toutes les copies, « Retirer » les efface du registre d'un coup.

### Changed

- Onglets renommés : « Cimetière » → « Poubelle », « Backup » → « Sauvegardes », avec une note d'intro distinguant exports (fichiers téléchargés) et instantanés locaux restaurables.
- Terminologie harmonisée : le bouton de groupe dit « Retirer les doublons (N) », cohérent avec l'onglet Doublons.
## [2026.09.69] - 2026-09-29

### Added

- Onglet Doublons : bouton « Actualiser » à côté des niveaux — relit les favoris Chrome et recalcule les groupes. Le calcul restait déjà live (tout changement de favori déclenche un rescan silencieux), le bouton donne un geste explicite sans passer par le « Réanalyser » de l'en-tête.
## [2026.09.68] - 2026-09-29

### Added

- Vue « Liste » dans la galerie : favicon, titre, URL, suppression ; même recherche, filtre par dossier et pagination que la galerie miniature. Bascule Miniatures / Liste persistée, le contrôle « Colonnes » se masque en mode liste.

### Changed

- Affichage des sessions : défaut changé en « aperçu + favicons » (sans miniatures de ligne) — les bibliothèques existantes avec l'ancien défaut « aperçu + miniatures + favicons » sont migrées automatiquement ; le choix reste modifiable dans Réglages.
- Compteur galerie : affiche « 60 affichés sur 209 » tant que le défilement infini n'a pas tout chargé, au lieu du total brut seul.

## [2026.09.67] - 2026-09-29

### Fixed

- Historique de navigation : les maillons de redirection ne sont plus comptés. Une visite dont la visite suivante la référence (referringVisitId) moins de 1,2 s après — http→https, préfixe www., liens google.fr/url, raccourcisseurs — est retirée du décompte, comme chrome://history qui n'affiche que la destination. Chaque clic via redirection comptait deux fois ; les cartes aujourd'hui / 7 jours / mois / année et le calendrier retrouvent des chiffres fidèles (vérifié : comptage identique aux visites réelles du profil sur navigations directes).
## [2026.09.66] - 2026-09-29

### Fixed

- Dédoublonnage : « Mettre les doublons en quarantaine » et les segments de niveau se réactivent après chaque action — ils restaient désactivés (curseur interdit) après un premier nettoyage, tant que la page n'était pas rechargée.

## [2026.09.65] - 2026-09-28

### Added

- Vitrine `store4/`, copiée depuis `store3/` conservé intact : huit captures réelles de l'extension, agrandissement accessible, textes détaillés, installation et FAQ.
- Playground autonome à données fictives, reconstitution pleine largeur du tableau de bord réel (rail, onglets, palette ⌘K, timeline de sessions, tiroir « Enregistrer & fermer ») : recherche groupée par source, galerie filtrable, quarantaine des doublons annulable, fermeture/réouverture d'onglets, restauration sans doublons, historique à densité réaliste (tuiles 147/1 128/4 146/50 602 visites, calendrier heatmap pleine largeur façon GitHub — jours de semaine, mois ancrés, légende — labels sans chevauchement, échantillon par jour), sessions des jours précédents datées et volumineuses (52/48/37 onglets en mosaïque de favicônes), fenêtre en cours sans miniatures. Miniatures et favicônes réelles via mshots et Google S2 (repli local). Aucune API Chrome ni persistance utilisateur.
- Pipeline `store4/tools/capture.mjs` : Chrome for Testing headless avec profil jetable, sans modification du rendu produit ; rapport de provenance et empreintes des captures. Aucun élément de l'interface n'est modifié.

## [Unreleased]

## [2026.09.64] - 2026-09-28

### Added

- Bouton « Dédupliquer » sur la session en cours : ferme les onglets ouverts en double (la première occurrence de chaque URL est gardée, jamais l'onglet actif ni les épinglés), avec annulation « Rouvrir » dans le toast — le pendant ouvert du dédoublonnage des sessions enregistrées et de la pastille « Onglets en double ».
## [2026.09.63] - 2026-09-28

### Changed

- Renommage : **PK Web Memory** — « Votre vie web, organisée. » L'extension ne se limite plus au tri de favoris : manifest (nom, description, titre de l'icône), en-tête et écran À propos, page vitrine store2, politique de confidentialité (store et store2) et README FR/EN passent au nouveau nom. Nouvelle fiche Chrome Web Store bilingue (store2/description-store.md) avec le positionnement « mémoire web » : recherche globale, sessions, veille native, pastille, page d'accueil, galerie, nettoyage et sauvegarde.
## [2026.09.62] - 2026-09-28

### Fixed

- Session quotidienne réparée : l'alarme n'était jamais recréée après la première migration, et un rechargement de l'extension (ou Chrome fermé à l'heure choisie) cassait la chaîne silencieusement. Désormais l'alarme est reprogrammée à chaque démarrage/installation et la session du jour est rattrapée à l'ouverture si l'heure choisie est passée.
## [2026.09.61] - 2026-09-28

### Changed

- Réglage « Affichage des sessions » à quatre niveaux : aperçu + miniatures + favicons (défaut), aperçu + favicons, miniatures + favicons, favicons seuls. Le grand aperçu à gauche et les miniatures de ligne se masquent désormais indépendamment — « favicons seuls » ne laisse plus subsister l'aperçu.
## [2026.09.60] - 2026-09-28

### Added

- Badge « Zzz » sur le favicon des onglets endormis dans la timeline (en plus de l'icône lune de la ligne).
- Récapitulatif « Onglets en veille » : le compteur « N en veille » de la session en cours ouvre un dialogue listant chaque onglet endormi (favicon, titre, URL d'origine complète) avec réveil en un clic. La veille étant un discard natif de Chrome, l'URL d'origine n'est jamais réécrite : même extension supprimée, aucun onglet ni URL ne peut être perdu.
## [2026.09.59] - 2026-09-28

### Fixed

- Pastille « Onglets en double » : compte désormais les onglets ouverts en double (même page ouverte plusieurs fois), et non plus les favoris en double. Rafraîchie aussi à la navigation d'un onglet.
## [2026.09.58] - 2026-09-28

### Added

- Réglage « Lignes de session » : choix entre favicon + miniature (aperçu au survol inclus, comportement actuel) et favicon seul — indépendant de la capture des pages visitées.

### Changed

- Mosaïque des archives : grille complète de tous les favicons de la session, plus de plafond à 12 ni de « +N ».
## [2026.09.57] - 2026-09-28

### Added

- Page d'accueil (nouvel onglet) : l'extension devient la page Ctrl+T de Chrome et s'ouvre sur la section choisie dans Réglages › Sessions & onglets — Sessions (par défaut), Favoris · Inventaire, Favoris · Galerie, Historique de navigation, Groupes d'onglets, ou « Désactivée » (ouverture sur les favoris). Le choix s'applique aussi à l'icône de la barre d'outils.
## [2026.09.56] - 2026-09-28

### Changed

- Mosaïque des archives pleine largeur, sous le nom de la session : favicons en tuiles carrées qui remplissent la ligne (12 max, « +N » au-delà), nom et actions restant sur la ligne d'en-tête.
## [2026.09.55] - 2026-09-28

### Changed

- Archives toujours dépliées en bas de timeline : plus de bouton de repli, chaque session archivée affiche désormais sa mosaïque de favicons (12 max, « +N » au-delà) pour reconnaître son contenu d'un coup d'œil.
## [2026.09.54] - 2026-09-28

### Added

- Pastille sur l'icône de la barre d'outils : nombre d'onglets ouverts (par défaut) ou de favoris en double — au choix dans Réglages › Sessions & onglets, « Aucune » pour la désactiver (Chrome n'affichant qu'un seul nombre). Mise à jour en direct à chaque onglet ou supprimé, favori modifié ou réglage changé.
## [2026.09.53] - 2026-09-27

### Added

- Export complet façon Tablerone : « Exporter… » sur chaque session enregistrée et sur la session en cours propose six formats — URL, titres, Markdown, HTML, CSV, JSON — copiés dans le presse-papiers ou téléchargés en fichier nommé d'après la session (le CSV avec notes se colle dans Sheets, Notion, Airtable…). « Copier les URL » reste l'accès rapide ; le bouton Markdown est remplacé par le dialogue.
- « Sélection… » sur la session en cours : seuls les onglets cochés deviennent une session (nom optionnel, « Enregistrer & fermer » disponible, épinglés conservés) — le « save just the selected ones » de Tablerone.
- Carte « Reprendre » en tête de timeline à tab zéro : la dernière session d'un jour précédent (hors favoris) resurge avec « Tout rouvrir » ; « Masquer » mémorise la plus récente écartée, une session plus récente reviendra le lendemain.
## [2026.09.52] - 2026-09-26

### Added

- Section « Archives » repliable en bas de la timeline : les sessions archivées y sont enfin retrouvables, une ligne compacte chacune (titre, onglets, jour) avec Restaurer, Tout rouvrir et Supprimer définitif (confirmation demandée). Les copies internes « · avant … » des annulations restent cachées.
- Repère de position dans les longues sessions : l'aperçu collant affiche le total d'onglets, puis « 12 / 125 » à la ligne survolée.

### Changed

- Retours précis à la place du générique « Session mise à jour » : mise en favori (« groupe Favoris, en tête de la timeline » / retour au jour), dédoublonnage (« aucun doublon : N onglets distincts » ou « X doublon(s) retiré(s) : N → M onglets », annulable), archivage (« section Archives, en bas de la timeline »).
- Après une fusion ou un dédoublonnage, la timeline défile jusqu'à la session concernée et la fait cligner pour montrer où elle se trouve.

## [2026.09.51] - 2026-09-26

### Added

- Session quotidienne paramétrable : à l'heure choisie (07:00 par défaut), tous les onglets ouverts deviennent une session datée « Session du jour » — une seule par jour, reprogrammée au lendemain par alarme. L'option « Repartir à vide » ferme ensuite les onglets enregistrés (épinglés conservés) en laissant un onglet neuf par fenêtre : chaque matin démarre sur une session live vide.
- Fusion vers la session en cours : « Fusionner… » sur la fenêtre live ouvre les onglets des anciennes sessions cochées directement dans cette fenêtre (sources archivées, annulation via le toast qui referme les onglets ouverts).
- « Renommer » sur la session en cours : nomme la fenêtre live (nom, tags, note) et l'enregistre comme session en un geste.
- Groupe « Favoris » en tête de timeline : les sessions étoilées y sont épinglées, à côté de « En cours », pour les retrouver sans chercher par jour.

### Changed

- Outils de session (Retirer les doublons, Fusionner, Copier les URL, Markdown, Archiver) désormais visibles même repliés — plus besoin de « Afficher les N onglets » pour y accéder.
- Boutons « Enregistrer la session » / « Enregistrer & fermer » retirés de l'en-tête Sessions : ils dupliquaient ceux de la session en cours, qui reste seule porte d'entrée.

### Fixed

- Tiroir de dialogue qui restait épinglé en haut de la fenêtre : les styles natifs du `<dialog>` (inset 0) l'emportaient sur l'ancrage bas ; `top: auto; right: auto` le fixe désormais en bas de l'écran.

## [2026.09.50] - 2026-09-26

### Added

- Sessions : chaque ligne affiche désormais en permanence une miniature de capture en petit — capture locale d'abord, puis repli sur le service de miniatures de la galerie selon le réglage « Source des miniatures » (lecture groupée en une requête). Un clic sur la miniature ouvre la vue élargie de la session sur cette page ; l'aperçu de la session en cours montre par défaut l'onglet actif. La session en cours reste en permanence en version élargie (grand aperçu), les anciennes sessions gardent la colonne étroite. Nouvelle action « Fusionner… » : les onglets de plusieurs sessions cochées rejoignent une session cible, les sources sont archivées et la fusion reste annulable (copie « avant fusion »).

### Changed

- Section « Groupes d'onglets » masquée temporairement dans le rail latéral (fonctionnement instable) ; le code reste en place pour une réactivation ultérieure.
- « Tout rouvrir » lance la session entière dans une seule nouvelle fenêtre, focalisée à la fin de l'ouverture (la structure multi-fenêtres reste enregistrée).

### Fixed

- Dialogues sessions (fusion, modification, note) : le reset `* { margin: 0 }` collait le `<dialog>` natif en haut à gauche, et ses boutons « Fermer »/« Annuler » ne répondaient pas (écouteur lié à la section seulement). Ils s'affichent désormais en tiroir bas animé, fermable par bouton, clic sur le fond assombri ou Échap ; les toasts passent en haut de l'écran pendant l'ouverture.
- Compteur « onglets ouverts » figé après une action longue (restauration de 100+ onglets) : les rafraîchissements déclenchés pendant l'action étaient perdus et aucun rafraîchissement final n'avait lieu en cas d'erreur. Chaque action rejoue maintenant un rafraîchissement à sa fin, un auto-contrôle silencieux toutes les 10 s corrige seul tout écart, et le rendu ne reconstruit la timeline que lorsque les données changent réellement (survols et miniatures préservés). Les pages internes exclues du décompte s'affichent désormais explicitement (« + N page(s) interne(s) »).

## [2026.09.49] - 2026-09-26

### Added

- Sessions refondues en timeline fusionnée depuis la variante src3 : la session en cours reste dépliée en tête, une croix par ligne ferme l'onglet courant ou retire un lien enregistré (toujours annulable via une copie archivée), les sessions passées se déplient sur place, un aperçu de page suit la ligne survolée ou focalisée et un clic sur l'aperçu élargit la vue. Captures réalisées localement par le service worker (30 jours, désactivables), « Enregistrer & fermer » sans formulaire, mise en veille des onglets inactifs (15/30/60 min) et recherche globale qui indexe aussi les sessions enregistrées. Les anciens instantanés sont migrés automatiquement ; réglages « Sessions & onglets » dans la section Réglages.

### Changed

- Suppression de la variante intermédiaire `src2/` (doublon de travail, historique git conservé) ; `src3/` reste temporairement comme référence de la fusion.
- Sauvegarde automatique des sessions : cadence fixe de 5 minutes, 20 versions distinctes (au lieu de 12 auto / 7 jours + 28 manuelles) ; un favori devient une session permanente.

## [2026.09.48] - 2026-09-25

### Changed

- En-tête : un pictogramme noir sobre par section (favoris, historique, groupes d'onglets, sessions, réglages), identique au rail latéral ; l'icône PK colorée reste réservée à la barre d'outils Chrome et à la page À propos.

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
