# PK Web Memory — kit média v4

Captures **réelles** de l'extension du dépôt (chargée non empaquetée, badge `v2026.10.18`),
dans un profil Chrome for Testing jetable piloté en CDP. Aucune donnée privée, aucune
capture d'écran système ; le profil est supprimé en fin de run.

## Contenu

| Dossier | Rôle |
|---|---|
| `screenshots/` | 9 scènes 1440×1000 pour la landing (`01-inventaire` → `09-dashboard`) |
| `screenshots/cws/` | 5 captures **1280×800** exactement, pour la fiche Chrome Web Store |
| `assets/` | `cws-tile-440x280`, `cws-marquee-1400x560`, `banner-1544x500`, `card-1200x630`, `icon128` |
| `gifs/` | `pk-web-memory-large.gif` (1024 px) · `pk-web-memory-compact.gif` (560 px) |
| `videos/` | `pk-web-memory-promo.mp4` — 1280×800, h264, ~8 s, sans audio |

Scénario de la boucle animée : favoris → clic « Rechercher » (⌘K) → saisie « design » →
résultats (favoris, historique, onglets) → survol → clic sur un résultat. Curseur incrusté
à la position réelle des événements CDP (les captures CDP n'incluent pas le pointeur).

## Régénérer

```sh
export CHROME_BIN="/chemin/vers/Google Chrome for Testing"   # facultatif (cache ms-playwright sinon)
node store/v4/tools/capture-v4.mjs                           # tout : scènes + boucle + assets (~4 min, réseau)
node store/v4/tools/capture-v4.mjs --scene sessions,galerie  # scènes choisies
node store/v4/tools/capture-v4.mjs --scene -                 # rien que la boucle animée
SKIP_NET=1 node store/v4/tools/capture-v4.mjs                # sans réseau (favicônes lettres, miniatures SVG)
bash store/v4/tools/build-media.sh                           # GIF + MP4 + icon128 (ffmpeg, ImageMagick)
```

Rapport machine : `tools/capture-report.json` (empreintes des sources, dimensions, méthode).

## Données de démonstration (fictives, curées)

51 favoris / 7 dossiers — « Tableau de bord » contient 6 catégories (47 liens), 4 doublons
volontaires (Figma, GitHub, MDN, Hugging Face), 4 liens morts dans « Archives à vérifier » ;
9 sessions enregistrées nommées (groupes colorés, une archivée, une favorite) ; 12 onglets
réels mis en veille pour la session en cours ; archive de visites semée sur 8 mois dans le
stockage de l'extension + visites réelles du profil (titres et favicônes obtenus par de
vrais chargements). Défini dans `tools/capture-v4.mjs`.

## Méthode et limites (honnêtes)

- Chrome for Testing requis pour `--load-extension` ; pilotage CDP
  (`Emulation.setDeviceMetricsOverride` + `Page.captureScreenshot`), aucune capture d'écran
  système, aucun redimensionnement post-capture pour les scènes.
- **Injections cosmétiques documentées** : favicônes réelles Google S2 injectées au rendu
  (le cache `_favicon` d'un profil jetable est vide ; repli lettre + dégradé), miniatures
  « mshots » indisponibles (403) → 12 sites chargés réellement en onglets (400×300) + repli
  SVG géométrique pour le reste, curseur incrusté dans les frames de la boucle.
- États de scan (liens morts), vignettes et archive de visites sont **semés** dans
  `chrome.storage.local` puis rendus par l'interface réelle — l'UI, le layout et les
  interactions ne sont jamais fabriqués.
- Les captures n'incluent ni la barre de Chrome ni l'environnement macOS.
- `SKIP_NET=1` produit un kit structurellement complet mais avec favicônes-lettres et
  miniatures SVG — ne pas livrer tel quel.
- Détails du cadrage et critères de réception : `../PLAN.md` ; scènes pas-à-pas : ce README
  et `tools/capture-v4.mjs`.
