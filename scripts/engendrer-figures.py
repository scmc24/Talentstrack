# -*- coding: utf-8 -*-
"""
Figures explicatives du document de conception : cycle de vie, architecture
client-serveur, répartition modèle-vue-contrôleur.

Dessinées par programme pour rester cohérentes entre elles et avec les
schémas de données.
"""
import os

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SORTIE = os.path.join(RACINE, 'docs', 'schemas')
os.makedirs(SORTIE, exist_ok=True)

ENCRE = '#101720'
OCRE = '#C2571B'
TERRAIN = '#0E7C5A'
GRIS = '#5A6673'
TRAIT = '#C9D0D6'
PAPIER = '#FFFFFF'
FOND = '#F7F8F9'


def ech(t):
    return t.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def debut(l, h, titre):
    return [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{l}" height="{h}" '
        f'viewBox="0 0 {l} {h}" font-family="Helvetica, Arial, sans-serif">',
        f'<rect width="{l}" height="{h}" fill="{FOND}"/>',
        '<defs>'
        f'<marker id="f" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" '
        f'orient="auto"><path d="M0 0L10 5L0 10z" fill="{GRIS}"/></marker>'
        f'<marker id="fo" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" '
        f'orient="auto"><path d="M0 0L10 5L0 10z" fill="{OCRE}"/></marker>'
        '</defs>',
        f'<text x="24" y="34" font-size="17" font-weight="bold" fill="{ENCRE}">{ech(titre)}</text>',
    ]


def bloc(x, y, w, h, titre, lignes, couleur, taille_titre=13):
    out = [
        f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="5" fill="{PAPIER}" '
        f'stroke="{couleur}" stroke-width="1.6"/>',
        f'<rect x="{x}" y="{y}" width="{w}" height="4" rx="2" fill="{couleur}"/>',
        f'<text x="{x + w / 2:.0f}" y="{y + 26}" font-size="{taille_titre}" font-weight="bold" '
        f'fill="{ENCRE}" text-anchor="middle">{ech(titre)}</text>',
    ]
    for i, ligne in enumerate(lignes):
        out.append(
            f'<text x="{x + w / 2:.0f}" y="{y + 46 + 16 * i}" font-size="11" fill="{GRIS}" '
            f'text-anchor="middle">{ech(ligne)}</text>'
        )
    return out


def fin(L, nom, legende=None, h=None):
    if legende:
        for i, ligne in enumerate(legende):
            L.append(
                f'<text x="24" y="{h - 20 - 15 * (len(legende) - 1 - i)}" font-size="10.5" '
                f'fill="{GRIS}">{ech(ligne)}</text>'
            )
    L.append('</svg>')
    open(os.path.join(SORTIE, nom), 'w', encoding='utf-8').write('\n'.join(L))
    print(nom)


# =====================================================================
# 1. Cycle de vie itératif et incrémental
# =====================================================================
L, H = 1100, 625
S = debut(L, H, 'Cycle de vie itératif et incrémental')

# Les lignes de détail sont découpées à la main : une coupure automatique
# séparerait un mot au milieu.
phases = [
    ('Analyse', ['Besoins et règles de gestion']),
    ('Conception', ['Modèles de données', 'et de traitements']),
    ('Réalisation', ['Base, services, interfaces']),
    ('Vérification', ['Tests et retour au terrain']),
]

# Trois itérations en colonnes, chacune reprenant les quatre phases
largeur_col = 290
for it in range(3):
    x = 40 + it * (largeur_col + 25)
    S.append(
        f'<rect x="{x}" y="70" width="{largeur_col}" height="440" rx="6" fill="none" '
        f'stroke="{TRAIT}" stroke-width="1" stroke-dasharray="5 4"/>'
    )
    S.append(
        f'<text x="{x + largeur_col / 2:.0f}" y="94" font-size="12.5" font-weight="bold" '
        f'fill="{OCRE}" text-anchor="middle">Itération {it + 1}</text>'
    )
    for i, (nom, detail) in enumerate(phases):
        by = 110 + i * 98
        S += bloc(x + 20, by, largeur_col - 40, 76, nom, detail, ENCRE, 12.5)
        if i < len(phases) - 1:
            S.append(
                f'<line x1="{x + largeur_col / 2:.0f}" y1="{by + 76}" '
                f'x2="{x + largeur_col / 2:.0f}" y2="{by + 94}" stroke="{GRIS}" '
                f'stroke-width="1.3" marker-end="url(#f)"/>'
            )
    if it < 2:
        S.append(
            f'<line x1="{x + largeur_col}" y1="290" x2="{x + largeur_col + 23}" y2="290" '
            f'stroke="{OCRE}" stroke-width="2" marker-end="url(#fo)"/>'
        )

