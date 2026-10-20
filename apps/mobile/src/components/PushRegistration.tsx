import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { socialApi } from '../lib/api';
import { registerForPush } from '../lib/push';
import { useSession } from '../lib/session';

/** Once signed in, register this phone for price-alert pushes; open the token on tap. */
export function PushRegistration() {
  const { token } = useSession();

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void registerForPush().then((pushToken) => {
      if (pushToken && !cancelled) socialApi.savePushToken(token, pushToken).catch(() => {});
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const mint = response.notification.request.content.data?.mint;
      if (typeof mint === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) {
        router.push(`/token/${mint}`);
      }
    });
    return () => subscription.remove();
  }, []);

  return null;
}
