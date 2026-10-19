import type { RiskLevel } from '@sift/shared';
import { useColorScheme } from 'react-native';

const light = {
  background: '#F6F7F9',
  card: '#FFFFFF',
  text: '#111827',
  muted: '#6B7280',
  border: '#E5E7EB',
  accent: '#0F766E',
  accentText: '#FFFFFF',
  up: '#15803D',
  down: '#B91C1C',
};

const dark: typeof light = {
  background: '#0B0F14',
  card: '#151B23',
  text: '#F3F4F6',
  muted: '#9CA3AF',
  border: '#232B36',
  accent: '#2DD4BF',
  accentText: '#04211E',
  up: '#4ADE80',
  down: '#F87171',
};

export type Palette = typeof light;

export function usePalette(): Palette {
  return useColorScheme() === 'dark' ? dark : light;
}

/** Badge colours: strong text on a soft background, readable in both themes. */
export const RISK_COLORS: Record<RiskLevel | 'unknown', { fg: string; bg: string }> = {
  green: { fg: '#166534', bg: '#DCFCE7' },
  amber: { fg: '#92400E', bg: '#FEF3C7' },
  red: { fg: '#991B1B', bg: '#FEE2E2' },
  unknown: { fg: '#374151', bg: '#E5E7EB' },
};

/** Never "safe": green only means no red flags were found. */
export const RISK_LABELS: Record<RiskLevel | 'unknown', string> = {
  green: 'No red flags',
  amber: 'Caution',
  red: 'High risk',
  unknown: 'Not checked yet',
};
