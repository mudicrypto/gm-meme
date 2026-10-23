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
  // "Safe" in any claim about the token (but "not safe" / "safe to assume" is fine).
  /(?<!\bnot\s)\b(is|looks|seems|appears|totally|completely|100%|very|pretty)\s+safe\b/i,
  /\bsafe\s+(token|coin|project|investment|bet|play|buy|to (buy|hold|trade|invest|ape))\b/i,
  /\b(legit|audited|risk[- ]free|no risk|low[- ]risk)\b/i,
  /\b(to the moon|ape in|don'?t miss|get in (early|now)|buy the dip)\b/i,
  // A sentence that starts by telling you to trade.
  /(^|[.!?]\s+)(buy|sell|ape|hold|grab)\b/i,
];

/** Words that make a token's own name unfit to repeat in Sift's voice. */
const LOADED_NAME =
  /\b(safe|buy|sell|ape|legit|audit\w*|guarantee\w*|risk\w*|rug\w*|scam\w*|lock\w*|sift)\b/i;

/**
 * The token's name, if it's fit to repeat in a sentence Sift writes: letters, digits and
 * spaces only (no sentences or links), and none of the words a scammer would plant.
 */
export function plainTokenName(name: string | undefined): string | undefined {
  if (!name || !/^[\p{L}\p{N} ]{1,32}$/u.test(name.trim())) return undefined;
  return LOADED_NAME.test(name) ? undefined : name.trim();
}

export function looksLikeAdvice(...texts: readonly string[]): boolean {
  return texts.some((text) => ADVICE_PATTERNS.some((pattern) => pattern.test(text)));
}
