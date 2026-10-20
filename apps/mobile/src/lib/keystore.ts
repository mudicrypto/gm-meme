import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Secrets kept on this phone: the iOS Keychain / Android Keystore, readable only while
 * unlocked and never included in backups or synced to other devices.
 *
 * The web build has no secure storage, so there secrets only live in memory for the
 * session ("preview" wallets, devnet testing only). They are never written to localStorage.
 */
export interface SecretItem {
  readonly persistent: boolean;
  load(): Promise<string | null>;
  save(value: string): Promise<void>;
  remove(): Promise<void>;
}

function nativeItem(key: string): SecretItem {
  return {
    persistent: true,
    load: () => SecureStore.getItemAsync(key),
    save: (value) =>
      SecureStore.setItemAsync(key, value, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      }),
    remove: () => SecureStore.deleteItemAsync(key),
  };
}

const memory = new Map<string, string>();
function sessionOnlyItem(key: string): SecretItem {
  return {
    persistent: false,
    load: async () => memory.get(key) ?? null,
    save: async (value) => {
      memory.set(key, value);
    },
    remove: async () => {
      memory.delete(key);
    },
  };
}

const secretItem = Platform.OS === 'web' ? sessionOnlyItem : nativeItem;

/** The embedded wallet's 32-byte seed (base64). */
export const keyStore = secretItem('sift.wallet.seed');
/** The Phantom connection (JSON): session token and this app's encryption key, no wallet keys. */
export const phantomStore = secretItem('sift.phantom.session');
