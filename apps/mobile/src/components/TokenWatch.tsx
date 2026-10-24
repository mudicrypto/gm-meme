import type { AlertDirection } from '@sift/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Bell } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { Text, TextInput } from './Text';
import { socialApi } from '../lib/api';
import { formatSolPrice } from '../lib/format';
import { useSession } from '../lib/session';
import { describeAlert, parsePriceSol, suggestedAlertPrice } from '../lib/social';
import { useAlerts, useWatchlist } from '../lib/social-hooks';
import { colors, radius, usePalette } from '../lib/theme';
import { Button } from './Button';
import { Card } from './Card';
import { Segmented } from './Segmented';

/** Watch a token and set price alerts for it. Needs sign-in. */
export function TokenWatch({ mint, priceSol }: { mint: string; priceSol: number | undefined }) {
  const palette = usePalette();
  const { token } = useSession();
  const queryClient = useQueryClient();
  const watchlist = useWatchlist();
  const alerts = useAlerts();
  const [direction, setDirection] = useState<AlertDirection>('above');
  const [price, setPrice] = useState('');
  const [open, setOpen] = useState(false);

  const watching = watchlist.data?.tokens.some((t) => t.mint === mint) ?? false;
  const mine = (alerts.data?.alerts ?? []).filter((a) => a.mint === mint && !a.triggeredAt);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['social'] });
  const toggleWatch = useMutation({
    mutationFn: () => (watching ? socialApi.unwatch(token!, mint) : socialApi.watch(token!, mint)),
    onSuccess: refresh,
  });
  const target = parsePriceSol(price);
  const create = useMutation({
    mutationFn: () => socialApi.createAlert(token!, { mint, direction, priceSol: target! }),
    onSuccess: async () => {
      setOpen(false);
      setPrice('');
      await refresh();
    },
  });

  if (!token) {
    return (
      <Card title="Watch and alerts">
        <Text style={{ color: palette.muted }}>
          Sign in on the Friends tab to watch this token and get price alerts.
        </Text>
      </Card>
    );
  }

  const openForm = () => {
    if (priceSol) setPrice(suggestedAlertPrice(priceSol, direction));
    setOpen(true);
  };

  return (
    <Card title="Watch and alerts">
      <Button
        label={watching ? 'On your watchlist' : 'Add to watchlist'}
        variant={watching ? 'secondary' : 'primary'}
        disabled={toggleWatch.isPending || watchlist.isPending}
        onPress={() => toggleWatch.mutate()}
      />
      {mine.map((alert) => (
        <View key={alert.id} style={styles.alert}>
          <Bell size={16} color={colors.link} strokeWidth={2} />
          <Text style={{ color: palette.text }}>{describeAlert(alert)}</Text>
        </View>
      ))}
      {open ? (
        <>
          <Segmented
            value={direction}
            onChange={(next) => {
              setDirection(next);
              if (priceSol) setPrice(suggestedAlertPrice(priceSol, next));
            }}
            options={[
              { value: 'above', label: 'Goes above' },
              { value: 'below', label: 'Goes below' },
            ]}
          />
          <TextInput
            value={price}
            onChangeText={setPrice}
            placeholder="Price in SOL per token"
            placeholderTextColor={palette.muted}
            keyboardType="decimal-pad"
            autoCapitalize="none"
            style={styles.input}
          />
          <Text style={{ color: palette.muted, fontSize: 13 }}>
            {priceSol ? `Now ${formatSolPrice(priceSol)} SOL. ` : 'No price recorded yet. '}
            {target
              ? `Alert when ${describeAlert({ direction, priceSol: target }).toLowerCase()}.`
              : ''}
          </Text>
          <Button
            label={create.isPending ? 'Saving…' : 'Set alert'}
            disabled={!target || create.isPending}
            onPress={() => create.mutate()}
          />
          <Button label="Cancel" variant="secondary" onPress={() => setOpen(false)} />
          {create.isError ? (
            <Text style={{ color: palette.down }}>{create.error.message}</Text>
          ) : null}
        </>
      ) : (
        <Button label="Set a price alert" variant="secondary" onPress={openForm} />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  alert: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.bg,
    borderRadius: radius.input,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
  },
});
