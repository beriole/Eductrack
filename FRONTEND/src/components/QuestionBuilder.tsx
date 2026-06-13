import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, shadow } from '@/src/theme';

export interface QItem {
  enonce: string;
  type: 'qcm' | 'vrai_faux';
  options: string[];
  correct: number;       // index de la bonne option
  explication: string;
}

export const emptyQuestion = (): QItem => ({
  enonce: '', type: 'qcm', options: ['', ''], correct: 0, explication: '',
});

/** Convertit l'état du builder vers le format attendu par l'API. */
export function toApiQuestions(items: QItem[]) {
  return items.map((q) => {
    const options = q.type === 'vrai_faux' ? ['Vrai', 'Faux'] : q.options.map((o) => o.trim()).filter(Boolean);
    return {
      enonce: q.enonce.trim(),
      type_question: q.type,
      options,
      reponse_correcte: options[q.correct] ?? options[0],
      explication: q.explication.trim(),
    };
  });
}

/** Vrai si chaque question est complète (énoncé + ≥2 options + bonne réponse). */
export function questionsValides(items: QItem[]) {
  if (items.length === 0) return false;
  return items.every((q) => {
    if (!q.enonce.trim()) return false;
    const opts = q.type === 'vrai_faux' ? ['Vrai', 'Faux'] : q.options.map((o) => o.trim()).filter(Boolean);
    return opts.length >= 2 && q.correct < opts.length;
  });
}

export function QuestionBuilder({
  questions, onChange,
}: { questions: QItem[]; onChange: (q: QItem[]) => void }) {
  const update = (i: number, patch: Partial<QItem>) =>
    onChange(questions.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));

  const setType = (i: number, type: 'qcm' | 'vrai_faux') =>
    update(i, { type, correct: 0, options: type === 'qcm' ? (questions[i].options.length >= 2 ? questions[i].options : ['', '']) : [] });

  const setOption = (i: number, oi: number, val: string) =>
    update(i, { options: questions[i].options.map((o, idx) => (idx === oi ? val : o)) });

  const addOption = (i: number) => {
    if (questions[i].options.length >= 5) return;
    update(i, { options: [...questions[i].options, ''] });
  };
  const removeOption = (i: number, oi: number) => {
    const opts = questions[i].options.filter((_, idx) => idx !== oi);
    const correct = questions[i].correct >= opts.length ? 0 : questions[i].correct;
    update(i, { options: opts, correct });
  };

  const removeQuestion = (i: number) => onChange(questions.filter((_, idx) => idx !== i));

  return (
    <View>
      {questions.map((q, i) => {
        const vf = q.type === 'vrai_faux';
        const options = vf ? ['Vrai', 'Faux'] : q.options;
        return (
          <View key={i} style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.qNum}>Question {i + 1}</Text>
              {questions.length > 1 && (
                <TouchableOpacity onPress={() => removeQuestion(i)} hitSlop={8}>
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                </TouchableOpacity>
              )}
            </View>

            <TextInput
              style={styles.enonce}
              placeholder="Énoncé de la question"
              placeholderTextColor={colors.textLight}
              value={q.enonce}
              onChangeText={(t) => update(i, { enonce: t })}
              multiline
            />

            <View style={styles.typeRow}>
              {(['qcm', 'vrai_faux'] as const).map((t) => (
                <TouchableOpacity key={t} style={[styles.typeChip, q.type === t && styles.typeChipActive]} onPress={() => setType(i, t)}>
                  <Text style={[styles.typeText, q.type === t && styles.typeTextActive]}>{t === 'qcm' ? 'QCM' : 'Vrai / Faux'}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.optLabel}>Options · coche la bonne réponse</Text>
            {options.map((opt, oi) => (
              <View key={oi} style={styles.optRow}>
                <TouchableOpacity onPress={() => update(i, { correct: oi })} hitSlop={6}>
                  <Ionicons name={q.correct === oi ? 'radio-button-on' : 'radio-button-off'} size={22} color={q.correct === oi ? colors.success : colors.textLight} />
                </TouchableOpacity>
                {vf ? (
                  <Text style={styles.vfOpt}>{opt}</Text>
                ) : (
                  <>
                    <TextInput
                      style={styles.optInput}
                      placeholder={`Option ${String.fromCharCode(65 + oi)}`}
                      placeholderTextColor={colors.textLight}
                      value={opt}
                      onChangeText={(t) => setOption(i, oi, t)}
                    />
                    {q.options.length > 2 && (
                      <TouchableOpacity onPress={() => removeOption(i, oi)} hitSlop={6}>
                        <Ionicons name="close-circle" size={20} color={colors.textLight} />
                      </TouchableOpacity>
                    )}
                  </>
                )}
              </View>
            ))}
            {!vf && q.options.length < 5 && (
              <TouchableOpacity style={styles.addOpt} onPress={() => addOption(i)}>
                <Ionicons name="add" size={16} color={colors.primary} />
                <Text style={styles.addOptText}>Ajouter une option</Text>
              </TouchableOpacity>
            )}

            <Text style={styles.optLabel}>Correction (explication)</Text>
            <TextInput
              style={styles.explication}
              placeholder="Pourquoi cette réponse est correcte…"
              placeholderTextColor={colors.textLight}
              value={q.explication}
              onChangeText={(t) => update(i, { explication: t })}
              multiline
            />
          </View>
        );
      })}

      <TouchableOpacity style={styles.addQ} onPress={() => onChange([...questions, emptyQuestion()])} activeOpacity={0.85}>
        <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
        <Text style={styles.addQText}>Ajouter une question</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: 12, ...shadow.sm },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  qNum: { fontSize: 14, fontWeight: '800', color: colors.primary },
  enonce: { backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, padding: 12, fontSize: 15, color: colors.text, borderWidth: 1, borderColor: colors.border, minHeight: 52 },
  typeRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  typeChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.full, backgroundColor: colors.surfaceAlt, borderWidth: 1.5, borderColor: colors.border },
  typeChipActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  typeText: { fontSize: 12.5, fontWeight: '700', color: colors.textMuted },
  typeTextActive: { color: colors.primary },
  optLabel: { fontSize: 12.5, fontWeight: '800', color: colors.textMuted, marginTop: 14, marginBottom: 8 },
  optRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  optInput: { flex: 1, backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14.5, color: colors.text, borderWidth: 1, borderColor: colors.border },
  vfOpt: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
  addOpt: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 6 },
  addOptText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  explication: { backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, padding: 12, fontSize: 14, color: colors.text, borderWidth: 1, borderColor: colors.border, minHeight: 60 },
  addQ: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primaryLight, borderRadius: radius.md, paddingVertical: 14, marginTop: 4 },
  addQText: { fontSize: 14.5, fontWeight: '800', color: colors.primary },
});
