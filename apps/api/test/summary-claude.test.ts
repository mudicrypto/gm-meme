import { describe, expect, it, vi } from 'vitest';
import { createClaudeSummaryModel } from '../src/summary/claude';
import { SYSTEM_PROMPT } from '../src/summary/prompt';

/** A Messages API response, as the API returns it. */
function apiMessage(text: string, stop_reason = 'end_turn') {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5-5',
    content: [
      { type: 'thinking', thinking: '', signature: 'sig' },
      { type: 'text', text },
    ],
    stop_reason,
    stop_details: null,
    stop_sequence: null,
    usage: { input_tokens: 500, output_tokens: 120 },
  };
}

function setup(status: number, body: unknown) {
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
  );
  const model = createClaudeSummaryModel({
    apiKey: 'sk-ant-test',
    model: 'claude-opus-5-5',
    fetch,
  });
  return { fetch, model };
}

const good = JSON.stringify({
  summary:
    'Moon Cat launched an hour ago. The checks found no red flags. Prices can still fall fast.',
  red_flags: [],
});

describe('Claude summary model', () => {
  it('sends a structured-output request with fallbacks and parses the answer', async () => {
    const { fetch, model } = setup(200, apiMessage(good));
    expect(await model.summarize('<token_data>{}</token_data>')).toEqual({
      summary:
        'Moon Cat launched an hour ago. The checks found no red flags. Prices can still fall fast.',
      redFlags: [],
    });

    const [url, init] = fetch.mock.calls[0]!;
    expect(String(url)).toBe('https://api.anthropic.com/v1/messages?beta=true');
    const headers = new Headers(init!.headers);
    expect(headers.get('x-api-key')).toBe('sk-ant-test');
    expect(headers.get('anthropic-beta')).toContain('server-side-fallback-2026-07-01');
    const body = JSON.parse(init!.body as string);
    expect(body).toMatchObject({
      model: 'claude-opus-5-5',
      fallbacks: 'default',
      system: SYSTEM_PROMPT,
      output_config: { effort: 'low', format: { type: 'json_schema' } },
      messages: [{ role: 'user', content: '<token_data>{}</token_data>' }],
    });
    expect(body.output_config.format.schema.required).toEqual(['summary', 'red_flags']);
    expect(body).not.toHaveProperty('thinking'); // always on for this model; not configurable
  });

  it('returns null when every model in the chain refused', async () => {
    const { model } = setup(200, apiMessage('', 'refusal'));
    expect(await model.summarize('x')).toBeNull();
  });

  it('returns null for a truncated answer', async () => {
    const { model } = setup(200, apiMessage('{"summary": "Moon', 'max_tokens'));
    expect(await model.summarize('x')).toBeNull();
  });

  it('returns null for an answer that is not the expected JSON', async () => {
    expect(await setup(200, apiMessage('not json')).model.summarize('x')).toBeNull();
    expect(await setup(200, apiMessage('{"summary": ""}')).model.summarize('x')).toBeNull();
  });

  it('throws on API errors so the service can fall back', async () => {
    const { model } = setup(401, {
      type: 'error',
      error: { type: 'authentication_error', message: 'invalid x-api-key' },
    });
    await expect(model.summarize('x')).rejects.toThrow();
  });
});
