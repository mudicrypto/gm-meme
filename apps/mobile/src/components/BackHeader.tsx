import { router } from 'expo-router';
import { ChevronLeft, X } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '../lib/theme';
import { IconButton } from './Button';
import { Text } from './Text';

/** A pushed screen's header: back (or close) button, title, optional right side. */
export function BackHeader({
  title,
  subtitle,
  right,
  close = false,
  center = false,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  close?: boolean;
  /** Centre the title between the buttons (the order sheet). */
  center?: boolean;
}) {
  const Icon = close ? X : ChevronLeft;
  return (
    <View style={styles.row}>
      <IconButton
        label={close ? 'Close' : 'Back'}
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/portfolio'))}
      >
        <Icon size={20} color={colors.text} strokeWidth={2} />
      </IconButton>
      <View style={[styles.flex, center && styles.center]}>
        <Text style={center ? styles.centerTitle : styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text mono style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ?? (center ? <View style={styles.spacer} /> : null)}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
  flex: { flex: 1, minWidth: 0 },
  center: { alignItems: 'center' },
  title: { fontSize: 24, fontWeight: '800', letterSpacing: -0.6 },
  centerTitle: { fontSize: 17, fontWeight: '800' },
  subtitle: { fontSize: 12, color: colors.muted },
  spacer: { width: 44 },
});
