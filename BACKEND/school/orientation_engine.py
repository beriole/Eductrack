"""Moteur d'orientation scolaire (système camerounais).

À partir des résultats RÉELS d'un test intensif (scores par matière) et des
lacunes de l'élève, calcule une affinité pondérée pour chaque série et
recommande la mieux adaptée. Aucune valeur factice : tout dérive du test.
"""

# Chaque série = coefficients par code matière + métadonnées d'orientation.
SERIES_CONFIG = {
    'C': {
        'label': 'Série C — Mathématiques et Physique-Chimie',
        'coefs': {'MATH': 4, 'PHY': 3, 'CHI': 2, 'SVT': 1, 'INFO': 1},
        'aptitudes': ['Raisonnement logique', 'Calcul avancé', 'Physique expérimentale'],
        'metiers': ['Ingénieur', 'Médecin', 'Architecte', 'Pilote de ligne', 'Data scientist'],
        'filieres': ['Polytechnique (UY1)', 'ENSP Yaoundé', 'Faculté des Sciences', 'Médecine (FMSB)', 'ENSET Douala'],
    },
    'D': {
        'label': 'Série D — Mathématiques et Sciences de la Vie et de la Terre',
        'coefs': {'SVT': 4, 'CHI': 3, 'MATH': 2, 'PHY': 2},
        'aptitudes': ['Biologie cellulaire', 'Chimie organique', 'Observation scientifique'],
        'metiers': ['Médecin', 'Pharmacien', 'Biologiste', 'Agronome', 'Vétérinaire'],
        'filieres': ['Médecine (FMSB UY1)', 'Pharmacie', 'FASA Dschang', 'Biochimie', 'IUT Ngaoundéré'],
    },
    'E': {
        'label': 'Série E — Mathématiques et Techniques Industrielles',
        'coefs': {'MATH': 4, 'PHY': 3, 'INFO': 2},
        'aptitudes': ['Mathématiques appliquées', 'Électronique', 'Mécanique industrielle'],
        'metiers': ['Ingénieur industriel', 'Technicien BTP', 'Géomètre', 'Roboticien'],
        'filieres': ['IUT (UY1)', 'ENSET Douala', 'BTS Technique', 'Instituts polytechniques'],
    },
    'TI': {
        'label': 'Série TI — Technologies de l\'Information',
        'coefs': {'INFO': 4, 'MATH': 3, 'PHY': 1},
        'aptitudes': ['Algorithmique', 'Logique', 'Résolution de problèmes'],
        'metiers': ['Développeur', 'Ingénieur réseaux', 'Cybersécurité', 'Administrateur systèmes'],
        'filieres': ['IUT Génie Informatique', 'ENSPY Informatique', 'ISTDI', 'Fac Sciences Info'],
    },
    'A1': {
        'label': 'Série A1 — Lettres et Philosophie',
        'coefs': {'FRAN': 4, 'PHIL': 3, 'ANGL': 2, 'HIS': 1},
        'aptitudes': ['Expression écrite', 'Analyse littéraire', 'Philosophie', 'Langues'],
        'metiers': ['Journaliste', 'Avocat', 'Professeur de Lettres', 'Écrivain', 'Diplomate'],
        'filieres': ['FALSH (UY1)', 'Sciences Politiques', 'ENS Yaoundé', 'ESSTIC', 'IRIC'],
    },
    'A4': {
        'label': 'Série A4 — Sciences Humaines et Sociales',
        'coefs': {'HIS': 3, 'GEO': 3, 'FRAN': 2, 'ECO': 2, 'ECM': 1},
        'aptitudes': ['Sciences sociales', 'Histoire-Géographie', 'Analyse économique'],
        'metiers': ['Historien', 'Sociologue', 'Économiste', 'Enseignant', 'Gestionnaire RH'],
        'filieres': ['FALSH (UY1)', 'FSEG (UY2)', 'Droit (FSJP)', 'ENS Maroua', 'IRIC'],
    },
    'G': {
        'label': 'Série G — Sciences Commerciales et de Gestion',
        'coefs': {'ECO': 4, 'MATH': 2, 'FRAN': 1, 'ANGL': 1},
        'aptitudes': ['Commerce', 'Gestion financière', 'Communication commerciale'],
        'metiers': ['Comptable', 'Gestionnaire', 'Commercial', 'Banquier', 'Entrepreneur'],
        'filieres': ['ESSEC Douala', 'FSEG (UY2)', 'BTS Commerce', 'IUT GEA', 'ISTDI'],
    },
}

# Pénalité d'affinité si une matière à fort coefficient est une lacune avérée.
PENALITE_LACUNE = 8


def _affinite(scores, coefs, lacunes_codes):
    """Moyenne pondérée des scores pour une série, sur les matières testées.

    Applique une pénalité par matière à fort coefficient (>=3) en lacune."""
    num = den = 0.0
    penalite = 0.0
    for code, coef in coefs.items():
        if code in scores:
            num += coef * scores[code]
            den += coef
            if coef >= 3 and code in lacunes_codes:
                penalite += PENALITE_LACUNE
    if den == 0:
        return 0.0
    return max(0.0, round(num / den - penalite, 2))


def analyser_orientation(scores_par_matiere, lacunes_codes=None):
    """Calcule l'orientation à partir des scores réels par matière.

    `scores_par_matiere` : {code_matiere: score 0-100}.
    `lacunes_codes`      : set de codes matière où l'élève a des lacunes.
    Renvoie un dict prêt pour le modèle Orientations + le détail (classement)."""
    lacunes_codes = set(lacunes_codes or [])
    scores = {k: float(v) for k, v in scores_par_matiere.items()}

    classement = []
    for serie, config in SERIES_CONFIG.items():
        classement.append({
            'serie': serie,
            'label': config['label'],
            'affinite': _affinite(scores, config['coefs'], lacunes_codes),
        })
    classement.sort(key=lambda x: -x['affinite'])

    best = classement[0]['serie']
    cfg = SERIES_CONFIG[best]
    score_global = round(sum(scores.values()) / len(scores), 2) if scores else 0.0

    return {
        'serie_recommandee': best,
        'serie_label': cfg['label'],
        'aptitudes_detectees': cfg['aptitudes'],
        'metiers_recommandes': cfg['metiers'],
        'filieres_superieures': cfg['filieres'],
        'score_global': score_global,
        'classement': classement,
    }
