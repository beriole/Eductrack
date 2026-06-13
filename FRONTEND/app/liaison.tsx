import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/lib/api';
import { colors, radius, spacing, shadow } from '@/src/theme';

interface ParentLie {
  id_utilisateur: string;
  nom: string;
  prenom: string;
  email: string;
}

export default function LiaisonScreen() {
  const router = useRouter();
  const [code, setCode] = useState<string | null>(null);
  const [expire, setExpire] = useState<string | null>(null);
  const [parents, setParents] = useState<ParentLie[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [regen, setRegen] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [c, p] = await Promise.all([
        api.get('/users/me/code-liaison/'),
        api.get('/eleve/parents/'),
      ]);
      setCode(c.data.code);
      setExpire(c.data.expire_le);
      setParents(p.data.results ?? p.data);
    } catch {}
  }, []);

  useEffect(() => { fetchAll().finally(() => setLoading(false)); }, [fetchAll]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  };

  const regenerer = async () => {
    setRegen(true);
    try {
      const res = await api.post('/users/me/code-liaison/regenerer/');
      setCode(res.data.code);
      setExpire(res.data.expire_le);
      Alert.alert('Nouveau code', 'Ton code de liaison a été régénéré. L\'ancien n\'est plus valide.');
    } catch {
      Alert.alert('Oups', 'Régénération impossible.');
    } finally {
      setRegen(false);
    }
  };

  const revoquer = (p: ParentLie) => {
    Alert.alert('Révoquer l\'accès', `Retirer l'accès de ${p.prenom} ${p.nom} ?`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Révoquer', style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/eleve/parents/${p.id_utilisateur}/revoquer/`);
            setParents((prev) => prev.filter((x) => x.id_utilisateur !== p.id_utilisateur));
          } catch {
            Alert.alert('Oups', 'Révocation impossible.');
          }
        },
      },
    ]);
  };

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  const expireTxt = expire ? new Date(expire).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' }) : null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backRow}>
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Liaison parentale</Text>
          <Text style={styles.subtitle}>Partage ton code avec un parent</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* Code */}
        <View style={styles.codeCard}>
          <Text style={styles.codeLabel}>Ton code de liaison</Text>
          <Text style={styles.code}>{code ?? '—'}</Text>
          {expireTxt && <Text style={styles.codeExpire}>Valable jusqu'au {expireTxt}</Text>}
          <TouchableOpacity style={styles.regenBtn} onPress={regenerer} disabled={regen} activeOpacity={0.85}>
            {regen
              ? <ActivityIndicator size="small" color={colors.primary} />
              : <><Ionicons name="refresh" size={16} color={colors.primary} /><Text style={styles.regenText}>Régénérer</Text></>}
          </TouchableOpacity>
        </View>

        <Text style={styles.hint}>
          Donne ce code à ton parent. Dans son application, il choisit « Lier un enfant » et le saisit.
        </Text>

        {/* Parents liés */}
        <Text style={styles.sectionLabel}>Parents qui me suivent</Text>
        {parents.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="people-outline" size={30} color={colors.textLight} />
            <Text style={styles.emptyText}>Aucun parent lié pour l'instant.</Text>
          </View>
        ) : (
          parents.map((p) => (
            <View key={p.id_utilisateur} style={styles.parentRow}>
              <View style={styles.parentAvatar}>
                <Text style={styles.parentAvatarText}>{((p.prenom?.[0] ?? '') + (p.nom?.[0] ?? '')).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.parentName}>{p.prenom} {p.nom}</Text>
                <Text style={styles.parentEmail} numberOfLines={1}>{p.email}</Text>
              </View>
              <TouchableOpacity style={styles.revokeBtn} onPress={() => revoquer(p)}>
                <Ionicons name="close" size={16} color={colors.danger} />
              </TouchableOpacity>
            </View>
          ))
        )}
        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.md, paddingTop: 56, paddingBottom: 12 },
  backRow: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', ...shadow.sm },
  title: { fontSize: 22, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 1 },
  scroll: { padding: spacing.md },

  codeCard: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.xl, padding: 24, ...shadow.md },
  codeLabel: { fontSize: 13, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  code: { fontSize: 38, fontWeight: '900', color: colors.primary, letterSpacing: 8, marginTop: 10 },
  codeExpire: { fontSize: 12.5, color: colors.textLight, marginTop: 8 },
  regenBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, backgroundColor: colors.primaryLight, borderRadius: radius.full, paddingHorizontal: 18, paddingVertical: 9 },
  regenText: { fontSize: 13, fontWeight: '800', color: colors.primary },
  hint: { fontSize: 12.5, color: colors.textMuted, lineHeight: 18, marginTop: 14, marginBottom: 8, paddingHorizontal: 4 },

  sectionLabel: { fontSize: 13, fontWeight: '800', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 14, marginBottom: 10 },
  emptyCard: { alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 22, ...shadow.sm },
  emptyText: { color: colors.textMuted, fontSize: 13 },
  parentRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: radius.md, padding: 12, marginBottom: 8, ...shadow.sm },
  parentAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  parentAvatarText: { fontSize: 15, fontWeight: '800', color: colors.primary },
  parentName: { fontSize: 14, fontWeight: '700', color: colors.text },
  parentEmail: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  revokeBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: `${colors.danger}12`, alignItems: 'center', justifyContent: 'center' },
});
