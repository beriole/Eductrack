import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { api } from '@/src/lib/api';
import { colors, radius, spacing, shadow } from '@/src/theme';

interface Matiere { id_matiere: string; nom: string; code: string; }

const NIVEAUX = ['6e', '5e', '4e', '3e', '2nde', '1ere', 'Tle'];

export default function ImporterAnnaleScreen() {
  const router = useRouter();
  const [matieres, setMatieres] = useState<Matiere[]>([]);
  const [fichier, setFichier] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [titre, setTitre] = useState('');
  const [idMatiere, setIdMatiere] = useState<string | null>(null);
  const [niveau, setNiveau] = useState('Tle');
  const [annee, setAnnee] = useState('');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    api.get('/matieres/')
      .then((res) => setMatieres(res.data.results ?? res.data))
      .catch(() => {});
  }, []);

  const choisirFichier = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
    if (!res.canceled && res.assets?.length) {
      setFichier(res.assets[0]);
      if (!titre) setTitre(res.assets[0].name.replace(/\.pdf$/i, ''));
    }
  };

  const importer = async () => {
    if (!fichier) return Alert.alert('Fichier manquant', 'Choisis un PDF à importer.');
    if (!titre.trim() || !idMatiere) return Alert.alert('Champs requis', 'Renseigne le titre et la matière.');

    const form = new FormData();
    // En React Native, un fichier se passe sous forme { uri, name, type }.
    form.append('fichier', { uri: fichier.uri, name: fichier.name, type: 'application/pdf' } as any);
    form.append('titre', titre.trim());
    form.append('id_matiere', idMatiere);
    form.append('niveau', niveau);
    if (annee.trim()) form.append('annee', annee.trim());

    setUploading(true);
    try {
      const res = await api.post('/epreuves/importer-pdf/', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000,
      });
      const n = res.data.nb_questions_extraites;
      const src = res.data.source_extraction === 'ia' ? 'IA' : 'analyse automatique';
      Alert.alert(
        'Annale importée',
        `${n} question(s) extraite(s) par ${src}. L'épreuve « ${res.data.titre} » est disponible.`,
        [{ text: 'OK', onPress: () => router.back() }],
      );
    } catch (e: any) {
      const msg = e?.response?.data?.error ?? "L'import a échoué. Vérifie que le PDF contient du texte.";
      Alert.alert('Échec', msg);
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backRow}>
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Importer une annale</Text>
          <Text style={styles.subtitle}>PDF → questions extraites automatiquement</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Fichier */}
        <TouchableOpacity style={styles.fileBtn} onPress={choisirFichier} activeOpacity={0.85}>
          <Ionicons name={fichier ? 'document-text' : 'cloud-upload-outline'} size={22} color={colors.primary} />
          <Text style={styles.fileBtnText} numberOfLines={1}>
            {fichier ? fichier.name : 'Choisir un fichier PDF'}
          </Text>
          {fichier && <Ionicons name="checkmark-circle" size={20} color={colors.success} />}
        </TouchableOpacity>

        {/* Titre */}
        <Text style={styles.label}>Titre de l'épreuve</Text>
        <TextInput
          style={styles.input}
          placeholder="Ex. BAC Mathématiques 2023"
          placeholderTextColor={colors.textLight}
          value={titre}
          onChangeText={setTitre}
        />

        {/* Matière */}
        <Text style={styles.label}>Matière</Text>
        <View style={styles.chipsWrap}>
          {matieres.map((m) => (
            <TouchableOpacity
              key={m.id_matiere}
              style={[styles.chip, idMatiere === m.id_matiere && styles.chipActive]}
              onPress={() => setIdMatiere(m.id_matiere)}
            >
              <Text style={[styles.chipText, idMatiere === m.id_matiere && styles.chipTextActive]}>{m.nom}</Text>
            </TouchableOpacity>
          ))}
          {matieres.length === 0 && <Text style={styles.muted}>Chargement des matières…</Text>}
        </View>

        {/* Niveau */}
        <Text style={styles.label}>Niveau</Text>
        <View style={styles.chipsWrap}>
          {NIVEAUX.map((n) => (
            <TouchableOpacity
              key={n}
              style={[styles.chip, niveau === n && styles.chipActive]}
              onPress={() => setNiveau(n)}
            >
              <Text style={[styles.chipText, niveau === n && styles.chipTextActive]}>{n}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Année (optionnel) */}
        <Text style={styles.label}>Année (optionnel)</Text>
        <TextInput
          style={styles.input}
          placeholder="Ex. 2023"
          placeholderTextColor={colors.textLight}
          value={annee}
          onChangeText={setAnnee}
          keyboardType="number-pad"
          maxLength={4}
        />

        <TouchableOpacity style={[styles.submit, uploading && { opacity: 0.7 }]} onPress={importer} disabled={uploading} activeOpacity={0.85}>
          {uploading
            ? <><ActivityIndicator size="small" color={colors.white} /><Text style={styles.submitText}>Analyse du PDF…</Text></>
            : <><Ionicons name="sparkles" size={18} color={colors.white} /><Text style={styles.submitText}>Importer et analyser</Text></>}
        </TouchableOpacity>

        <Text style={styles.hint}>
          L'IA extrait les questions du PDF. Si l'IA est indisponible, une analyse automatique
          (numérotations 1./2./a)…) prend le relais. Un PDF avec couche texte est requis (pas une image scannée).
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.md, paddingTop: 56, paddingBottom: 12 },
  backRow: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', ...shadow.sm },
  title: { fontSize: 22, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 1 },
  scroll: { padding: spacing.md },

  fileBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16, borderWidth: 1.5, borderColor: colors.borderStrong, borderStyle: 'dashed', marginBottom: 18 },
  fileBtnText: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.text },

  label: { fontSize: 13, fontWeight: '800', color: colors.textMuted, marginBottom: 8, marginTop: 6 },
  input: { backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.text, borderWidth: 1, borderColor: colors.border, marginBottom: 12 },

  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.full, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  chipTextActive: { color: colors.primary },
  muted: { color: colors.textLight, fontSize: 13 },

  submit: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 15, marginTop: 12, ...shadow.lg },
  submitText: { color: colors.white, fontWeight: '800', fontSize: 15 },
  hint: { fontSize: 12, color: colors.textLight, lineHeight: 18, marginTop: 16 },
});
