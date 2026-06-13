import { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/lib/api';
import { EpreuveMeta, Meta } from '@/src/components/EpreuveMeta';
import { QuestionBuilder, QItem, emptyQuestion, toApiQuestions, questionsValides } from '@/src/components/QuestionBuilder';
import { colors, radius, spacing, shadow } from '@/src/theme';

export default function NouvelExerciceScreen() {
  const router = useRouter();
  const [meta, setMeta] = useState<Meta>({ titre: '', niveau: 'Tle', serie: null, id_matiere: '' });
  const [questions, setQuestions] = useState<QItem[]>([emptyQuestion()]);
  const [saving, setSaving] = useState(false);

  const valide = meta.titre.trim().length >= 3 && meta.id_matiere && questionsValides(questions);

  const creer = async () => {
    if (!valide) return Alert.alert('Incomplet', 'Renseigne le titre, la matière et des questions valides (énoncé, ≥2 options, bonne réponse cochée).');
    setSaving(true);
    try {
      await api.post('/enseignant/exercices/', {
        titre: meta.titre.trim(), id_matiere: meta.id_matiere, niveau: meta.niveau,
        serie: meta.serie, questions: toApiQuestions(questions),
      });
      Alert.alert('Exercice créé', 'Ton exercice et ses corrections sont enregistrés.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      const det = e?.response?.data?.details?.[0] ?? e?.response?.data?.error;
      Alert.alert('Erreur', det ?? "La création a échoué.");
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
          <Text style={styles.title}>Nouvel exercice</Text>
          <Text style={styles.subtitle}>Questions + corrections</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <EpreuveMeta value={meta} onChange={setMeta} />
        <Text style={styles.sectionTitle}>Questions</Text>
        <QuestionBuilder questions={questions} onChange={setQuestions} />

        <TouchableOpacity style={[styles.submit, (!valide || saving) && { opacity: 0.5 }]} onPress={creer} disabled={!valide || saving} activeOpacity={0.85}>
          {saving ? <ActivityIndicator color={colors.white} size="small" />
            : <><Ionicons name="save-outline" size={18} color={colors.white} /><Text style={styles.submitText}>Créer l'exercice</Text></>}
        </TouchableOpacity>
        <View style={{ height: 30 }} />
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
  sectionTitle: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: 22, marginBottom: 12 },
  submit: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 15, marginTop: 18, ...shadow.lg },
  submitText: { color: colors.white, fontWeight: '800', fontSize: 15 },
});
