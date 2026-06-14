import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/lib/api';
import { colors, radius } from '@/src/theme';

type IoniconName = keyof typeof Ionicons.glyphMap;

interface Abonnement {
  formule: string;
  montant: number;
  periodicite: string;
  date_expiration: string;
  statut: string;
}

interface AbonnementActif {
  abonnement: Abonnement | null;
  formule: string;
}

const FORMULES = [
  {
    key: 'basic',
    label: 'Basic',
    icon: 'gift-outline' as IoniconName,
    prix: { mensuel: 0, trimestriel: 0, annuel: 0 },
    features: ['Accès cours limité', '3 épreuves/mois', 'EduBot (5 msg/jour)'],
    couleur: '#6B7280',
  },
  {
    key: 'standard',
    label: 'Standard',
    icon: 'star' as IoniconName,
    prix: { mensuel: 2500, trimestriel: 6500, annuel: 24000 },
    features: ['Cours illimités', '20 épreuves/mois', 'EduBot illimité', 'Planning d\'études'],
    couleur: '#3B82F6',
    populaire: true,
  },
  {
    key: 'premium',
    label: 'Premium',
    icon: 'rocket' as IoniconName,
    prix: { mensuel: 5000, trimestriel: 13000, annuel: 48000 },
    features: ['Tout Standard', 'Épreuves illimitées', 'Suivi parental avancé', 'Orientation scolaire'],
    couleur: colors.primary,
  },
  {
    key: 'pro',
    label: 'Pro',
    icon: 'diamond' as IoniconName,
    prix: { mensuel: 10000, trimestriel: 26000, annuel: 96000 },
    features: ['Tout Premium', 'Sessions privées', 'Correction personnalisée', 'Support prioritaire'],
    couleur: '#D97706',
  },
];

type Periodicite = 'mensuel' | 'trimestriel' | 'annuel';

