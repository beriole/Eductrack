import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/lib/api';
import { StarRating } from '@/src/components/Feedback';
import { colors, radius, spacing, shadow } from '@/src/theme';

interface Contenu {
  id: string; type: 'cours' | 'epreuve'; titre: string; matiere_nom: string;
  note_moyenne: number | null; nb_avis: number; nb_favoris: number;
}
interface Commentaire {
  id_avis: string; note: number; commentaire: string; eleve_nom: string; contenu_titre: string; date_creation: string;
}
interface Retours {
  resume: { note_moyenne_globale: number | null; nb_avis: number; nb_favoris: number; nb_contenus_notes: number };
  contenus: Contenu[];
  derniers_commentaires: Commentaire[];
}

export default function RetoursScreen() {
  const router = useRouter();
  const [data, setData] = useState<Retours | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    try { const r = await api.get('/enseignant/retours/'); setData(r.data); } catch {}
  };
  useEffect(() => { fetchData().finally(() => setLoading(false)); }, []);
  const onRefresh = async () => { setRefreshing(true); await fetchData(); setRefreshing(false); };

  if (loading) return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;
  if (!data) return null;

  const { resume, contenus, derniers_commentaires } = data;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backRow}>
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Retours des élèves</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>

        {/* Résumé */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Ionicons name="star" size={20} color="#F59E0B" />
            <Text style={styles.statValue}>{resume.note_moyenne_globale != null ? resume.note_moyenne_globale.toFixed(1) : '—'}</Text>
            <Text style={styles.statLabel}>Note moyenne</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="chatbubble-ellipses" size={20} color={colors.primary} />
            <Text style={styles.statValue}>{resume.nb_avis}</Text>
            <Text style={styles.statLabel}>Avis reçus</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="heart" size={20} color={colors.danger} />
            <Text style={styles.statValue}>{resume.nb_favoris}</Text>
            <Text style={styles.statLabel}>Favoris</Text>
          </View>
        </View>

        {/* Contenus notés */}
        <Text style={styles.section}>Mes contenus</Text>
        {contenus.length === 0 ? (
          <Text style={styles.empty}>Aucun contenu publié pour l'instant.</Text>
        ) : contenus.map((c) => (
          <View key={`${c.type}-${c.id}`} style={styles.contenuCard}>
            <View style={[styles.contenuIcon, { backgroundColor: c.type === 'cours' ? `${colors.primary}15` : `${colors.violet}15` }]}>
              <Ionicons name={c.type === 'cours' ? 'book' : 'document-text'} size={18} color={c.type === 'cours' ? colors.primary : colors.violet} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.contenuTitre} numberOfLines={1}>{c.titre}</Text>
              <Text style={styles.contenuSub}>{c.matiere_nom}</Text>
              <View style={styles.contenuMeta}>
                <StarRating value={Math.round(c.note_moyenne ?? 0)} size={13} />
                <Text style={styles.metaText}>{c.note_moyenne != null ? c.note_moyenne.toFixed(1) : '—'} · {c.nb_avis} avis</Text>
                <View style={styles.favMeta}><Ionicons name="heart" size={12} color={colors.danger} /><Text style={styles.metaText}>{c.nb_favoris}</Text></View>
              </View>
            </View>
          </View>
        ))}

        {/* Commentaires */}
        <Text style={styles.section}>Derniers commentaires</Text>
        {derniers_commentaires.length === 0 ? (
          <Text style={styles.empty}>Pas encore de commentaire.</Text>
        ) : derniers_commentaires.map((cm) => (
          <View key={cm.id_avis} style={styles.commentCard}>
            <View style={styles.commentHead}>
              <Text style={styles.commentAuteur}>{cm.eleve_nom}</Text>
              <StarRating value={cm.note} size={13} />
            </View>
            <Text style={styles.commentContenu} numberOfLines={1}>sur « {cm.contenu_titre} »</Text>
            <Text style={styles.commentTexte}>{cm.commentaire}</Text>
          </View>
        ))}

        <View style={{ height: 30 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.md, paddingTop: 56, paddingBottom: 10 },
  backRow: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', ...shadow.sm },
  title: { fontSize: 20, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
  scroll: { padding: spacing.md },
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14, alignItems: 'center', gap: 4, ...shadow.sm },
  statValue: { fontSize: 22, fontWeight: '800', color: colors.text },
  statLabel: { fontSize: 11, color: colors.textMuted, textAlign: 'center' },
  section: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: 24, marginBottom: 12 },
  empty: { fontSize: 13.5, color: colors.textMuted },
  contenuCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14, marginBottom: 10, ...shadow.sm },
  contenuIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  contenuTitre: { fontSize: 14.5, fontWeight: '700', color: colors.text },
  contenuSub: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  contenuMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  metaText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  favMeta: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  commentCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14, marginBottom: 10, ...shadow.sm },
  commentHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  commentAuteur: { fontSize: 14, fontWeight: '800', color: colors.text },
  commentContenu: { fontSize: 12, color: colors.textLight, marginTop: 2, fontStyle: 'italic' },
  commentTexte: { fontSize: 13.5, color: colors.text, lineHeight: 20, marginTop: 6 },
});
