import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  base58Encode,
  base64ToBytes,
  bytesToBase64,
  decodeTransaction,
  publicKeyBytes,
  solanaKeys,
  withSignature,
} from '@sift/shared';
import * as Crypto from 'expo-crypto';
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Platform } from 'react-native';
import { keyStore, phantomStore } from './keystore';
import { type PhantomSession, phantomConnect, phantomSign } from './phantom';
import type { PhantomCluster } from './phantom-protocol';

export type WalletKind = 'embedded' | 'phantom';

interface WalletState {
  status: 'loading' | 'none' | 'ready';
  /** The wallet Sift trades with: the active one of the two below. */
  address: string | null;
  kind: WalletKind | null;
  embeddedAddress: string | null;
  phantomAddress: string | null;
  /** Phantom's deeplinks need the mobile app; the web preview can't use them. */
  phantomAvailable: boolean;
  /** False on web, where the embedded key is lost when the page closes. */
  persistent: boolean;
  create(): Promise<void>;
  remove(): Promise<void>;
  connectPhantom(cluster: PhantomCluster): Promise<void>;
  /** Forget the Phantom connection on this phone. Phantom keeps the wallet and its funds. */
  disconnectPhantom(): Promise<void>;
  use(kind: WalletKind): void;
  /** Sign a transaction (base64) whose only signer is the active wallet. */
  signTransaction(transactionBase64: string): Promise<string>;
  /** The embedded wallet's private key in the base58 format Phantom and Solflare import. */
  exportPrivateKey(): Promise<string>;
}

const ACTIVE_KEY = 'sift.wallet.active';
const WalletContext = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [seed, setSeed] = useState<Uint8Array | null>(null);
  const [phantom, setPhantom] = useState<PhantomSession | null>(null);
  const [preferred, setPreferred] = useState<WalletKind | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      keyStore.load().catch(() => null),
      phantomStore.load().catch(() => null),
      AsyncStorage.getItem(ACTIVE_KEY).catch(() => null),
    ])
      .then(([savedSeed, savedPhantom, active]) => {
        if (savedSeed) setSeed(base64ToBytes(savedSeed));
        const session = savedPhantom ? readSession(savedPhantom) : null;
        if (session) setPhantom(session);
        if (active === 'embedded' || active === 'phantom') setPreferred(active);
      })
      .finally(() => setLoaded(true));
  }, []);

  const embeddedAddress = useMemo(() => (seed ? solanaKeys.publicKey(seed) : null), [seed]);
  const phantomAddress = phantom?.publicKey ?? null;
  // The preferred wallet if it still exists, otherwise whichever one does.
  const kind: WalletKind | null =
    preferred === 'phantom' && phantom
      ? 'phantom'
      : preferred === 'embedded' && seed
        ? 'embedded'
        : seed
          ? 'embedded'
          : phantom
            ? 'phantom'
            : null;
  const address =
    kind === 'phantom' ? phantomAddress : kind === 'embedded' ? embeddedAddress : null;

  const use = useCallback((next: WalletKind) => {
    setPreferred(next);
    AsyncStorage.setItem(ACTIVE_KEY, next).catch(() => {});
  }, []);

  const create = useCallback(async () => {
    // A fresh 32-byte seed from the OS's secure random generator.
    const fresh = Crypto.getRandomBytes(32);
    await keyStore.save(bytesToBase64(fresh));
    setSeed(fresh);
    use('embedded');
  }, [use]);

  const remove = useCallback(async () => {
    await keyStore.remove();
    setSeed(null);
  }, []);

  const connectPhantom = useCallback(
    async (cluster: PhantomCluster) => {
      const session = await phantomConnect(cluster);
      await phantomStore.save(JSON.stringify(session));
      setPhantom(session);
      use('phantom');
    },
    [use],
  );

  const disconnectPhantom = useCallback(async () => {
    // The session token is useless without the encryption key we delete here.
    await phantomStore.remove();
    setPhantom(null);
  }, []);

  const signTransaction = useCallback(
    async (transactionBase64: string) => {
      if (!address) throw new Error('No wallet connected.');
      const bytes = base64ToBytes(transactionBase64);
      const tx = decodeTransaction(bytes);
      if (tx.numRequiredSignatures !== 1 || tx.accountKeys[0] !== address) {
        throw new Error('This transaction is not for your wallet.');
      }
      if (kind === 'phantom' && phantom) return bytesToBase64(await phantomSign(phantom, bytes));
      if (!seed) throw new Error('No wallet on this device.');
      return bytesToBase64(withSignature(bytes, 0, solanaKeys.sign(tx.message, seed)));
    },
    [address, kind, phantom, seed],
  );

  const exportPrivateKey = useCallback(async () => {
    if (!seed || !embeddedAddress) throw new Error('No wallet on this device.');
    const secret = new Uint8Array(64);
    secret.set(seed, 0);
    secret.set(publicKeyBytes(embeddedAddress), 32);
    return base58Encode(secret);
  }, [seed, embeddedAddress]);

  const value = useMemo<WalletState>(
    () => ({
      status: !loaded ? 'loading' : address ? 'ready' : 'none',
      address,
      kind,
      embeddedAddress,
      phantomAddress,
      phantomAvailable: Platform.OS !== 'web',
      persistent: keyStore.persistent,
      create,
      remove,
      connectPhantom,
      disconnectPhantom,
      use,
      signTransaction,
      exportPrivateKey,
    }),
    [
      loaded,
      address,
      kind,
      embeddedAddress,
      phantomAddress,
      create,
      remove,
      connectPhantom,
      disconnectPhantom,
      use,
      signTransaction,
      exportPrivateKey,
    ],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

function readSession(json: string): PhantomSession | null {
  try {
    const value = JSON.parse(json) as Partial<PhantomSession>;
    return typeof value.publicKey === 'string' &&
      typeof value.session === 'string' &&
      typeof value.phantomEncryptionPublicKey === 'string' &&
      typeof value.dappSecretKey === 'string'
      ? (value as PhantomSession)
      : null;
  } catch {
    return null;
  }
}

export function useWallet(): WalletState {
  const wallet = useContext(WalletContext);
  if (!wallet) throw new Error('useWallet outside WalletProvider');
  return wallet;
}
