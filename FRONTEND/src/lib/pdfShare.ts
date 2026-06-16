import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as SecureStore from 'expo-secure-store';
import { Alert } from 'react-native';
import { BASE_URL } from '@/src/lib/api';

/**
 * Télécharge un PDF protégé par JWT puis ouvre la feuille de partage du système
 * (WhatsApp, email, Drive…). `path` est relatif à l'API (ex. /parents/rapports/<id>/pdf/).
 */
export async function telechargerEtPartagerPdf(path: string, filename: string): Promise<boolean> {
  try {
    const token = await SecureStore.getItemAsync('access_token');
    const url = `${BASE_URL}${path}`;
    const safeName = filename.replace(/[^\w.\-]+/g, '_');
    const dest = `${FileSystem.cacheDirectory}${safeName}`;

    const res = await FileSystem.downloadAsync(url, dest, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (res.status !== 200) {
      Alert.alert('Échec', 'Le rapport PDF n\'a pas pu être téléchargé.');
      return false;
    }

    if (!(await Sharing.isAvailableAsync())) {
      Alert.alert('Partage indisponible', `Le PDF a été enregistré : ${res.uri}`);
      return false;
    }
    await Sharing.shareAsync(res.uri, {
      mimeType: 'application/pdf',
      dialogTitle: 'Partager le rapport',
      UTI: 'com.adobe.pdf',
    });
    return true;
  } catch {
    Alert.alert('Erreur', 'Impossible de partager le rapport pour le moment.');
    return false;
  }
}
