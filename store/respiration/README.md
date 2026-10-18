# Respiration · 2026.10.28

Captures de l’extension réelle dans un profil Chrome for Testing jetable, avec
des pages fictives servies sur localhost (dont une page vidéo locale lue via
`canvas.captureStream`, pour l’exception « lecture en cours »). Aucun DOM,
style ou contenu de produit n’est retouché pour les captures.

Scénario du test : 24 pages réparties en deux groupes Chrome, activation via
le formulaire (cible 10), fermetures ⌘W et remplissage, pause/reprise, puis un
second scénario avec brouillon dans une iframe, éditeur rempli et vidéo en
lecture — les deux premiers sont fermés, seule la lecture survit.

- `screenshots/respiration-desktop.png` : 1440 × 1000 — panneau Respiration,
  trois compteurs (ouverts / fermés à revenir / fermés par vous) puis les
  grilles complètes de favicônes par état.
- `screenshots/respiration-pages.png` : 1440 × 1000 — grand panneau « Voir
  toutes les pages » : favicône, titre, URL complète et état par ligne,
  filtre par état et recherche.
- `screenshots/respiration-mobile.png` : vue étroite 390 × 844. Le bloc
  Respiration s’adapte ; la barre d’actions historique de Sessions conserve son
  débordement horizontal préexistant. Ce n’est pas une extension mobile.

Régénération depuis la racine :

```sh
RESPIRATION_SHOTS=store/respiration/screenshots node --test extension/tests/respiration.browser.test.mjs
```

Le même test vérifie les événements Chrome natifs, la fermeture de fenêtre et
l’aller-retour SQLite de la file. `CHROME_BIN` permet de choisir un binaire de
test. Aucune donnée ni fenêtre du navigateur principal n’est utilisée.
