import { type ComponentRef, type ReactNode, type Ref, createContext, useContext } from 'react';
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
    fontFamily: fonts.ui[weight],
    // The family already carries the weight; a second one makes Android fall back.
    fontWeight: undefined,
    ...(mono || style.fontFamily === 'monospace' ? { fontVariant: ['tabular-nums'] } : {}),
  };
}

/**
 * The default text colour for a surface. Dark trade surfaces wrap their content in
 * `<Ink color={dark.text}>` so text reads light there without restyling every line.
 */
const InkContext = createContext<string>(colors.text);
export function Ink({ color, children }: { color: string; children: ReactNode }) {
  return <InkContext.Provider value={color}>{children}</InkContext.Provider>;
}
export const useInk = () => useContext(InkContext);

/** Text in Sift's type: use instead of React Native's Text everywhere. */
export function Text({ style, mono = false, ...rest }: TextProps & { mono?: boolean }) {
  const ink = useContext(InkContext);
  const flat = StyleSheet.flatten(style) ?? {};
  return <RNText {...rest} style={[{ color: ink }, style, fontStyle(flat, mono)]} />;
}

/** What a ref to `TextInput` holds (`focus()`, `blur()`). */
export type TextInputHandle = ComponentRef<typeof RNTextInput>;

export function TextInput({
  style,
  mono = false,
  ref,
  ...rest
}: TextInputProps & { mono?: boolean; ref?: Ref<TextInputHandle> }) {
  const ink = useContext(InkContext);
  const flat = StyleSheet.flatten(style) ?? {};
  return (
    <RNTextInput
      ref={ref}
      placeholderTextColor={colors.faint}
      {...rest}
      style={[{ color: ink }, style, fontStyle(flat, mono)]}
    />
  );
}
