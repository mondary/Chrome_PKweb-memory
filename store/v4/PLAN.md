# PK Web Memory — kit média v4

Direction validée avec l'utilisateur (16/10/2026) : refaire le kit visuel du Store
(captures, bannières, GIF, vidéo) sans rien supprimer des versions précédentes
(`store/v1`, `store/v2`, `store/v3`, `store/website` restent en place).

## Constat de départ

- La fiche Chrome Web Store utilise encore les captures **v1** (UI de septembre,
  badge `v2026.09.64`) : trois refontes de retard (Tableau de bord, vue Liste,
  Sessions retravaillées).
- La landing (`store/website/screenshots/`) montre l'UI actuelle mais avec des
  données pauvres (19 favoris, un seul dossier, aucune session riche) et un toast
  résiduel dans la capture du Tableau de bord.
- Aucun GIF ni vidéo n'existe dans le dépôt.

## Périmètre (kit complet)

| Cible | Fichiers | Format |
|---|---|---|
| Fiche Chrome Web Store | `screenshots/cws/cws-01-sessions.png` … `cws-05-doublons.png` | exactement **1280×800** (règle CWS), 5 max |
| Landing (prête à remplacer `store/website/screenshots/`) | `screenshots/01-inventaire.png` … `09-dashboard.png` | 1440×1000 |
| Tuile / marquee / bannière / carte OG | `assets/cws-tile-440x280.png`, `cws-marquee-1400x560.png`, `banner-1544x500.png`, `card-1200x630.png`, `icon128.png` | dimensions exactes |
| Animations | `gifs/pk-web-memory-large.gif`, `pk-web-memory-compact.gif`, `videos/pk-web-memory-promo.mp4` | boucle scriptée « recherche ⌘K » |

## Storyboard des scènes

| # | Fichier (site) | CWS | Scène | Source |
|---|---|---|---|---|
| 01 | 01-inventaire.png | — | Favoris › Inventaire actif : 46 favoris, 6 dossiers, domaine top | UI réelle |
| 02 | 02-recherche.png | cws-04-recherche.png | Recherche globale ⌘K, requête « design », résultats multi-sections | UI réelle |
| 03 | 03-historique.png | cws-03-historique.png | Historique local : cartes stats + timeline 14 jours reliée | archive semée + visites réelles |
| 04 | 04-galerie.png | — | Galerie en miniatures (12 vraies captures de sites + repli) | vignettes réelles |
| 05 | 05-doublons.png | cws-05-doublons.png | Doublons niveau 1 : 4 groupes, actions | UI réelle |
| 06 | 06-sessions.png | cws-01-sessions.png | Sessions : session en cours (12 onglets) + 9 sessions enregistrées, groupes colorés | UI réelle |
| 07 | 07-liens-morts.png | — | Liens morts : 4 vérifiés | états semés |
| 08 | 08-backup.png | — | Sauvegardes : 2 exports réels dans l'historique | interactions réelles |
| 09 | 09-dashboard.png | cws-02-tableau-de-bord.png | Tableau de bord, vue Liste, 5 catégories, 42 liens | UI réelle |

Boucle animée (GIF + MP4, 1280×800) : favoris → clic « Rechercher » → saisie
« design » → résultats → survol → clic sur un résultat → retour. Curseur incrusté
à la position réelle des événements CDP.

## Données (jeu curé réaliste, aucune donnée privée)

- **46 favoris** dans 6 dossiers : Design & inspiration (12), Développement (11),
  Intelligence artificielle (7), Recherche & veille (6), Outils & ressources (6),
  Archives à vérifier (4, volontairement morts). 4 doublons volontaires (Figma,
  MDN, GitHub, Hugging Face).
- **9 sessions enregistrées** nommées (veille design, refonte landing, docs MV3,
  exploration IA locale…), groupes d'onglets colorés, une archivée, une favorite.
- **Session en cours** : 12 onglets réels mis en veille (titre + favicône).
- **Archive de visites** semée sur 7 mois (dense sur 14 jours) dans le stockage de
  l'extension ; visites du jour semées via `chrome.history.addUrl`.

## Méthode de capture (reproductible)

- Chrome for Testing (`CHROME_BIN` ou cache ms-playwright), profil jetable,
  extension **non empaquetée du dépôt** (`extension/`, version 10.18), CDP.
- Deux injections **cosmétiques documentées**, aucune modification d'UI ni de layout :
  1. favicônes réelles (Google S2, UA navigateur) injectées au rendu — le cache
     `_favicon` d'un profil jetable est vide ; repli lettre+dégradé ;
  2. miniatures « mshots » indisponibles (403) : 12 vraies captures de sites
     chargées en onglets réels (400×300) + repli SVG géométrique.
- Aucun screenshot d'écran système ; tout passe par `Page.captureScreenshot`.
- Rapport `tools/capture-report.json` : hashes des sources, version, méthode,
  limites.

## Critères de réception

- Dimensions exactes vérifiées au pixel (`sips`) ; 1280×800 pour tout le set CWS.
- Favicônes présentes sur toutes les lignes visibles ; aucun globe gris générique.
- Aucun état transitoire (toast, survol, curseur système) dans les captures fixes.
- Interface en français, cohérente entre les 9 scènes ; données crédibles et
  cohérentes d'une scène à l'autre.
- GIF : boucle lisible, curseur visible, < 10 Mo ; MP4 : 1280×800 h264, sans audio.
- Bannières relues à l'œil, texte net, aucune faute.

## État (16/10/2026)

Kit produit et revu visuellement : 18 fichiers (5 CWS 1280×800, 9 scènes 1440×1000, 4 assets),
65 frames compositées, GIF large/compact, MP4, rapport `tools/capture-report.json`.
README FR/EN synchronisés (bannière + captures + arborescence). **En attente de validation
utilisateur** avant remplacement des images de la fiche CWS et de la landing.

## Étapes suivantes (après validation visuelle de l'utilisateur)

1. Remplacer les 5 images de la fiche CWS (dashboard, via ego) + éventuellement
   la tuile et le marquee.
2. Copier le jeu `screenshots/*.png` vers `store/website/screenshots/`.
3. Bump CalVer + CHANGELOG + README si des références changent.

## Régénération

```sh
node store/v4/tools/capture-v4.mjs            # captures + frames anim
node store/v4/tools/capture-v4.mjs --assets   # tuile/marquee/bannière/carte
bash store/v4/tools/build-media.sh            # curseur + GIF + MP4
```
