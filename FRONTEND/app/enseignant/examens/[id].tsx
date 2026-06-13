import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/lib/api';
import { PdfManager } from '@/src/components/Pdf';
import { colors, radius, spacing, shadow } from '@/src/theme';

interface Question {
  id_question: string;
  numero_ordre: number;
  enonce: string;
  type_question: string;
  options: any[];
  reponse_correcte: string | null;
}
interface Epreuve {
  id_epreuve: string;
  titre: string;
  type_epreuve: string;
  niveau: string;
  serie: string | null;
  annee: number | null;
  matiere_nom?: string;
  corrige: string | null;
  fichier_pdf?: string | null;
  corrige_pdf?: string | null;
  questions: Question[];
}

const optText = (o: any) => (typeof o === 'string' ? o : (o?.texte ?? ''));

export default function ExamenDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [ep, setEp] = useState<Epreuve | null>(null);
  const [corrige, setCorrige] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<'questions' | 'corrige'>('questions');

  useEffect(() => {
    api.get(`/enseignant/epreuves/${id}/`)
      .then((r) => { setEp(r.data); setCorrige(r.data.corrige ?? ''); })
      .catch(() => Alert.alert('Erreur', 'Épreuve introuvable.', [{ text: 'Retour', onPress: () => router.back() }]))
      .finally(() => setLoading(false));
  }, [id]);

  const enregistrerCorrige = async () => {
    setSaving(true);
    try {
      await api.patch(`/enseignant/epreuves/${id}/`, { corrige });
      setEp((e) => (e ? { ...e, corrige } : e));
      Alert.alert('Enregistré', 'Le corrigé a été sauvegardé.');
    } catch {
      Alert.alert('Erreur', "La sauvegarde a échoué.");
    } finally {
      setSaving(false);
    }
  };

  const supprimer = () => {
    Alert.alert('Supprimer le sujet', 'Action irréversible. Confirmer ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer', style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/enseignant/epreuves/${id}/`);
            router.back();
          } catch (e: any) {
            Alert.alert('Impossible', e?.response?.data?.error ?? 'La suppression a échoué.');
          }
        },
      },
    ]);
  };

  if (loading) return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;
  if (!ep) return null;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backRow}>
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={2}>{ep.titre}</Text>
          <Text style={styles.subtitle}>
            {ep.matiere_nom} · {ep.niveau}{ep.serie ? ` · ${ep.serie}` : ''}{ep.annee ? ` · ${ep.annee}` : ''}
          </Text>
        </View>
        <TouchableOpacity onPress={supprimer} style={styles.deleteIcon}>
          <Ionicons name="trash-outline" size={20} color={colors.danger} />
        </TouchableOpacity>
      </View>

      <View style={{ paddingHorizontal: spacing.md, paddingBottom: 6, gap: 10 }}>
        <PdfManager
          url={ep.fichier_pdf}
          endpoint={`/enseignant/epreuves/${id}/pdf/`}
          title="Sujet (PDF)"
          icon="document-text"
          onUploaded={(u) => setEp((e: any) => ({ ...e, fichier_pdf: u }))}
        />
        <PdfManager
          url={ep.corrige_pdf}
          endpoint={`/enseignant/epreuves/${id}/pdf/`}
          extra={{ cible: 'corrige' }}
          resultKey="corrige_pdf"
          title="Corrigé (PDF)"
          sub="Visible par l'élève après composition."
          icon="checkmark-done-circle"
          onUploaded={(u) => setEp((e: any) => ({ ...e, corrige_pdf: u }))}
        />
      </View>

      <View style={styles.tabs}>
        {(['questions', 'corrige'] as const).map((tk) => (
          <TouchableOpacity key={tk} style={[styles.tab, tab === tk && styles.tabActive]} onPress={() => setTab(tk)} activeOpacity={0.8}>
            <Text style={[styles.tabText, tab === tk && styles.tabTextActive]}>
              {tk === 'questions' ? `Questions (${ep.questions?.length ?? 0})` : 'Corrigé'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {tab === 'questions' ? (
          (ep.questions?.length ?? 0) === 0 ? (
            <Text style={styles.muted}>Aucune question extraite.</Text>
          ) : (
            ep.questions.map((q) => (
              <View key={q.id_question} style={styles.qCard}>
                <Text style={styles.qEnonce}><Text style={styles.qNum}>{q.numero_ordre}. </Text>{q.enonce}</Text>
                {q.options?.length > 0 && q.options.map((o, i) => {
                  const txt = optText(o);
                  const correct = q.reponse_correcte && txt === q.reponse_correcte;
                  return (
                    <View key={i} style={styles.optRow}>
                      <Text style={[styles.optLetter, correct && { color: colors.success }]}>{String.fromCharCode(65 + i)}.</Text>
                      <Text style={[styles.optText, correct && { color: colors.success, fontWeight: '700' }]}>{txt}</Text>
                      {correct && <Ionicons name="checkmark-circle" size={15} color={colors.success} />}
                    </View>
                  );
                })}
                {q.reponse_correcte && q.options?.length === 0 && (
                  <Text style={styles.qReponse}>Réponse : {q.reponse_correcte}</Text>
                )}
              </View>
            ))
          )
        ) : (
          <View>
            <Text style={styles.label}>Corrigé du sujet</Text>
            <Text style={styles.help}>Rédige la correction (réponses, barème, méthode). Visible dans ta banque.</Text>
            <TextInput
              style={styles.textarea}
              placeholder="Ex. 1) Réponse B car… 2) Vrai, d'après…"
              placeholderTextColor={colors.textLight}
              value={corrige}
              onChangeText={setCorrige}
              multiline
              textAlignVertical="top"
            />
            <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={enregistrerCorrige} disabled={saving} activeOpacity={0.85}>
              {saving ? <ActivityIndicator size="small" color={colors.white} />
                : <><Ionicons name="save-outline" size={18} color={colors.white} /><Text style={styles.saveText}>Enregistrer le corrigé</Text></>}
            </TouchableOpacity>
          </View>
        )}
        <View style={{ height: 28 }} />
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
  title: { fontSize: 18, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
  subtitle: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: spacing.md, paddingVertical: 8 },
  tab: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: radius.full, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  tabActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  tabText: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  tabTextActive: { color: colors.primary },
  scroll: { padding: spacing.md },
  muted: { color: colors.textLight, fontSize: 13.5, textAlign: 'center', marginTop: 20 },

  qCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: 10, ...shadow.sm },
  qEnonce: { fontSize: 14.5, color: colors.text, lineHeight: 21, marginBottom: 8 },
  qNum: { fontWeight: '800', color: colors.primary },
  optRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 },
  optLetter: { fontSize: 13.5, fontWeight: '700', color: colors.textMuted, width: 18 },
  optText: { flex: 1, fontSize: 14, color: colors.text },
  qReponse: { fontSize: 13.5, color: colors.success, fontWeight: '700', marginTop: 6 },

  label: { fontSize: 14, fontWeight: '800', color: colors.text },
  help: { fontSize: 12.5, color: colors.textMuted, marginTop: 4, marginBottom: 12 },
  textarea: { backgroundColor: colors.surface, borderRadius: radius.md, padding: 14, fontSize: 15, color: colors.text, borderWidth: 1, borderColor: colors.border, minHeight: 200 },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 15, marginTop: 16, ...shadow.lg },
  saveText: { color: colors.white, fontWeight: '800', fontSize: 15 },
});
