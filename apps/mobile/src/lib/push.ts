import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

let registered: string | null = null;

/** The push token this phone registered with Sift in this session, if any. */
export const registeredPushToken = () => registered;
export const setRegisteredPushToken = (token: string | null) => {
  registered = token;
};

export type PushSetup = { token: string } | { problem: string };

/**
 * Set this phone up for price-alert notifications: an Expo push token, or the reason it
 * can't get one, in plain words. Alerts still show in the Watchlist tab either way.
 */
export async function setUpPush(): Promise<PushSetup> {
  if (Platform.OS === 'web')
    return { problem: 'Notifications work in the phone app, not the web preview.' };
  if (!Device.isDevice) return { problem: 'Notifications need a real phone, not a simulator.' };
  const projectId =
    (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId ??
    Constants.easConfig?.projectId;
  if (!projectId) {
    return {
      problem: 'This build isn’t set up for notifications. Install the test app from Expo.',
    };
  }
  try {
    if (Platform.OS === 'android') {
      // Android 13+ only shows the permission prompt once a channel exists.
      await Notifications.setNotificationChannelAsync('price-alerts', {
        name: 'Price alerts',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') ({ status } = await Notifications.requestPermissionsAsync());
    if (status !== 'granted') {
      return { problem: 'Notifications are off for Sift. Turn them on in your phone’s Settings.' };
    }
    return { token: (await Notifications.getExpoPushTokenAsync({ projectId })).data };
  } catch {
    return {
      problem:
        'The phone couldn’t register for notifications. On Android this build may be missing its Firebase setup.',
    };
  }
}

/** Just the token, for background registration after sign-in. */
export async function registerForPush(): Promise<string | null> {
  const setup = await setUpPush();
  return 'token' in setup ? setup.token : null;
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
