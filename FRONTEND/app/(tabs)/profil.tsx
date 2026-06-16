import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, ScrollView, Image, Switch,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuthStore } from '@/src/store/authStore';
import { useI18n } from '@/src/i18n/useI18n';
import { api, BASE_URL } from '@/src/lib/api';
import { GradientBox } from '@/src/components/GradientBox';
import { programmerRappels, annulerRappels, notificationTest } from '@/src/lib/reminders';
import { colors, radius, spacing, shadow } from '@/src/theme';

// Les avatars uploadés sont servis en chemin relatif (/media/...) → on préfixe
// par l'origine du serveur (BASE_URL sans le suffixe /api/v1).
const MEDIA_ORIGIN = BASE_URL.replace(/\/api\/v1\/?$/, '');
const resolveAvatar = (url?: string | null) =>
  !url ? null : url.startsWith('http') ? url : `${MEDIA_ORIGIN}${url}`;

type IconName = keyof typeof Ionicons.glyphMap;

interface QuickLink {
  icon: IconName;
  label: string;
  route: string;
  color: string;
  roles?: string[];
}

const QUICK_LINKS: QuickLink[] = [
  { icon: 'notifications', label: 'Notifications', route: '/notifications', color: colors.info },
  { icon: 'sparkles', label: 'Révision IA', route: '/revision', color: colors.violet, roles: ['eleve'] },
  { icon: 'timer', label: 'Focus', route: '/focus', color: colors.rose, roles: ['eleve'] },
  { icon: 'calendar', label: 'Planning', route: '/planning', color: colors.primary, roles: ['eleve'] },
  { icon: 'pulse', label: 'Diagnostic', route: '/diagnostic', color: colors.accent, roles: ['eleve'] },
  { icon: 'compass', label: 'Orientation', route: '/orientation', color: colors.emerald, roles: ['eleve'] },
  { icon: 'create', label: 'Rédaction', route: '/redaction', color: colors.violet, roles: ['eleve'] },
  { icon: 'ribbon', label: 'Concours', route: '/concours', color: colors.amber, roles: ['eleve'] },
  { icon: 'trophy', label: 'Classement', route: '/(tabs)/classement', color: '#EAB308', roles: ['eleve'] },
  { icon: 'link', label: 'Liaison', route: '/liaison', color: colors.violet, roles: ['eleve'] },
  { icon: 'card', label: 'Abonnement', route: '/abonnement', color: colors.emerald },
  { icon: 'people', label: 'Mes enfants', route: '/(tabs)/enfants', color: colors.primary, roles: ['parent'] },
  { icon: 'person-add', label: 'Lier enfant', route: '/parent/lier', color: colors.accent, roles: ['parent'] },
];

