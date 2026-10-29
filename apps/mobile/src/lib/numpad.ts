/** The next value after pressing `key`: digits, one decimal point, at most `decimals` places. */
export function pressKey(value: string, key: string, decimals = 9): string {
  if (key === 'del') return value.slice(0, -1);
  if (key === '.') return value.includes('.') ? value : `${value || '0'}.`;
  const [, fraction] = value.split('.');
  if (fraction !== undefined && fraction.length >= decimals) return value;
  if (value === '0') return key;
  return value.length >= 12 ? value : value + key;
}
