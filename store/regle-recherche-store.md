# Règle de recherche Chrome Web Store — marque Mondary / PK-Labs

Objectif : quand quelqu'un cherche « mondary » ou « pk-labs » dans le Chrome Web Store,
les sept extensions PK apparaissent. Cette règle s'applique à toute nouvelle extension PK,
dès sa première soumission.

## Pourquoi cette règle (constat vérifié le 17/10/2026)

La recherche du Chrome Web Store ne matche ni le compte développeur ni l'e-mail :
PK Web Memory affichait « Proposé par cmondary » et clement.mondary+dev@gmail.com depuis
sa publication, sans jamais ressortir sur « mondary ». Elle matche le **texte publié de la
fiche** : nom, résumé, description longue et champ « Site web ». Les six premières extensions
ressortent sur « mondary » ET « pk-labs » parce que leurs fiches contiennent « Made by PK-Labs »
et « mondary.design ».

L'index de recherche se rafraîchit avec un délai (de quelques heures à quelques jours) après
publication d'une fiche : une fiche conforme mais absente des résultats est simplement en
attente de réindexation.

### Constat du 23/11/2026 — ce qui marche, ce qui ne marche pas

Mesures faites sur les sept fiches publiées (script : node scripts/check-store-search.mjs) :

| Requête | Résultat | Lecture |
|---|---|---|
| mondary | 6/7, PK Web Memory manque | la fiche a le bon texte mais son index est resté bloqué depuis octobre |
| mondary design | 7/7 | le texte de la fiche est bien pris en compte |
| pk-labs / pk labs | 7/7 | la signature éditoriale fonctionne |
| pklabs (sans tiret) | 2/7 | le tokenizer ne recolle pas PK-Labs |
| pk | 6/7 sur la première page | 62 résultats après « Afficher plus » ; PK Highlighter est 12e |

Deux conséquences :

1. **Le titre du store vient du paquet**, pas du dashboard (la fiche affiche « Titre issu du
   package » et « Résumé issu du package »). Modifier le manifeste et republier est le seul
   moyen d'agir sur le nom ; une retouche du dashboard ne change pas le titre.
2. **Un index peut rester faux malgré un texte correct** (cas PK Web Memory). Le remède fiable
   est de mettre la marque dans le **titre** : la recherche sur le nom fonctionne toujours
   (pk web memory ramène la fiche), alors que le texte de description peut être ignoré.

« PK » est un mot-clé de deux lettres, partagé par des milliers de fiches : on ne peut pas
garantir sept positions dans les dix premiers résultats. Le store affiche dix résultats puis un
bouton « Afficher plus ». La couverture complète et stable passe donc par les requêtes de marque
mondary, pk-labs et Mondary PK, pas par pk seul.

### Constat du 24/11/2026 — plafond de compte

Le compte est plafonné à **7 extensions publiées**. Le huitième brouillon (PK Screenshot Resizer)
peut être préparé et enregistré, mais l'envoi est refusé avec
« MAX_PUBLISHED_ITEM_LIMIT_REACHED ». Deux issues seulement : demander une augmentation de la
limite depuis le tableau de bord, ou dépublier une extension existante.

PK Sticky Notes a été refusée le 24/11 pour `activeTab` demandé mais inutilisé (même motif que
PK Traduction le 17/11). Le manifeste ne le demande plus ; la 2026.11.3 a été renvoyée.

