import { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/lib/api';
import { colors, radius, spacing, shadow } from '@/src/theme';

const CIBLES = [
  { key: 'all', label: 'Tout le monde', icon: 'globe-outline' },
  { key: 'eleve', label: 'Élèves', icon: 'school-outline' },
  { key: 'enseignant', label: 'Enseignants', icon: 'person-outline' },
  { key: 'parent', label: 'Parents', icon: 'people-outline' },
] as const;

export default function BroadcastScreen() {
  const router = useRouter();
  const [titre, setTitre] = useState('');
  const [message, setMessage] = useState('');
  const [cible, setCible] = useState<string>('all');
  const [sending, setSending] = useState(false);

  const envoyer = async () => {
    if (titre.trim().length < 3 || message.trim().length < 5) {
      Alert.alert('Champs requis', 'Renseigne un titre et un message.');
      return;
    }
    Alert.alert('Envoyer la diffusion ?', `La notification sera envoyée à : ${CIBLES.find((c) => c.key === cible)?.label}.`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Envoyer', onPress: async () => {
          setSending(true);
          try {
            const r = await api.post('/admin/broadcast/', { titre: titre.trim(), message: message.trim(), cible });
            Alert.alert('Diffusion envoyée', r.data.message, [{ text: 'OK', onPress: () => router.back() }]);
          } catch (e: any) {
            Alert.alert('Erreur', e?.response?.data?.error ?? "L'envoi a échoué.");
          } finally { setSending(false); }
        },
      },
    ]);
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backRow}><Ionicons name="arrow-back" size={20} color={colors.text} /></TouchableOpacity>
        <View style={{ flex: 1 }}><Text style={styles.title}>Diffusion</Text><Text style={styles.subtitle}>Notification de masse</Text></View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Destinataires</Text>
        <View style={styles.cibles}>
          {CIBLES.map((c) => {
            const active = cible === c.key;
            return (
              <TouchableOpacity key={c.key} style={[styles.cible, active && styles.cibleActive]} onPress={() => setCible(c.key)} activeOpacity={0.85}>
                <Ionicons name={c.icon as any} size={18} color={active ? colors.primary : colors.textMuted} />
                <Text style={[styles.cibleText, active && { color: colors.primary }]}>{c.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.label}>Titre</Text>
        <TextInput style={styles.input} placeholder="Ex. Nouvelle annale disponible" placeholderTextColor={colors.textLight} value={titre} onChangeText={setTitre} maxLength={100} />

        <Text style={styles.label}>Message</Text>
        <TextInput style={[styles.input, styles.textarea]} placeholder="Rédige ton message…" placeholderTextColor={colors.textLight}
          value={message} onChangeText={setMessage} multiline textAlignVertical="top" maxLength={500} />

        <TouchableOpacity style={[styles.send, sending && { opacity: 0.7 }]} onPress={envoyer} disabled={sending} activeOpacity={0.85}>
          {sending ? <ActivityIndicator color="#fff" /> : <><Ionicons name="megaphone" size={18} color="#fff" /><Text style={styles.sendText}>Envoyer la diffusion</Text></>}
        </TouchableOpacity>
        <Text style={styles.hint}>La notification est créée pour chaque utilisateur ciblé et envoyée en push à ceux qui ont activé les notifications.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.md, paddingTop: 56, paddingBottom: 10 },
  backRow: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', ...shadow.sm },
  title: { fontSize: 22, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 1 },
  scroll: { padding: spacing.md },
  label: { fontSize: 13, fontWeight: '800', color: colors.textMuted, marginBottom: 8, marginTop: 14 },
  cibles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cible: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.full, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border },
  cibleActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  cibleText: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  input: { backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.text, borderWidth: 1, borderColor: colors.border },
  textarea: { minHeight: 130 },
  send: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 15, marginTop: 22, ...shadow.lg },
  sendText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  hint: { fontSize: 12, color: colors.textLight, lineHeight: 18, marginTop: 14 },
});
