# -*- coding: utf-8 -*-
"""
Engendre les schémas du modèle de données à partir de db/schema.sql.

Les dessiner à la main garantirait qu'ils finissent par décrire autre chose
que le code. Ici, toute modification du schéma se répercute en relançant ce
script.

Sortie : des fichiers SVG dans docs/schemas, puis convertis en PNG pour
insertion dans un document.
"""
import re
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


def lire_schema():
    chemin = os.path.join(RACINE, 'db', 'schema.sql')
    source = open(chemin, encoding='utf-8').read()
    tables = {}
    for m in re.finditer(r'CREATE TABLE (\w+) \((.*?)\n\);', source, re.S):
        nom, corps = m.group(1), m.group(2)
        colonnes = []
        for ligne in corps.split('\n'):
            l = ligne.strip()
            if not l or l.startswith('--'):
                continue
            mc = re.match(r'(\w+)\s+(TEXT|INTEGER|REAL)', l)
            if not mc:
                continue
            fk = re.search(r'REFERENCES (\w+)', l)
            colonnes.append({
                'nom': mc.group(1),
                'type': mc.group(2),
                'pk': 'PRIMARY KEY' in l,
                'fk': fk.group(1) if fk else None,
                'obligatoire': 'NOT NULL' in l,
            })
        tables[nom] = colonnes
    return tables


