import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { socialApi } from '../lib/api';
import { useSession } from '../lib/session';
import { RISK_COLORS, colors, radius, space } from '../lib/theme';
import { Button } from './Button';
import { Sheet } from './Sheet';
import { Text, TextInput } from './Text';

/**
 * Delete account (both app stores require it in the app). Says exactly what goes and what
 * stays, and needs "DELETE" typed. The server refuses while a Sift wallet still holds
 * funds, and that message is shown as is.
 */
export function DeleteAccount() {
  const session = useSession();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!session.token) return null;

  const close = () => {
    setOpen(false);
    setTyped('');
    setError(null);
  };
  const confirm = async () => {
    if (!session.token) return;
    setBusy(true);
    setError(null);
    try {
      await socialApi.deleteAccount(session.token);
      queryClient.clear();
      await session.signOut();
      close();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        style={styles.link}
        hitSlop={4}
      >
        <Text style={styles.linkText}>Delete account</Text>
      </Pressable>
      <Sheet visible={open} onClose={close} title="Delete your account?">
        <View style={styles.body}>
          <Text style={styles.text}>
            This permanently deletes your profile, the trades you shared, who you follow, your
            watchlist, price alerts and sign-ins. It can’t be undone.
          </Text>
          <Text style={styles.text}>
            If you have a Sift wallet, withdraw everything from it first. Your phone wallet and its
            key stay on this phone: Sift never had them. Remove that separately in Portfolio.
          </Text>
          <TextInput
            value={typed}
            onChangeText={setTyped}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="Type DELETE to confirm"
            placeholderTextColor={colors.faint}
            accessibilityLabel="Type DELETE to confirm"
            style={styles.input}
          />
          {error ? (
            <View style={styles.error}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
          <Button
            label={busy ? 'Deleting…' : 'Delete my account'}
            variant="secondary"
            disabled={typed.trim() !== 'DELETE' || busy}
            onPress={() => void confirm()}
          />
          <Button label="Keep my account" onPress={close} />
        </View>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  link: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  linkText: { fontSize: 14, fontWeight: '600', color: colors.down },
  body: { gap: space.md },
  text: { fontSize: 14, lineHeight: 21, color: colors.text2 },
  input: {
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    fontSize: 15,
    color: colors.text,
  },
  error: { padding: 12, borderRadius: radius.input, backgroundColor: RISK_COLORS.red.bg },
  errorText: { fontSize: 13, lineHeight: 19, color: RISK_COLORS.red.fg },
});
