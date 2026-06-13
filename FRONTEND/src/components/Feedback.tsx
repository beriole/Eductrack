import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/lib/api';
import { colors, radius, shadow } from '@/src/theme';

/** Rangée d'étoiles. Interactive si `onChange` est fourni. */
export function StarRating({ value, onChange, size = 22 }: { value: number; onChange?: (n: number) => void; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= value;
        const star = <Ionicons name={filled ? 'star' : 'star-outline'} size={size} color={filled ? '#F59E0B' : colors.textLight} />;
        return onChange
          ? <TouchableOpacity key={n} onPress={() => onChange(n)} hitSlop={6}>{star}</TouchableOpacity>
          : <View key={n}>{star}</View>;
      })}
    </View>
  );
}

type Cible = { kind: 'cours' | 'epreuve'; id: string };

function payload(cible: Cible, extra: object = {}) {
  return cible.kind === 'cours' ? { id_cours: cible.id, ...extra } : { id_epreuve: cible.id, ...extra };
}

/** Bloc d'avis élève : moyenne, favori, et notation + commentaire personnels. */
export function ContentFeedback({
  cible, noteMoyenne, nbAvis, monAvis, estFavori,
}: {
  cible: Cible;
  noteMoyenne?: number | null;
  nbAvis?: number;
  monAvis?: { note: number; commentaire: string | null } | null;
  estFavori?: boolean;
}) {
  const [note, setNote] = useState(monAvis?.note ?? 0);
  const [commentaire, setCommentaire] = useState(monAvis?.commentaire ?? '');
  const [fav, setFav] = useState(!!estFavori);
  const [saving, setSaving] = useState(false);
  const [savedNote, setSavedNote] = useState(monAvis?.note ?? 0);

  const toggleFav = async () => {
    setFav((v) => !v); // optimiste
    try { const r = await api.post('/favoris/toggle/', payload(cible)); setFav(r.data.est_favori); }
    catch { setFav((v) => !v); }
  };

  const envoyer = async () => {
    if (note < 1) { Alert.alert('Note requise', 'Choisis au moins une étoile.'); return; }
    setSaving(true);
    try {
      await api.post('/avis/', payload(cible, { note, commentaire: commentaire.trim() }));
      setSavedNote(note);
      Alert.alert('Merci !', 'Ton avis a bien été enregistré.');
    } catch (e: any) {
      Alert.alert('Oups', e?.response?.data?.error ?? "L'envoi a échoué.");
    } finally { setSaving(false); }
  };

  const modifie = note !== savedNote || (commentaire.trim() !== (monAvis?.commentaire ?? '').trim());

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="star" size={16} color="#F59E0B" />
          <Text style={styles.moyenne}>{noteMoyenne != null ? noteMoyenne.toFixed(1) : '—'}</Text>
          <Text style={styles.nbAvis}>{nbAvis ? `(${nbAvis} avis)` : 'Aucun avis'}</Text>
        </View>
        <TouchableOpacity onPress={toggleFav} style={[styles.favBtn, fav && styles.favBtnActive]} activeOpacity={0.8}>
          <Ionicons name={fav ? 'heart' : 'heart-outline'} size={18} color={fav ? colors.danger : colors.textMuted} />
          <Text style={[styles.favText, fav && { color: colors.danger }]}>{fav ? 'Favori' : 'Ajouter'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.divider} />

      <Text style={styles.label}>Ton avis</Text>
      <View style={{ marginTop: 8, marginBottom: 10 }}>
        <StarRating value={note} onChange={setNote} size={28} />
      </View>
      <TextInput
        style={styles.input}
        placeholder="Un commentaire pour l'enseignant (optionnel)…"
        placeholderTextColor={colors.textLight}
        value={commentaire}
        onChangeText={setCommentaire}
        multiline
      />
      <TouchableOpacity
        style={[styles.submit, (!modifie || saving) && { opacity: 0.5 }]}
        onPress={envoyer} disabled={!modifie || saving} activeOpacity={0.85}>
        {saving ? <ActivityIndicator size="small" color={colors.white} />
          : <><Ionicons name="send" size={15} color={colors.white} /><Text style={styles.submitText}>{savedNote ? 'Mettre à jour' : 'Envoyer'}</Text></>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16, ...shadow.sm },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  moyenne: { fontSize: 18, fontWeight: '800', color: colors.text },
  nbAvis: { fontSize: 12.5, color: colors.textMuted },
  favBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.full, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  favBtnActive: { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5' },
  favText: { fontSize: 12.5, fontWeight: '700', color: colors.textMuted },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 14 },
  label: { fontSize: 14, fontWeight: '800', color: colors.text },
  input: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: 12, fontSize: 14, color: colors.text, borderWidth: 1, borderColor: colors.border, minHeight: 70, textAlignVertical: 'top' },
  submit: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 12, marginTop: 12 },
  submitText: { color: colors.white, fontWeight: '800', fontSize: 14 },
});
