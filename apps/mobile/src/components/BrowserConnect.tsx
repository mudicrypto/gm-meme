import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Image, Linking, Pressable, StyleSheet, View } from 'react-native';
import { transition } from '../lib/motion';
import { useNetwork } from '../lib/network';
import { colors, radius, space } from '../lib/theme';
import { useWallet } from '../lib/wallet';
import { Card } from './Card';
import { Text } from './Text';

/**
 * Sift on the web: connect a browser wallet extension (Phantom, Solflare, Backpack…). The
 * keys stay in the extension, which shows its own approval for every sign-in and trade.
 * On devnet there's also a throwaway test wallet that lives only in this tab.
 */
export function BrowserConnect() {
  const wallet = useWallet();
  const { cluster, isDevnet } = useNetwork();
  const [creating, setCreating] = useState(false);
  const connect = useMutation({
    mutationFn: (name: string) => wallet.connectBrowser(name, cluster),
  });
  const found = wallet.browserWallets;
  return (
    <Card title="Connect your wallet">
      <Text style={styles.body}>
        Sift on the web works with your browser wallet. Your keys stay in the extension: Sift shows
        the full cost, then your wallet asks you to approve.
      </Text>
      {found.length > 0 ? (
        <View style={styles.list}>
          {found.map((w) => (
            <Pressable
              key={w.name}
              onPress={() => connect.mutate(w.name)}
              disabled={connect.isPending}
              accessibilityRole="button"
              accessibilityLabel={`Connect ${w.name}`}
              style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [
                styles.walletRow,
                hovered && { backgroundColor: colors.surface2 },
                connect.isPending && { opacity: 0.6 },
                transition,
              ]}
            >
              {w.icon.startsWith('data:image/') ? (
                <Image source={{ uri: w.icon }} style={styles.icon} />
              ) : (
                <View style={styles.icon} />
              )}
              <Text style={styles.walletName}>
                {connect.isPending && connect.variables === w.name
                  ? `Approve in ${w.name}…`
                  : w.name}
              </Text>
              <Text style={styles.connect}>Connect</Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <View style={styles.none}>
          <Text style={styles.body}>
            No wallet extension found in this browser. Install one, then reload this page:
          </Text>
          <View style={styles.links}>
            {[
              ['Phantom', 'https://phantom.com/download'],
              ['Solflare', 'https://solflare.com/download'],
              ['Backpack', 'https://backpack.app/download'],
            ].map(([name, url]) => (
              <Pressable
                key={name}
                onPress={() => void Linking.openURL(url!)}
                accessibilityRole="link"
                style={styles.linkButton}
              >
                <Text style={styles.link}>Get {name}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
      {connect.isError ? (
        <Text style={styles.error}>
          {/reject|denied|cancel/i.test(connect.error.message)
            ? 'You cancelled in your wallet. Nothing was shared.'
            : connect.error.message}
        </Text>
      ) : null}
      {isDevnet && !wallet.embeddedAddress ? (
        <Pressable
          onPress={async () => {
            setCreating(true);
            await wallet.create().finally(() => setCreating(false));
          }}
          disabled={creating}
          accessibilityRole="button"
          style={styles.test}
        >
          <Text style={styles.link}>Or try a test wallet</Text>
          <Text style={styles.hint}>Devnet only. Lost when you close this tab.</Text>
        </Pressable>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  body: { fontSize: 14, lineHeight: 21, color: colors.muted },
  list: { gap: space.sm },
  walletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 56,
    paddingHorizontal: space.md,
    borderRadius: radius.input,
    backgroundColor: colors.bg,
  },
  icon: { width: 28, height: 28, borderRadius: 8, backgroundColor: colors.surface2 },
  walletName: { flex: 1, fontSize: 15, fontWeight: '600' },
  connect: { fontSize: 14, fontWeight: '600', color: colors.accent },
  none: { gap: space.sm },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  linkButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: radius.input,
    backgroundColor: colors.bg,
  },
  link: { fontSize: 14, fontWeight: '600', color: colors.accent },
  error: { fontSize: 13, color: colors.down },
  test: { minHeight: 44, justifyContent: 'center', alignItems: 'center', gap: 2 },
  hint: { fontSize: 12, color: colors.faint },
});
