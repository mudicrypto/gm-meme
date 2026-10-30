import { useState } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { type AppearanceMode, saveMode, scheme, startupMode } from '../lib/appearance';
import { colors } from '../lib/theme';
import { Card } from './Card';
import { Segmented } from './Segmented';
import { Text } from './Text';

const OPTIONS = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const;

/**
 * Light, dark, or follow the phone. Colours are set when Sift starts: the web app reloads
 * to repaint, and the phone app asks for a restart.
 */
export function AppearanceCard() {
  const [mode, setMode] = useState<AppearanceMode>(startupMode);
  const choose = (next: AppearanceMode) => {
    setMode(next);
    saveMode(next);
    if (Platform.OS === 'web') window.location.reload();
  };
  const pending = Platform.OS !== 'web' && mode !== startupMode;
  return (
    <Card title="Appearance">
      <Segmented options={OPTIONS} value={mode} onChange={choose} />
      <Text style={styles.note}>
        {pending
          ? 'Close and reopen Sift to apply.'
          : mode === 'system'
            ? `Following your ${Platform.OS === 'web' ? 'browser' : 'phone'}: ${scheme} now.`
            : `Always ${mode}.`}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  note: { fontSize: 13, color: colors.muted },
});
