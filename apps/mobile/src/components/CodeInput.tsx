import { StyleSheet } from 'react-native';
import { colors, radius } from '../lib/theme';
import { TextInput } from './Text';

/** A 6-digit authenticator code. */
export function CodeInput({
  value,
  onChange,
  autoFocus = false,
}: {
  value: string;
  onChange: (code: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <TextInput
      mono
      value={value}
      onChangeText={(text) => onChange(text.replace(/\D/g, '').slice(0, 6))}
      placeholder="000000"
      keyboardType="number-pad"
      textContentType="oneTimeCode"
      autoComplete="one-time-code"
      autoFocus={autoFocus}
      maxLength={6}
      accessibilityLabel="6-digit code from your authenticator app"
      style={styles.input}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    height: 60,
    borderRadius: radius.input + 2,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.bg,
    textAlign: 'center',
    fontSize: 28,
    fontWeight: '600',
    letterSpacing: 10,
  },
});
