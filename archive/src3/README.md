# Sessions · SRC3

<img src="icon.png" width="72" alt="Icône PK">

[Français](README.md) · [English](README.en.md)

Refonte de [src2](../src2/README.md) calquée sur le vrai fonctionnement de Tablerone : **une timeline sobre, sans cadres**, où la session en cours est **toujours dépliée**, chaque ligne porte sa **croix de fermeture**, et un **aperçu de page** remplace la mosaïque de favicônes. **Version 2026.09.2** · Chrome Manifest V3 · aucune dépendance ni compilation. Interface française.

![Timeline SRC3 — session en cours dépliée](store/01-timeline.png)

## Installation

1. Ouvrir `chrome://extensions` (Chrome 120+).
2. Activer le **Mode développeur**.
3. **Charger l’extension non empaquetée** → sélectionner **ce dossier `src3/`**.
4. Cliquer l’icône **Sessions · PK — SRC3** (raccourci ⌘⇧Y / Ctrl⇧Y, modifiable dans `chrome://extensions/shortcuts`).

Coexiste avec `../extension/` et `../src2/` (stockages séparés).

## Ce qui change par rapport à src2

- **Timeline façon Tablerone** : plus de cartes à bordures ni de menu latéral — sessions ouvertes en haut (toujours dépliées), puis sessions enregistrées groupées par jour, dépliables **sur place** (pas de boîte de dialogue).
- **Une croix par ligne** : ferme l’onglet de la session en cours (une copie archivée permet d’annuler) ou retire le lien d’une session enregistrée (copie de récupération + « Annuler »).
- **Aperçu au survol** : une seule capture à gauche, collante, qui suit la ligne survolée ou focalisée au clavier — plus de grille de favicônes.
- **Vue élargie** : un clic sur l’aperçu élargit la page (1400 px), agrandit la capture (360 px) et affiche les options avancées ; un second clic ou Échap referme.
- **Enregistrement direct** : « Enregistrer les fenêtres » ou « Enregistrer & fermer » agissent immédiatement, sans formulaire intermédiaire.
- **Captures locales** : le service worker photographie les pages que vous consultez réellement (jamais en navigation privée, jamais envoyées à un service externe). Voir Permissions.
- **Thème clair/sombre/système**, recherche ⌘K, notes par lien, dédoublonnage, archives avec restauration/suppression définitive.

## Fonctionnement des captures

Le worker attend ~1,1 s d’affichage stable puis capture **l’onglet visible** d’une fenêtre **normale et focalisée** (jamais privée, jamais activée artificiellement, jamais pendant un chargement). L’image est réduite (largeur 440 px, JPEG ≈ 55 %), conservée **30 jours** dans le stockage local (60 captures / 2 Mo maximum), puis servie au survol des lignes. Désactivable dans les réglages. Une page jamais visitée depuis l’installation n’a simplement pas d’aperçu.

## Permissions

| Permission | Utilisation |
|---|---|
| `tabs`, `tabGroups` | Lire titres/URL, rouvrir, fermer, mettre en veille, recréer les groupes |
| `storage`, `alarms` | Bibliothèque, captures, sauvegarde périodique (5 min) |
| `favicon` | Icônes via le mécanisme interne de Chrome |
| `<all_urls>` (hôte) | **Uniquement** `tabs.captureVisibleTab` pour les captures locales ; aucun script injecté, aucune requête réseau vers les sites |

## Données et limites

- 100 % local, sans compte ni suivi. Désinstaller supprime les données : **exportez le JSON** régulièrement (réglages).
- L’import JSON (`pk-sessions`, schéma 1) ajoute sans écraser ; 10 Mo / 2 000 sessions / 5 000 onglets max, validation complète avant écriture.
- La sauvegarde automatique (toutes les 5 min, 20 versions distinctes) ne ferme jamais d’onglet ; un favori devient une collection permanente.
- Fermer un onglet via sa croix crée d’abord une copie archivée (annulable), puis ferme ; l’onglet épinglé est concerné, contrairement au nettoyage groupé.
- La mise en veille (15/30/60 min) protège les onglets actifs, épinglés et audibles ; désactivée par défaut.
- Pas de synchronisation cloud, de partage hébergé ni d’import du format propriétaire Tablerone.

## Vérifications et aperçu

```sh
node --test src3/tests/sessions.test.mjs
python3 -m http.server 8769 --bind 127.0.0.1 --directory src3
```

Puis ouvrir <http://127.0.0.1:8769/?demo> (aperçu fictif sans accès aux onglets ; `&expand&highlight` pré-déplie et élargit). 21 tests couvrent notamment : captures locales (fraîcheur, purge), fermeture d’onglet avec sauvegarde préalable et refus si l’URL a changé, retrait de lien + annulation, suppression limitée aux copies archivées, échec d’écriture sans fermeture, restauration des groupes, écritures concurrentes.

Les captures de cette documentation viennent de l’aperçu `?demo` (données fictives). Vérification manuelle recommandée après installation : survol des lignes, croix de fermeture + « Annuler », clic sur l’aperçu (élargissement), « Enregistrer & fermer » puis « Tout rouvrir ».

## Structure

```text
manifest.json   Extension installable directement
sw.js           API Chrome, captures locales, écritures sérialisées
core.mjs        Validation, recherche, retraits, purge des captures
index.html      Interface (timeline)
style.css       Sobre monochrome, clair/sombre
app.js          Rendu et interactions
tests/          Tests sans dépendance + API simulée pour l’aperçu
store/          Captures fictives et présentation
```

Historique : [CHANGELOG](CHANGELOG.md) · Références : [Tablerone](https://tabler.one/) (FAQ, changelog, glossaire) — implémentation indépendante, aucun code ni visuel propriétaire repris.
