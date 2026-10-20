import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * An Expo push token for price alerts, or null when this build can't get one: the web
 * preview, a simulator, Expo Go on Android (no remote push since SDK 53), a build without
 * an EAS project ID, or the user said no. Alerts still show in the Watchlist tab.
 */
export async function registerForPush(): Promise<string | null> {
  if (Platform.OS === 'web' || !Device.isDevice) return null;
  const projectId =
    (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId ??
    Constants.easConfig?.projectId;
  if (!projectId) return null;
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('price-alerts', {
        name: 'Price alerts',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') ({ status } = await Notifications.requestPermissionsAsync());
    if (status !== 'granted') return null;
    return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch {
    return null;
  }
}

if (Platform.OS !== 'web') {
  // Show alerts that arrive while Sift is open, too.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}
