import { useFocusEffect } from 'expo-router';
import { usePreventScreenCapture } from 'expo-screen-capture';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Platform, Pressable, StyleSheet } from 'react-native';
import { Text } from './Text';
import { confirmOwner } from '../lib/device-auth';
import { RISK_COLORS, usePalette } from '../lib/theme';
import { useWallet } from '../lib/wallet';

/**
 * "Show private key", guarded: the owner confirms first, the key can't be copied or
 * screenshotted, and it hides itself when you leave the screen or the app.
 */
export function PrivateKeyReveal() {
  const palette = usePalette();
  const wallet = useWallet();
  const [secret, setSecret] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);

  // Leaving the tab, or the app going to the background (and the app switcher snapshot).
  useFocusEffect(useCallback(() => () => setSecret(null), []));
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') setSecret(null);
    });
    return () => subscription.remove();
  }, []);

  const reveal = async () => {
    setDenied(false);
    if (!(await confirmOwner('Confirm it’s you to show your private key'))) {
      setDenied(true);
      return;
    }
    setSecret(await wallet.exportPrivateKey());
  };

  if (!secret) {
    return (
      <>
        <Pressable onPress={reveal} style={[styles.secondary, { borderColor: palette.border }]}>
          <Text style={{ color: palette.text, fontWeight: '600' }}>Show private key</Text>
        </Pressable>
        {denied ? (
          <Text style={{ color: palette.muted }}>Not confirmed, so the key stays hidden.</Text>
        ) : null}
      </>
    );
  }
  return (
    <>
      {Platform.OS !== 'web' ? <NoScreenCapture /> : null}
      {/* Not selectable: copied keys end up in clipboard history and keyboard apps. */}
      <Text style={[styles.secret, { color: palette.text, borderColor: palette.border }]}>
        {secret}
      </Text>
      <Text style={{ color: RISK_COLORS.red.fg }}>
        Anyone with this key can take your funds. Write it down on paper. Never share it, and never
        paste it into a website.
      </Text>
      <Pressable
        onPress={() => setSecret(null)}
        style={[styles.secondary, { borderColor: palette.border }]}
      >
        <Text style={{ color: palette.text, fontWeight: '600' }}>Hide</Text>
      </Pressable>
    </>
  );
}

/** Blocks screenshots and screen recording while mounted. */
function NoScreenCapture() {
  usePreventScreenCapture('private-key');
  return null;
}

const styles = StyleSheet.create({
  secondary: { borderRadius: 12, paddingVertical: 10, alignItems: 'center', borderWidth: 1 },
  secret: { borderWidth: 1, borderRadius: 10, padding: 10, fontFamily: 'monospace', fontSize: 12 },
});
