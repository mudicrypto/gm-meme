import type {
  HoldingsResponse,
  RiskScore,
  TokenChartResponse,
  TokenExplanation,
  TokenListResponse,
  TrendingResponse,
} from '@sift/shared';

const DEFAULT_API_URL = 'http://localhost:3000';

/** Join the API base URL and a path, tolerating stray slashes on either side. */
export function apiUrl(path: string, base: string = getApiBaseUrl()): string {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

export function getApiBaseUrl(): string {
  return process.env.EXPO_PUBLIC_API_URL || DEFAULT_API_URL;
}

export class ApiError extends Error {
  override name = 'ApiError';
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function getJson<T>(path: string, fetchFn: typeof fetch = fetch): Promise<T> {
  let res: Response;
  try {
    res = await fetchFn(apiUrl(path), { headers: { accept: 'application/json' } });
  } catch {
    throw new ApiError(0, "Can't reach Sift. Check your connection.");
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new ApiError(res.status, body?.message ?? `Request failed (${res.status}).`);
  }
  return (await res.json()) as T;
}

const enc = encodeURIComponent;

export const api = {
  newTokens: () => getJson<TokenListResponse>('/tokens/new?limit=50'),
  trending: () => getJson<TrendingResponse>('/tokens/trending?limit=50&windowMinutes=60'),
  risk: (mint: string) => getJson<RiskScore>(`/tokens/${enc(mint)}/risk`),
  summary: (mint: string) => getJson<TokenExplanation>(`/tokens/${enc(mint)}/summary`),
  chart: (mint: string, windowMinutes: number) =>
    getJson<TokenChartResponse>(`/tokens/${enc(mint)}/chart?windowMinutes=${windowMinutes}`),
  holdings: (address: string) => getJson<HoldingsResponse>(`/wallets/${enc(address)}/holdings`),
};
