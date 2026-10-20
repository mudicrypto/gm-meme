import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const KEY = 'sift.wallet.seed';

/**
 * Where the embedded wallet's 32-byte seed lives: the iOS Keychain / Android Keystore,
 * readable only while unlocked and never included in backups or synced to other devices.
 *
 * The web build has no secure storage, so there the key only lives in memory for the
 * session ("preview" wallets, devnet testing only). It is never written to localStorage.
 */
export interface KeyStore {
  readonly persistent: boolean;
  load(): Promise<string | null>;
  save(seedBase64: string): Promise<void>;
  remove(): Promise<void>;
}

const native: KeyStore = {
  persistent: true,
  load: () => SecureStore.getItemAsync(KEY),
  save: (value) =>
    SecureStore.setItemAsync(KEY, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }),
  remove: () => SecureStore.deleteItemAsync(KEY),
};

let memory: string | null = null;
const sessionOnly: KeyStore = {
  persistent: false,
  load: async () => memory,
  save: async (value) => {
    memory = value;
  },
  remove: async () => {
    memory = null;
  },
};

export const keyStore: KeyStore = Platform.OS === 'web' ? sessionOnly : native;
