import type { LucideIcon } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { colors, space, trade } from '../lib/theme';
import { Button } from './Button';
import { GlowIcon, GlowPanel } from './GlowPanel';
import { Text } from './Text';

/**
 * The one empty / gated state used across Sift: a lit panel with an icon, a short title,
 * one line of context and at most two actions. Centred, never a wall of text.
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
    <GlowPanel style={styles.box}>
      <GlowIcon>
        <Icon size={24} color={trade.lime} strokeWidth={1.8} />
      </GlowIcon>
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
                variant="lime"
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
    </GlowPanel>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    gap: space.lg,
    paddingVertical: 48,
    paddingHorizontal: space.xl,
  },
  copy: { alignItems: 'center', gap: 8, maxWidth: 400 },
  title: { fontSize: 22, fontWeight: '600', letterSpacing: -0.4, textAlign: 'center' },
  body: { fontSize: 15, lineHeight: 22, color: colors.muted, textAlign: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space.sm },
  button: { minWidth: 168 },
  note: { fontSize: 12, lineHeight: 17, color: colors.faint, textAlign: 'center', maxWidth: 340 },
});