def echapper(t):
    return (t.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;'))


def entete_svg(largeur, hauteur, titre):
    return [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{largeur}" height="{hauteur}" '
        f'viewBox="0 0 {largeur} {hauteur}" font-family="Helvetica, Arial, sans-serif">',
        f'<rect width="{largeur}" height="{hauteur}" fill="{FOND}"/>',
        '<defs>',
        f'<marker id="fleche" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" '
        f'markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="{GRIS}"/></marker>',
        f'<marker id="patte" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="9" '
        f'markerHeight="9" orient="auto"><path d="M10 0L0 5L10 10M0 5H10" fill="none" '
        f'stroke="{GRIS}" stroke-width="1.3"/></marker>',
        '</defs>',
        f'<text x="24" y="34" font-size="17" font-weight="bold" fill="{ENCRE}">{echapper(titre)}</text>',
    ]


# ---------------------------------------------------------------------
# Modèle conceptuel : entités et associations, sans détail technique
# ---------------------------------------------------------------------
def _bord(boite, vers):
    """
    Point où un lien touche le bord d'une forme.

    Tracer les liens de centre à centre les ferait passer sous les boîtes et
    les losanges, ce qui rend le schéma illisible dès qu'il y a plus de
    quelques entités.
    """
    x, y, w, h = boite
    cx, cy = x + w / 2, y + h / 2
    dx, dy = vers[0] - cx, vers[1] - cy
    if dx == 0 and dy == 0:
        return cx, cy
    # Facteur d'échelle pour atteindre le bord du rectangle
    fx = (w / 2) / abs(dx) if dx else float('inf')
    fy = (h / 2) / abs(dy) if dy else float('inf')
    f = min(fx, fy)
    return cx + dx * f, cy + dy * f


def _bord_losange(centre, demi_l, demi_h, vers):
    cx, cy = centre
    dx, dy = vers[0] - cx, vers[1] - cy
    if dx == 0 and dy == 0:
        return cx, cy
    # Losange : |x|/a + |y|/b = 1
    f = 1 / (abs(dx) / demi_l + abs(dy) / demi_h)
    return cx + dx * f, cy + dy * f


def mcd(nom_fichier, titre, entites, associations, largeur=1100, hauteur=760, legende=None):
    """
    Les entités sont des rectangles, les associations des losanges, et les
    cardinalités sont portées près de l'entité qu'elles concernent. C'est la
    représentation attendue dans un mémoire de conception.
    """
    L = entete_svg(largeur, hauteur, titre)

    boites = {}
    for cle, e in entites.items():
        w = e.get('w', 180)
        h = 34 + 18 * len(e['attrs'])
        boites[cle] = (e['x'], e['y'], w, h)

    DEMI_L, DEMI_H = 72, 23

    # Liens d'abord, pour qu'ils passent sous les formes
    for a in associations:
        centre = (a['x'], a['y'])
        for cote in ('gauche', 'droite'):
            if cote not in a:
                continue
            cible, cardinalite = a[cote]
            boite = boites[cible]
            cx, cy = boite[0] + boite[2] / 2, boite[1] + boite[3] / 2

            depart = _bord_losange(centre, DEMI_L, DEMI_H, (cx, cy))
            arrivee = _bord(boite, centre)

            L.append(
                f'<line x1="{depart[0]:.1f}" y1="{depart[1]:.1f}" '
                f'x2="{arrivee[0]:.1f}" y2="{arrivee[1]:.1f}" '
                f'stroke="{GRIS}" stroke-width="1.2"/>'
            )

            # La cardinalité est posée aux deux tiers du lien, du côté de
            # l'entité : c'est elle qu'elle qualifie, et la coller au losange
            # laisserait douter de laquelle il s'agit.
            mx = depart[0] + (arrivee[0] - depart[0]) * 0.56
            my = depart[1] + (arrivee[1] - depart[1]) * 0.56
            L.append(
                f'<rect x="{mx - 21:.1f}" y="{my - 10:.1f}" width="42" height="18" rx="9" '
                f'fill="{FOND}" stroke="{TRAIT}" stroke-width="0.8"/>'
                f'<text x="{mx:.1f}" y="{my + 4:.1f}" font-size="10.5" fill="{GRIS}" '
                f'text-anchor="middle">{cardinalite}</text>'
            )

    # Entités
    for cle, e in entites.items():
        x, y, w, h = boites[cle]
        couleur = e.get('couleur', ENCRE)
        L.append(
            f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="4" fill="{PAPIER}" '
            f'stroke="{couleur}" stroke-width="1.6"/>'
            f'<path d="M{x} {y + 4}a4 4 0 0 1 4-4h{w - 8}a4 4 0 0 1 4 4v22H{x}z" fill="{couleur}"/>'
            f'<text x="{x + w / 2:.0f}" y="{y + 18}" font-size="12.5" font-weight="bold" '
            f'fill="{PAPIER}" text-anchor="middle">{echapper(e["nom"])}</text>'
        )
        for i, attr in enumerate(e['attrs']):
            souligne = attr.startswith('#')
            texte = attr[1:] if souligne else attr
            ty = y + 44 + 18 * i
            L.append(
                f'<text x="{x + 10}" y="{ty}" font-size="11" fill="{ENCRE}">'
                f'{echapper(texte)}</text>'
            )
            if souligne:
                # Soulignement tracé explicitement : l'attribut de style du
                # texte n'est pas rendu de la même façon par tous les outils
                # de conversion, et un identifiant non souligné change le sens
                # du schéma.
                largeur_texte = 5.9 * len(texte)
                L.append(
                    f'<line x1="{x + 10}" y1="{ty + 3}" x2="{x + 10 + largeur_texte:.0f}" '
                    f'y2="{ty + 3}" stroke="{ENCRE}" stroke-width="1"/>'
                )

    # Associations
    for a in associations:
        ax, ay = a['x'], a['y']
        L.append(
            f'<polygon points="{ax},{ay - DEMI_H} {ax + DEMI_L},{ay} {ax},{ay + DEMI_H} '
            f'{ax - DEMI_L},{ay}" fill="{PAPIER}" stroke="{OCRE}" stroke-width="1.6"/>'
            f'<text x="{ax}" y="{ay + 4}" font-size="11" fill="{ENCRE}" '
            f'text-anchor="middle">{echapper(a["nom"])}</text>'
        )

    if legende:
        ly = hauteur - 18 - 15 * (len(legende) - 1)
        for i, ligne in enumerate(legende):
            L.append(
                f'<text x="24" y="{ly + 15 * i}" font-size="10.5" fill="{GRIS}">'
                f'{echapper(ligne)}</text>'
            )

    L.append('</svg>')
    chemin = os.path.join(SORTIE, nom_fichier)
    open(chemin, 'w', encoding='utf-8').write('\n'.join(L))
    return chemin


# ---------------------------------------------------------------------
# Modèle logique : tables, colonnes, clés
# ---------------------------------------------------------------------
def mld(nom_fichier, titre, groupes, tables, largeur=1500, hauteur=1000, legende=None):
    L = entete_svg(largeur, hauteur, titre)
    boites = {}

    for g in groupes:
        for nom, (x, y) in g['tables'].items():
            colonnes = tables[nom]
            w = g.get('w', 215)
            h = 30 + 15 * len(colonnes) + 6
            boites[nom] = (x, y, w, h)

    # Liens de clé étrangère
    for nom, (x, y, w, h) in boites.items():
        for i, c in enumerate(tables[nom]):
            if not c['fk'] or c['fk'] not in boites:
                continue
            if c['fk'] == nom:
                continue
            tx, ty, tw, th = boites[c['fk']]
            depart_y = y + 38 + 15 * i
            depart_x = x if tx + tw / 2 < x + w / 2 else x + w
            arrivee_x = tx + tw if depart_x == x else tx
            arrivee_y = ty + th / 2
            milieu = (depart_x + arrivee_x) / 2
            L.append(
                f'<path d="M{depart_x} {depart_y} C{milieu} {depart_y}, {milieu} {arrivee_y}, '
                f'{arrivee_x} {arrivee_y}" fill="none" stroke="{GRIS}" stroke-width="0.9" '
                f'stroke-opacity="0.55" marker-end="url(#fleche)"/>'
            )

    for g in groupes:
        couleur = g['couleur']
        for nom, (x, y) in g['tables'].items():
            colonnes = tables[nom]
            w, h = boites[nom][2], boites[nom][3]
            L.append(
                f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="4" fill="{PAPIER}" '
                f'stroke="{couleur}" stroke-width="1.4"/>'
                f'<rect x="{x}" y="{y}" width="{w}" height="22" rx="4" fill="{couleur}"/>'
                f'<rect x="{x}" y="{y + 14}" width="{w}" height="8" fill="{couleur}"/>'
                f'<text x="{x + 8}" y="{y + 15}" font-size="11.5" font-weight="bold" '
                f'fill="{PAPIER}">{echapper(nom)}</text>'
            )
            for i, c in enumerate(colonnes):
                ty = y + 38 + 15 * i
                marque = ''
                couleur_texte = ENCRE
                if c['pk']:
                    marque = 'PK '
                    couleur_texte = OCRE
                elif c['fk']:
                    marque = 'FK '
                    couleur_texte = TERRAIN
                etoile = ' *' if c['obligatoire'] and not c['pk'] else ''
                L.append(
                    f'<text x="{x + 8}" y="{ty}" font-size="10" fill="{couleur_texte}">'
                    f'{echapper(marque + c["nom"] + etoile)}</text>'
                )

    # Légende des groupes
    lx, ly = 24, hauteur - 54
    for g in groupes:
        L.append(
            f'<rect x="{lx}" y="{ly - 9}" width="12" height="12" rx="2" fill="{g["couleur"]}"/>'
            f'<text x="{lx + 18}" y="{ly}" font-size="11" fill="{ENCRE}">{echapper(g["nom"])}</text>'
        )
        lx += 34 + 6.6 * len(g['nom']) + 34

    if legende:
        for i, ligne in enumerate(legende):
            L.append(
                f'<text x="24" y="{hauteur - 28 + 14 * i}" font-size="10.5" fill="{GRIS}">'
                f'{echapper(ligne)}</text>'
            )

    L.append('</svg>')
    chemin = os.path.join(SORTIE, nom_fichier)
    open(chemin, 'w', encoding='utf-8').write('\n'.join(L))
    return chemin


# =====================================================================
# Production des trois schémas
# =====================================================================
if __name__ == '__main__':
    tables = lire_schema()

    # --- Schéma 1 : modèle conceptuel, le cœur du modèle --------------
    mcd(
        'mcd-coeur.svg',
        'Modèle conceptuel de données — cœur du modèle',
        entites={
            'personne': {
                'nom': 'PERSONNE', 'x': 60, 'y': 90, 'w': 185, 'couleur': ENCRE,
                'attrs': ['#identifiant', 'nom', 'date de naissance', 'sexe', 'rôle',
                          'adresse électronique'],
            },
            'sportif': {
                'nom': 'SPORTIF', 'x': 60, 'y': 300, 'w': 185, 'couleur': ENCRE,
                'attrs': ['#identifiant', 'latéralité', 'statut'],
            },
            'socle': {
                'nom': 'SOCLE', 'x': 60, 'y': 450, 'w': 185, 'couleur': GRIS,
                'attrs': ['âge premier contact', 'âge première structure',
                          'contexte initial', 'soutien familial', 'conditions'],
            },
            'etape': {
                'nom': 'ÉTAPE', 'x': 470, 'y': 300, 'w': 190, 'couleur': ENCRE,
                'attrs': ['#identifiant', 'début', 'fin', 'niveau',
                          'motif de fin', 'fiabilité'],
            },
            'structure': {
                'nom': 'STRUCTURE', 'x': 860, 'y': 300, 'w': 190, 'couleur': ENCRE,
                'attrs': ['#identifiant', 'nom', 'type', 'latitude', 'longitude',
                          'vérifiée'],
            },
            'unite': {
                'nom': 'UNITÉ ADMINISTRATIVE', 'x': 840, 'y': 90, 'w': 215, 'couleur': TERRAIN,
                'attrs': ['#code', 'nom', 'niveau', 'latitude', 'longitude', 'population'],
            },
            'transition': {
                'nom': 'TRANSITION', 'x': 455, 'y': 545, 'w': 215, 'couleur': OCRE,
                'attrs': ['#identifiant', 'mode d\u2019arrivée', 'date d\u2019effet',
                          'fiabilité'],
            },
        },
        associations=[
            {'nom': 'est un', 'x': 152, 'y': 266,
             'gauche': ('personne', '1,1'), 'droite': ('sportif', '1,1')},
            {'nom': 'part de', 'x': 152, 'y': 419,
             'gauche': ('sportif', '0,1'), 'droite': ('socle', '1,1')},
            {'nom': 'parcourt', 'x': 358, 'y': 350,
             'gauche': ('sportif', '0,n'), 'droite': ('etape', '1,1')},
            {'nom': 'se déroule dans', 'x': 760, 'y': 350,
             'gauche': ('etape', '0,1'), 'droite': ('structure', '0,n')},
            {'nom': 'est situé dans', 'x': 947, 'y': 266,
             'gauche': ('structure', '1,1'), 'droite': ('unite', '0,n')},
            {'nom': 'mène à', 'x': 565, 'y': 495,
             'gauche': ('transition', '1,1'), 'droite': ('etape', '0,1')},
        ],
        largeur=1120, hauteur=720,
        legende=[
            'Les attributs soulignés sont les identifiants.',
            'La TRANSITION est une entité à part entière et non un attribut de l\u2019ÉTAPE : elle porte le mode d\u2019arrivée,',
            'information que ni l\u2019étape précédente ni la suivante ne contiennent.',
            'Chaque ÉTAPE conserve son UNITÉ ADMINISTRATIVE au moment où elle s\u2019est déroulée, indépendamment',
            'de l\u2019adresse actuelle de la structure.',
        ],
    )
    print('mcd-coeur.svg')

    # --- Schéma 2 : évaluation et progression -------------------------
    mcd(
        'mcd-evaluation.svg',
        'Modèle conceptuel de données — évaluation et progression sportive',
        entites={
            'discipline': {
                'nom': 'DISCIPLINE', 'x': 60, 'y': 70, 'w': 175, 'couleur': TERRAIN,
                'attrs': ['#identifiant', 'nom', 'type', 'avec grades',
                          'avec catégories'],
            },
            'sportif': {
                'nom': 'SPORTIF', 'x': 60, 'y': 300, 'w': 175, 'couleur': ENCRE,
                'attrs': ['#identifiant', 'statut'],
            },
            'evaluation': {
                'nom': 'ÉVALUATION', 'x': 470, 'y': 70, 'w': 190, 'couleur': ENCRE,
                'attrs': ['#identifiant', 'date', 'contexte', 'commentaire'],
            },
            'critere': {
                'nom': 'CRITÈRE', 'x': 900, 'y': 70, 'w': 200, 'couleur': TERRAIN,
                'attrs': ['#identifiant', 'famille', 'nom', 'description'],
            },
            'grade': {
                'nom': 'GRADE', 'x': 900, 'y': 300, 'w': 200, 'couleur': TERRAIN,
                'attrs': ['#identifiant', 'nom', 'ordre'],
            },
            'mesure': {
                'nom': 'MESURE', 'x': 470, 'y': 470, 'w': 190, 'couleur': GRIS,
                'attrs': ['type', 'valeur', 'date', 'source'],
            },
            'categorie': {
                'nom': 'CATÉGORIE DE POIDS', 'x': 890, 'y': 470, 'w': 210, 'couleur': TERRAIN,
                'attrs': ['#identifiant', 'nom', 'sexe', 'tranche d\u2019âge',
                          'poids mini', 'poids maxi'],
            },
        },
        associations=[
            {'nom': 'pratique', 'x': 148, 'y': 247,
             'gauche': ('discipline', '0,n'), 'droite': ('sportif', '1,1')},
            {'nom': 'reçoit', 'x': 352, 'y': 230,
             'gauche': ('sportif', '0,n'), 'droite': ('evaluation', '1,1')},
            {'nom': 'note', 'x': 780, 'y': 123,
             'gauche': ('evaluation', '1,n'), 'droite': ('critere', '0,n')},
            {'nom': 'a obtenu', 'x': 610, 'y': 344,
             'gauche': ('sportif', '0,n'), 'droite': ('grade', '0,n')},
            {'nom': 'est mesuré', 'x': 300, 'y': 420,
             'gauche': ('sportif', '0,n'), 'droite': ('mesure', '1,1')},
            {'nom': 'appartient à', 'x': 420, 'y': 706,
             'gauche': ('sportif', '0,n'), 'droite': ('categorie', '0,n')},
        ],
        largeur=1180, hauteur=820,
        legende=[
            'Les associations « a obtenu » et « appartient à » portent leurs propres attributs : date d\u2019obtention et',
            'autorité pour un grade, période de début et de fin pour une catégorie de poids. Elles deviennent donc',
            'des tables à part entière dans le modèle logique.',
            'Le type de la DISCIPLINE commande la présence des grades et des catégories : un sport collectif n\u2019en a pas.',
        ],
    )
    print('mcd-evaluation.svg')

    # --- Schéma 3 : modèle logique complet ----------------------------
    mld(
        'mld-complet.svg',
        'Modèle logique de données — schéma relationnel complet',
        groupes=[
            {
                'nom': 'Référentiels', 'couleur': TERRAIN,
                'tables': {
                    'unites_admin': (30, 70),
                    'disciplines': (30, 270),
                    'postes': (30, 440),
                    'types_structure': (30, 560),
                    'criteres': (30, 680),
                    'grades': (30, 840),
                },
            },
            {
                'nom': 'Acteurs', 'couleur': ENCRE,
                'tables': {
                    'structures': (290, 70),
                    'personnes': (290, 290),
                    'sportifs': (290, 660),
                    'sessions': (290, 810),
                    'codes_acces': (290, 920),
                },
            },
            {
                'nom': 'Traces du parcours', 'couleur': OCRE,
                'tables': {
                    'socles': (570, 70),
                    'etapes': (570, 290),
                    'transitions': (570, 610),
                    'contestations': (570, 830),
                },
            },
            {
                'nom': 'Contexte et évaluation', 'couleur': GRIS,
                'tables': {
                    'evenements': (850, 70),
                    'participations': (850, 290),
                    'mesures': (850, 400),
                    'evaluations': (850, 580),
                    'notes_evaluation': (850, 740),
                    'grades_obtenus': (1130, 70),
                    'categories_poids': (1130, 290),
                    'appartenances_poids': (1130, 460),
                    'fichiers': (1130, 610),
                },
            },
        ],
        tables=tables,
        largeur=1420, hauteur=1180,
        legende=[
            'PK : clé primaire.  FK : clé étrangère.  * : valeur obligatoire.',
            'Les flèches vont de la clé étrangère vers la table référencée.',
        ],
    )
    print('mld-complet.svg')
