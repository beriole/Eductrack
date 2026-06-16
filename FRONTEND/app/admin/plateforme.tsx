import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Switch, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/lib/api';
import { colors, radius, spacing, shadow, subjectColor, subjectIconName } from '@/src/theme';

type Tab = 'matieres' | 'badges' | 'defis';
const TABS: { key: Tab; label: string; path: string; idKey: string }[] = [
  { key: 'matieres', label: 'Matières', path: '/admin/matieres', idKey: 'id_matiere' },
  { key: 'badges', label: 'Badges', path: '/admin/badges', idKey: 'id_badge' },
  { key: 'defis', label: 'Défis', path: '/admin/defis', idKey: 'id_defi' },
];

export default function PlateformeScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('matieres');
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const cfg = TABS.find((t) => t.key === tab)!;

  const fetch = useCallback(async () => {
    setLoading(true);
    try { const r = await api.get(cfg.path + '/'); setItems(r.data.results ?? r.data); } catch {} finally { setLoading(false); }
  }, [cfg.path]);
  useEffect(() => { fetch(); }, [fetch]);

  const toggle = async (item: any) => {
    const id = item[cfg.idKey];
    const next = !item.actif;
    setItems((p) => p.map((x) => x[cfg.idKey] === id ? { ...x, actif: next } : x));
    try { await api.patch(`${cfg.path}/${id}/`, { actif: next }); }
    catch { setItems((p) => p.map((x) => x[cfg.idKey] === id ? { ...x, actif: !next } : x)); Alert.alert('Erreur', 'Modification impossible.'); }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backRow}><Ionicons name="arrow-back" size={20} color={colors.text} /></TouchableOpacity>
        <View style={{ flex: 1 }}><Text style={styles.title}>Plateforme</Text><Text style={styles.subtitle}>Programme & gamification</Text></View>
      </View>

      <View style={styles.seg}>
        {TABS.map((t) => (
          <TouchableOpacity key={t.key} style={[styles.segBtn, tab === t.key && styles.segActive]} onPress={() => setTab(t.key)} activeOpacity={0.8}>
            <Text style={[styles.segText, tab === t.key && styles.segTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View> : (
        <FlatList
          data={items} keyExtractor={(it) => String(it[cfg.idKey])} contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>Aucun élément.</Text>}
          renderItem={({ item }) => {
            const tint = tab === 'matieres' ? subjectColor(item.code) : colors.primary;
            const icon = tab === 'matieres' ? subjectIconName(item.code) : tab === 'badges' ? 'ribbon' : 'flag';
            const main = item.nom || item.titre;
            const sub = tab === 'matieres' ? item.code
              : tab === 'badges' ? `${item.categorie} · ${item.valeur_points} XP`
              : `${item.type_cible} · ${item.periode}`;
            return (
              <View style={styles.card}>
                <View style={[styles.icon, { backgroundColor: `${tint}15` }]}><Ionicons name={icon as any} size={20} color={tint} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>{main}</Text>
                  <Text style={styles.sub} numberOfLines={1}>{sub}</Text>
                </View>
                <Switch value={!!item.actif} onValueChange={() => toggle(item)}
                  trackColor={{ true: colors.primary, false: colors.borderStrong }} thumbColor="#fff" />
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 40 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.md, paddingTop: 56, paddingBottom: 10 },
  backRow: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', ...shadow.sm },
  title: { fontSize: 22, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 1 },
  seg: { flexDirection: 'row', gap: 8, paddingHorizontal: spacing.md, paddingVertical: 10 },
  segBtn: { flex: 1, paddingVertical: 9, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  segActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  segText: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  segTextActive: { color: colors.primary },
  list: { padding: spacing.md, paddingBottom: 32 },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 40 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border, marginBottom: 10, ...shadow.sm },
  icon: { width: 44, height: 44, borderRadius: radius.md, justifyContent: 'center', alignItems: 'center' },
  name: { fontSize: 14.5, fontWeight: '800', color: colors.text },
  sub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
});
