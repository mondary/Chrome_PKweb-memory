# Stockage des groupes d'onglets sauvegardés et des sessions Chrome — enquête locale

Enquête en **lecture seule** menée le 2026-09-24 sur ce Mac (macOS 27.0, Chrome 153.0.8010.53, Chrome en cours d'exécution pendant l'inspection). Aucun fichier de Chrome n'a été lu, copié ni modifié ; seules des vérifications de présence (`stat` sur chemins exacts) ont été possibles — voir le blocage ci-dessous. Aucune URL ni titre personnel n'apparaît dans ce document.

## Conclusion courte

Le dossier de données de Chrome (`~/Library/Application Support/Google/Chrome`) est **protégé par le système sur ce Mac** : toute lecture de contenu (y compris un simple `ls` du dossier, `cat` du JSON Bookmarks, `strings` sur les LevelDB) renvoie `Operation not permitted` depuis cet environnement, shell comme outils fichiers. L'enquête s'est donc arrêtée au niveau des métadonnées (taille, date, existence). D'après la connaissance du fonctionnement de Chrome — **à confirmer avec le protocole du §6, non vérifiable ici** — les groupes d'onglets sauvegardés ne sont **pas** stockés comme dossiers dans le fichier `Bookmarks` JSON : ils vivent dans un modèle distinct, persisté dans le LevelDB de synchronisation du profil (`Default/Sync Data/LevelDB`), tandis que le fichier `Bookmarks` ne contient que les nœuds favoris classiques.

## 1. Blocage constaté (important pour toute suite)

- `ls ~/Library/Application Support/Google/Chrome` → `Operation not permitted`. Idem pour `~/Library/Safari` et `~/Library/Cookies`.
- En revanche `~/Library/Application Support/Google` (liste), `Google/DriveFS`, `Chromium`, `Chrome Canary`, `Chrome for Testing`, `Chrome-headless` restent listables. Le refus vise donc **spécifiquement les données de navigation**, pas le dossier d'accueil en général : signature d'une protection macOS (TCC / « Accès complet au disque » non accordé aux processus utilisés ici), ou d'un sandbox les ciblant.
- `stat` sur des chemins exacts fonctionne : on sait qu'un fichier existe, sa taille et sa date, mais jamais son contenu. `mdls` et `xattr` sont également refusés.
- Conséquence : les étapes « grep des marqueurs dans Bookmarks » et « strings | grep -i group sur les .ldb » **n'ont pas pu être exécutées** sur ce Mac. Elles sont reprises au §6 comme protocole à faire tourner dans un Terminal disposant de l'accès complet au disque.

## 2. Profils détectés

