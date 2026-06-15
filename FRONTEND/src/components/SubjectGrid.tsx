import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, shadow, subjectColor, subjectIconName } from '@/src/theme';

export interface SubjectEntry {
  id: string;        // id_matiere
  nom: string;       // libellé affiché
  code: string;      // code matière (couleur + icône)
  count: number;     // nombre de contenus dans cette matière
}

/**
 * Grille de matières (2 colonnes). On tape une matière pour afficher ses
 * contenus (cours / épreuves). Réutilisée côté élève ET enseignant.
 */
export function SubjectGrid({
  subjects, onPress, header, refreshing, onRefresh, emptyLabel = 'Aucune matière disponible.',
  countLabel = (n) => `${n} élément${n > 1 ? 's' : ''}`,
}: {
  subjects: SubjectEntry[];
  onPress: (s: SubjectEntry) => void;
  header?: React.ReactElement;
  refreshing?: boolean;
  onRefresh?: () => void;
  emptyLabel?: string;
  countLabel?: (n: number) => string;
}) {
  return (
    <FlatList
      data={subjects}
      keyExtractor={(s) => s.id || s.code}
      numColumns={2}
      columnWrapperStyle={styles.row}
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={header}
      refreshControl={
        onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.primary} /> : undefined
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <View style={styles.emptyIcon}><Ionicons name="albums-outline" size={32} color={colors.primary} /></View>
          <Text style={styles.emptyText}>{emptyLabel}</Text>
        </View>
      }
      renderItem={({ item }) => {
        const tint = subjectColor(item.code);
        return (
          <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={() => onPress(item)}>
            <View style={[styles.iconBox, { backgroundColor: `${tint}1A` }]}>
              <Ionicons name={subjectIconName(item.code)} size={26} color={tint} />
            </View>
            <Text style={styles.name} numberOfLines={2}>{item.nom}</Text>
            <View style={[styles.countPill, { backgroundColor: `${tint}14` }]}>
              <Text style={[styles.countText, { color: tint }]}>{countLabel(item.count)}</Text>
            </View>
          </TouchableOpacity>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.md, paddingBottom: 110 },
  row: { gap: 12 },
  card: {
    flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md,
    borderWidth: 1, borderColor: colors.border, marginBottom: 12, minHeight: 132, ...shadow.sm,
  },
  iconBox: { width: 52, height: 52, borderRadius: radius.md, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  name: { fontSize: 15, fontWeight: '800', color: colors.text, letterSpacing: -0.3, flex: 1 },
  countPill: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.full, marginTop: 8 },
  countText: { fontSize: 12, fontWeight: '800' },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 80 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primaryLight, justifyContent: 'center', alignItems: 'center', marginBottom: 14 },
  emptyText: { color: colors.textMuted, fontWeight: '600', textAlign: 'center' },
});
