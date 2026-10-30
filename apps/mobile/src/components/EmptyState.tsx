import type { LucideIcon } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { colors, space, tint } from '../lib/theme';
import { Button } from './Button';
import { Text } from './Text';

/**
 * The one empty / gated state used across Sift: an icon, a short title, one line of
 * context and at most two actions. Centred, quiet, never a wall of text.
 */
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  secondary,
  note,
}: {
  icon: LucideIcon;
  title: string;
  body?: string;
  action?: { label: string; onPress: () => void; disabled?: boolean };
  secondary?: { label: string; onPress: () => void };
  /** Small print under the actions (an error, a reassurance). */
  note?: { text: string; tone?: 'muted' | 'down' };
}) {
  return (
    <View style={styles.box}>
      <View style={styles.icon}>
        <Icon size={22} color={colors.accent} strokeWidth={2} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        {body ? <Text style={styles.body}>{body}</Text> : null}
      </View>
      {action || secondary ? (
        <View style={styles.actions}>
          {action ? (
            <View style={styles.button}>
              <Button
                small
                label={action.label}
                onPress={action.onPress}
                disabled={action.disabled}
              />
            </View>
          ) : null}
          {secondary ? (
            <View style={styles.button}>
              <Button
                small
                variant="secondary"
                label={secondary.label}
                onPress={secondary.onPress}
              />
            </View>
          ) : null}
        </View>
      ) : null}
      {note ? (
        <Text style={[styles.note, note.tone === 'down' && { color: colors.down }]}>
          {note.text}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    gap: space.lg,
    paddingVertical: space.xl * 2,
    paddingHorizontal: space.lg,
  },
  icon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: tint(colors.accent, 0.1),
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { alignItems: 'center', gap: 6, maxWidth: 360 },
  title: { fontSize: 18, fontWeight: '600', textAlign: 'center' },
  body: { fontSize: 14, lineHeight: 20, color: colors.muted, textAlign: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space.sm },
  button: { minWidth: 168 },
  note: { fontSize: 12, lineHeight: 17, color: colors.faint, textAlign: 'center', maxWidth: 340 },
});