La demande d'augmentation de limite a été tentée le 24/11 : refusée par Google
(« vos extensions actuellement publiées ont besoin d'un engagement plus soutenu »), avec un
délai de 24 h avant une nouvelle demande.

### À finir dès que les examens débloquent la fiche

Le 24/11, cinq fiches ont été alignées sur le hub : URL officielle et URL de la page d'accueil
passées à `https://mondary.design/apps/`, et visuels complétés (petite image 440×280 et bannière
1400×560 partout où elles manquaient). Google limite les annulations d'examen à cinq par jour
(« Impossible d'annuler, car vous avez atteint la limite quotidienne ») : PK Traduction et
PK Simple Gmail restent donc à corriger le lendemain.

Les champs de fiche sont en lecture seule pendant l'examen. Restent à aligner :

| Extension | URL officielle | URL d'accueil | Pied deux sites |
|---|---|---|---|
| PK New Tab | ok | ok | à remplacer |
| PK Chrome Shortcuts | `mondary.design` sans schéma, à normaliser en https | ok | ok |
| PK Highlighter | ok | GitHub → mondary.design | à remplacer |
| PK Sticky Notes | ok | GitHub → mondary.design | à remplacer |
| PK Traduction | **vide** → https://mondary.design/ | **vide** → https://mondary.design | à remplacer |
| PK Simple Gmail | ok | ok | ok |
| PK Web Memory | ok | ok | ok |

## Le bloc marque obligatoire (4 points)

1. **Titre du paquet** (manifeste, ≤ 45 caractères) : garder le préfixe « PK » et ajouter la
   marque après un point médian, par exemple « PK Web Memory · Mondary ». C'est le seul champ
   qui garantit la présence sur la requête mondary, y compris quand l'index de la description
   est bloqué.
2. **Résumé du paquet** (≤ 132 caractères) : « … Made by Mondary · PK-Labs. » — les deux marques,
   séparées, pour que mondary et pk-labs matchent même sur la description courte.
3. **Description longue** : terminée par les deux lignes standard (une occurrence de chaque domaine) :
   - FR : `Plus d'applications créées par PK-Labs sur https://apps.pouark.com. Découvertes d'outils numériques et pépites design sur https://mondary.design.`
   - EN : `More apps by PK-Labs at https://apps.pouark.com. Digital tools and design gems at https://mondary.design.`
   - Rôles : `apps.pouark.com` = les apps créées par PK ; `mondary.design` = les outils numériques
     découverts (les pépites). Ligne héritée des six fiches publiées avant le 17/10/2026
     (`Visit https://mondary.design for more tools and design resources.`) : à aligner sur le
     standard deux sites lors de leur prochaine mise à jour.
4. **Fiche › Champs supplémentaires — deux champs, tous deux obligatoires** :
   - **« URL officielle »** (menu des sites vérifiés via Google Search Console) : `https://mondary.design/`,
     jamais « Aucune ». C'est ce qui affiche le lien Développeur sur la fiche publique — le chaînon
     manquant de Web Memory le 17/10/2026 (résumé et description déjà conformes, mais « Aucune » sélectionnée).
   - **« URL de la page d'accueil »** : `https://mondary.design/apps/`.
5. **Garde-fou anti-rejet** (leçon du 16/10/2026) : une seule occurrence de chaque domaine (deux URL
   maximum) dans la description, aucune énumération de formats — « URL, titres, Markdown, HTML, CSV et JSON » a
   déclenché le refus automatique « spam : trop de mots clés dans la description ».

## Vérifier (après publication)

```bash
# Les extensions qui ressortent sur le mot-clé :
curl -sL 'https://chromewebstore.google.com/search/mondary?hl=fr' | rg -o '/detail/[a-z0-9-]+/[a-p]{32}' | sort -u

# Le bloc marque visible sur la fiche publique :
curl -sL 'https://chromewebstore.google.com/detail/<slug>/<id>?hl=fr' | rg -io '.{0,60}(mondary|pk-labs).{0,60}'
```

## État des sept extensions (relevé le 23/11/2026)

| Extension | ID | Version publique | Recherche « mondary » | Paquet prêt (marque dans le titre) |
|---|---|---|---|---|
| PK New Tab | boeenonaijkccialgfaeipkhfhnnpfmd | 2026.10.7 | oui | 2026.11.2 |
| PK Chrome Shortcuts | cjgecoangnnoihcdplnoanbmajpanned | 2026.11.12 | oui | 2026.11.22 |
| PK Highlighter | nnmkffkeilpnimdbiifhphpnflilhmno | 2026.10.4 | oui | 2026.11.1 |
| PK Simple Gmail | kijhhekofbbmdgnheepmjcenehmgepgl | 2026.11.8 | oui | 2026.11.32 |
| PK Sticky Notes | hphdicffdchamcdembnkggjcdmmoennm | 1.0.3 | oui | 2026.11.3 (activeTab retiré) |
| PK Traduction | cfiocchdiillmnnemodbnhkbbhamnbmi | 2026.06.2 | oui | 2026.11.3 (activeTab retiré) |
| PK Web Memory | bpbbglmebdopkbmgpehloggencjmfbcd | 2026.11.4 | **non** | 2026.11.7 |

Les sept paquets 2026.11.x portent le titre « PK … · Mondary » et le résumé
« … Made by Mondary · PK-Labs. ». Ils ont tous été envoyés à l'examen le 23/11/2026 : la
recherche repasse au vert quand ils seront approuvés et réindexés.

PK Traduction est bloquée côté store : la version 2026.10.4 a été refusée le 17/11 pour
« activeTab demandé mais non utilisé ». Le manifeste local ne demande plus activeTab ; le paquet
2026.11.3 corrige donc aussi ce refus.

Le contrôle automatique se lance depuis la racine du hub :

```bash
node scripts/check-store-search.mjs
node scripts/check-store-search.mjs --json
```
