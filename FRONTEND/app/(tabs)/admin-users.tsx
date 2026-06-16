import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, TextInput,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/lib/api';
import { GradientBox } from '@/src/components/GradientBox';
import { colors, radius, spacing, shadow } from '@/src/theme';

interface User {
  id_utilisateur: string; nom: string; prenom: string; email: string;
  role: string; actif: boolean; email_verifie: boolean;
}

const ROLES = [
  { key: '', label: 'Tous' },
  { key: 'eleve', label: 'Élèves' },
  { key: 'enseignant', label: 'Profs' },
  { key: 'parent', label: 'Parents' },
  { key: 'admin', label: 'Admins' },
];
const ROLE_COLOR: Record<string, string> = {
  eleve: colors.accent, enseignant: colors.violet, parent: colors.primary, admin: colors.danger,
};

export default function AdminUsersScreen() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [role, setRole] = useState('');
  const [search, setSearch] = useState('');
  const [count, setCount] = useState(0);

  const fetchUsers = useCallback(async () => {
    try {
      const params: Record<string, string> = { page_size: '50' };
      if (role) params.role = role;
      if (search.trim()) params.search = search.trim();
      const r = await api.get('/admin/users/', { params });
      setUsers(r.data.results ?? r.data);
      setCount(r.data.count ?? (r.data.results ?? r.data).length);
    } catch {}
  }, [role, search]);

  useFocusEffect(useCallback(() => { fetchUsers().finally(() => setLoading(false)); }, [fetchUsers]));
  useEffect(() => { const t = setTimeout(fetchUsers, 350); return () => clearTimeout(t); }, [search, role]);
  const onRefresh = async () => { setRefreshing(true); await fetchUsers(); setRefreshing(false); };

  return (
    <View style={styles.container}>
      <GradientBox colors={colors.gradientPrimary} style={styles.header}>
        <Text style={styles.title}>Utilisateurs</Text>
        <Text style={styles.subtitle}>{count} compte(s) sur la plateforme</Text>
      </GradientBox>

      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={colors.textLight} style={{ marginRight: 8 }} />
        <TextInput style={styles.searchInput} placeholder="Rechercher par nom ou email…"
          placeholderTextColor={colors.textLight} value={search} onChangeText={setSearch} autoCapitalize="none" />
      </View>

      <View style={styles.filterRow}>
        {ROLES.map((r) => {
          const active = role === r.key;
          return (
            <TouchableOpacity key={r.key || 'all'} style={[styles.chip, active && styles.chipActive]} onPress={() => setRole(r.key)} activeOpacity={0.8}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{r.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(u) => u.id_utilisateur}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListEmptyComponent={<Text style={styles.empty}>Aucun utilisateur.</Text>}
          renderItem={({ item }) => {
            const rc = ROLE_COLOR[item.role] ?? colors.textMuted;
            return (
              <TouchableOpacity style={styles.card} activeOpacity={0.85}
                onPress={() => router.push(`/admin/utilisateur/${item.id_utilisateur}` as any)}>
                <View style={[styles.avatar, { backgroundColor: `${rc}1A` }]}>
                  <Text style={[styles.avatarText, { color: rc }]}>{(item.prenom?.[0] ?? '') + (item.nom?.[0] ?? '') || '?'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>{item.prenom} {item.nom || ''}</Text>
                  <Text style={styles.email} numberOfLines={1}>{item.email}</Text>
                  <View style={styles.tags}>
                    <View style={[styles.roleTag, { backgroundColor: `${rc}1A` }]}><Text style={[styles.roleTagText, { color: rc }]}>{item.role}</Text></View>
                    {!item.actif && <View style={styles.suspendTag}><Text style={styles.suspendText}>suspendu</Text></View>}
                    {item.email_verifie && <Ionicons name="checkmark-circle" size={14} color={colors.success} />}
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
              </TouchableOpacity>
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
  header: { paddingHorizontal: spacing.lg, paddingTop: 56, paddingBottom: 22, borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl },
  title: { fontSize: 26, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, marginHorizontal: spacing.md, marginTop: 12, borderRadius: radius.md, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border, ...shadow.sm },
  searchInput: { flex: 1, fontSize: 15, color: colors.text, paddingVertical: 12 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: spacing.md, paddingVertical: 10 },
  chip: { paddingHorizontal: 13, paddingVertical: 7, borderRadius: radius.full, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  chipText: { fontSize: 12.5, fontWeight: '700', color: colors.textMuted },
  chipTextActive: { color: colors.primary },
  list: { padding: spacing.md, paddingBottom: 32 },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 40 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border, marginBottom: 10, ...shadow.sm },
  avatar: { width: 46, height: 46, borderRadius: 23, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 16, fontWeight: '900' },
  name: { fontSize: 15, fontWeight: '800', color: colors.text },
  email: { fontSize: 12.5, color: colors.textMuted, marginTop: 1 },
  tags: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  roleTag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.full },
  roleTagText: { fontSize: 10.5, fontWeight: '800', textTransform: 'capitalize' },
  suspendTag: { backgroundColor: '#FEF2F2', paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.full },
  suspendText: { fontSize: 10.5, fontWeight: '800', color: colors.danger },
});
