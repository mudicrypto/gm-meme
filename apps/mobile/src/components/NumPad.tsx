import { Delete } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import { haptic } from '../lib/motion';
import { pressKey } from '../lib/numpad';
import { colors } from '../lib/theme';
import { Text } from './Text';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'] as const;

/** An on-screen keypad for amounts, so the system keyboard never covers the cost. */
export function NumPad({
  value,
  onChange,
  decimals = 9,
}: {
  value: string;
  onChange: (value: string) => void;
  decimals?: number;
}) {
  return (
    <View style={styles.grid}>
      {KEYS.map((key) => (
        <Pressable
          key={key}
          onPress={() => {
            haptic.select();
            onChange(pressKey(value, key, decimals));
          }}
          onLongPress={key === 'del' ? () => onChange('') : undefined}
          accessibilityRole="button"
          accessibilityLabel={key === 'del' ? 'Delete' : key === '.' ? 'Decimal point' : key}
          style={({ pressed }) => [styles.key, pressed && styles.pressed]}
        >
          {key === 'del' ? (
            <Delete size={22} color={colors.text2} strokeWidth={2} />
          ) : (
            <Text mono style={styles.keyText}>
              {key}
            </Text>
          )}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 4 },
  key: {
    width: '33.333%',
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
  },
  pressed: { backgroundColor: colors.surface2 },
  keyText: { fontSize: 24, fontWeight: '500', color: colors.text },
});
