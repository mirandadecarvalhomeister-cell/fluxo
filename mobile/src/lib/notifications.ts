import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
  }),
});

export async function requestNotificationPermission(): Promise<boolean> {
  if (!Device.isDevice) return false;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('fluxo', {
      name: 'Fluxo',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 90, 45, 120],
      lightColor: '#8b5cf6',
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

export async function notifyLocally(title: string, body: string, data?: Record<string, unknown>) {
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, data, sound: false },
      trigger: null,
    });
  } catch {
    // Notificação é opcional; nunca deve derrubar a navegação.
  }
}

export function addNotificationTapHandler(handler: (data: Record<string, any>) => void) {
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    handler(response.notification.request.content.data || {});
  });
  return () => subscription.remove();
}
