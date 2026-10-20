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
import { keyStore } from './keystore';

interface WalletState {
  status: 'loading' | 'none' | 'ready';
  address: string | null;
  /** False on web, where the key is lost when the page closes. */
  persistent: boolean;
  create(): Promise<void>;
  remove(): Promise<void>;
  /** Sign a transaction (base64) whose only signer is this wallet. */
  signTransaction(transactionBase64: string): Promise<string>;
  /** The private key in the base58 format Phantom and Solflare import. */
  exportPrivateKey(): Promise<string>;
}

const WalletContext = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [seed, setSeed] = useState<Uint8Array | null>(null);
  const [status, setStatus] = useState<WalletState['status']>('loading');

  useEffect(() => {
    keyStore
      .load()
      .then((saved) => {
        if (saved) setSeed(base64ToBytes(saved));
        setStatus(saved ? 'ready' : 'none');
      })
      .catch(() => setStatus('none'));
  }, []);

  const address = useMemo(() => (seed ? solanaKeys.publicKey(seed) : null), [seed]);

  const create = useCallback(async () => {
    // A fresh 32-byte seed from the OS's secure random generator.
    const fresh = Crypto.getRandomBytes(32);
    await keyStore.save(bytesToBase64(fresh));
    setSeed(fresh);
    setStatus('ready');
  }, []);

  const remove = useCallback(async () => {
    await keyStore.remove();
    setSeed(null);
    setStatus('none');
  }, []);

  const signTransaction = useCallback(
    async (transactionBase64: string) => {
      if (!seed || !address) throw new Error('No wallet on this device.');
      const bytes = base64ToBytes(transactionBase64);
      const tx = decodeTransaction(bytes);
      if (tx.numRequiredSignatures !== 1 || tx.accountKeys[0] !== address) {
        throw new Error('This transaction is not for your wallet.');
      }
      return bytesToBase64(withSignature(bytes, 0, solanaKeys.sign(tx.message, seed)));
    },
    [seed, address],
  );

  const exportPrivateKey = useCallback(async () => {
    if (!seed || !address) throw new Error('No wallet on this device.');
    const secret = new Uint8Array(64);
    secret.set(seed, 0);
    secret.set(publicKeyBytes(address), 32);
    return base58Encode(secret);
  }, [seed, address]);

  const value = useMemo<WalletState>(
    () => ({
      status,
      address,
      persistent: keyStore.persistent,
      create,
      remove,
      signTransaction,
      exportPrivateKey,
    }),
    [status, address, create, remove, signTransaction, exportPrivateKey],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletState {
  const wallet = useContext(WalletContext);
  if (!wallet) throw new Error('useWallet outside WalletProvider');
  return wallet;
}
