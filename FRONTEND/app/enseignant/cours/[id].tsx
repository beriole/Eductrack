import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/lib/api';
import { CoursForm, CoursData } from '@/src/components/CoursForm';
import { PdfManager } from '@/src/components/Pdf';
import { colors, radius, spacing, shadow } from '@/src/theme';

const STATUT_META: Record<string, { label: string; color: string }> = {
  brouillon: { label: 'Brouillon', color: colors.textMuted },
  en_revision: { label: 'En révision', color: colors.warning },
  publie: { label: 'Publié', color: colors.success },
  archive: { label: 'Archivé', color: colors.textLight },
};

export default function EditCoursScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [cours, setCours] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get(`/cours/${id}/`)
      .then((r) => setCours(r.data))
      .catch(() => Alert.alert('Erreur', 'Cours introuvable.', [{ text: 'Retour', onPress: () => router.back() }]))
      .finally(() => setLoading(false));
  }, [id]);

  const enregistrer = async (data: CoursData) => {
    setSaving(true);
    try {
      const r = await api.patch(`/cours/${id}/`, data);
      setCours(r.data);
      Alert.alert('Enregistré', 'Les modifications ont été sauvegardées.');
    } catch (e: any) {
      Alert.alert('Erreur', e?.response?.data?.detail ?? "La sauvegarde a échoué.");
    } finally {
      setSaving(false);
    }
  };

  const soumettre = () => {
    Alert.alert('Soumettre pour publication', 'Le cours sera envoyé en révision avant publication. Continuer ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Soumettre',
        onPress: async () => {
          setBusy(true);
          try {
            await api.post(`/cours/${id}/soumettre/`);
            setCours((c: any) => ({ ...c, statut: 'en_revision' }));
            Alert.alert('Soumis', 'Ton cours est en cours de révision.');
          } catch (e: any) {
            Alert.alert('Erreur', e?.response?.data?.error ?? 'La soumission a échoué.');
          } finally { setBusy(false); }
        },
      },
    ]);
  };

  const supprimer = () => {
    Alert.alert('Supprimer le cours', 'Cette action est irréversible. Confirmer ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer', style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await api.delete(`/cours/${id}/`);
            router.back();
          } catch (e: any) {
            Alert.alert('Erreur', e?.response?.data?.detail ?? 'La suppression a échoué.');
            setBusy(false);
          }
        },
      },
    ]);
  };

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }
  if (!cours) return null;

  const meta = STATUT_META[cours.statut] ?? STATUT_META.brouillon;
  const editable = cours.statut === 'brouillon';

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backRow}>
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>{cours.titre}</Text>
          <View style={[styles.statutBadge, { backgroundColor: `${meta.color}15` }]}>
            <Text style={[styles.statutText, { color: meta.color }]}>{meta.label}</Text>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {editable ? (
          <CoursForm
            initial={{
              titre: cours.titre, contenu: cours.contenu, niveau: cours.niveau,
              serie: cours.serie, id_matiere: cours.id_matiere,
            }}
            submitting={saving}
            submitLabel="Enregistrer les modifications"
            onSubmit={enregistrer}
          />
        ) : (
          <View style={styles.readonly}>
            <Text style={styles.roInfo}>{cours.matiere_nom} · {cours.niveau}{cours.serie ? ` · ${cours.serie}` : ''}</Text>
            <Text style={styles.roContent}>{cours.contenu}</Text>
            <Text style={styles.roNote}>Ce cours n'est plus modifiable ({meta.label.toLowerCase()}).</Text>
          </View>
        )}

        {/* PDF du cours */}
        <View style={{ marginTop: 18 }}>
          <PdfManager
            url={cours.fichier_pdf}
            endpoint={`/enseignant/cours/${id}/pdf/`}
            onUploaded={(u) => setCours((c: any) => ({ ...c, fichier_pdf: u }))}
          />
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          {editable && (
            <TouchableOpacity style={[styles.actionBtn, styles.submitBtn]} onPress={soumettre} disabled={busy} activeOpacity={0.85}>
              {busy ? <ActivityIndicator size="small" color={colors.white} />
                : <><Ionicons name="paper-plane-outline" size={17} color={colors.white} /><Text style={styles.submitBtnText}>Soumettre pour publication</Text></>}
            </TouchableOpacity>
          )}
          {cours.statut !== 'publie' && (
            <TouchableOpacity style={[styles.actionBtn, styles.deleteBtn]} onPress={supprimer} disabled={busy} activeOpacity={0.85}>
              <Ionicons name="trash-outline" size={17} color={colors.danger} />
              <Text style={styles.deleteBtnText}>Supprimer</Text>
            </TouchableOpacity>
          )}
        </View>
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
  title: { fontSize: 19, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
  statutBadge: { alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 3, borderRadius: radius.full, marginTop: 4 },
  statutText: { fontSize: 11, fontWeight: '800' },
  scroll: { padding: spacing.md },

  readonly: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, ...shadow.sm },
  roInfo: { fontSize: 13, fontWeight: '700', color: colors.primary, marginBottom: 10 },
  roContent: { fontSize: 15, color: colors.text, lineHeight: 23 },
  roNote: { fontSize: 12.5, color: colors.textLight, marginTop: 14, fontStyle: 'italic' },

  actions: { gap: 12, marginTop: 18 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: radius.md, paddingVertical: 14 },
  submitBtn: { backgroundColor: colors.primary, ...shadow.md },
  submitBtnText: { color: colors.white, fontWeight: '800', fontSize: 15 },
  deleteBtn: { backgroundColor: '#FEF2F2', borderWidth: 1.5, borderColor: '#FCA5A5' },
  deleteBtnText: { color: colors.danger, fontWeight: '800', fontSize: 15 },
});
