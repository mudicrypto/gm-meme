import { Appearance, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/** The user's appearance choice: follow the phone, or always light or dark. */
export type AppearanceMode = 'system' | 'light' | 'dark';
export type Scheme = 'light' | 'dark';

const KEY = 'sift.appearance';

export function parseMode(value: string | null | undefined): AppearanceMode {
  return value === 'light' || value === 'dark' ? value : 'system';
}

/** The scheme to draw: the choice, or the phone's setting (light when it has none). */
export function resolveScheme(mode: AppearanceMode, system: string | null | undefined): Scheme {
  if (mode !== 'system') return mode;
  return system === 'dark' ? 'dark' : 'light';
}

/**
 * Read synchronously, at startup: every style sheet takes its colours when its module
 * loads, so the scheme is fixed for the session and a change applies on the next start.
 */
export function readMode(): AppearanceMode {
  try {
    if (Platform.OS === 'web') {
      return typeof localStorage === 'undefined' ? 'system' : parseMode(localStorage.getItem(KEY));
    }
    return parseMode(SecureStore.getItem(KEY));
  } catch {
    return 'system';
  }
}

export function saveMode(mode: AppearanceMode): void {
  try {
    if (Platform.OS === 'web') localStorage.setItem(KEY, mode);
    else SecureStore.setItem(KEY, mode);
  } catch {
    // Not saved: the app keeps following the phone.
  }
}

export const startupMode = readMode();
export const scheme: Scheme = resolveScheme(startupMode, Appearance.getColorScheme());
