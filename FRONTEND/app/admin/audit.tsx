import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/lib/api';
import { colors, radius, spacing, shadow } from '@/src/theme';

interface Entry { id_journal: string; admin: string; action: string; cible_type: string | null; cible_id: string | null; details: Record<string, any>; date: string }

const ACTION_META: Record<string, { icon: string; color: string; label: string }> = {
  maj_utilisateur: { icon: 'person', color: colors.primary, label: 'Utilisateur modifié' },
  valider_cours: { icon: 'checkmark-circle', color: colors.success, label: 'Cours publié' },
  rejeter_cours: { icon: 'close-circle', color: colors.danger, label: 'Cours rejeté' },
  paiement_confirmer: { icon: 'cash', color: colors.success, label: 'Paiement confirmé' },
  paiement_rembourser: { icon: 'arrow-undo', color: colors.violet, label: 'Paiement remboursé' },
  payer_remuneration: { icon: 'wallet', color: colors.emerald, label: 'Rémunération versée' },
  broadcast: { icon: 'megaphone', color: colors.accent, label: 'Diffusion envoyée' },
};

export default function AuditScreen() {
  const router = useRouter();
  const [items, setItems] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetch = async () => { try { const r = await api.get('/admin/audit/', { params: { page_size: '100' } }); setItems(r.data.results ?? []); } catch {} };
  useEffect(() => { fetch().finally(() => setLoading(false)); }, []);
  const onRefresh = async () => { setRefreshing(true); await fetch(); setRefreshing(false); };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backRow}><Ionicons name="arrow-back" size={20} color={colors.text} /></TouchableOpacity>
        <View style={{ flex: 1 }}><Text style={styles.title}>Journal d'audit</Text><Text style={styles.subtitle}>{items.length} action(s)</Text></View>
      </View>

      {loading ? <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View> : (
        <FlatList
          data={items} keyExtractor={(e) => e.id_journal} contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListEmptyComponent={<Text style={styles.empty}>Aucune action enregistrée.</Text>}
          renderItem={({ item }) => {
            const m = ACTION_META[item.action] ?? { icon: 'ellipse', color: colors.textMuted, label: item.action };
            const det = Object.entries(item.details || {}).map(([k, v]) => `${k}: ${v}`).join(' · ');
            return (
              <View style={styles.row}>
                <View style={[styles.icon, { backgroundColor: `${m.color}15` }]}><Ionicons name={m.icon as any} size={17} color={m.color} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.action}>{m.label}</Text>
                  {det ? <Text style={styles.det} numberOfLines={2}>{det}</Text> : null}
                  <Text style={styles.meta}>{item.admin} · {fmt(item.date)}</Text>
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}
function fmt(iso: string) { return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 40 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.md, paddingTop: 56, paddingBottom: 10 },
  backRow: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', ...shadow.sm },
  title: { fontSize: 22, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 1 },
  list: { padding: spacing.md, paddingBottom: 32 },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 40 },
  row: { flexDirection: 'row', gap: 12, backgroundColor: colors.surface, borderRadius: radius.md, padding: 12, borderWidth: 1, borderColor: colors.border, marginBottom: 8, ...shadow.sm },
  icon: { width: 38, height: 38, borderRadius: 11, justifyContent: 'center', alignItems: 'center' },
  action: { fontSize: 14, fontWeight: '800', color: colors.text },
  det: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  meta: { fontSize: 11.5, color: colors.textLight, marginTop: 4, fontWeight: '600' },
});
