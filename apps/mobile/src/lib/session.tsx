import type { AuthSession } from '@sift/shared';
import { base58Encode, isSignInChallengeFor } from '@sift/shared';
import { useQueryClient } from '@tanstack/react-query';
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { ApiError, socialApi } from './api';
import { authStore } from './keystore';
import { registeredPushToken, setRegisteredPushToken } from './push';
import { useWallet } from './wallet';

interface SessionState {
  status: 'loading' | 'signed-out' | 'signed-in';
  /** Bearer token for the active wallet, when signed in. */
  token: string | null;
  /** Sign in by signing a plain-text message with the active wallet. */
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  /** Call when the API says the session is no longer valid (401). */
  expired(error: unknown): boolean;
}

const SessionContext = createContext<SessionState | null>(null);

/**
 * The Sift account is the wallet: signing a message proves you hold it. One session, for
 * the active wallet; switching wallets means signing in as that wallet.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const wallet = useWallet();
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState<AuthSession | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    authStore
      .load()
      .then((json) => setSaved(json ? readSession(json) : null))
      .catch(() => setSaved(null))
      .finally(() => setLoaded(true));
  }, []);

  // Expiry is checked on load and by the API (a 401 signs you out via `expired`).
  const valid = saved && saved.wallet === wallet.address ? saved : null;

  const forget = useCallback(async () => {
    await authStore.remove().catch(() => {});
    setSaved(null);
    queryClient.removeQueries({ queryKey: ['social'] });
  }, [queryClient]);

  const signIn = useCallback(async () => {
    const address = wallet.address;
    if (!address) throw new Error('Set up a wallet first.');
    const challenge = await socialApi.challenge(address);
    // Sign only Sift's own sign-in text, rebuilt here, never whatever the server sent.
    if (!isSignInChallengeFor(challenge, address, new Date())) {
      throw new Error(
        'The sign-in request from the server didn’t look right, so nothing was signed.',
      );
    }
    const message = Uint8Array.from(new TextEncoder().encode(challenge.message));
    const signature = await wallet.signMessage(message);
    const session = await socialApi.signIn(address, challenge.nonce, base58Encode(signature));
    await authStore.save(JSON.stringify(session));
    setSaved(session);
  }, [wallet]);

  const signOut = useCallback(async () => {
    if (saved) {
      // Stop this phone getting the wallet's alerts, then end the session on the server.
      const pushToken = registeredPushToken();
      if (pushToken) {
        await socialApi.deletePushToken(saved.token, pushToken).catch(() => {});
        setRegisteredPushToken(null);
      }
      await socialApi.signOut(saved.token).catch(() => {});
    }
    await forget();
  }, [saved, forget]);

  // A wallet removed from this phone (or a wallet app disconnected) is signed out everywhere.
  const { embeddedAddress, phantomAddress, walletAppAddress, browserAddress } = wallet;
  useEffect(() => {
    if (!loaded || wallet.status === 'loading' || !saved) return;
    if (
      ![embeddedAddress, phantomAddress, walletAppAddress, browserAddress].includes(saved.wallet)
    ) {
      // After this render: signing out updates state.
      void Promise.resolve().then(signOut);
    }
  }, [
    loaded,
    wallet.status,
    saved,
    embeddedAddress,
    phantomAddress,
    walletAppAddress,
    browserAddress,
    signOut,
  ]);

  const expired = useCallback(
    (error: unknown) => {
      if (error instanceof ApiError && error.status === 401) {
        void forget();
        return true;
      }
      return false;
    },
    [forget],
  );

  const value = useMemo<SessionState>(
    () => ({
      status:
        !loaded || wallet.status === 'loading' ? 'loading' : valid ? 'signed-in' : 'signed-out',
      token: valid?.token ?? null,
      signIn,
      signOut,
      expired,
    }),
    [loaded, wallet.status, valid, signIn, signOut, expired],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

function readSession(json: string): AuthSession | null {
  try {
    const value = JSON.parse(json) as Partial<AuthSession>;
    return typeof value.token === 'string' &&
      typeof value.wallet === 'string' &&
      typeof value.expiresAt === 'string' &&
      Date.parse(value.expiresAt) > Date.now()
      ? (value as AuthSession)
      : null;
  } catch {
    return null;
  }
}

export function useSession(): SessionState {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession outside SessionProvider');
  return session;
}
