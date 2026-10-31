import type { RiskLevel } from '@sift/shared';
import { scheme } from './appearance';

// Sift's design system, light and dark. Every colour, size and font the screens use comes
// from here; screens never hard-code them.

// Neutral, exchange-style palettes: graphite or white surfaces, Sift green for actions,
// lime for the one call to action on a trade.
const light = {
  /** The page. */
  bg: '#FFFFFF',
  /** Panels, cards, inputs, sheets. */
  surface: '#FAFAFA',
  /** Quiet fills: segmented tracks, hover, selected chips. */
  surface2: '#F2F3F5',
  /** Panel and table borders. */
  border: '#EAECEF',
  /** Button and input borders. */
  borderStrong: '#DCDFE4',
  /** Hairlines between table rows. */
  divider: '#F2F3F5',
  tabBar: '#FFFFFF',
  /** Off state of a switch track. */
  track: '#DCDFE4',
  text: '#1E2329',
  /** Body text on panels. */
  text2: '#32373F',
  /** Long-form body text (summaries, notes). */
  body: '#2B3139',
  /** Secondary text: labels, column headers. */
  muted: '#707A8A',
  /** Captions and disclaimers (4.5:1 on white). */
  faint: '#6B7480',
  /** Sift green: primary actions, active tabs, links. */
  accent: '#0B8A57',
  /** Shadows (never shown as a surface). */
  shadow: '#000000',
  /** Text and icons on an accent background. */
  onAccent: '#FFFFFF',
  /** Links and accent labels. */
  link: '#0B8A57',
  up: '#0B8A57',
  caution: '#B26A00',
  down: '#D12F45',
  /** Filled change badges, with white text. */
  upFill: '#0E9F67',
  downFill: '#E0394F',
  onFill: '#FFFFFF',
  /** The header's Connect button. */
  cta: '#1E2329',
  onCta: '#FFFFFF',
  /** The bright call to action on a trade. */
  lime: '#C8F04B',
  onLime: '#14161A',
};

export type Colors = typeof light;

/** Dark mode: neutral graphite, the exchange look. */
const darkColors: Colors = {
  bg: '#0F1114',
  surface: '#181A1F',
  surface2: '#22252B',
  border: '#262A30',
  borderStrong: '#363B43',
  divider: '#1D2025',
  tabBar: '#121418',
  track: '#363B43',
  text: '#EAECEF',
  text2: '#C7CCD3',
  body: '#D4D8DE',
  muted: '#848E9C',
  faint: '#7D8694',
  accent: '#2EBD85',
  shadow: '#000000',
  onAccent: '#0F1114',
  link: '#2EBD85',
  up: '#2EBD85',
  caution: '#F0B44C',
  down: '#F6465D',
  upFill: '#1FA672',
  downFill: '#E5404F',
  onFill: '#FFFFFF',
  cta: '#C8F04B',
  onCta: '#14161A',
  lime: '#C8F04B',
  onLime: '#14161A',
};

/** Dark mode is on for this session (the choice applies at startup). */
export const isDark = scheme === 'dark';

/** The app's colours, light or dark. */
export const colors: Colors = isDark ? darkColors : light;

/**
 * Trade surfaces (the trade screen, the desktop token panel, the trade sheet): a panel
 * one step off the page, with lime marking the selected side, preset and slippage.
 * They follow the theme.
 */
export const trade = isDark
  ? {
      bg: '#14161A',
      surface: '#1C1F24',
      surface2: '#262A31',
      border: '#2A2E35',
      text: darkColors.text,
      muted: darkColors.muted,
      faint: darkColors.faint,
      up: darkColors.up,
      down: darkColors.down,
      caution: darkColors.caution,
      accent: darkColors.accent,
      lime: darkColors.lime,
      onLime: darkColors.onLime,
    }
  : {
      bg: '#FAFAFA',
      surface: '#FFFFFF',
      surface2: '#F2F3F5',
      border: '#E6E8EB',
      text: light.text,
      muted: light.muted,
      faint: light.faint,
      up: light.up,
      down: light.down,
      caution: light.caution,
      accent: light.accent,
      // Lime can't be read on white: the selection mark is Sift green in light mode.
      lime: light.accent,
      onLime: '#FFFFFF',
    };

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

// Some screens call usePalette(): the current colours under the names they use.
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
