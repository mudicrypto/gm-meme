import {
  Text as RNText,
  TextInput as RNTextInput,
  StyleSheet,
  type TextInputProps,
  type TextProps,
  type TextStyle,
} from 'react-native';
import { colors, fonts } from '../lib/theme';

type Weight = 400 | 500 | 600 | 700 | 800;

function weightOf(style: TextStyle): Weight {
  const w = style.fontWeight;
  const n = w === 'bold' ? 700 : w === 'normal' || w === undefined ? 400 : Number(w);
  return n >= 800 ? 800 : n >= 700 ? 700 : n >= 600 ? 600 : n >= 500 ? 500 : 400;
}

/**
 * Inter at the style's weight; `mono` (numbers, prices, addresses) adds tabular figures so
 * columns of numbers line up. Native platforms need one family per weight.
 */
function fontStyle(style: TextStyle, mono: boolean): TextStyle {
  const weight = weightOf(style);
  return {
    // The terminal look tops out at bold: 800 reads as 700.
    fontFamily: fonts.ui[weight === 800 ? 700 : weight],
    // The family already carries the weight; a second one makes Android fall back.
    fontWeight: undefined,
    ...(mono || style.fontFamily === 'monospace' ? { fontVariant: ['tabular-nums'] } : {}),
  };
}

/** Text in Sift's type: use instead of React Native's Text everywhere. */
export function Text({ style, mono = false, ...rest }: TextProps & { mono?: boolean }) {
  const flat = StyleSheet.flatten(style) ?? {};
  return <RNText {...rest} style={[{ color: colors.text }, style, fontStyle(flat, mono)]} />;
}

export function TextInput({ style, mono = false, ...rest }: TextInputProps & { mono?: boolean }) {
  const flat = StyleSheet.flatten(style) ?? {};
  return (
    <RNTextInput
      placeholderTextColor={colors.faint}
      {...rest}
      style={[{ color: colors.text }, style, fontStyle(flat, mono)]}
    />
  );
}
