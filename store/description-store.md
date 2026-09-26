# Fiche Chrome Web Store — Favoris

## Nom

Favoris

## Accroche

Retrouvez votre web dans Chrome.

## Description courte (≤ 132 caractères)

Recherche, historique par jour, galerie et sessions restaurables pour retrouver, nettoyer et sauvegarder vos favoris Chrome.

## Description courte EN

Search, daily history, visual gallery and restorable sessions to find, clean up and back up your Chrome bookmarks.

## Description longue FR

Favoris vous aide à retrouver et organiser ce que vous gardez dans Chrome.

• **Recherche globale** : retrouvez un favori, une page visitée ou un onglet ouvert depuis une palette clavier. Parcourez les résultats avec les flèches et rouvrez une page ou son onglet existant.
• **Historique par jour** : calendrier, timeline et pages visitées pour retrouver votre parcours.
• **Sessions** : la session en cours reste dépliée en haut de la timeline, une croix par ligne ferme l'onglet ou retire le lien (annulable), un aperçu de la page suit le survol et les sessions enregistrées se rouvrent en un clic. Sauvegarde manuelle « enregistrer & fermer » et automatique toutes les 5 minutes, mise en veille des onglets inactifs.
• **Galerie visuelle** : parcourez vos favoris avec des miniatures, une recherche et des filtres.
• **Nettoyage** : repérez les doublons, vérifiez les liens morts et placez les éléments concernés en quarantaine restaurable.
• **Sauvegarde** : exportez vos favoris et restaurez des instantanés locaux.

Les favoris, visites, sessions, réglages et sauvegardes sont traités dans Chrome et conservés dans le stockage local de l'extension. Favoris n'exploite pas de compte, d'analytics ou de publicité.

**Services externes utilisés par certaines fonctions :** les miniatures sont demandées à WordPress.com mshots avec l'URL concernée ; les favicônes de secours des cartes de groupes d'onglets ouverts peuvent être demandées à Google S2 avec le domaine ; le scan de liens effectue une requête sans identifiants vers les URL que vous choisissez de vérifier. Ces services et sites reçoivent les requêtes nécessaires à la fonction utilisée. Le mode « favicônes uniquement » de la galerie évite les requêtes mshots.

Politique de confidentialité : `store/privacy-policy.html` (à héberger publiquement avant la soumission ; URL candidate GitHub Pages : `https://mondary.github.io/Chrome_BookmarksSorter/store/privacy-policy.html`, non active tant que Pages n'est pas configuré).

## Long description EN

Favoris helps you find and organize what you keep in Chrome.

• **Global search**: find a bookmark, a visited page or an open tab from a keyboard palette. Navigate with the arrow keys and reopen a page or switch to its existing tab.
• **Daily history**: calendar, timeline and visited pages help you retrace your browsing.
• **Sessions**: the current session stays expanded at the top of the timeline, a cross on every row closes the tab or removes the link (undoable), a page preview follows the hover and saved sessions reopen in one click. Manual “save & close”, automatic backup every 5 minutes, and idle-tab sleeping.
• **Visual gallery**: browse bookmarks with thumbnails, search and filters.
• **Cleanup**: find duplicates, check dead links and move affected items to a restorable quarantine.
• **Backup**: export bookmarks and restore local snapshots.

Bookmarks, visits, sessions, settings and backups are processed in Chrome and kept in the extension's local storage. Favoris does not use accounts, analytics or advertising.

**External services used by some features:** thumbnails are requested from WordPress.com mshots with the relevant URL; fallback favicons for open tab-group cards may be requested from Google S2 with the domain; the dead-link checker makes credential-free requests to URLs you choose to check. Those services and websites receive the requests needed for the selected feature. The gallery's “favicons only” mode avoids mshots requests.

Privacy policy: `store/privacy-policy.html` (host this file publicly before submission; candidate GitHub Pages URL: `https://mondary.github.io/Chrome_BookmarksSorter/store/privacy-policy.html`, not live until Pages is enabled).

## Métadonnées à saisir

- Catégorie : **Productivité**
- Langues : français, anglais
- Icône : `assets/icon128.png` (128 × 128)
- Captures à téléverser (maximum 5) : `screenshots/01-inventaire.png`, `02-recherche.png`, `03-historique.png`, `06-sessions.png`, `05-doublons.png` (1280 × 800)
- Petite tuile promotionnelle : `assets/tile-440x280.png` (440 × 280)
- Bannière promotionnelle : `assets/marquee-1400x560.png` (1400 × 560 ; vérifier l'emplacement proposé dans le tableau de bord)
- Bannière du README/site : `assets/banner-1544x500.png`
- Carte sociale : `assets/card-1200x630.png`

## Justification des permissions (à copier dans le tableau de bord)

| Permission | Justification |
|---|---|
| `bookmarks` | Lire, rechercher, organiser et exporter les favoris ; permettre le déplacement en quarantaine et la restauration demandés par l'utilisateur. |
| `history` | Afficher l'historique par jour, rechercher des pages visitées et reconstruire les journées dans le gestionnaire de sessions. |
| `tabs` | Afficher les onglets ouverts dans la session en cours, enregistrer/restaurer des sessions, fermer ou mettre en veille les onglets demandés et basculer vers un onglet existant depuis la recherche. |
| `tabGroups` | Afficher et gérer les groupes actuellement ouverts. Chrome ne donne pas accès aux groupes enregistrés mais fermés via cette API. |
| `storage` | Conserver localement les réglages, sessions, état de nettoyage, cache de favicônes/miniatures et aperçus de session. |
| `unlimitedStorage` | Permettre le cache local des miniatures et des sessions lorsque les données dépassent le quota standard. |
| `alarms` | Déclencher la sauvegarde de session automatique et la vérification des onglets inactifs. |
| `favicon` | Afficher les favicônes associées aux pages et aux onglets. |
| Hôtes `http://*/*`, `https://*/*` | Vérifier les liens choisis par l'utilisateur, charger les miniatures/favicônes des sites et capturer localement l'aperçu des pages visitées (jamais en navigation privée, jamais envoyé à un service externe). Les requêtes de scan n'envoient pas les cookies du site (`credentials: omit`). |

## Déclarations de confidentialité à confirmer dans le tableau de bord

- Les données de favoris, d'historique et d'onglets servent uniquement aux fonctions visibles de l'extension.
- Elles ne sont ni vendues, ni utilisées pour la publicité, ni envoyées à un serveur contrôlé par l'éditeur.
- Des URL/domaines sont communiqués aux services externes décrits ci-dessus lors de l'utilisation des miniatures, des favicônes de secours ou du scan de liens.
- La politique doit être publiée sur une URL HTTPS accessible sans connexion. Vérifier l'URL finale et les déclarations de traitement dans le dashboard avant soumission.

### État de préparation

- Icônes, visuels et captures sont prêts dans `store/assets/` et `store/screenshots/`.
- La politique est rédigée dans `store/privacy-policy.html`, mais aucune GitHub Pages n'est actuellement configurée pour ce dépôt. Activer Pages puis vérifier l'URL candidate avant de la saisir dans le Chrome Web Store.
- `store/index.html` est un mini-site de présentation statique, distinct de la fiche Chrome Web Store et de l'extension.
