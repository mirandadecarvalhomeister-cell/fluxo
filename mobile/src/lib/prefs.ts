import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Preferences } from '../types';

const KEY = 'fluxo.mobile.preferences.v1';

export const DEFAULT_PREFERENCES: Preferences = {
  autoplay: true,
  dataSaver: false,
  videoQuality: 'auto',
  sound: false,
  reduceMotion: false,
  notifications: false,
  hiddenPosts: [],
  mutedTopics: [],
  hiddenProfiles: [],
};

export async function loadPreferences(): Promise<Preferences> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    return { ...DEFAULT_PREFERENCES, ...(JSON.parse(raw) as Partial<Preferences>) };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export async function savePreferences(preferences: Preferences) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(preferences));
  } catch {
    // Preferências são um extra: falhar a gravação não deve quebrar o app.
  }
}
