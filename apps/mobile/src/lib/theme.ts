import type { RiskLevel } from '@sift/shared';

// Sift's design system (docs/design/DESIGN.md): dark, calm, flat. Every colour, size and
// font the screens use comes from here; screens never hard-code them.

export const colors = {
  bg: '#0B0D12',
  surface: '#151922',
  surface2: '#1D2230',
  /** Card borders. */
  border: '#1F2430',
  /** Button and input borders. */
  borderStrong: '#262C3A',
  /** Hairlines between list rows. */
  divider: '#1A1E28',
  tabBar: '#0E1117',
  /** Off state of a switch track. */
  track: '#2A3040',
  text: '#F3F5F9',
  /** Body text on cards. */
  text2: '#C9CFDA',
  /** Long-form body text (summaries, notes). */
  body: '#E2E6EE',
  muted: '#9BA4B5',
  faint: '#8A93A5',
  accent: '#8B9CFF',
  /** Shadows and glows (never shown as a surface). */
  shadow: '#000000',
  /** Text and icons on an accent background. */
  onAccent: '#0B0D12',
  /** Links and accent labels. */
  link: '#A9B5FF',
  up: '#34D399',
  caution: '#FBBF24',
  down: '#F87171',
} as const;

/** A colour at `alpha` opacity: tinted badge backgrounds (~0.12) and borders (~0.3). */
export function tint(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/** Font families as loaded in the root layout (one family per weight on native). */
export const fonts = {
  ui: {
    400: 'Manrope_400Regular',
    500: 'Manrope_500Medium',
    600: 'Manrope_600SemiBold',
    700: 'Manrope_700Bold',
    800: 'Manrope_800ExtraBold',
  },
  mono: { 500: 'JetBrainsMono_500Medium', 600: 'JetBrainsMono_600SemiBold' },
} as const;

export const radius = { chip: 12, input: 14, card: 18, cardLarge: 20, hero: 24, sheet: 28 };
export const space = {
  screen: 20,
  gap: 10,
  card: 16,
  /** Room at the bottom of tab screens so content clears the floating tab bar. */
  tabBar: 120,
};

/** Type scale: size, weight and letter spacing. */
export const type = {
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.8 },
  section: { fontSize: 17, fontWeight: '800' },
  cardTitle: { fontSize: 16, fontWeight: '700' },
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