export default function ProfilScreen() {
  const router = useRouter();
  const { user, logout, refreshUser } = useAuthStore();
  const { lang, setLang, t } = useI18n();

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const changerAvatar = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission requise', "Autorise l'accès aux photos pour changer ta photo de profil.");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.6,
    });
    if (res.canceled || !res.assets?.length) return;
    const a = res.assets[0];
    const form = new FormData();
    form.append('avatar', { uri: a.uri, name: a.fileName || 'avatar.jpg', type: a.mimeType || 'image/jpeg' } as any);
    setUploadingAvatar(true);
    try {
      await api.post('/users/me/avatar/', form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 60000 });
      await refreshUser();
    } catch {
      Alert.alert('Erreur', "L'envoi de la photo a échoué.");
    } finally {
      setUploadingAvatar(false);
    }
  };

  // Rappels de révision (notifications locales) — activés par défaut pour les élèves.
  const [rappelsActifs, setRappelsActifs] = useState(true);
  useEffect(() => {
    AsyncStorage.getItem('rappels_actifs').then((v) => setRappelsActifs(v !== 'false'));
  }, []);
  const basculerRappels = async (valeur: boolean) => {
    setRappelsActifs(valeur);
    await AsyncStorage.setItem('rappels_actifs', valeur ? 'true' : 'false');
    if (valeur) {
      const ok = await programmerRappels();
      Alert.alert(ok ? 'Rappels activés' : 'Permission requise',
        ok ? 'On te rappellera de réviser chaque jour 💪' : "Autorise les notifications pour activer les rappels.");
    } else {
      await annulerRappels();
    }
  };

  // Rafraîchit les infos (score, série, XP…) à l'ouverture pour rester aligné
  // sur le dashboard, qui lit les valeurs fraîches de l'API.
  useEffect(() => { refreshUser?.(); }, []);

  const [nom, setNom] = useState(user?.nom ?? '');
  const [prenom, setPrenom] = useState(user?.prenom ?? '');
  const [telephone, setTelephone] = useState(user?.telephone ?? '');
  const [ville, setVille] = useState(user?.ville ?? '');
  const [etablissement, setEtablissement] = useState(user?.etablissement ?? '');

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.patch('/users/me/', {
        nom: nom.trim(),
        prenom: prenom.trim(),
        telephone: telephone.trim() || null,
        ...(user?.role === 'eleve' && {
          ville: ville.trim() || null,
          etablissement: etablissement.trim() || null,
        }),
      });
      await refreshUser();
      setEditing(false);
      Alert.alert('Succès', 'Profil mis à jour.');
    } catch (error: any) {
      const msg = error?.response?.data?.detail ?? 'Impossible de sauvegarder.';
      Alert.alert('Erreur', msg);
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    Alert.alert('Déconnexion', 'Êtes-vous sûr ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Se déconnecter', style: 'destructive', onPress: logout },
    ]);
  };

  if (!user) return null;

  const initials = `${user.prenom?.[0] ?? ''}${user.nom?.[0] ?? ''}`.toUpperCase();
  const roleLabel = { eleve: 'Élève', parent: 'Parent', enseignant: 'Enseignant', admin: 'Admin' }[user.role];
  const links = QUICK_LINKS.filter((l) => !l.roles || l.roles.includes(user.role));
  const avatarUri = resolveAvatar(user.avatar_url);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.inner} showsVerticalScrollIndicator={false}>
      {/* En-tête dégradé */}
      <GradientBox colors={colors.gradientPrimary} style={styles.hero}>
        <TouchableOpacity style={styles.avatarRing} activeOpacity={0.85} onPress={changerAvatar} disabled={uploadingAvatar}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.initials}>{initials}</Text>
            </View>
          )}
          <View style={styles.camBadge}>
            {uploadingAvatar
              ? <ActivityIndicator size="small" color="#fff" />
              : <Ionicons name="camera" size={14} color="#fff" />}
          </View>
        </TouchableOpacity>
        <Text style={styles.name}>{user.prenom} {user.nom}</Text>
        <Text style={styles.heroEmail} numberOfLines={1}>{user.email}</Text>
        <View style={styles.roleBadge}>
          <Ionicons name="shield-checkmark" size={12} color="#fff" />
          <Text style={styles.roleText}>{roleLabel}</Text>
          {user.email_verifie && <Ionicons name="checkmark-circle" size={13} color="#fff" />}
        </View>
      </GradientBox>

      {/* Carte de stats flottante (élève) */}
      {user.role === 'eleve' && (
        <View style={styles.floatCard}>
          <Stat value={`${user.score_global ?? 0}`} label="Score" icon="trophy" color={colors.primary} />
          <View style={styles.floatDivider} />
          <Stat value={`${user.streak_jours ?? 0}`} label="Série" icon="flame" color={colors.amber} />
          <View style={styles.floatDivider} />
          <Stat value={`${user.points_gamification ?? 0}`} label="XP" icon="flash" color={colors.emerald} />
        </View>
      )}

      {/* Bannière email non vérifié */}
      {!user.email_verifie && (
        <TouchableOpacity style={styles.verifyBanner} onPress={() => router.push('/verify-email')}>
          <Ionicons name="warning" size={16} color="#92400E" />
          <Text style={styles.verifyText}>Email non vérifié — appuie pour vérifier</Text>
          <Ionicons name="chevron-forward" size={14} color="#92400E" />
        </TouchableOpacity>
      )}

      {/* Accès rapides */}
      <View style={styles.cardSection}>
        <SectionTitle icon="apps">Accès rapide</SectionTitle>
        <View style={styles.grid}>
          {links.map((l) => (
            <TouchableOpacity key={l.route} style={styles.tile} activeOpacity={0.7} onPress={() => router.push(l.route as any)}>
              <View style={[styles.tileIcon, { backgroundColor: `${l.color}14` }]}>
                <Ionicons name={l.icon} size={22} color={l.color} />
              </View>
              <Text style={styles.tileLabel} numberOfLines={1}>{l.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Infos + édition */}
      <View style={styles.cardSection}>
        <View style={styles.sectionHeader}>
          <SectionTitle icon="person-circle" noMargin>{editing ? 'Modifier le profil' : 'Informations'}</SectionTitle>
          {!editing && (
            <TouchableOpacity style={styles.editChip} onPress={() => setEditing(true)}>
              <Ionicons name="pencil" size={13} color={colors.primary} />
              <Text style={styles.editLink}>Modifier</Text>
            </TouchableOpacity>
          )}
        </View>

        {editing ? (
          <>
            <Field label="Prénom" value={prenom} onChange={setPrenom} />
            <Field label="Nom" value={nom} onChange={setNom} />
            <Field label="Téléphone" value={telephone} onChange={setTelephone} keyboardType="phone-pad" />
            {user.role === 'eleve' && (
              <>
                <Field label="Ville" value={ville} onChange={setVille} />
                <Field label="Établissement" value={etablissement} onChange={setEtablissement} />
              </>
            )}
            <View style={styles.editActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditing(false)}>
                <Text style={styles.cancelText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveText}>Sauvegarder</Text>}
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            <InfoRow icon="mail-outline" label="Email" value={user.email} />
            <InfoRow icon="call-outline" label="Téléphone" value={user.telephone || '—'} />
            {user.role === 'eleve' && (
              <>
                <InfoRow icon="school-outline" label="Niveau" value={user.niveau_scolaire ?? '—'} />
                <InfoRow icon="location-outline" label="Région" value={user.region ?? '—'} />
                <InfoRow icon="business-outline" label="Établissement" value={user.etablissement || '—'} last />
              </>
            )}
            {user.role !== 'eleve' && (
              <InfoRow icon="person-outline" label="Rôle" value={roleLabel} last />
            )}
          </>
        )}
      </View>

      {/* Rappels de révision (notifications locales) — élèves */}
      {user.role === 'eleve' && (
        <View style={styles.cardSection}>
          <SectionTitle icon="alarm">Rappels de révision</SectionTitle>
          <View style={styles.rappelRow}>
            <View style={styles.rappelIcon}><Ionicons name="alarm" size={20} color={colors.primary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rappelTitle}>Me motiver chaque jour</Text>
              <Text style={styles.rappelSub}>Notifications pour ne jamais lâcher tes révisions.</Text>
            </View>
            <Switch
              value={rappelsActifs}
              onValueChange={basculerRappels}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={colors.white}
            />
          </View>
          <TouchableOpacity style={styles.rappelTest} onPress={async () => {
            const ok = await notificationTest(3);
            if (!ok) Alert.alert('Permission requise', "Autorise les notifications pour tester.");
          }} activeOpacity={0.85}>
            <Ionicons name="notifications-outline" size={16} color={colors.primary} />
            <Text style={styles.rappelTestText}>Tester une notification</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Langue */}
      <View style={styles.cardSection}>
        <SectionTitle icon="language">{t('profil.language')}</SectionTitle>
        <View style={styles.langRow}>
          {(['fr', 'en'] as const).map((code) => (
            <TouchableOpacity
              key={code}
              style={[styles.langBtn, lang === code && styles.langBtnActive]}
              onPress={() => setLang(code)}
              activeOpacity={0.85}
            >
              <View style={[styles.langCode, lang === code && styles.langCodeActive]}>
                <Text style={[styles.langCodeText, lang === code && styles.langCodeTextActive]}>{code.toUpperCase()}</Text>
              </View>
              <Text style={[styles.langText, lang === code && styles.langTextActive]}>{t(`lang.${code}`)}</Text>
              {lang === code && <Ionicons name="checkmark-circle" size={18} color={colors.primary} />}
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Déconnexion */}
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.85}>
        <Ionicons name="log-out-outline" size={18} color={colors.danger} />
        <Text style={styles.logoutText}>{t('profil.logout')}</Text>
      </TouchableOpacity>
      <Text style={styles.version}>SmartSchool · v1.0</Text>
    </ScrollView>
  );
}

function SectionTitle({ icon, children, noMargin }: { icon: IconName; children: React.ReactNode; noMargin?: boolean }) {
  return (
    <View style={[styles.titleRow, noMargin && { marginBottom: 0 }]}>
      <Ionicons name={icon} size={16} color={colors.primary} />
      <Text style={styles.titleText}>{children}</Text>
    </View>
  );
}

function Stat({ value, label, icon, color }: { value: string; label: string; icon: IconName; color: string }) {
  return (
    <View style={styles.stat}>
      <View style={[styles.statIcon, { backgroundColor: `${color}14` }]}>
        <Ionicons name={icon} size={15} color={color} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Field({ label, value, onChange, keyboardType }: { label: string; value: string; onChange: (v: string) => void; keyboardType?: 'phone-pad' }) {
  return (
    <>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput style={styles.input} value={value} onChangeText={onChange} keyboardType={keyboardType} placeholderTextColor={colors.textLight} />
    </>
  );
}

function InfoRow({ icon, label, value, last }: { icon: IconName; label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.infoRow, last && { borderBottomWidth: 0 }]}>
      <View style={styles.infoIcon}><Ionicons name={icon} size={16} color={colors.textMuted} /></View>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  inner: { paddingBottom: 40 },

  hero: { alignItems: 'center', paddingTop: 64, paddingBottom: 44, paddingHorizontal: spacing.lg, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  avatarRing: { padding: 4, borderRadius: 52, backgroundColor: 'rgba(255,255,255,0.25)' },
  avatar: { width: 88, height: 88, borderRadius: 44 },
  avatarPlaceholder: { width: 88, height: 88, borderRadius: 44, backgroundColor: 'rgba(255,255,255,0.22)', justifyContent: 'center', alignItems: 'center' },
  initials: { color: '#fff', fontSize: 30, fontWeight: '800' },
  camBadge: { position: 'absolute', right: 0, bottom: 0, width: 30, height: 30, borderRadius: 15, backgroundColor: colors.primaryDark, borderWidth: 2, borderColor: '#fff', justifyContent: 'center', alignItems: 'center' },
  name: { fontSize: 22, fontWeight: '800', color: '#fff', marginTop: 12 },
  heroEmail: { fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 3 },
  roleBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8, paddingHorizontal: 12, paddingVertical: 5, backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: radius.full },
  roleText: { fontSize: 12.5, fontWeight: '800', color: '#fff' },

  floatCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, marginHorizontal: spacing.md, marginTop: -26, borderRadius: radius.lg, paddingVertical: 16, paddingHorizontal: spacing.md, ...shadow.md },
  floatDivider: { width: 1, height: 34, backgroundColor: colors.border },
  floatEmail: { fontSize: 14, fontWeight: '700', color: colors.text },
  stat: { flex: 1, alignItems: 'center' },
  statIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  statValue: { fontSize: 19, fontWeight: '800', color: colors.text },
  statLabel: { fontSize: 11, color: colors.textMuted, marginTop: 1, fontWeight: '600' },

  verifyBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: spacing.md, marginTop: spacing.md, backgroundColor: '#FEF3C7', paddingHorizontal: spacing.md, paddingVertical: 11, borderRadius: radius.md },
  verifyText: { flex: 1, fontSize: 13, color: '#92400E', fontWeight: '700' },

  cardSection: { backgroundColor: colors.surface, marginHorizontal: spacing.md, marginTop: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderRadius: radius.lg, ...shadow.sm },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: colors.text, marginBottom: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 12 },
  titleText: { fontSize: 15, fontWeight: '800', color: colors.text },
  rappelRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rappelIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  rappelTitle: { fontSize: 14.5, fontWeight: '800', color: colors.text },
  rappelSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  rappelTest: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12, paddingVertical: 11, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.primary, backgroundColor: colors.primaryLight },
  rappelTestText: { color: colors.primary, fontWeight: '800', fontSize: 13.5 },
  editChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primaryLight, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.full },
  editLink: { fontSize: 12.5, color: colors.primary, fontWeight: '800' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 16 },
  tile: { width: '25%', alignItems: 'center' },
  tileIcon: { width: 50, height: 50, borderRadius: radius.md, justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
  tileLabel: { fontSize: 11, color: colors.textMuted, fontWeight: '600', textAlign: 'center' },

  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.surfaceAlt },
  infoIcon: { width: 30, height: 30, borderRadius: 9, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  infoLabel: { fontSize: 13.5, color: colors.textMuted, fontWeight: '600' },
  infoValue: { flex: 1, fontSize: 13.5, fontWeight: '700', color: colors.text, textAlign: 'right' },

  fieldLabel: { fontSize: 12, fontWeight: '700', color: colors.textMuted, marginBottom: 4, marginTop: 8 },
  input: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.text, marginBottom: 4 },
  editActions: { flexDirection: 'row', gap: 12, marginTop: spacing.md },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: radius.sm, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center' },
  cancelText: { color: colors.textMuted, fontWeight: '700' },
  saveBtn: { flex: 1, paddingVertical: 12, borderRadius: radius.sm, backgroundColor: colors.primary, alignItems: 'center' },
  saveText: { color: '#fff', fontWeight: '800' },

  langRow: { flexDirection: 'row', gap: 12 },
  langBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 12, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surfaceAlt },
  langBtnActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  langCode: { width: 30, height: 22, borderRadius: 6, backgroundColor: colors.border, justifyContent: 'center', alignItems: 'center' },
  langCodeActive: { backgroundColor: colors.primary },
  langCodeText: { fontSize: 11, fontWeight: '800', color: colors.textMuted },
  langCodeTextActive: { color: '#fff' },
  langText: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.textMuted },
  langTextActive: { color: colors.primary },

  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginHorizontal: spacing.md, marginTop: spacing.lg, paddingVertical: 14, borderRadius: radius.md, borderWidth: 1.5, borderColor: '#FCA5A5', backgroundColor: '#FEF2F2' },
  logoutText: { color: colors.danger, fontWeight: '800', fontSize: 15 },
  version: { textAlign: 'center', fontSize: 12, color: colors.textLight, marginTop: 16 },
});
