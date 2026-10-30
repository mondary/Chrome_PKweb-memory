# Landing media — provenance / provenance des médias

## Sources

- `demo.gif` : copie de la boucle v4 réelle `store/v4/gifs/pk-web-memory-large.gif` (1024×640, curseur incrusté) — inventaire → ouverture de la palette ⌘K → saisie « design » → résultats → clic. Boucle ~5,9 s. Ce n'est pas un diaporama ni une interface recréée, et il démarre sur l'inventaire net (pas un premier plan flou).
- `demo-poster.png` : première image de `demo.gif` (inventaire net) ; version statique pour pause et mouvement réduit.
- `sessions.png`, `bookmarks.png` : captures réelles `store/website/screenshots/06-sessions.png` et `01-inventaire.png`, marges blanches recadrées, sans réduction de résolution (1250×900).
- Les sources ont été produites dans un **profil jetable, avec des données fictives**. Elles ne contiennent ni favoris, ni sessions, ni statistiques du profil utilisateur. Enregistrement v4 et captures historiques : ce ne sont pas de nouvelles captures de la version 2026.10.67. Voir `../../v4/media-kit/README.md` et `../tools/capture-report.json` pour les limites d'origine.
- The GIF reuses the real v4 loop recording with fictional demo data. It is not a new recording of version 2026.10.67. The two still views reuse original-resolution demo screenshots.

## Reproduction

Depuis la racine du projet / from the project root:

```sh
bash store/website/tools/prepare-landing-media.sh
node store/website/tools/qa-landing.mjs
```

Prérequis : ffmpeg, ImageMagick, Node avec WebSocket, Chrome installé. Le contrôle démarre **uniquement une instance headless isolée** dans un profil temporaire ; aucun redémarrage, lecture ou modification du Chrome utilisateur.

## QA

- Aucun défilement de page à 1024×768, 1440×900 et 1920×1080. Zone de démonstration mesurée : respectivement 659, 1005 et 1365 px de large, au lieu de miniatures de 30 vw.
- Mobile 390×844 / tablette 768×1024 : empilement et défilement naturel, aucun débordement horizontal. Le rendu n'est pas rogné artificiellement pour cacher du contenu.
- GIF chargé et multi-images ; pause, sélection par flèches clavier, dialogue agrandi, Échap et retour du focus vérifiés.
- FR/EN, métadonnées, stockage bloqué, sans JS (FR) et `prefers-reduced-motion` vérifiés.
- Captures desktop, mobile et agrandissement revues visuellement. Aucun upload/publication effectué par ce chantier.
