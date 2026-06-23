import { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, Image,
  FlatList, KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { api } from '@/src/lib/api';
import { useAuthStore } from '@/src/store/authStore';
import { RichText } from '@/src/components/RichText';
import { colors, radius, shadow, subjectColor } from '@/src/theme';

function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

interface Source { id_cours: string; titre: string; matiere_nom: string; matiere_code: string }
interface Message {
  id: string;
  serverId?: string;          // id du message côté serveur (pour le feedback)
  role: 'user' | 'assistant';
  contenu: string;
  image?: string;
  sources?: Source[];
  utile?: boolean | null;
}

const WELCOME: Message = {
  id: 'welcome', role: 'assistant',
  contenu: "Bonjour ! Je suis **EduBot**, ton tuteur. Pose une question, ou prends en **photo** un exercice 📸. Je m'adapte à ta classe et je m'appuie sur tes cours.",
};

type Mode = 'guide' | 'direct';

export default function ChatbotScreen() {
  const { user } = useAuthStore();
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [mode, setMode] = useState<Mode>('guide');
  const [photo, setPhoto] = useState<string | null>(null);
  const [quota, setQuota] = useState<{ illimite: boolean; restant: number | null } | null>(null);
  const sessionRef = useRef<string>(uuidv4());
  const listRef = useRef<FlatList>(null);
  const targetRef = useRef('');      // texte cible (se remplit via le flux ou d'un coup)
  const shownRef = useRef(0);        // nb de caractères déjà révélés
  const doneRef = useRef(false);     // le réseau a fini d'envoyer
  const typingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => { if (typingRef.current) clearInterval(typingRef.current); }, []);

  const choisirPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission requise', 'Autorise l\'accès aux photos.'); return; }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], quality: 0.5, base64: true, allowsEditing: true,
    });
    if (!res.canceled && res.assets?.[0]?.base64) setPhoto(res.assets[0].base64);
  };

  const prendrePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission requise', 'Autorise la caméra.'); return; }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.5, base64: true });
    if (!res.canceled && res.assets?.[0]?.base64) setPhoto(res.assets[0].base64);
  };

  // Révélation progressive « style ChatGPT » : on dévoile le texte cible
  // (targetRef) caractère par caractère, qu'il arrive en flux ou d'un coup.
  const startTypewriter = (botId: string) => {
    if (typingRef.current) clearInterval(typingRef.current);
    typingRef.current = setInterval(() => {
      setMessages((prev) => prev.map((m) => {
        if (m.id !== botId) return m;
        const t = targetRef.current;
        if (m.contenu.length >= t.length) return m;
        const remaining = t.length - m.contenu.length;
        const step = Math.max(1, Math.ceil(remaining / 12)); // accélère si en retard
        const next = t.slice(0, m.contenu.length + step);
        shownRef.current = next.length;
        return { ...m, contenu: next };
      }));
      if (doneRef.current && shownRef.current >= targetRef.current.length) {
        if (typingRef.current) clearInterval(typingRef.current);
        typingRef.current = null;
        setSending(false);
      }
    }, 24);
  };

  // Réponse en un bloc (JSON) → remplit targetRef ; le typewriter l'anime ensuite.
  const fillNonStream = async (text: string, img: string | null, botId: string) => {
    try {
      const res = await api.post('/chatbot/message/', {
        contenu: text, session_chat: sessionRef.current, mode,
        ...(img ? { image_base64: img } : {}),
      }, { timeout: 60000 });
      setMessages((prev) => prev.map((m) => m.id === botId ? { ...m, serverId: res.data.reponse.id_message, sources: res.data.sources ?? [] } : m));
      setQuota({ illimite: !!res.data.quota_illimite, restant: res.data.quota_restant });
      targetRef.current = res.data.reponse.contenu;
    } catch (e: any) {
      targetRef.current = e?.response?.status === 402
        ? "Tu as atteint ta limite quotidienne (formule Basic). Passe à **Standard** pour un accès illimité à EduBot."
        : "Désolé, je ne peux pas répondre pour l'instant. Réessaie dans un moment.";
    }
  };

  const send = async () => {
    const text = input.trim();
    if ((!text && !photo) || sending) return;
    setInput('');
    const img = photo; setPhoto(null);

    setMessages((prev) => [...prev, { id: Date.now().toString(), role: 'user', contenu: text || '📸 Exercice', image: img ?? undefined }]);
    setSending(true);

    const botId = 'bot-' + Date.now();
    targetRef.current = ''; doneRef.current = false; shownRef.current = 0;
    setMessages((prev) => [...prev, { id: botId, role: 'assistant', contenu: '', utile: null }]);
    startTypewriter(botId);

    try {
      // Chemin non-streamé (JSON) : accents fiables. L'effet « machine à écrire »
      // est assuré côté client par le typewriter qui révèle targetRef.
      await fillNonStream(text, img, botId);
    } catch {
      targetRef.current = targetRef.current || "Désolé, une erreur est survenue.";
    } finally {
      doneRef.current = true; // le typewriter terminera la révélation puis s'arrêtera
    }
  };

  const noter = async (m: Message, utile: boolean) => {
    if (!m.serverId) return;
    setMessages((prev) => prev.map((x) => x.id === m.id ? { ...x, utile } : x));
    try { await api.post(`/chatbot/messages/${m.serverId}/feedback/`, { utile }); } catch {}
  };

  useEffect(() => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages]);

  if (user?.role !== 'eleve') {
    return (
      <View style={styles.centered}>
        <Ionicons name="lock-closed" size={48} color={colors.textLight} style={{ marginBottom: 12 }} />
        <Text style={styles.lockText}>EduBot est réservé aux élèves.</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <View style={styles.header}>
        <View style={styles.avatar}><Ionicons name="sparkles" size={20} color={colors.white} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>EduBot</Text>
          <View style={styles.statusRow}>
            <View style={styles.dot} />
            <Text style={styles.headerSub}>
              Tuteur IA{quota && !quota.illimite ? ` · ${quota.restant} msg restants` : ''}
            </Text>
          </View>
        </View>
        {/* Mode pédagogique */}
        <View style={styles.modeToggle}>
          {(['guide', 'direct'] as Mode[]).map((m) => (
            <TouchableOpacity key={m} style={[styles.modeBtn, mode === m && styles.modeBtnActive]} onPress={() => setMode(m)}>
              <Text style={[styles.modeBtnText, mode === m && styles.modeBtnTextActive]}>{m === 'guide' ? 'Guidé' : 'Direct'}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.messagesList}
        renderItem={({ item }) => (
          <View style={[styles.bubble, item.role === 'user' ? styles.bubbleUser : styles.bubbleBot]}>
            {item.role === 'assistant' && (
              <View style={styles.botLabelRow}><Ionicons name="sparkles" size={11} color={ACCENT} /><Text style={styles.botLabel}>EduBot</Text></View>
            )}
            {item.image && (
              <Image source={{ uri: `data:image/jpeg;base64,${item.image}` }} style={styles.msgImage} resizeMode="cover" />
            )}
            {item.role === 'assistant'
              ? (item.contenu
                  ? <RichText text={item.contenu} />
                  : <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 2, alignSelf: 'flex-start' }} />)
              : (item.contenu ? <Text style={[styles.bubbleText, styles.bubbleTextUser]}>{item.contenu}</Text> : null)}

            {/* Sources (cours utilisés) */}
            {!!item.sources?.length && (
              <View style={styles.sourcesRow}>
                {item.sources.map((s: Source) => (
                  <TouchableOpacity key={s.id_cours} style={[styles.sourceChip, { borderColor: subjectColor(s.matiere_code) }]}
                    onPress={() => router.push(`/cours/${s.id_cours}` as any)}>
                    <Ionicons name="book-outline" size={11} color={subjectColor(s.matiere_code)} />
                    <Text style={[styles.sourceText, { color: subjectColor(s.matiere_code) }]} numberOfLines={1}>{s.titre}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Feedback 👍/👎 (une fois la réponse identifiée côté serveur) */}
            {item.role === 'assistant' && !!item.serverId && (
              <View style={styles.feedbackRow}>
                <TouchableOpacity onPress={() => noter(item, true)} hitSlop={8}>
                  <Ionicons name={item.utile === true ? 'thumbs-up' : 'thumbs-up-outline'} size={15} color={item.utile === true ? colors.success : colors.textLight} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => noter(item, false)} hitSlop={8}>
                  <Ionicons name={item.utile === false ? 'thumbs-down' : 'thumbs-down-outline'} size={15} color={item.utile === false ? colors.danger : colors.textLight} />
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      />

      {/* Aperçu photo sélectionnée */}
      {photo && (
        <View style={styles.photoPreview}>
          <Image source={{ uri: `data:image/jpeg;base64,${photo}` }} style={styles.photoThumb} />
          <Text style={styles.photoLabel}>Photo prête à envoyer</Text>
          <TouchableOpacity onPress={() => setPhoto(null)} hitSlop={8}><Ionicons name="close-circle" size={22} color={colors.textMuted} /></TouchableOpacity>
        </View>
      )}

      <View style={styles.inputRow}>
        <TouchableOpacity style={styles.iconBtn} onPress={prendrePhoto} hitSlop={6}><Ionicons name="camera-outline" size={22} color={colors.primary} /></TouchableOpacity>
        <TouchableOpacity style={styles.iconBtn} onPress={choisirPhoto} hitSlop={6}><Ionicons name="image-outline" size={22} color={colors.primary} /></TouchableOpacity>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder={photo ? 'Ajoute une consigne (optionnel)…' : 'Pose ta question…'}
          placeholderTextColor={colors.textLight}
          multiline
          maxLength={500}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!input.trim() && !photo || sending) && styles.sendBtnDisabled]}
          onPress={send}
          disabled={(!input.trim() && !photo) || sending}
        >
          <Ionicons name="send" size={18} color="#fff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const ACCENT = colors.primary;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  lockText: { fontSize: 16, color: colors.textMuted, textAlign: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.primary, paddingTop: 56, paddingBottom: 16, paddingHorizontal: 20,
    borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl, ...shadow.md,
  },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 22, fontWeight: '800', color: colors.white },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.emerald },
  headerSub: { fontSize: 12.5, color: '#C7D2FE' },
  modeToggle: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: radius.full, padding: 3 },
  modeBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.full },
  modeBtnActive: { backgroundColor: colors.white },
  modeBtnText: { fontSize: 11.5, fontWeight: '800', color: '#fff' },
  modeBtnTextActive: { color: colors.primary },
  botLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  messagesList: { padding: 16, paddingBottom: 8, gap: 12 },
  bubble: { maxWidth: '85%', borderRadius: radius.lg, padding: 12, ...shadow.sm },
  bubbleUser: { alignSelf: 'flex-end', backgroundColor: ACCENT, borderBottomRightRadius: 4 },
  bubbleBot: { alignSelf: 'flex-start', backgroundColor: colors.surface, borderBottomLeftRadius: 4 },
  botLabel: { fontSize: 11, fontWeight: '700', color: ACCENT, marginBottom: 4 },
  bubbleText: { fontSize: 15, color: colors.text, lineHeight: 22 },
  bubbleTextUser: { color: colors.white },
  msgImage: { width: 180, height: 130, borderRadius: 10, marginBottom: 8 },
  sourcesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  sourceChip: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: 160, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.full, borderWidth: 1, backgroundColor: colors.surfaceAlt },
  sourceText: { fontSize: 11, fontWeight: '700' },
  feedbackRow: { flexDirection: 'row', gap: 16, marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border },
  photoPreview: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.surfaceAlt, borderTopWidth: 1, borderTopColor: colors.border },
  photoThumb: { width: 40, height: 40, borderRadius: 8 },
  photoLabel: { flex: 1, fontSize: 13, color: colors.textMuted, fontWeight: '600' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, padding: 12, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  iconBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primaryLight, justifyContent: 'center', alignItems: 'center' },
  input: { flex: 1, backgroundColor: colors.surfaceAlt, borderRadius: radius.xl, borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, color: colors.text, maxHeight: 100 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: ACCENT, justifyContent: 'center', alignItems: 'center', ...shadow.sm },
  sendBtnDisabled: { backgroundColor: colors.textLight },
});
