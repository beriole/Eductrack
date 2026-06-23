import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/lib/api';
import { useAuthStore } from '@/src/store/authStore';
import { GradientHeader } from '@/src/components/GradientHeader';
import { colors, radius, spacing, shadow } from '@/src/theme';

interface LeaderboardEntry {
  rang: number;
  nom: string;
  prenom: string;
  points: number;
  region: string;
  niveau: string;
  avatar: string | null;
}

interface LeaderboardData {
  leaderboard: LeaderboardEntry[];
  ma_position: number | null;
}

const REGIONS = ['Tous', 'Centre', 'Littoral', 'Ouest', 'Nord', 'Sud', 'Est', 'Adamaoua', 'Nord-Ouest', 'Sud-Ouest', 'Extrême-Nord'];
const NIVEAUX = ['Tous', '6e', '5e', '4e', '3e', '2nde', '1ere', 'Tle'];

const PODIUM = {
  1: { color: '#F59E0B', tint: '#FEF3C7', height: 92, icon: 'trophy' as const },
  2: { color: '#94A3B8', tint: '#F1F5F9', height: 72, icon: 'medal' as const },
  3: { color: '#D97706', tint: '#FEF0E6', height: 58, icon: 'medal' as const },
};

const initials = (e: LeaderboardEntry) => ((e.prenom?.[0] ?? '') + (e.nom?.[0] ?? '')).toUpperCase();

