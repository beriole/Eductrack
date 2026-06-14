import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/lib/api';
import { colors, radius } from '@/src/theme';

type IoniconName = keyof typeof Ionicons.glyphMap;

interface Notification {
  id_notification: string;
  type_notif: string;
  titre: string;
  message: string;
  lue: boolean;
  date_envoi: string;
}

const TYPE_ICON: Record<string, { name: IoniconName; color: string }> = {
  badge: { name: 'medal', color: '#F5B400' },
  rappel: { name: 'alarm', color: '#F59E0B' },
  rapport: { name: 'document-text', color: '#3B82F6' },
  alerte: { name: 'warning', color: '#EF4444' },
  promo: { name: 'gift', color: '#8B5CF6' },
};
const DEFAULT_ICON: { name: IoniconName; color: string } = { name: 'notifications', color: colors.primary };

export default function NotificationsScreen() {
  const router = useRouter();
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchNotifs = async () => {
    try {
      const res = await api.get('/notifications/');
      setNotifs(res.data.results ?? res.data);
    } catch {}
  };

  useEffect(() => {
    fetchNotifs().finally(() => setLoading(false));
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchNotifs();
    setRefreshing(false);
  };

  const markRead = async (id: string) => {
    try {
      await api.patch(`/notifications/${id}/read/`);
      setNotifs((prev) => prev.map((n) => n.id_notification === id ? { ...n, lue: true } : n));
    } catch {}
  };

  const markAllRead = async () => {
    try {
      await api.post('/notifications/read-all/');
      setNotifs((prev) => prev.map((n) => ({ ...n, lue: true })));
    } catch {}
  };

  const unreadCount = notifs.filter((n) => !n.lue).length;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#C7D2FE" />
        </TouchableOpacity>
        <Text style={styles.title}>Notifications {unreadCount > 0 ? `(${unreadCount})` : ''}</Text>
        {unreadCount > 0 && (
          <TouchableOpacity onPress={markAllRead}>
            <Text style={styles.markAll}>Tout lire</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : (
        <FlatList
          data={notifs}
          keyExtractor={(n) => n.id_notification}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Ionicons name="notifications-outline" size={48} color="#9CA3AF" />
              <Text style={{ color: '#6B7280', marginTop: 8 }}>Aucune notification.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.card, !item.lue && styles.cardUnread]}
              onPress={() => markRead(item.id_notification)}
              activeOpacity={0.8}
            >
              {(() => { const ic = TYPE_ICON[item.type_notif] ?? DEFAULT_ICON; return (
                <View style={[styles.iconWrap, { backgroundColor: `${ic.color}1A` }]}>
                  <Ionicons name={ic.name} size={20} color={ic.color} />
                </View>
              ); })()}
              <View style={styles.content}>
                <Text style={[styles.titre, !item.lue && styles.titreUnread]}>{item.titre}</Text>
                <Text style={styles.message} numberOfLines={2}>{item.message}</Text>
                <Text style={styles.date}>
                  {new Date(item.date_envoi).toLocaleDateString('fr-FR', {
                    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                  })}
                </Text>
              </View>
              {!item.lue && <View style={styles.dot} />}
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const PRIMARY = colors.primary;
const ACCENT = colors.primary;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, marginTop: 40 },
  header: {
    backgroundColor: PRIMARY, paddingTop: 56, paddingBottom: 16,
    paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center',
    borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl,
  },
  backBtn: { marginRight: 12 },
  backText: { color: '#C7D2FE', fontSize: 14, fontWeight: '600' },
  title: { flex: 1, fontSize: 18, fontWeight: '800', color: '#fff' },
  markAll: { color: '#C7D2FE', fontSize: 13, fontWeight: '600' },
  list: { padding: 16, gap: 10 },
  card: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#fff', borderRadius: 14, padding: 14, elevation: 1 },
  cardUnread: { borderLeftWidth: 3, borderLeftColor: ACCENT },
  iconWrap: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  content: { flex: 1 },
  titre: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 4 },
  titreUnread: { fontWeight: '800', color: PRIMARY },
  message: { fontSize: 13, color: '#6B7280', lineHeight: 18 },
  date: { fontSize: 11, color: '#9CA3AF', marginTop: 6 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: ACCENT, marginTop: 4 },
});