# Boucle de retour : la vérification peut remettre en cause l'analyse
S.append(
    f'<path d="M{40 + largeur_col / 2:.0f} 540 C{40 + largeur_col / 2:.0f} 575, '
    f'{40 + 2 * (largeur_col + 25) + largeur_col / 2:.0f} 575, '
    f'{40 + 2 * (largeur_col + 25) + largeur_col / 2:.0f} 540" fill="none" stroke="{OCRE}" '
    f'stroke-width="1.6" stroke-dasharray="6 4"/>'
)
S.append(
    f'<text x="{L / 2:.0f}" y="600" font-size="11.5" fill="{OCRE}" text-anchor="middle">'
    f'Chaque itération peut remettre en cause les précédentes</text>'
)
S.append(
    f'<text x="{40 + largeur_col / 2:.0f}" y="534" font-size="10.5" fill="{GRIS}" '
    f'text-anchor="middle">Produit utilisable</text>'
)
S.append(
    f'<text x="{40 + (largeur_col + 25) + largeur_col / 2:.0f}" y="534" font-size="10.5" '
    f'fill="{GRIS}" text-anchor="middle">Produit enrichi</text>'
)
S.append(
    f'<text x="{40 + 2 * (largeur_col + 25) + largeur_col / 2:.0f}" y="534" font-size="10.5" '
    f'fill="{GRIS}" text-anchor="middle">Produit complet</text>'
)
fin(S, 'cycle-de-vie.svg')


# =====================================================================
# 2. Architecture client-serveur
# =====================================================================
L, H = 1120, 640
S = debut(L, H, 'Architecture client-serveur')

# Clients
S.append(f'<text x="120" y="80" font-size="12.5" font-weight="bold" fill="{OCRE}" '
         f'text-anchor="middle">CLIENTS</text>')

clients = [
    (60, 110, 'Téléphone', ['Encadrant sur le terrain']),
    (60, 240, 'Tablette', ['Consultation en club']),
    (60, 370, 'Ordinateur', ['Administration, analyses']),
]
for x, y, nom, lignes in clients:
    S += bloc(x, y, 190, 86, nom, lignes, ENCRE, 12.5)
    S.append(f'<line x1="{x + 190}" y1="{y + 43}" x2="430" y2="{y + 43}" stroke="{GRIS}" '
             f'stroke-width="1.3" marker-end="url(#f)"/>')

S.append(f'<text x="340" y="196" font-size="11" fill="{GRIS}" text-anchor="middle">Internet</text>')
S.append(f'<text x="340" y="212" font-size="10.5" fill="{GRIS}" text-anchor="middle">'
         f'requêtes sécurisées</text>')

# Serveur
S.append(f'<rect x="430" y="100" width="380" height="400" rx="6" fill="none" '
         f'stroke="{OCRE}" stroke-width="1.6"/>')
S.append(f'<text x="620" y="80" font-size="12.5" font-weight="bold" fill="{OCRE}" '
         f'text-anchor="middle">SERVEUR</text>')

S += bloc(455, 130, 330, 90, 'Application web',
          ['Produit les pages et traite', 'les demandes des clients'], ENCRE, 12.5)
S += bloc(455, 250, 330, 100, 'Base de données SQL distribuée',
          ['Parcours, structures,', 'territoires, évaluations'], TERRAIN, 12.5)
S += bloc(455, 380, 330, 90, 'Stockage des fichiers',
          ['Logos, photographies,', 'attestations'], GRIS, 12.5)

S.append(f'<line x1="620" y1="220" x2="620" y2="246" stroke="{GRIS}" stroke-width="1.3" '
         f'marker-end="url(#f)"/>')
