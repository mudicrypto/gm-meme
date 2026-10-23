import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

/**
 * Ask the phone's owner to confirm with Face ID, a fingerprint or the device passcode
 * before something sensitive (showing the private key, removing the wallet).
 *
 * True when confirmed, or when the phone has no lock at all (nothing to check against;
 * the screen warns instead). The web preview holds only throwaway devnet keys.
 */
export async function confirmOwner(reason: string): Promise<boolean> {
  if (Platform.OS === 'web') return true;
  const level = await LocalAuthentication.getEnrolledLevelAsync();
  if (level === LocalAuthentication.SecurityLevel.NONE) return true;
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: reason,
    cancelLabel: 'Cancel',
  });
  return result.success;
}
