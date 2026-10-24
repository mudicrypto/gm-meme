import { useMutation } from '@tanstack/react-query';
import { Text } from './Text';
import { socialApi } from '../lib/api';
import { setRegisteredPushToken, setUpPush } from '../lib/push';
import { useSession } from '../lib/session';
import { usePalette } from '../lib/theme';
import { Button } from './Button';
import { Card } from './Card';

/** Check that price alerts reach this phone: set it up if needed, then send a test. */
export function NotificationsCard() {
  const palette = usePalette();
  const { token } = useSession();
  const test = useMutation({
    mutationFn: async () => {
      const setup = await setUpPush();
      if ('problem' in setup) throw new Error(setup.problem);
      await socialApi.savePushToken(token!, setup.token);
      setRegisteredPushToken(setup.token);
      return socialApi.pushTest(token!);
    },
  });
  return (
    <Card title="Notifications">
      <Text style={{ color: palette.muted }}>
        When an alert goes off, Sift can tell you on your lock screen. Check it works on this phone.
      </Text>
      <Button
        label={test.isPending ? 'Sending…' : 'Send a test notification'}
        variant="secondary"
        disabled={test.isPending || !token}
        onPress={() => test.mutate()}
      />
      {test.isSuccess ? (
        <Text style={{ color: palette.up }}>
          Sent. It should arrive in a few seconds
          {test.data.devices > 1 ? ` on your ${test.data.devices} phones` : ''}.
        </Text>
      ) : null}
      {test.isError ? <Text style={{ color: palette.down }}>{test.error.message}</Text> : null}
    </Card>
  );
}
