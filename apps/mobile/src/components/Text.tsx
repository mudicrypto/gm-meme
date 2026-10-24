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
 * The font for a style: Manrope by weight, or JetBrains Mono for numbers, prices and
 * addresses. Native platforms need one font family per weight, so the weight picks it.
 */
function fontStyle(style: TextStyle, mono: boolean): TextStyle {
  const weight = weightOf(style);
  const useMono = mono || style.fontFamily === 'monospace';
  return {
    fontFamily: useMono ? fonts.mono[weight >= 600 ? 600 : 500] : fonts.ui[weight],
    // The family already carries the weight; a second one makes Android fall back.
    fontWeight: undefined,
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