export default function AbonnementScreen() {
  const router = useRouter();
  const [actif, setActif] = useState<AbonnementActif | null>(null);
  const [loading, setLoading] = useState(true);
  const [periodicite, setPeriodicite] = useState<Periodicite>('mensuel');
  const [selected, setSelected] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [paying, setPaying] = useState(false);
  const [polling, setPolling] = useState(false);
  const [transId, setTransId] = useState<string | null>(null);

  useEffect(() => {
    api.get('/abonnements/actif/')
      .then(r => setActif(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSubscribe = async () => {
    if (!selected || selected === 'basic') return;
    if (!phone.trim()) {
      Alert.alert('Téléphone requis', 'Saisissez votre numéro MTN MoMo ou Orange Money.');
      return;
    }
    setPaying(true);
    try {
      const res = await api.post('/paiements/initier/', {
        formule: selected,
        periodicite,
        phone: phone.trim(),
      });
      setTransId(res.data.trans_id);
      Alert.alert(
        'Paiement initié',
        `Confirmez le paiement de ${res.data.montant} FCFA sur votre téléphone.\n\nAppuyez sur "Vérifier" après confirmation.`,
        [
          { text: 'Vérifier', onPress: () => pollStatut(res.data.trans_id) },
          { text: 'Plus tard', style: 'cancel' },
        ],
      );
    } catch (e: any) {
      Alert.alert('Erreur', e?.response?.data?.error ?? 'Impossible d\'initier le paiement.');
    } finally {
      setPaying(false);
    }
  };

  const pollStatut = async (tid: string) => {
    setPolling(true);
    try {
      const res = await api.get(`/paiements/${tid}/statut/`);
      if (res.data.statut === 'confirme') {
        Alert.alert('Paiement confirmé', 'Votre abonnement est maintenant actif.');
        const updated = await api.get('/abonnements/actif/');
        setActif(updated.data);
        setSelected(null);
      } else {
        Alert.alert('En attente', 'Paiement pas encore confirmé. Réessayez dans quelques instants.');
      }
    } catch {
      Alert.alert('Erreur', 'Impossible de vérifier le statut.');
    } finally {
      setPolling(false);
    }
  };

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  const formuleActuelle = actif?.formule ?? 'basic';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.inner}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backRow}>
          <Ionicons name="arrow-back" size={18} color="#C7D2FE" />
          <Text style={styles.backText}>Retour</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Abonnements</Text>
        <Text style={styles.subtitle}>Choisissez la formule adaptée à vos objectifs</Text>
      </View>

      {/* Abonnement actif */}
      {actif?.abonnement && (
        <View style={styles.activeBanner}>
          <Ionicons name="checkmark-circle" size={16} color="#065F46" />
          <Text style={styles.activeBannerText}>
            Abonnement {formuleActuelle.toUpperCase()} actif jusqu'au{' '}
            {new Date(actif.abonnement.date_expiration).toLocaleDateString('fr-FR')}
          </Text>
        </View>
      )}

      {/* Toggle périodicité */}
      <View style={styles.periodiciteRow}>
        {(['mensuel', 'trimestriel', 'annuel'] as Periodicite[]).map((p) => (
          <TouchableOpacity
            key={p}
            style={[styles.periodeBtn, periodicite === p && styles.periodeBtnActive]}
            onPress={() => setPeriodicite(p)}
          >
            <Text style={[styles.periodeBtnText, periodicite === p && styles.periodeBtnTextActive]}>
              {p === 'mensuel' ? 'Mensuel' : p === 'trimestriel' ? 'Trimestriel' : 'Annuel'}
            </Text>
            {p === 'annuel' && <Text style={styles.reductionTag}>-20%</Text>}
          </TouchableOpacity>
        ))}
      </View>

      {/* Cartes formules */}
      {FORMULES.map((f) => {
        const prix = f.prix[periodicite];
        const isActuel = f.key === formuleActuelle;
        const isSelected = selected === f.key;
        return (
          <TouchableOpacity
            key={f.key}
            style={[
              styles.card,
              isSelected && { borderColor: f.couleur, borderWidth: 2.5 },
              isActuel && styles.cardActuel,
            ]}
            onPress={() => setSelected(f.key)}
            activeOpacity={0.85}
          >
            {f.populaire && <View style={[styles.popularBadge, { backgroundColor: f.couleur }]}><Text style={styles.popularText}>Populaire</Text></View>}
            <View style={styles.cardHeader}>
              <View style={[styles.cardIconWrap, { backgroundColor: `${f.couleur}1A` }]}>
                <Ionicons name={f.icon} size={22} color={f.couleur} />
              </View>
              <View style={styles.cardTitleBlock}>
                <Text style={[styles.cardTitle, { color: f.couleur }]}>{f.label}</Text>
                {isActuel && <Text style={styles.actuelTag}>Votre formule</Text>}
              </View>
              <View style={styles.prixBlock}>
                <Text style={[styles.prix, { color: f.couleur }]}>
                  {prix === 0 ? 'Gratuit' : `${prix.toLocaleString()} F`}
                </Text>
                {prix > 0 && <Text style={styles.prixPeriode}>/{periodicite}</Text>}
              </View>
            </View>
            <View style={styles.featuresBlock}>
              {f.features.map((feat, i) => (
                <View key={i} style={styles.featureRow}>
                  <Ionicons name="checkmark" size={15} color={f.couleur} />
                  <Text style={styles.featureItem}>{feat}</Text>
                </View>
              ))}
            </View>
          </TouchableOpacity>
        );
      })}

      {/* Saisie téléphone */}
      {selected && selected !== 'basic' && selected !== formuleActuelle && (
        <View style={styles.phoneSection}>
          <Text style={styles.phoneSectionLabel}>Numéro MTN MoMo ou Orange Money</Text>
          <TextInput
            style={styles.phoneInput}
            value={phone}
            onChangeText={setPhone}
            placeholder="ex: 6XXXXXXXX"
            keyboardType="phone-pad"
            maxLength={15}
            placeholderTextColor="#9CA3AF"
          />
          <Text style={styles.phoneHint}>
            Le paiement sera demandé sur ce numéro. Assurez-vous d'avoir le solde suffisant.
          </Text>
        </View>
      )}

      {/* Bouton souscrire */}
      {selected && selected !== 'basic' && selected !== formuleActuelle && (
        <TouchableOpacity
          style={[styles.subscribeBtn, (paying || polling) && styles.subscribeBtnLoading]}
          onPress={handleSubscribe}
          disabled={paying || polling}
        >
          {paying || polling
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.subscribeBtnText}>
                Payer {FORMULES.find(f => f.key === selected)?.prix[periodicite].toLocaleString()} FCFA →
              </Text>
          }
        </TouchableOpacity>
      )}

      {transId && (
        <TouchableOpacity style={styles.verifyBtn} onPress={() => pollStatut(transId)} disabled={polling}>
          {polling
            ? <ActivityIndicator color={colors.primary} />
            : <View style={styles.verifyBtnInner}><Ionicons name="refresh" size={16} color={colors.primary} /><Text style={styles.verifyBtnText}>Vérifier le paiement</Text></View>
          }
        </TouchableOpacity>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const PRIMARY = colors.primary;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  inner: { paddingBottom: 32 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { backgroundColor: PRIMARY, paddingTop: 56, paddingBottom: 24, paddingHorizontal: 20, borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12 },
  backText: { color: '#C7D2FE', fontWeight: '600', fontSize: 14 },
  title: { fontSize: 24, fontWeight: '800', color: '#fff' },
  subtitle: { fontSize: 13, color: '#C7D2FE', marginTop: 4 },
  activeBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#D1FAE5', margin: 16, borderRadius: 12, padding: 12 },
  activeBannerText: { color: '#065F46', fontWeight: '600', fontSize: 13, textAlign: 'center' },
  periodiciteRow: { flexDirection: 'row', margin: 16, gap: 8 },
  periodeBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#E5E7EB', alignItems: 'center' },
  periodeBtnActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  periodeBtnText: { fontSize: 12, fontWeight: '600', color: '#6B7280' },
  periodeBtnTextActive: { color: colors.primary },
  reductionTag: { fontSize: 10, color: '#10B981', fontWeight: '700', marginTop: 2 },
  card: { backgroundColor: '#fff', borderRadius: 16, marginHorizontal: 16, marginBottom: 12, padding: 16, borderWidth: 1.5, borderColor: '#E5E7EB', elevation: 1 },
  cardActuel: { borderColor: '#10B981', backgroundColor: '#F0FDF4' },
  popularBadge: { position: 'absolute', top: -1, right: 12, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8, borderTopLeftRadius: 0, borderTopRightRadius: 14 },
  popularText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  cardIconWrap: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  cardTitleBlock: { flex: 1 },
  cardTitle: { fontSize: 18, fontWeight: '800' },
  actuelTag: { fontSize: 11, color: '#10B981', fontWeight: '700', marginTop: 2 },
  prixBlock: { alignItems: 'flex-end' },
  prix: { fontSize: 20, fontWeight: '900' },
  prixPeriode: { fontSize: 11, color: '#9CA3AF' },
  featuresBlock: { gap: 6 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  featureItem: { fontSize: 13, color: '#374151' },
  phoneSection: { marginHorizontal: 16, marginTop: 4, marginBottom: 12 },
  phoneSectionLabel: { fontSize: 14, fontWeight: '700', color: PRIMARY, marginBottom: 8 },
  phoneInput: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E7EB', paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: PRIMARY },
  phoneHint: { fontSize: 12, color: '#9CA3AF', marginTop: 6 },
  subscribeBtn: { backgroundColor: colors.primary, borderRadius: 14, marginHorizontal: 16, paddingVertical: 16, alignItems: 'center', marginBottom: 12 },
  subscribeBtnLoading: { backgroundColor: '#9CA3AF' },
  subscribeBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  verifyBtn: { borderWidth: 1.5, borderColor: colors.primary, borderRadius: 14, marginHorizontal: 16, paddingVertical: 14, alignItems: 'center', marginBottom: 12 },
  verifyBtnInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  verifyBtnText: { color: colors.primary, fontWeight: '700', fontSize: 15 },
});
