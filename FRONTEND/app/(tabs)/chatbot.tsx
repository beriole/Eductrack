import { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  FlatList, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/lib/api';
import { useAuthStore } from '@/src/store/authStore';
import { colors, radius, shadow } from '@/src/theme';

function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  contenu: string;
  horodatage?: string;
}

const WELCOME: Message = {
  id: 'welcome',
  role: 'assistant',
  contenu: "Bonjour ! Je suis EduBot, ton assistant pédagogique. Pose-moi tes questions sur tes cours, des exercices, ou la préparation au BAC/BEPC. Je suis là pour t'aider !",
};

export default function ChatbotScreen() {
  const { user } = useAuthStore();
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const sessionRef = useRef<string>(uuidv4());
  const listRef = useRef<FlatList>(null);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');

    const userMsg: Message = { id: Date.now().toString(), role: 'user', contenu: text };
    setMessages((prev) => [...prev, userMsg]);
    setSending(true);

    try {
      const res = await api.post('/chatbot/message/', {
        contenu: text,
        session_chat: sessionRef.current,
      });
      const botMsg: Message = {
        id: res.data.reponse.id_message,
        role: 'assistant',
        contenu: res.data.reponse.contenu,
      };
      setMessages((prev) => [...prev, botMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: 'err-' + Date.now(), role: 'assistant', contenu: "Désolé, je ne peux pas répondre pour l'instant. Réessaie dans un moment." },
      ]);
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages]);

  // Garde-fou APRÈS tous les hooks (évite « Rendered fewer hooks » à la déconnexion).
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
      {/* En-tête */}
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Ionicons name="sparkles" size={20} color={colors.white} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>EduBot</Text>
          <View style={styles.statusRow}>
            <View style={styles.dot} />
            <Text style={styles.headerSub}>Assistant pédagogique IA</Text>
          </View>
        </View>
      </View>

      {/* Messages */}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.messagesList}
        renderItem={({ item }) => (
          <View style={[styles.bubble, item.role === 'user' ? styles.bubbleUser : styles.bubbleBot]}>
            {item.role === 'assistant' && (
              <View style={styles.botLabelRow}>
                <Ionicons name="sparkles" size={11} color={ACCENT} />
                <Text style={styles.botLabel}>EduBot</Text>
              </View>
            )}
            <Text style={[styles.bubbleText, item.role === 'user' && styles.bubbleTextUser]}>
              {item.contenu}
            </Text>
          </View>
        )}
        ListFooterComponent={sending ? (
          <View style={[styles.bubble, styles.bubbleBot]}>
            <View style={styles.botLabelRow}>
              <Ionicons name="sparkles" size={11} color={ACCENT} />
              <Text style={styles.botLabel}>EduBot</Text>
            </View>
            <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 4 }} />
          </View>
        ) : null}
      />

      {/* Saisie */}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Pose ta question..."
          placeholderTextColor={colors.textLight}
          multiline
          maxLength={500}
          onSubmitEditing={send}
          returnKeyType="send"
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!input.trim() || sending) && styles.sendBtnDisabled]}
          onPress={send}
          disabled={!input.trim() || sending}
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
  avatar: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: colors.white },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.emerald },
  headerSub: { fontSize: 13, color: '#C7D2FE' },
  botLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  messagesList: { padding: 16, paddingBottom: 8, gap: 12 },
  bubble: { maxWidth: '80%', borderRadius: radius.lg, padding: 12, ...shadow.sm },
  bubbleUser: { alignSelf: 'flex-end', backgroundColor: ACCENT, borderBottomRightRadius: 4 },
  bubbleBot: { alignSelf: 'flex-start', backgroundColor: colors.surface, borderBottomLeftRadius: 4 },
  botLabel: { fontSize: 11, fontWeight: '700', color: ACCENT, marginBottom: 4 },
  bubbleText: { fontSize: 15, color: colors.text, lineHeight: 22 },
  bubbleTextUser: { color: colors.white },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', padding: 12,
    backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border,
  },
  input: {
    flex: 1, backgroundColor: colors.surfaceAlt, borderRadius: radius.xl,
    borderWidth: 1.5, borderColor: colors.border,
    paddingHorizontal: 16, paddingVertical: 10, fontSize: 15,
    color: colors.text, maxHeight: 100, marginRight: 8,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: ACCENT,
    justifyContent: 'center', alignItems: 'center', ...shadow.sm,
  },
  sendBtnDisabled: { backgroundColor: colors.textLight },
});