export default function ClassementScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [region, setRegion] = useState('Tous');
  const [niveau, setNiveau] = useState('Tous');

  const fetchData = async () => {
    try {
      const params: Record<string, string> = {};
      if (region !== 'Tous') params.region = region;
      if (niveau !== 'Tous') params.niveau = niveau;
      const res = await api.get('/gamification/leaderboard/', { params });
      setData(res.data);
    } catch {}
  };

  useEffect(() => {
    setLoading(true);
    fetchData().finally(() => setLoading(false));
  }, [region, niveau]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const all = data?.leaderboard ?? [];
  const top3 = all.slice(0, 3);
  const rest = all.slice(3);
  const moi = user?.role === 'eleve' && data?.ma_position
    ? all.find((e) => e.rang === data.ma_position) : undefined;

  return (
    <View style={styles.container}>
      {/* En-tête dégradé */}
      <GradientHeader
        title="Classement"
        subtitle="Les meilleurs élèves"
        icon="trophy"
        right={
          user?.role === 'eleve' ? (
            <TouchableOpacity style={styles.headerBtn} onPress={() => router.push('/defis')} activeOpacity={0.85}>
              <Ionicons name="ribbon" size={15} color="#fff" />
              <Text style={styles.headerBtnText}>Défis</Text>
            </TouchableOpacity>
          ) : data?.ma_position ? (
            <View style={styles.headerBtn}>
              <Ionicons name="person" size={13} color="#fff" />
              <Text style={styles.headerBtnText}>#{data.ma_position}</Text>
            </View>
          ) : undefined
        }
      />

      {/* Filtres */}
      <View style={styles.filters}>
        <FlatList
          horizontal showsHorizontalScrollIndicator={false}
          data={REGIONS} keyExtractor={(r) => r}
          contentContainerStyle={styles.filterRow}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.chip, region === item && styles.chipActive]}
              onPress={() => setRegion(item)} activeOpacity={0.8}
            >
              <Text style={[styles.chipText, region === item && styles.chipTextActive]}>{item}</Text>
            </TouchableOpacity>
          )}
        />
        <FlatList
          horizontal showsHorizontalScrollIndicator={false}
          data={NIVEAUX} keyExtractor={(n) => n}
          contentContainerStyle={styles.filterRow}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.chipSm, niveau === item && styles.chipActive]}
              onPress={() => setNiveau(item)} activeOpacity={0.8}
            >
              <Text style={[styles.chipText, niveau === item && styles.chipTextActive]}>{item}</Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : all.length === 0 ? (
        <View style={styles.centered}>
          <View style={styles.emptyIcon}><Ionicons name="podium-outline" size={36} color={colors.primary} /></View>
          <Text style={styles.emptyText}>Aucun classement pour ces filtres.</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
          {/* Podium */}
          {top3.length > 0 && (
            <View style={styles.podium}>
              {[top3[1], top3[0], top3[2]].map((e) => {
                if (!e) return <View key={Math.random()} style={{ flex: 1 }} />;
                const meta = PODIUM[e.rang as 1 | 2 | 3];
                const isMe = e.rang === data?.ma_position;
                return (
                  <View key={e.rang} style={styles.podiumCol}>
                    <View style={[styles.podiumAvatar, { borderColor: meta.color }, isMe && styles.podiumAvatarMe]}>
                      <Text style={[styles.podiumAvatarText, { color: meta.color }]}>{initials(e)}</Text>
                      {e.rang === 1 && (
                        <View style={styles.crown}><Ionicons name="trophy" size={14} color="#fff" /></View>
                      )}
                    </View>
                    <Text style={styles.podiumName} numberOfLines={1}>{e.prenom}</Text>
                    <Text style={styles.podiumPts}>{e.points} XP</Text>
                    <View style={[styles.pedestal, { height: meta.height, backgroundColor: meta.tint, borderColor: meta.color }]}>
                      <Text style={[styles.pedestalRank, { color: meta.color }]}>{e.rang}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* Reste du classement */}
          {rest.length > 0 && (
            <View style={styles.listCard}>
              {rest.map((item) => {
                const isMe = item.rang === data?.ma_position;
                return (
                  <View key={item.rang} style={[styles.row, isMe && styles.rowMe]}>
                    <Text style={styles.rank}>{item.rang}</Text>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{initials(item)}</Text>
                    </View>
                    <View style={styles.info}>
                      <Text style={styles.name} numberOfLines={1}>
                        {item.prenom} {item.nom}{isMe ? '  (toi)' : ''}
                      </Text>
                      <Text style={styles.sub}>{item.niveau} · {item.region}</Text>
                    </View>
                    <View style={styles.ptsBadge}>
                      <Text style={styles.pts}>{item.points}</Text>
                      <Text style={styles.ptsLabel}>XP</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          <View style={{ height: moi && data?.ma_position && data.ma_position > 3 ? 86 : 20 }} />
        </ScrollView>
      )}

      {/* Carte « ma position » fixée si hors podium */}
      {moi && data?.ma_position && data.ma_position > 3 && (
        <View style={styles.meBar}>
          <Text style={styles.meRank}>#{moi.rang}</Text>
          <View style={[styles.avatar, styles.meAvatar]}>
            <Text style={[styles.avatarText, { color: colors.white }]}>{initials(moi)}</Text>
          </View>
          <View style={styles.info}>
            <Text style={[styles.name, { color: colors.white }]} numberOfLines={1}>Toi</Text>
            <Text style={[styles.sub, { color: '#C7D2FE' }]}>{moi.niveau} · {moi.region}</Text>
          </View>
          <View style={styles.meBadge}>
            <Text style={styles.mePts}>{moi.points}</Text>
            <Text style={styles.mePtsLabel}>XP</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl, marginTop: 40 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primaryLight, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  emptyText: { color: colors.textMuted, fontWeight: '600' },

  header: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingTop: 56, paddingBottom: 8 },
  title: { fontSize: 28, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 1 },
  myRankPill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.primaryLight, borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 7 },
  myRankText: { fontSize: 14, fontWeight: '800', color: colors.primary },
  defisBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.primary, borderRadius: radius.full, paddingHorizontal: 14, paddingVertical: 8, ...shadow.sm },
  defisBtnText: { fontSize: 13, fontWeight: '800', color: colors.white },
  headerBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 7 },
  headerBtnText: { fontSize: 13, fontWeight: '800', color: '#fff' },

  filters: { paddingBottom: 4 },
  filterRow: { paddingHorizontal: spacing.md, paddingVertical: 6, gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.full, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border },
  chipSm: { paddingHorizontal: 13, paddingVertical: 6, borderRadius: radius.full, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  chipText: { fontSize: 12.5, fontWeight: '700', color: colors.textMuted },
  chipTextActive: { color: colors.primary },

  scroll: { paddingHorizontal: spacing.md, paddingTop: 8 },

  podium: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10, marginBottom: 18, marginTop: 6 },
  podiumCol: { flex: 1, alignItems: 'center' },
  podiumAvatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.surface, borderWidth: 3, alignItems: 'center', justifyContent: 'center', ...shadow.md },
  podiumAvatarMe: { backgroundColor: colors.primaryLight },
  podiumAvatarText: { fontSize: 19, fontWeight: '800' },
  crown: { position: 'absolute', top: -12, alignSelf: 'center', width: 26, height: 26, borderRadius: 13, backgroundColor: '#F59E0B', alignItems: 'center', justifyContent: 'center', ...shadow.sm },
  podiumName: { fontSize: 13, fontWeight: '800', color: colors.text, marginTop: 8 },
  podiumPts: { fontSize: 12, fontWeight: '700', color: colors.textMuted, marginBottom: 8 },
  pedestal: { width: '100%', borderTopLeftRadius: radius.md, borderTopRightRadius: radius.md, borderWidth: 1, borderBottomWidth: 0, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 10 },
  pedestalRank: { fontSize: 24, fontWeight: '900' },

  listCard: { backgroundColor: colors.surface, borderRadius: radius.lg, paddingHorizontal: 6, paddingVertical: 4, ...shadow.sm },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 10, borderRadius: radius.md },
  rowMe: { backgroundColor: colors.primaryLight },
  rank: { width: 30, fontSize: 15, fontWeight: '800', color: colors.textLight, textAlign: 'center' },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primaryLight, justifyContent: 'center', alignItems: 'center', marginHorizontal: 10 },
  avatarText: { fontSize: 14, fontWeight: '800', color: colors.primary },
  info: { flex: 1 },
  name: { fontSize: 14, fontWeight: '700', color: colors.text },
  sub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  ptsBadge: { alignItems: 'center', minWidth: 48 },
  pts: { fontSize: 16, fontWeight: '800', color: colors.primary },
  ptsLabel: { fontSize: 10, fontWeight: '700', color: colors.textLight },

  meBar: { position: 'absolute', left: spacing.md, right: spacing.md, bottom: 16, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primary, borderRadius: radius.lg, paddingVertical: 12, paddingHorizontal: 12, ...shadow.lg },
  meRank: { width: 30, fontSize: 15, fontWeight: '800', color: colors.white, textAlign: 'center' },
  meAvatar: { backgroundColor: 'rgba(255,255,255,0.22)' },
  meBadge: { alignItems: 'center', minWidth: 48 },
  mePts: { fontSize: 16, fontWeight: '800', color: colors.white },
  mePtsLabel: { fontSize: 10, fontWeight: '700', color: '#C7D2FE' },
});
