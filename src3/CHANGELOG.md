# Changelog — Sessions SRC3

Refonte de `src2/` calquée sur le comportement réel de Tablerone. Historique de src2 : [../src2/CHANGELOG.md](../src2/CHANGELOG.md).

## [2026.09.2] - 2026-09-26

### Added

- Timeline sobre sans cadres ni menu latéral : session en cours toujours dépliée en tête, sessions enregistrées groupées par jour et dépliables sur place (« Afficher les N onglets »).
- Une croix par ligne : fermeture de l’onglet courant (copie archivée + « Annuler ») ou retrait du lien d’une session (copie de récupération + « Annuler »).
- Aperçu de page unique, collante, suivant la ligne survolée ou focalisée au clavier ; clic sur l’aperçu = vue élargie (page 1400 px, capture 360 px, options avancées), second clic ou Échap pour refermer.
- Captures locales par le service worker (onglet visible d’une fenêtre normale focalisée, jamais privée ni activée artificiellement), réduites et conservées 30 jours (60 / 2 Mo), désactivables.
- Enregistrement direct sans formulaire (« Enregistrer les fenêtres », « Enregistrer & fermer »), notes par lien, restauration et suppression définitive des copies archivées depuis les réglages.
- Permission hôte `<all_urls>` dédiée à `tabs.captureVisibleTab` uniquement.

### Changed

- Interface monochrome clair/sombre/système alignée sur le style de Favoris (`../extension/`), en 13 px, sans bordures de cartes.
