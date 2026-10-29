import type { RiskLevel } from '@sift/shared';

// Sift's design system: a graphite trading terminal (docs/design/TERMINAL.md). Every colour,
// size and font the screens use comes from here; screens never hard-code them.

export const colors = {
  bg: '#0B0D10',
  /** Panels, cards, inputs, sheets. */
  surface: '#12161C',
  /** Raised controls on a panel: selected segments, chips, hover. */
  surface2: '#1A2028',
  /** Panel and table borders. */
  border: '#242B35',
  /** Button and input borders. */
  borderStrong: '#2C3440',
  /** Hairlines between table rows. */
  divider: '#1A1F27',
  tabBar: '#0E1115',
  /** Off state of a switch track. */
  track: '#2C3440',
  text: '#F3F5F7',
  /** Body text on panels. */
  text2: '#C9D0DB',
  /** Long-form body text (summaries, notes). */
  body: '#E1E5EB',
  /** Secondary text: labels, column headers. */
  muted: '#A0AABA',
  /** Captions and disclaimers (still 4.5:1 on the background). */
  faint: '#8590A1',
  accent: '#63E6BE',
  /** Shadows (never shown as a surface). */
  shadow: '#000000',
  /** Text and icons on an accent background. */
  onAccent: '#06130F',
  /** Links and accent labels. */
  link: '#63E6BE',
  up: '#63E6BE',
  caution: '#F5B544',
  down: '#FF786E',
} as const;

/** A colour at `alpha` opacity: tinted badge backgrounds (~0.12) and borders (~0.3). */
export function tint(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/** Inter, one family per weight (native platforms need that). Numbers use tabular figures. */
export const fonts = {
  ui: {
    400: 'Inter_400Regular',
    500: 'Inter_500Medium',
    600: 'Inter_600SemiBold',
    700: 'Inter_700Bold',
    800: 'Inter_800ExtraBold',
  },
} as const;

/** 8px grid; radii 8–12. */
export const radius = { chip: 8, input: 10, card: 12, cardLarge: 12, hero: 12, sheet: 16 };
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  screen: 16,
  gap: 8,
  card: 16,
  /** Room at the bottom of tab screens so content clears the tab bar. */
  tabBar: 24,
};

/** Width breakpoints: phones up to 767, tablets to 1199, desktops from 1200. */
export const breakpoints = { tablet: 768, desktop: 1200 } as const;

/** Type scale: size, weight and letter spacing. */
export const type = {
  title: { fontSize: 26, fontWeight: '700', letterSpacing: -0.6 },
  section: { fontSize: 16, fontWeight: '700' },
  cardTitle: { fontSize: 15, fontWeight: '600' },
  body: { fontSize: 14 },
  label: { fontSize: 13 },
  caption: { fontSize: 12 },
} as const;

// The screens used to call usePalette() for a light or dark palette. The design is dark
// only, so it returns the one palette, under the names those screens use.
const palette = {
  background: colors.bg,
  card: colors.surface,
  text: colors.text,
  muted: colors.muted,
  border: colors.borderStrong,
  accent: colors.accent,
  /** Text on the accent colour. */
  accentText: colors.onAccent,
  up: colors.up,
  down: colors.down,
} as const;

export type Palette = typeof palette;

export function usePalette(): Palette {
  return palette;
}

/** Badge colours: the status colour on a 12% tint of itself. */
export const RISK_COLORS: Record<RiskLevel | 'unknown', { fg: string; bg: string }> = {
  green: { fg: colors.up, bg: tint(colors.up, 0.12) },
  amber: { fg: colors.caution, bg: tint(colors.caution, 0.12) },
  red: { fg: colors.down, bg: tint(colors.down, 0.12) },
  unknown: { fg: colors.muted, bg: colors.surface2 },
};

/**
 * Never "safe" (a project rule): green only means no red flags were found. The design's
 * "Safe" is shown as "No red flags".
 */
export const RISK_LABELS: Record<RiskLevel | 'unknown', string> = {
  green: 'No red flags',
  amber: 'Caution',
  red: 'Risky',
  unknown: 'Not checked yet',
};
