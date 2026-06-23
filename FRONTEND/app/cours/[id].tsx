import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  ActivityIndicator, TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/lib/api';
import { GradientBox } from '@/src/components/GradientBox';
import { PdfViewButton } from '@/src/components/Pdf';
import { ContentFeedback } from '@/src/components/Feedback';
import { colors, radius, spacing, shadow, subjectColor, subjectIconName } from '@/src/theme';

interface CoursDetail {
  id_cours: string;
  titre: string;
  contenu: string;
  matiere_nom: string;
  matiere_code: string;
  enseignant_nom: string;
  niveau: string;
  serie: string;
  nb_vues: number;
  duree_lecture_min: number;
  resume: string;
  statut: string;
  date_publication: string;
  fichier_pdf?: string | null;
  note_moyenne?: number | null;
  nb_avis?: number;
  mon_avis?: { note: number; commentaire: string | null } | null;
  est_favori?: boolean;
}

export default function CoursDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [cours, setCours] = useState<CoursDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    api.get(`/cours/${id}/`)
      .then((res) => setCours(res.data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }
  if (error || !cours) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Cours introuvable.</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.backLinkRow}>
          <Ionicons name="arrow-back" size={16} color={colors.primary} />
          <Text style={styles.backLink}>Retour</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const color = subjectColor(cours.matiere_code);

  const onScroll = (e: any) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const scrollable = contentSize.height - layoutMeasurement.height;
    setProgress(scrollable > 0 ? Math.min(1, contentOffset.y / scrollable) : 0);
  };

  return (
    <View style={styles.container}>
      {/* Barre de progression de lecture */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressBar, { width: `${progress * 100}%`, backgroundColor: color }]} />
      </View>

      <ScrollView scrollEventThrottle={16} onScroll={onScroll}>
        {/* En-tête dégradé aux couleurs de la matière */}
        <GradientBox colors={[`${color}E6`, color]} style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={16} color="#fff" />
            <Text style={styles.backBtnText}>Retour</Text>
          </TouchableOpacity>
          <Ionicons name={subjectIconName(cours.matiere_code)} size={48} color="#fff" style={styles.headerIcon} />
          <View style={styles.badges}>
            <View style={styles.badge}><Text style={styles.badgeText}>{cours.matiere_nom}</Text></View>
            <View style={styles.badge}><Text style={styles.badgeText}>{cours.niveau}{cours.serie ? ` · ${cours.serie}` : ''}</Text></View>
          </View>
          <Text style={styles.titre}>{cours.titre}</Text>
          <Text style={styles.meta}>
            Par {cours.enseignant_nom} · {cours.nb_vues} vues
            {cours.duree_lecture_min ? ` · ${cours.duree_lecture_min} min de lecture` : ''}
          </Text>
        </GradientBox>

        {/* Résumé */}
        {cours.resume ? (
          <View style={[styles.resumeBox, { borderLeftColor: color }]}>
            <View style={styles.resumeLabelRow}>
              <Ionicons name="sparkles" size={14} color={color} />
              <Text style={[styles.resumeLabel, { color }]}>En bref</Text>
            </View>
            <Text style={styles.resumeText}>{cours.resume}</Text>
          </View>
        ) : null}

        {/* Document PDF du cours (si fourni par l'enseignant) */}
        {cours.fichier_pdf ? (
          <View style={{ marginHorizontal: spacing.md, marginBottom: spacing.md }}>
            <PdfViewButton url={cours.fichier_pdf} label="Consulter le cours en PDF" />
          </View>
        ) : null}

        {/* Contenu (rendu Markdown léger : titres, listes, gras) */}
        <View style={styles.contenuBox}>
          {cours.contenu ? <CourseBody contenu={cours.contenu} color={color} />
            : <Text style={styles.para}>Contenu non disponible.</Text>}
        </View>

        {/* Avis & favori */}
        <View style={{ margin: spacing.md }}>
          <ContentFeedback
            cible={{ kind: 'cours', id: cours.id_cours }}
            noteMoyenne={cours.note_moyenne}
            nbAvis={cours.nb_avis}
            monAvis={cours.mon_avis}
            estFavori={cours.est_favori}
          />
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// Rendu inline du gras **texte**.
function renderInline(text: string, keyBase: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((p, i) =>
    p.startsWith('**') && p.endsWith('**')
      ? <Text key={`${keyBase}-${i}`} style={styles.bold}>{p.slice(2, -2)}</Text>
      : <Text key={`${keyBase}-${i}`}>{p}</Text>
  );
}

