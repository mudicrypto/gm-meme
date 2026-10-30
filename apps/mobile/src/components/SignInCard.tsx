import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { KeyRound, Wallet } from 'lucide-react-native';
import { Platform } from 'react-native';
import { mwaErrorMessage } from '../lib/mwa-results';
import { isCancelled } from '../lib/phantom';
import { useSession } from '../lib/session';
import { useWallet } from '../lib/wallet';
import { EmptyState } from './EmptyState';

/**
 * Where a feature needs you signed in. `reason` is one short line ("Keep a watchlist and
 * get price alerts."). Signing in signs a message, not a transaction.
 */
export function SignInCard({ reason }: { reason: string }) {
  const wallet = useWallet();
  const session = useSession();
  const signIn = useMutation({ mutationFn: session.signIn });

  if (!wallet.address) {
    return (
      <EmptyState
        icon={Wallet}
        title={Platform.OS === 'web' ? 'Connect a wallet' : 'Set up your wallet'}
        body={reason}
        action={{
          label: Platform.OS === 'web' ? 'Connect wallet' : 'Set up wallet',
          onPress: () => router.navigate('/portfolio'),
        }}
      />
    );
  }
  const error = signIn.isError && !isCancelled(signIn.error) ? mwaErrorMessage(signIn.error) : null;
  return (
    <EmptyState
      icon={KeyRound}
      title="Sign in"
      body={reason}
      action={{
        label: signIn.isPending ? 'Waiting for your wallet…' : 'Sign in',
        onPress: () => signIn.mutate(),
        disabled: signIn.isPending,
      }}
      note={
        error
          ? { text: error, tone: 'down' }
          : { text: 'You sign a short message. It’s free and can’t move funds.' }
      }
    />
  );
}
