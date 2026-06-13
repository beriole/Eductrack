import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as WebBrowser from 'expo-web-browser';
import { api } from '@/src/lib/api';
import { colors, radius, shadow } from '@/src/theme';

/** Ouvre un PDF (URL absolue) dans le navigateur in-app — côté élève comme prof. */
async function ouvrirPdf(url: string) {
  try { await WebBrowser.openBrowserAsync(url); }
  catch { Alert.alert('Oups', "Impossible d'ouvrir le PDF."); }
}

/** Bouton « Consulter le PDF » (élève). N'affiche rien s'il n'y a pas de fichier. */
export function PdfViewButton({ url, label = 'Consulter le PDF' }: { url?: string | null; label?: string }) {
  if (!url) return null;
  return (
    <TouchableOpacity style={styles.viewBtn} onPress={() => ouvrirPdf(url)} activeOpacity={0.85}>
      <Ionicons name="document-text" size={18} color={colors.danger} />
      <Text style={styles.viewText}>{label}</Text>
      <Ionicons name="open-outline" size={16} color={colors.danger} />
    </TouchableOpacity>
  );
}

/** Gestion du PDF côté enseignant : voir / importer / remplacer.
 *  `title`/`sub` personnalisent l'étiquette, `extra` ajoute des champs au form
 *  (ex. { cible: 'corrige' }), `resultKey` est la clé de l'URL dans la réponse. */
export function PdfManager({
  url, endpoint, onUploaded,
  title = 'Document PDF', sub, extra, resultKey = 'fichier_pdf', icon = 'document-attach',
}: {
  url?: string | null; endpoint: string; onUploaded?: (newUrl: string) => void;
  title?: string; sub?: string; extra?: Record<string, string>;
  resultKey?: string; icon?: keyof typeof Ionicons.glyphMap;
}) {
  const [busy, setBusy] = useState(false);

  const importer = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.length) return;
    const file = res.assets[0];
    const form = new FormData();
    form.append('fichier', { uri: file.uri, name: file.name, type: 'application/pdf' } as any);
    if (extra) Object.entries(extra).forEach(([k, v]) => form.append(k, v));
    setBusy(true);
    try {
      const r = await api.post(endpoint, form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 60000 });
      onUploaded?.(r.data[resultKey]);
      Alert.alert('PDF importé', 'Le document est désormais disponible.');
    } catch (e: any) {
      Alert.alert('Échec', e?.response?.data?.error ?? "L'import du PDF a échoué.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.card}>
      <View style={[styles.icon, { backgroundColor: url ? `${colors.success}15` : colors.surfaceAlt }]}>
        <Ionicons name={icon} size={20} color={url ? colors.success : colors.textMuted} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.sub}>{url ? (sub ?? "PDF attaché (consultable par l'élève).") : 'Aucun PDF attaché.'}</Text>
      </View>
      {url ? (
        <TouchableOpacity style={styles.smallBtn} onPress={() => ouvrirPdf(url)}>
          <Ionicons name="eye-outline" size={18} color={colors.primary} />
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity style={styles.importBtn} onPress={importer} disabled={busy} activeOpacity={0.85}>
        {busy ? <ActivityIndicator size="small" color={colors.white} />
          : <><Ionicons name={url ? 'refresh' : 'cloud-upload-outline'} size={16} color={colors.white} /><Text style={styles.importText}>{url ? 'Remplacer' : 'Importer'}</Text></>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  viewBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#FEF2F2', borderWidth: 1.5, borderColor: '#FCA5A5', borderRadius: radius.md, paddingVertical: 13 },
  viewText: { color: colors.danger, fontWeight: '800', fontSize: 14.5 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14, ...shadow.sm },
  icon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 14.5, fontWeight: '800', color: colors.text },
  sub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  smallBtn: { width: 36, height: 36, borderRadius: 11, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  importBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 9, ...shadow.sm },
  importText: { color: colors.white, fontWeight: '800', fontSize: 13 },
});