- Un seul profil détecté par sonde d'existence : **`Default`** (`…/Google/Chrome/Default`). Les répertoires `Profile 1` à `Profile 6` n'existent pas (sondes `stat` négatives).
- Limite : `Local State` (qui contient `profile.info_cache`, l'énumération officielle des profils) est présent (23 881 octets, modifié ce jour) mais illisible ici ; l'énumération n'a donc pas pu être faite par ce biais.

## 3. Inventaire vérifié (métadonnées uniquement)

Tous les chemins sont relatifs à `~/Library/Application Support/Google/Chrome`.

| Chemin | Taille | Modifié le | Rôle |
|---|---|---|---|
| `Default/Bookmarks` | 5 286 921 o | 2026-09-24 18:27 | JSON des favoris (voir §4). Réécrit en continu : son mtime a avancé de ~1 h pendant l'inspection, Chrome tournant. |
| `Default/Bookmarks.bak` | 5 680 803 o | 2026-09-24 08:50 | Sauvegarde de la réécriture précédente du JSON. |
| `Default/Sessions/` | — | 2026-09-24 (dossier vivant) | Sessions de restauration, format binaire SNSS (§5). Contenu non énumérable ici. |
| `Default/Sync Data/LevelDB/` | — | dossier présent | Base LevelDB de synchronisation (voir §5). |
| `Default/Sync Data/LevelDB/CURRENT` | 16 o | 2026-07-12 | Pointeur LevelDB classique : confirme une vraie base LevelDB. |
| `Default/Sync Data/LevelDB/LOCK` | 0 o | 2026-07-12 | Verrou LevelDB. |
| `Default/Preferences` | 802 329 o | 2026-09-24 18:28 | Préférences du profil (JSON, réécrites en continu). |
| `Default/History` | 77 070 336 o | 2026-09-24 18:26 | Historique SQLite. |
| `Local State` | 23 881 o | 2026-09-24 18:25 | État global (énumération des profils via `profile.info_cache`). |

Probes négatives (absence aux chemins testés, preuve non exhaustive) : aucun dossier `Default/Saved Tab Groups`, `Default/Tab Groups`, `Default/Shared Tab Groups`, ni équivalent sous `Default/Sync Data/` ; pas de dossier `Sessions` ni `Sync Data` à la racine du user-data-dir (ils sont bien **par profil**). Les autres familles Chrome du Mac (`Chrome Canary`, `Chrome for Testing`, `Chrome-headless`) ne contiennent aucun profil exploitable (pas de `Bookmarks`).

## 4. Le fichier `Bookmarks` contient-il les groupes sauvegardés ?

**Non vérifiable ici** (contenu illisible). État des connaissances, à confirmer via §6 :

- Le JSON `Bookmarks` sérialise uniquement le modèle de favoris : racines `roots.bookmark_bar` / `other` / `synced`, nœuds à champs `children`, `date_added` (timestamps Chrome µs), `guid`, `id`, `name`, `type` (`"url"` ou `"folder"`), et `url` pour les feuilles. Aucun champ prévu pour les groupes d'onglets.
- Les groupes d'onglets sauvegardés (fonction « Enregistrer le groupe ») sont gérés par un modèle séparé (SavedTabGroupModel) côté navigateur. Ils **s'affichent** dans la barre de favoris / dans le gestionnaire de favoris (superposition d'interface), mais ne sont **pas des nœuds du modèle de favoris** : l'export HTML du gestionnaire de favoris ne les embarque pas, et ils n'apparaissent donc pas comme dossiers dans `Bookmarks`.
- Leur persistance durable passe par la synchronisation : entités de type « saved tab group » stockées dans le LevelDB de sync du profil (`Default/Sync Data/LevelDB/`, éventuellement `Sync Data/LevelDB/` à la racine selon les versions), avec leurs métadonnées. Les « groupes partagés » ajoutent des données de collaboration du même ordre.

Un dossier dans `bookmark_bar` n'est donc **pas** la preuve d'un groupe sauvegardé ; la distinction ne se voit pas dans le JSON (dossier = simple dossier).

## 5. Sessions (fichiers SNSS) et autres candidats

- `Default/Sessions/` existe et est actif sur ce profil. Rôles connus du format SNSS (binaire Chrome, non parsé ici) : d'un côté les commandes de restauration de fenêtres/session, de l'autre les piles de navigation par onglet. Historiquement nommés `Current Session`, `Current Tabs`, `Last Session`, `Last Tabs` (session courante et précédente) ; les versions récentes de Chrome utilisent des noms tournants du style `Session_<n>` / `Tabs_<n>`. **Aucun de ces noms exacts n'a été trouvé par sonde sur cette machine** (plages testées : noms historiques, `Session_/Tabs_` 1–30 000) : le schéma de nommage de Chrome 153 sur ce poste n'a pas pu être confirmé, le dossier ne pouvant pas être listé. Aucun de ces fichiers n'est lisible par une extension Chrome.
- `Default/Sync Data/LevelDB/` : base LevelDB (confirmée par `CURRENT`/`LOCK`). C'est le stockage des entités de synchronisation et des « ModelTypeStore » par type de données — c'est là que vivent les groupes d'onglets sauvegardés quand la sync est active (et leur stockage local durable dans le cas contraire). Les fichiers `.ldb` y sont binaires et compressés ; une inspection `strings` ne donne que des fragments, jamais une structure fiable. Non inspectable ici (EPERM), cf. §6.
- Candidats écartés par sonde : dossiers nommés d'après « group »/« shared » — inexistants aux emplacements testés (§3). Sur ce Mac, tout ce qui touche aux groupes sauvegardés transite donc par le LevelDB de sync, pas par un dossier dédié.

## 6. Protocole de vérification (à exécuter dans un Terminal disposant de l'accès complet au disque)

À lancer soi-même, en lecture seule, pour transformer les §4–5 en constats locaux (aucune donnée sensible dans les sorties des commandes 2 et 4 si on ne montre que les clés) :

1. Profils réels : `python3 -c "import json;print(list(json.load(open('$HOME/Library/Application Support/Google/Chrome/Local State'))['profile']['info_cache']))"`
2. Marqueurs de groupes dans le JSON Bookmarks (probablement vide, c'est la réponse attendue) :
   `strings "$HOME/Library/Application Support/Google/Chrome/Default/Bookmarks" | grep -iE 'tab_group|saved_tab_group|shared_tab_group' | sort -u`
3. Contenu du dossier Sessions (noms réels sur cette version) :
   `ls -l "$HOME/Library/Application Support/Google/Chrome/Default/Sessions"`
4. Groupes dans le LevelDB de sync (fragments binaires, résultat indicatif) :
   `for f in "$HOME/Library/Application Support/Google/Chrome/Default/Sync Data/LevelDB"/*.ldb; do strings "$f" | grep -i 'savedtabgroup' && echo "== $f"; done`
5. Contre-épreuve : enregistrer un groupe d'onglets dans Chrome, refaire 2 — si le JSON ne change pas de structure alors que le LevelDB oui, la conclusion du §4 est confirmée localement.

## 7. Implications pour un futur import dans l'extension

- L'API `chrome.bookmarks` (celle qu'utilise l'extension) reflète le modèle de favoris : **elle n'expose pas les groupes d'onglets sauvegardés**, même s'ils s'affichent dans la barre de favoris. Un import « groupes sauvegardés » ne peut donc pas passer par là.
- `chrome.tabGroups` / `chrome.tabs` ne voient que les groupes **ouverts dans la session courante** ; `chrome.sessions` ne donne que les récemment fermés. Piste pragmatique : demander à l'utilisateur d'ouvrir les groupes à importer, puis les lire via `chrome.tabs`/`chrome.tabGroups` dans l'extension (permissions `tabs` et `tabGroups`).
- Lire les fichiers disque (`Bookmarks`, LevelDB, SNSS) depuis une extension est impossible (sandbox + aucun accès au disque utilisateur) ; et côté machine, ces fichiers sont de toute façon verrouillés par la protection disque de macOS pour tout outil non autorisé (§1). Un import hors navigateur exigerait un script local exécuté avec l'accès complet au disque, qui parserait le LevelDB de sync — format interne non garanti stable entre versions de Chrome.
