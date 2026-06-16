import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/lib/api';
import { colors, radius, spacing, shadow } from '@/src/theme';

interface Remun {
  id_remuneration: string; enseignant: string; periode_debut: string; periode_fin: string;
  nb_vues_cours: number; montant_calcule: number; montant_verse: number; statut_paiement: string;
}
const STATUT_COLOR: Record<string, string> = { en_attente: colors.warning, verse: colors.success, annule: colors.danger };

export default function RemunerationsScreen() {
  const router = useRouter();
  const [items, setItems] = useState<Remun[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const fetch = async () => { try { const r = await api.get('/admin/remunerations/', { params: { page_size: '50' } }); setItems(r.data.results ?? []); } catch {} };
  useEffect(() => { fetch().finally(() => setLoading(false)); }, []);
  const onRefresh = async () => { setRefreshing(true); await fetch(); setRefreshing(false); };

  const payer = (r: Remun) => {
    Alert.alert('Verser la rémunération ?', `${r.enseignant} — ${r.montant_calcule.toLocaleString('fr-FR')} F`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Verser', onPress: async () => {
        setBusy(r.id_remuneration);
        try { const res = await api.post(`/admin/remunerations/${r.id_remuneration}/payer/`);
          setItems((p) => p.map((x) => x.id_remuneration === r.id_remuneration ? res.data : x)); }
        catch (e: any) { Alert.alert('Erreur', e?.response?.data?.error ?? 'Action impossible.'); }
        finally { setBusy(null); }
      } },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backRow}><Ionicons name="arrow-back" size={20} color={colors.text} /></TouchableOpacity>
        <View style={{ flex: 1 }}><Text style={styles.title}>Rémunérations</Text><Text style={styles.subtitle}>Enseignants</Text></View>
      </View>

      {loading ? <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View> : (
        <FlatList
          data={items} keyExtractor={(r) => r.id_remuneration} contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListEmptyComponent={<Text style={styles.empty}>Aucune rémunération.</Text>}
          renderItem={({ item }) => {
            const c = STATUT_COLOR[item.statut_paiement] ?? colors.textMuted;
            return (
              <View style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{item.enseignant}</Text>
                    <Text style={styles.sub}>{fmt(item.periode_debut)} → {fmt(item.periode_fin)} · {item.nb_vues_cours} vues</Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: `${c}1A` }]}><Text style={[styles.badgeText, { color: c }]}>{item.statut_paiement}</Text></View>
                </View>
                <View style={styles.amountRow}>
                  <Text style={styles.amount}>{item.montant_calcule.toLocaleString('fr-FR')} F</Text>
                  {item.statut_paiement === 'en_attente' ? (
                    <TouchableOpacity style={styles.payBtn} disabled={busy === item.id_remuneration} onPress={() => payer(item)} activeOpacity={0.85}>
                      {busy === item.id_remuneration ? <ActivityIndicator size="small" color="#fff" /> : <><Ionicons name="wallet-outline" size={15} color="#fff" /><Text style={styles.payText}>Verser</Text></>}
                    </TouchableOpacity>
                  ) : <Text style={styles.verse}>Versé : {item.montant_verse.toLocaleString('fr-FR')} F</Text>}
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}
function fmt(iso: string) { return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }); }

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 40 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.md, paddingTop: 56, paddingBottom: 10 },
  backRow: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', ...shadow.sm },
  title: { fontSize: 22, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 1 },
  list: { padding: spacing.md, paddingBottom: 32 },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 40 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border, marginBottom: 10, ...shadow.sm },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  name: { fontSize: 15, fontWeight: '800', color: colors.text },
  sub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.full },
  badgeText: { fontSize: 10.5, fontWeight: '800' },
  amountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  amount: { fontSize: 18, fontWeight: '800', color: colors.text },
  payBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primary, borderRadius: radius.full, paddingHorizontal: 16, paddingVertical: 9, ...shadow.sm },
  payText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  verse: { fontSize: 13, fontWeight: '700', color: colors.success },
});
