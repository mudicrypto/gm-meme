import { DISPLAY_NAME_MAX, type MyProfile } from '@sift/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Switch } from './Switch';
import { Text, TextInput } from './Text';
import { socialApi } from '../lib/api';
import { useSession } from '../lib/session';
import { normalizeHandle } from '../lib/social';
import { usePalette } from '../lib/theme';
import { Button } from './Button';
import { Card } from './Card';

/** Pick or change your name, and choose whether to share your trades. */
export function ProfileForm({
  profile,
  onDone,
}: {
  profile: MyProfile | null;
  onDone?: () => void;
}) {
  const palette = usePalette();
  const { token } = useSession();
  const queryClient = useQueryClient();
  const [handle, setHandle] = useState(profile?.handle ?? '');
  const [displayName, setDisplayName] = useState(profile?.displayName ?? '');
  const [shareTrades, setShareTrades] = useState(profile?.shareTrades ?? false);
  const checked = normalizeHandle(handle);
  const nameOk = displayName.trim().length > 0;
  const save = useMutation({
    mutationFn: () => {
      if (!('handle' in checked)) throw new Error(checked.error);
      return socialApi.saveProfile(token!, {
        handle: checked.handle,
        displayName: displayName.trim(),
        shareTrades,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['social'] });
      onDone?.();
    },
  });
  const inputStyle = [styles.input, { color: palette.text, borderColor: palette.border }];

  return (
    <Card title={profile ? 'Edit your profile' : 'Create your profile'}>
      <Text style={{ color: palette.muted }}>
        Friends find you by your name. Your wallet address isn’t shown on your profile.
      </Text>
      <Text style={[styles.label, { color: palette.text }]}>Name (@handle)</Text>
      <TextInput
        value={handle}
        onChangeText={setHandle}
        placeholder="e.g. sam_trades"
        placeholderTextColor={palette.muted}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={21}
        style={inputStyle}
      />
      {handle.length > 0 && 'error' in checked ? (
        <Text style={{ color: palette.down }}>{checked.error}</Text>
      ) : null}
      <Text style={[styles.label, { color: palette.text }]}>Display name</Text>
      <TextInput
        value={displayName}
        onChangeText={setDisplayName}
        placeholder="Sam"
        placeholderTextColor={palette.muted}
        maxLength={DISPLAY_NAME_MAX}
        style={inputStyle}
      />
      <View style={styles.switchRow}>
        <View style={styles.flex}>
          <Text style={[styles.label, { color: palette.text }]}>Share my trades</Text>
          <Text style={{ color: palette.muted, fontSize: 13 }}>
            Trades you make in Sift from now on show on your profile and in your followers’ feeds.
            Anyone on Sift can see them, and someone determined could match them to your wallet on
            the blockchain. Off by default. Turning it off removes what you shared.
          </Text>
        </View>
        <Switch value={shareTrades} onValueChange={setShareTrades} label="Share my trades" />
      </View>
      <Button
        label={save.isPending ? 'Saving…' : 'Save'}
        disabled={save.isPending || !('handle' in checked) || !nameOk}
        onPress={() => save.mutate()}
      />
      {save.isError ? <Text style={{ color: palette.down }}>{save.error.message}</Text> : null}
      {onDone && profile ? <Button label="Cancel" variant="secondary" onPress={onDone} /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  label: { fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flex: { flex: 1, gap: 2 },
});
