import { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/lib/api';
import { SkeletonList } from '@/src/components/Skeleton';
import { colors, radius, spacing, shadow, subjectColor, subjectIconName } from '@/src/theme';

interface Resultats {
  q: string;
  matieres: { id_matiere: string; nom: string; code: string }[];
  cours: { id_cours: string; titre: string; matiere_nom: string; matiere_code: string; niveau: string }[];
  epreuves: { id_epreuve: string; titre: string; type_epreuve: string; matiere_nom: string; matiere_code: string; niveau: string; duree_minutes: number }[];
}

const TYPE_LABEL: Record<string, string> = { officielle: 'Annale', simulation: 'Simulation', exercice: 'Exercice' };

export default function RechercheScreen() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [res, setRes] = useState<Resultats | null>(null);
  const [loading, setLoading] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    const term = q.trim();
    if (term.length < 2) { setRes(null); setLoading(false); return; }
    setLoading(true);
    debounce.current = setTimeout(async () => {
      try { const r = await api.get('/recherche/', { params: { q: term } }); setRes(r.data); }
      catch {} finally { setLoading(false); }
    }, 350);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [q]);

  const total = res ? res.matieres.length + res.cours.length + res.epreuves.length : 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backRow}><Ionicons name="arrow-back" size={20} color={colors.text} /></TouchableOpacity>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={colors.textLight} />
          <TextInput
            style={styles.input}
            placeholder="Rechercher cours, examens, matières…"
            placeholderTextColor={colors.textLight}
            value={q}
            onChangeText={setQ}
            autoFocus
            autoCapitalize="none"
            returnKeyType="search"
          />
          {q.length > 0 && (
            <TouchableOpacity onPress={() => setQ('')}><Ionicons name="close-circle" size={18} color={colors.textLight} /></TouchableOpacity>
          )}
        </View>
      </View>

      {loading ? (
        <SkeletonList count={6} />
      ) : !res ? (
        <View style={styles.hint}>
          <Ionicons name="search-outline" size={40} color={colors.textLight} />
          <Text style={styles.hintText}>Tape au moins 2 caractères pour rechercher.</Text>
        </View>
      ) : total === 0 ? (
        <View style={styles.hint}>
          <Ionicons name="sad-outline" size={40} color={colors.textLight} />
          <Text style={styles.hintText}>Aucun résultat pour « {res.q} ».</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
          {res.matieres.length > 0 && <Text style={styles.section}>Matières</Text>}
          {res.matieres.map((m) => (
            <Row key={m.id_matiere} code={m.code} title={m.nom} sub="Matière"
              onPress={() => router.push(`/matiere/${m.id_matiere}?nom=${encodeURIComponent(m.nom)}&code=${m.code}` as any)} />
          ))}

          {res.cours.length > 0 && <Text style={styles.section}>Cours</Text>}
          {res.cours.map((c) => (
            <Row key={c.id_cours} code={c.matiere_code} title={c.titre} sub={`${c.matiere_nom} · ${c.niveau}`}
              onPress={() => router.push(`/cours/${c.id_cours}` as any)} />
          ))}

          {res.epreuves.length > 0 && <Text style={styles.section}>Examens & exercices</Text>}
          {res.epreuves.map((e) => (
            <Row key={e.id_epreuve} code={e.matiere_code} title={e.titre}
              sub={`${TYPE_LABEL[e.type_epreuve] ?? e.type_epreuve} · ${e.matiere_nom}`}
              onPress={() => router.push(`/sessions/nouvelle?epreuveId=${e.id_epreuve}&mode=exercice&duree=${e.duree_minutes}` as any)} />
          ))}
          <View style={{ height: 24 }} />
        </ScrollView>
      )}
    </View>
  );
}

function Row({ code, title, sub, onPress }: { code: string; title: string; sub: string; onPress: () => void }) {
  const c = subjectColor(code);
  return (
    <TouchableOpacity style={styles.row} activeOpacity={0.85} onPress={onPress}>
      <View style={[styles.rowIcon, { backgroundColor: `${c}1A` }]}>
        <Ionicons name={subjectIconName(code)} size={20} color={c} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>{title}</Text>
        <Text style={styles.rowSub} numberOfLines={1}>{sub}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: spacing.md, paddingTop: 54, paddingBottom: 10 },
  backRow: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', ...shadow.sm },
  searchBar: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border },
  input: { flex: 1, fontSize: 15, color: colors.text, paddingVertical: 12 },
  list: { padding: spacing.md },
  section: { fontSize: 13, fontWeight: '800', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 14, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 12, borderWidth: 1, borderColor: colors.border, marginBottom: 8, ...shadow.sm },
  rowIcon: { width: 42, height: 42, borderRadius: radius.md, justifyContent: 'center', alignItems: 'center' },
  rowTitle: { fontSize: 14.5, fontWeight: '800', color: colors.text },
  rowSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  hint: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: spacing.xl },
  hintText: { fontSize: 14, color: colors.textMuted, textAlign: 'center', fontWeight: '600' },
});
