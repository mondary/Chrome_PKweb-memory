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

## Le bloc marque obligatoire (4 points)

1. **Résumé du paquet** (≤ 132 caractères) : contient « PK-Labs » ; ajouter « mondary.design »
   si la place le permet. Modèle des six premières fiches : « … Made by PK-Labs. »
2. **Description longue** : terminée par les deux lignes standard (une occurrence de chaque domaine) :
   - FR : `Plus d'applications créées par PK-Labs sur https://apps.pouark.com. Découvertes d'outils numériques et pépites design sur https://mondary.design.`
   - EN : `More apps by PK-Labs at https://apps.pouark.com. Digital tools and design gems at https://mondary.design.`
   - Rôles : `apps.pouark.com` = les apps créées par PK ; `mondary.design` = les outils numériques
     découverts (les pépites). Ligne héritée des six fiches publiées avant le 17/10/2026
     (`Visit https://mondary.design for more tools and design resources.`) : à aligner sur le
     standard deux sites lors de leur prochaine mise à jour.
3. **Fiche › Champs supplémentaires — deux champs, tous deux obligatoires** :
   - **« URL officielle »** (menu des sites vérifiés via Google Search Console) : `https://mondary.design/`,
     jamais « Aucune ». C'est ce qui affiche le lien Développeur sur la fiche publique — le chaînon
     manquant de Web Memory le 17/10/2026 (résumé et description déjà conformes, mais « Aucune » sélectionnée).
   - **« URL de la page d'accueil »** : `https://mondary.design`.
4. **Garde-fou anti-rejet** (leçon du 16/10/2026) : une seule occurrence de chaque domaine (deux URL
   maximum) dans la description, aucune énumération de formats — « URL, titres, Markdown, HTML, CSV et JSON » a
   déclenché le refus automatique « spam : trop de mots clés dans la description ».

## Vérifier (après publication)

```bash
# Les extensions qui ressortent sur le mot-clé :
curl -sL 'https://chromewebstore.google.com/search/mondary?hl=fr' | rg -o '/detail/[a-z0-9-]+/[a-p]{32}' | sort -u

# Le bloc marque visible sur la fiche publique :
curl -sL 'https://chromewebstore.google.com/detail/<slug>/<id>?hl=fr' | rg -io '.{0,60}(mondary|pk-labs).{0,60}'
```

## État des sept extensions (vérifié le 17/10/2026)

| Extension | ID | Recherche « mondary » | Recherche « pk-labs » | Conforme règle |
|---|---|---|---|---|
| PK New Tab | boeenonaijkccialgfaeipkhfhnnpfmd | oui | oui | oui |
| PK Chrome Shortcuts | cjgecoangnnoihcdplnoanbmajpanned | oui | oui | oui |
| PK Highlighter | nnmkffkeilpnimdbiifhphpnflilhmno | oui | oui | oui |
| PK SimpleGmail | kijhhekofbbmdgnheepmjcenehmgepgl | oui | oui | oui |
| PK Sticky Notes | hphdicffdchamcdembnkggjcdmmoennm | oui | oui | oui |
| PK Traduction | cfiocchdiillmnnemodbnhkbbhamnbmi | oui | oui | oui |
| PK Web Memory | bpbbglmebdopkbmgpehloggencjmfbcd | réindexation en cours | ajouté par 2026.10.22 | 2026.10.22 en examen ; pied deux sites à la soumission suivante |

La fiche Web Memory 2026.10.20 (approuvée et publiée le 17/10) porte déjà « mondary.design » dans le
résumé et la description ; la recherche ne la renvoie pas encore car l'index n'a pas été rafraîchi.
La 2026.10.22, en attente d'examen le 17/10, ajoute « Made by PK-Labs » au résumé et sélectionne
l'URL officielle `https://mondary.design/` (l'URL de la page d'accueil était déjà remplie).
