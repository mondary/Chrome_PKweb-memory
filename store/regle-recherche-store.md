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
2. **Description longue** : une seule ligne standard en fin de texte :
   - EN : `Visit https://mondary.design for more tools and design resources.`
   - FR : `Visitez https://mondary.design pour plus d'outils et de ressources design.`
   - Variante FR validée (Web Memory) : `D'autres outils et ressources design sur https://mondary.design.`
3. **Champ « URL de la page d'accueil » (Site web)** de la fiche : `https://mondary.design` —
   vérifier après enregistrement que la fiche publique affiche bien le lien dans l'encart
   « Développeur » (le champ peut rester vide s'il n'est pas sauvegardé : cas Web Memory le 17/10/2026).
4. **Garde-fou anti-rejet** (leçon du 16/10/2026) : une seule occurrence du domaine dans la
   description, aucune énumération de formats — « URL, titres, Markdown, HTML, CSV et JSON » a
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
| PK Web Memory | bpbbglmebdopkbmgpehloggencjmfbcd | réindexation en cours | ajouté par 2026.10.22 | résumé + Site web complétés par 2026.10.22 |

La fiche Web Memory 2026.10.21 (approuvée le 17/10) porte déjà « mondary.design » dans le
résumé et la description ; la recherche ne la renvoie pas encore car l'index n'a pas été
rafraîchi. La 2026.10.22 ajoute « Made by PK-Labs » au résumé et complète le champ Site web.