// Rendu Markdown minimal (titres #/##/###, listes -/•/1., gras) sans dépendance.
function CourseBody({ contenu, color }: { contenu: string; color: string }) {
  const lines = contenu.replace(/\r/g, '').split('\n');
  return (
    <>
      {lines.map((raw, idx) => {
        const line = raw.trim();
        const key = `l-${idx}`;
        if (!line) return <View key={key} style={{ height: 10 }} />;
        if (line.startsWith('### ')) return <Text key={key} style={styles.h3}>{renderInline(line.slice(4), key)}</Text>;
        if (line.startsWith('## ')) return (
          <View key={key} style={styles.h2Row}>
            <View style={[styles.h2Bar, { backgroundColor: color }]} />
            <Text style={styles.h2}>{renderInline(line.slice(3), key)}</Text>
          </View>
        );
        if (line.startsWith('# ')) return <Text key={key} style={styles.h1}>{renderInline(line.slice(2), key)}</Text>;
        const bullet = line.match(/^[-•*]\s+(.*)/);
        if (bullet) return (
          <View key={key} style={styles.bulletRow}>
            <View style={[styles.bulletDot, { backgroundColor: color }]} />
            <Text style={styles.bulletText}>{renderInline(bullet[1], key)}</Text>
          </View>
        );
        const num = line.match(/^(\d+)[.)]\s+(.*)/);
        if (num) return (
          <View key={key} style={styles.bulletRow}>
            <Text style={[styles.numDot, { color }]}>{num[1]}.</Text>
            <Text style={styles.bulletText}>{renderInline(num[2], key)}</Text>
          </View>
        );
        return <Text key={key} style={styles.para}>{renderInline(line, key)}</Text>;
      })}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.lg, backgroundColor: colors.bg },
  errorText: { fontSize: 16, color: colors.danger, marginBottom: 12 },
  backLinkRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  backLink: { color: colors.primary, fontSize: 15, fontWeight: '600' },
  progressTrack: { height: 3, backgroundColor: colors.border, zIndex: 10 },
  progressBar: { height: 3 },
  header: { paddingHorizontal: spacing.lg, paddingTop: 52, paddingBottom: spacing.lg },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.md },
  backBtnText: { color: 'rgba(255,255,255,0.9)', fontSize: 14, fontWeight: '700' },
  headerIcon: { marginBottom: 8 },
  badges: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  badge: { backgroundColor: 'rgba(255,255,255,0.22)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.sm },
  badgeText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  titre: { fontSize: 24, fontWeight: '800', color: '#fff', marginBottom: 8, letterSpacing: -0.3 },
  meta: { fontSize: 12, color: 'rgba(255,255,255,0.85)' },
  resumeBox: {
    margin: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md,
    padding: spacing.md, borderLeftWidth: 4, ...shadow.sm,
  },
  resumeLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 },
  resumeLabel: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  resumeText: { fontSize: 14, color: colors.textMuted, lineHeight: 22 },
  contenuBox: {
    marginHorizontal: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.lg, borderWidth: 1, borderColor: colors.border, ...shadow.sm,
  },
  para: { fontSize: 16, color: colors.text, lineHeight: 27, marginBottom: 2 },
  bold: { fontWeight: '800', color: colors.text },
  h1: { fontSize: 22, fontWeight: '900', color: colors.text, letterSpacing: -0.4, marginTop: 6, marginBottom: 10 },
  h2Row: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 18, marginBottom: 10 },
  h2Bar: { width: 4, height: 20, borderRadius: 2 },
  h2: { flex: 1, fontSize: 18, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
  h3: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: 12, marginBottom: 6 },
  bulletRow: { flexDirection: 'row', gap: 10, marginBottom: 8, paddingLeft: 2 },
  bulletDot: { width: 7, height: 7, borderRadius: 4, marginTop: 8 },
  numDot: { fontSize: 15, fontWeight: '900', marginTop: 1, minWidth: 20 },
  bulletText: { flex: 1, fontSize: 15.5, color: colors.text, lineHeight: 24 },
});
