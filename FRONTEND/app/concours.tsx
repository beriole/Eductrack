import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/lib/api';
import { colors, radius } from '@/src/theme';

interface Concours {
  code: string;
  nom: string;
  categorie: string;
  etablissement: string;
  niveau_requis: string;
  epreuves: string[];
  debouches: string[];
  periode: string;
  icone: string;
}

export default function ConcoursScreen() {
  const router = useRouter();
  const [concours, setConcours] = useState<Concours[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [filtre, setFiltre] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchConcours = async (categorie?: string | null) => {
    try {
      const res = await api.get('/concours/', {
        params: categorie ? { categorie } : {},
      });
      setConcours(res.data.concours ?? []);
      setCategories(res.data.categories ?? []);
    } catch {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConcours();
  }, []);

  const selectFiltre = (cat: string | null) => {
    setFiltre(cat);
    setLoading(true);
    fetchConcours(cat);
  };

  if (loading && concours.length === 0) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backRow}>
          <Ionicons name="arrow-back" size={18} color="#C7D2FE" />
          <Text style={styles.backText}>Retour</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Préparation aux Concours</Text>
        <Text style={styles.subtitle}>Grandes écoles et administrations du Cameroun</Text>
      </View>

      {/* Filtres */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtres} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
        <TouchableOpacity
          style={[styles.chip, filtre === null && styles.chipActive]}
          onPress={() => selectFiltre(null)}
        >
          <Text style={[styles.chipText, filtre === null && styles.chipTextActive]}>Tous</Text>
        </TouchableOpacity>
        {categories.map((cat) => (
          <TouchableOpacity
            key={cat}
            style={[styles.chip, filtre === cat && styles.chipActive]}
            onPress={() => selectFiltre(cat)}
          >
            <Text style={[styles.chipText, filtre === cat && styles.chipTextActive]}>{cat}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.content}>
        {concours.map((c) => {
          const isOpen = expanded === c.code;
          return (
            <TouchableOpacity
              key={c.code}
              style={styles.card}
              activeOpacity={0.9}
              onPress={() => setExpanded(isOpen ? null : c.code)}
            >
              <View style={styles.cardHead}>
                <Text style={styles.cardIcon}>{c.icone}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardNom}>{c.nom}</Text>
                  <Text style={styles.cardEtab}>{c.etablissement}</Text>
                </View>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{c.categorie}</Text>
                </View>
              </View>

              <View style={styles.metaRow}>
                <View style={styles.metaItem}>
                  <Ionicons name="school-outline" size={13} color="#6B7280" />
                  <Text style={styles.meta}>{c.niveau_requis}</Text>
                </View>
                <View style={styles.metaItem}>
                  <Ionicons name="calendar-outline" size={13} color="#6B7280" />
                  <Text style={styles.meta}>{c.periode}</Text>
                </View>
              </View>

              {isOpen && (
                <View style={styles.details}>
                  <Text style={styles.detailTitle}>Épreuves</Text>
                  <View style={styles.tags}>
                    {c.epreuves.map((e, i) => (
                      <View key={i} style={styles.tag}><Text style={styles.tagText}>{e}</Text></View>
                    ))}
                  </View>
                  <Text style={styles.detailTitle}>Débouchés</Text>
                  {c.debouches.map((d, i) => (
                    <Text key={i} style={styles.debouche}>• {d}</Text>
                  ))}
                </View>
              )}

              <Text style={styles.toggle}>{isOpen ? 'Réduire ▲' : 'Voir les détails ▼'}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const PRIMARY = colors.primary;
const ACCENT = colors.primary;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { backgroundColor: PRIMARY, paddingTop: 56, paddingBottom: 20, paddingHorizontal: 20, borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12 },
  backText: { color: '#C7D2FE', fontWeight: '600', fontSize: 14 },
  title: { fontSize: 22, fontWeight: '800', color: '#fff' },
  subtitle: { fontSize: 12, color: '#C7D2FE', marginTop: 4 },
  filtres: { marginTop: 12 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB' },
  chipActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  chipText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  chipTextActive: { color: '#fff' },
  content: { padding: 16, gap: 12 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, elevation: 1, marginBottom: 4 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardIcon: { fontSize: 32 },
  cardNom: { fontSize: 15, fontWeight: '800', color: PRIMARY },
  cardEtab: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  badge: { backgroundColor: `${ACCENT}15`, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeText: { fontSize: 11, fontWeight: '700', color: ACCENT },
  metaRow: { flexDirection: 'row', gap: 16, marginTop: 12 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  meta: { fontSize: 12, color: '#374151' },
  details: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  detailTitle: { fontSize: 13, fontWeight: '700', color: PRIMARY, marginBottom: 8, marginTop: 8 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { backgroundColor: '#EDE9FE', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  tagText: { fontSize: 12, color: ACCENT, fontWeight: '600' },
  debouche: { fontSize: 13, color: '#374151', marginBottom: 4, lineHeight: 19 },
  toggle: { fontSize: 12, color: ACCENT, fontWeight: '700', marginTop: 12, textAlign: 'center' },
});
