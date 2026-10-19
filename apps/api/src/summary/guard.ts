// Last line of defence for "never financial advice": reject model output that tells
// people what to do with their money or promises outcomes. The prompt already forbids
// this; a match means the answer is replaced by the rules-based summary.
const ADVICE_PATTERNS: readonly RegExp[] = [
  /\b(you should|we recommend|i recommend|consider)\s+(buy|sell|hold|invest|ape|exit|get in)/i,
  /\b(buy|sell|hold)\s+(now|today|before|while)\b/i,
  /\b(strong|good|great|safe)\s+(buy|investment|bet)\b/i,
  /\b(will|is going to|set to)\s+(moon|pump|10x|100x|skyrocket|explode)\b/i,
  /\bguaranteed\b/i,
  /\b(not a|no) (rug|scam)\b/i,
  /\bthis token is safe\b/i,
];

export function looksLikeAdvice(...texts: readonly string[]): boolean {
  return texts.some((text) => ADVICE_PATTERNS.some((pattern) => pattern.test(text)));
}
