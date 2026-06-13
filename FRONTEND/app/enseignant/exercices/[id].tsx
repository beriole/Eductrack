import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/lib/api';
import { EpreuveMeta, Meta } from '@/src/components/EpreuveMeta';
import { QuestionBuilder, QItem, toApiQuestions, questionsValides } from '@/src/components/QuestionBuilder';
import { PdfManager } from '@/src/components/Pdf';
import { colors, radius, spacing, shadow } from '@/src/theme';

const optText = (o: any) => (typeof o === 'string' ? o : (o?.texte ?? ''));

function toQItems(questions: any[]): QItem[] {
  return (questions ?? []).map((q) => {
    const type = q.type_question === 'vrai_faux' ? 'vrai_faux' : 'qcm';
    const options = (q.options ?? []).map(optText);
    const correct = Math.max(0, options.findIndex((o: string) => o === q.reponse_correcte));
    return { enonce: q.enonce ?? '', type, options: options.length ? options : ['', ''], correct, explication: q.explication ?? '' };
  });
}

export default function EditExerciceScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [questions, setQuestions] = useState<QItem[]>([]);
  const [fichierPdf, setFichierPdf] = useState<string | null>(null);
  const [corrigePdf, setCorrigePdf] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get(`/enseignant/epreuves/${id}/`)
      .then((r) => {
        const d = r.data;
        setMeta({ titre: d.titre, niveau: d.niveau, serie: d.serie, id_matiere: d.id_matiere });
        setQuestions(toQItems(d.questions));
        setFichierPdf(d.fichier_pdf ?? null);
        setCorrigePdf(d.corrige_pdf ?? null);
      })
      .catch(() => Alert.alert('Erreur', 'Exercice introuvable.', [{ text: 'Retour', onPress: () => router.back() }]))
      .finally(() => setLoading(false));
  }, [id]);

  const valide = !!meta && meta.titre.trim().length >= 3 && meta.id_matiere && questionsValides(questions);

  const enregistrer = async () => {
    if (!valide || !meta) return;
    setSaving(true);
    try {
      await api.patch(`/enseignant/epreuves/${id}/`, {
        titre: meta.titre.trim(), niveau: meta.niveau, serie: meta.serie,
      });
      await api.put(`/enseignant/exercices/${id}/questions/`, { questions: toApiQuestions(questions) });
      Alert.alert('Enregistré', 'Les modifications ont été sauvegardées.');
    } catch (e: any) {
      const det = e?.response?.data?.details?.[0] ?? e?.response?.data?.error;
      Alert.alert('Erreur', det ?? "La sauvegarde a échoué (élèves déjà passés ?).");
    } finally {
      setSaving(false);
    }
  };

  const supprimer = () => {
    Alert.alert('Supprimer l\'exercice', 'Action irréversible. Confirmer ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer', style: 'destructive',
        onPress: async () => {
          try { await api.delete(`/enseignant/epreuves/${id}/`); router.back(); }
          catch (e: any) { Alert.alert('Impossible', e?.response?.data?.error ?? 'Échec.'); }
        },
      },
    ]);
  };

  if (loading || !meta) return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backRow}>
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>Modifier l'exercice</Text>
        </View>
        <TouchableOpacity onPress={supprimer} style={styles.deleteIcon}>
          <Ionicons name="trash-outline" size={20} color={colors.danger} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <EpreuveMeta value={meta} onChange={setMeta} />

        <View style={{ marginTop: 18, gap: 10 }}>
          <PdfManager url={fichierPdf} endpoint={`/enseignant/epreuves/${id}/pdf/`}
            title="Énoncé (PDF)" icon="document-text" onUploaded={setFichierPdf} />
          <PdfManager url={corrigePdf} endpoint={`/enseignant/epreuves/${id}/pdf/`}
            extra={{ cible: 'corrige' }} resultKey="corrige_pdf"
            title="Corrigé (PDF)" sub="Visible par l'élève après composition."
            icon="checkmark-done-circle" onUploaded={setCorrigePdf} />
        </View>

        <Text style={styles.sectionTitle}>Questions</Text>
        <QuestionBuilder questions={questions} onChange={setQuestions} />

        <TouchableOpacity style={[styles.submit, (!valide || saving) && { opacity: 0.5 }]} onPress={enregistrer} disabled={!valide || saving} activeOpacity={0.85}>
          {saving ? <ActivityIndicator color={colors.white} size="small" />
            : <><Ionicons name="save-outline" size={18} color={colors.white} /><Text style={styles.submitText}>Enregistrer</Text></>}
        </TouchableOpacity>
        <View style={{ height: 30 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.md, paddingTop: 56, paddingBottom: 10 },
  backRow: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', ...shadow.sm },
  deleteIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 19, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
  scroll: { padding: spacing.md },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: 22, marginBottom: 12 },
  submit: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 15, marginTop: 18, ...shadow.lg },
  submitText: { color: colors.white, fontWeight: '800', fontSize: 15 },
});
