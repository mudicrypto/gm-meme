import type { RiskLevel } from '@sift/shared';

// Sift's design system: a graphite trading terminal (docs/design/TERMINAL.md). Every colour,
// size and font the screens use comes from here; screens never hard-code them.

export const colors = {
  /** Warm off-white page. */
  bg: '#F6F7F2',
  /** Panels, cards, inputs, sheets. */
  surface: '#FFFFFF',
  /** Quiet fills: segmented tracks, hover, selected chips. */
  surface2: '#EFF1EB',
  /** Panel and table borders. */
  border: '#E3E6DE',
  /** Button and input borders. */
  borderStrong: '#D2D7CC',
  /** Hairlines between table rows. */
  divider: '#ECEEE8',
  tabBar: '#FFFFFF',
  /** Off state of a switch track. */
  track: '#D2D7CC',
  text: '#0F1712',
  /** Body text on panels. */
  text2: '#2B3730',
  /** Long-form body text (summaries, notes). */
  body: '#25302A',
  /** Secondary text: labels, column headers. */
  muted: '#5C675F',
  /** Captions and disclaimers (4.5:1 on the page). */
  faint: '#6B756E',
  /** Sift green: primary actions, active tabs, links. */
  accent: '#0B7A4F',
  /** Shadows (never shown as a surface). */
  shadow: '#000000',
  /** Text and icons on an accent background. */
  onAccent: '#FFFFFF',
  /** Links and accent labels. */
  link: '#0B7A4F',
  up: '#108A4E',
  caution: '#A86200',
  down: '#D13A3A',
  /** The bright call to action on dark trade surfaces. */
  lime: '#D5F25B',
  onLime: '#0F1712',
} as const;

/**
 * The dark trade surfaces (the phone Trade screen, the desktop token panel): near-black
 * green with a lime call to action.
 */
export const dark = {
  bg: '#0F1915',
  surface: '#16231D',
  surface2: '#1E2C26',
  border: '#28372F',
  text: '#F2F5F3',
  muted: '#9AA79F',
  faint: '#83908A',
  up: '#3DD68C',
  down: '#FF6B6B',
  caution: '#F5B544',
  accent: '#3DD68C',
  lime: '#D5F25B',
  onLime: '#0F1712',
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
/** 8px controls, 12px cards. */
export const radius = { chip: 8, input: 8, card: 12, cardLarge: 12, hero: 12, sheet: 16 };
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