S.append(f'<line x1="620" y1="350" x2="620" y2="376" stroke="{GRIS}" stroke-width="1.3" '
         f'marker-end="url(#f)"/>')

# Données géographiques de référence
S += bloc(850, 250, 230, 100, 'Données géographiques',
          ['Fonds de carte,', 'découpage administratif'], TERRAIN, 12.5)
S.append(f'<line x1="785" y1="300" x2="846" y2="300" stroke="{TERRAIN}" stroke-width="1.3" '
         f'marker-end="url(#f)"/>')

fin(S, 'architecture-client-serveur.svg',
    legende=[
        'Le client ne conserve aucune donnée : il affiche ce que le serveur lui envoie.',
        'Toutes les règles de gestion et tous les contrôles de droits sont appliqués côté serveur.',
    ], h=H)


# =====================================================================
# 3. Répartition modèle-vue-contrôleur
# =====================================================================
L, H = 1120, 600
S = debut(L, H, 'Organisation du code selon le modèle-vue-contrôleur')

S += bloc(60, 110, 290, 150, 'VUE',
          ['Ce que l\u2019utilisateur voit', '', 'Pages, formulaires de saisie,',
           'cartes et tableaux de bord'], OCRE, 14)
S += bloc(415, 110, 290, 150, 'CONTRÔLEUR',
          ['Ce qui décide', '', 'Vérifie les droits, applique', 'les règles de gestion'], ENCRE, 14)
S += bloc(770, 110, 290, 150, 'MODÈLE',
          ['Ce qui est enregistré', '', 'Tables, contraintes,', 'requêtes d\u2019analyse'], TERRAIN, 14)

# Flux aller
S.append(f'<line x1="350" y1="160" x2="411" y2="160" stroke="{GRIS}" stroke-width="1.4" '
         f'marker-end="url(#f)"/>')
S.append(f'<text x="380" y="152" font-size="10" fill="{GRIS}" text-anchor="middle">demande</text>')
S.append(f'<line x1="705" y1="160" x2="766" y2="160" stroke="{GRIS}" stroke-width="1.4" '
         f'marker-end="url(#f)"/>')
S.append(f'<text x="735" y="152" font-size="10" fill="{GRIS}" text-anchor="middle">lecture</text>')

# Flux retour
S.append(f'<line x1="766" y1="215" x2="705" y2="215" stroke="{GRIS}" stroke-width="1.4" '
         f'marker-end="url(#f)"/>')
S.append(f'<text x="735" y="233" font-size="10" fill="{GRIS}" text-anchor="middle">données</text>')
S.append(f'<line x1="411" y1="215" x2="350" y2="215" stroke="{GRIS}" stroke-width="1.4" '
         f'marker-end="url(#f)"/>')
S.append(f'<text x="380" y="233" font-size="10" fill="{GRIS}" text-anchor="middle">page prête</text>')

# Correspondance avec la réalisation
S.append(f'<text x="24" y="330" font-size="12.5" font-weight="bold" fill="{ENCRE}">'
         f'Ce que cela donne concrètement</text>')

corr = [
    (60, 'VUE', ['Les écrans : effectif, saisie d\u2019une étape,',
                 'fiche de parcours, carte des territoires'], OCRE),
    (415, 'CONTRÔLEUR', ['Les services : qui peut attester, qui peut',
                         'évaluer, quelles données sont visibles'], ENCRE),
    (770, 'MODÈLE', ['La base et ses règles : un grade sans autorité',
                     'ou une note hors barème sont refusés'], TERRAIN),
]
for x, nom, lignes, couleur in corr:
    S.append(f'<rect x="{x}" y="355" width="290" height="100" rx="5" fill="{PAPIER}" '
             f'stroke="{TRAIT}" stroke-width="1"/>')
    S.append(f'<rect x="{x}" y="355" width="4" height="100" rx="2" fill="{couleur}"/>')
    for i, ligne in enumerate(lignes):
        S.append(f'<text x="{x + 18}" y="{388 + 20 * i}" font-size="11" fill="{ENCRE}">'
                 f'{ech(ligne)}</text>')

fin(S, 'modele-vue-controleur.svg',
    legende=[
        'Séparer ces trois rôles permet de modifier un écran sans toucher aux règles,',
        'et de changer une règle sans refaire les écrans.',
    ], h=H)
