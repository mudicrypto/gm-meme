import { plainTokenName } from './guard';
import type { SummaryInput } from './prompt';

/**
 * A summary assembled from the risk checks, with no AI. Used when no Anthropic key is
 * configured, when Claude is unavailable, and when its answer fails our checks.
 */
export function rulesSummary(input: SummaryInput): { summary: string; redFlags: string[] } {
  // The creator picks the name, so it's only repeated when it can't read as a claim.
  const name =
    plainTokenName(input.token?.name) ?? plainTokenName(input.token?.symbol) ?? 'This token';
  const hour = input.activityLastHour;
  const trading =
    hour.swapCount === 0
      ? `${name} has had no trades recorded by Sift in the last hour.`
      : `${name} had ${hour.swapCount} trade${hour.swapCount === 1 ? '' : 's'} from ${hour.uniqueTraders} wallet${hour.uniqueTraders === 1 ? '' : 's'} in the last hour.`;

  const flagged = input.risk.reasons.filter((r) => r.level !== 'green');
  const red = flagged.filter((r) => r.level === 'red').length;
  const amber = flagged.length - red;
  const checks =
    flagged.length === 0
      ? `Sift's ${input.risk.reasons.length} safety checks found no red flags.`
      : `Sift's safety checks rate it ${input.risk.level}, with ${[
          red > 0 ? count(red, 'serious issue') : '',
          amber > 0 ? count(amber, 'warning') : '',
        ]
          .filter(Boolean)
          .join(' and ')}.`;

  const top = flagged[0];
  const risk = top
    ? `The biggest concern: ${lowerFirst(firstSentence(top.message))}`
    : 'Like most meme coins, its price can still fall sharply.';

  return {
    summary: `${trading} ${checks} ${risk}`,
    redFlags: flagged.map((r) => firstSentence(r.message)),
  };
}

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

/** Keep a three-sentence summary at three sentences when a finding has two. */
function firstSentence(text: string): string {
  const end = text.search(/[.!?](\s|$)/);
  return end === -1 ? text : text.slice(0, end + 1);
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}
