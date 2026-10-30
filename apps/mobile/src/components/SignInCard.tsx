import { useMutation } from '@tanstack/react-query';
import { Link } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';
import { Text } from './Text';
import { mwaErrorMessage } from '../lib/mwa-results';
import { isCancelled } from '../lib/phantom';
import { useSession } from '../lib/session';
import { usePalette } from '../lib/theme';
import { useWallet } from '../lib/wallet';
import { Button } from './Button';
import { Card } from './Card';

/** Shown where a feature needs you signed in. Signing in signs a message, not a transaction. */
export function SignInCard({ reason }: { reason: string }) {
  const palette = usePalette();
  const wallet = useWallet();
  const session = useSession();
  const signIn = useMutation({ mutationFn: session.signIn });

  if (!wallet.address) {
    return (
      <Card title="Set up a wallet first">
        <Text style={{ color: palette.muted }}>
          Your wallet is your Sift account. {reason} Create one on this phone or connect your wallet
          app.
        </Text>
        <Link href="/portfolio" asChild>
          <Pressable style={StyleSheet.flatten([styles.link, { backgroundColor: palette.accent }])}>
            <Text style={[styles.linkText, { color: palette.accentText }]}>Set up wallet</Text>
          </Pressable>
        </Link>
      </Card>
    );
  }
  return (
    <Card title="Sign in with your wallet">
      <Text style={{ color: palette.muted }}>
        {reason}{' '}
        {wallet.kind === 'phantom'
          ? 'Phantom will ask you to sign a short message.'
          : wallet.kind === 'walletApp'
            ? 'Your wallet app will ask you to sign a short message.'
            : wallet.kind === 'browser'
              ? `${wallet.browserWalletName ?? 'Your wallet'} will ask you to sign a short message.`
              : 'Your wallet signs a short message on this phone.'}{' '}
        It proves the wallet is yours. It is not a transaction: it can’t move funds or cost
        anything.
      </Text>
      <Button
        label={signIn.isPending ? 'Signing in…' : 'Sign in'}
        disabled={signIn.isPending}
        onPress={() => signIn.mutate()}
      />
      {signIn.isError && !isCancelled(signIn.error) && mwaErrorMessage(signIn.error) ? (
        <Text style={{ color: palette.down }}>{mwaErrorMessage(signIn.error)}</Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  link: { borderRadius: 12, paddingVertical: 11, alignItems: 'center' },
  linkText: { fontSize: 15, fontWeight: '700' },
});
