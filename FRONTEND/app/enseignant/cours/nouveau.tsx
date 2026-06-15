import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/lib/api';
import { CoursForm, CoursData } from '@/src/components/CoursForm';
import { colors, radius, spacing, shadow } from '@/src/theme';

export default function NouveauCoursScreen() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const creer = async (data: CoursData) => {
    setSaving(true);
    try {
      const { fichier, ...rest } = data;
      if (fichier) {
        // Cours avec PDF → multipart/form-data.
        const form = new FormData();
        form.append('titre', rest.titre);
        form.append('contenu', rest.contenu);
        form.append('niveau', rest.niveau);
        form.append('id_matiere', rest.id_matiere);
        if (rest.serie) form.append('serie', rest.serie);
        form.append('fichier_pdf', { uri: fichier.uri, name: fichier.name, type: 'application/pdf' } as any);
        await api.post('/cours/', form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 60000 });
      } else {
        await api.post('/cours/', rest);
      }
      Alert.alert('Cours créé', 'Ton cours a été enregistré en brouillon.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      const err = e?.response?.data;
      const msg = err?.detail ?? err?.contenu ?? (typeof err === 'string' ? err : "La création a échoué.");
      Alert.alert('Erreur', Array.isArray(msg) ? msg[0] : msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backRow}>
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Nouveau cours</Text>
          <Text style={styles.subtitle}>Enregistré en brouillon</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <CoursForm submitting={saving} submitLabel="Enregistrer le brouillon" onSubmit={creer} />
        <View style={{ height: 28 }} />
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
});
