import { SIFT_FEE_WALLET } from '@sift/shared';
import type {
  AlertDirection,
  AlertsResponse,
  AuthChallenge,
  AuthSession,
  FeedResponse,
  MeResponse,
  MyProfile,
  PriceAlert,
  ProfileResponse,
  ProfileUpdate,
  PublicProfile,
  SolanaCluster,
  WatchlistResponse,
  TradeQuote,
  TradeQuoteRequest,
  TradeStatusResponse,
  TradeSubmitResponse,
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
  return request<T>(path, { headers: { accept: 'application/json' } }, fetchFn);
}

export async function postJson<T>(
  path: string,
  body: unknown,
  fetchFn: typeof fetch = fetch,
): Promise<T> {
  return request<T>(
    path,
    {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
    fetchFn,
  );
}

/** Release builds must talk to Sift over https: plain http can be read and changed in transit. */
export function insecureApiUrl(base: string, dev: boolean): boolean {
  return !dev && !base.startsWith('https://');
}

// React Native always defines __DEV__ (false in release builds); tests don't.
const isDevBuild = typeof __DEV__ === 'undefined' || __DEV__;

async function request<T>(path: string, init: RequestInit, fetchFn: typeof fetch): Promise<T> {
  if (insecureApiUrl(getApiBaseUrl(), isDevBuild)) {
    throw new ApiError(0, 'This build of Sift points at an insecure server address.');
  }
  let res: Response;
  try {
    res = await fetchFn(apiUrl(path), init);
  } catch {
    throw new ApiError(0, "Can't reach Sift. Check your connection.");
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new ApiError(res.status, body?.message ?? `Request failed (${res.status}).`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** A request as the signed-in user (bearer token from wallet sign-in). */
export function authed<T>(
  token: string | null,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
  fetchFn: typeof fetch = fetch,
): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  return request<T>(
    path,
    { method, headers, body: body === undefined ? undefined : JSON.stringify(body) },
    fetchFn,
  );
}

const enc = encodeURIComponent;

/** Profiles, follows, the friends feed, watchlist and price alerts. */
export const socialApi = {
  challenge: (wallet: string) => postJson<AuthChallenge>('/auth/challenge', { wallet }),
  signIn: (wallet: string, nonce: string, signature: string) =>
    postJson<AuthSession>('/auth/session', { wallet, nonce, signature }),
  signOut: (token: string) => authed<void>(token, 'DELETE', '/auth/session'),
  me: (token: string) => authed<MeResponse>(token, 'GET', '/me'),
  saveProfile: (token: string, update: ProfileUpdate) =>
    authed<{ profile: MyProfile }>(token, 'PUT', '/me/profile', update),
  search: (token: string | null, q: string) =>
    authed<{ profiles: PublicProfile[] }>(token, 'GET', `/profiles?q=${enc(q)}`),
  profile: (token: string | null, handle: string) =>
    authed<ProfileResponse>(token, 'GET', `/profiles/${enc(handle)}`),
  follow: (token: string, handle: string) => authed<void>(token, 'PUT', `/follows/${enc(handle)}`),
  unfollow: (token: string, handle: string) =>
    authed<void>(token, 'DELETE', `/follows/${enc(handle)}`),
  feed: (token: string) => authed<FeedResponse>(token, 'GET', '/feed'),
  watchlist: (token: string) => authed<WatchlistResponse>(token, 'GET', '/me/watchlist'),
  watch: (token: string, mint: string) => authed<void>(token, 'PUT', `/me/watchlist/${enc(mint)}`),
  unwatch: (token: string, mint: string) =>
    authed<void>(token, 'DELETE', `/me/watchlist/${enc(mint)}`),
  alerts: (token: string) => authed<AlertsResponse>(token, 'GET', '/me/alerts'),
  createAlert: (
    token: string,
    alert: { mint: string; direction: AlertDirection; priceSol: number },
  ) => authed<{ alert: PriceAlert }>(token, 'POST', '/me/alerts', alert),
  deleteAlert: (token: string, id: string) =>
    authed<void>(token, 'DELETE', `/me/alerts/${enc(id)}`),
  savePushToken: (token: string, pushToken: string) =>
    authed<void>(token, 'PUT', '/me/push-token', { token: pushToken }),
  deletePushToken: (token: string, pushToken: string) =>
    authed<void>(token, 'DELETE', '/me/push-token', { token: pushToken }),
};

export const api = {
  newTokens: () => getJson<TokenListResponse>('/tokens/new?limit=50'),
  trending: () => getJson<TrendingResponse>('/tokens/trending?limit=50&windowMinutes=60'),
  risk: (mint: string) => getJson<RiskScore>(`/tokens/${enc(mint)}/risk`),
  summary: (mint: string) => getJson<TokenExplanation>(`/tokens/${enc(mint)}/summary`),
  chart: (mint: string, windowMinutes: number) =>
    getJson<TokenChartResponse>(`/tokens/${enc(mint)}/chart?windowMinutes=${windowMinutes}`),
  holdings: (address: string) => getJson<HoldingsResponse>(`/wallets/${enc(address)}/holdings`),
  config: () =>
    getJson<{
      cluster: SolanaCluster;
      trading: { enabled: boolean; platformFeeBps: number; feeWallet: string | null };
    }>('/config'),
  quote: (request: TradeQuoteRequest) => postJson<TradeQuote>('/trades/quote', request),
  submit: (quoteId: string, transaction: string) =>
    postJson<TradeSubmitResponse>('/trades/submit', { quoteId, transaction }),
  tradeStatus: (signature: string) => getJson<TradeStatusResponse>(`/trades/${enc(signature)}`),
  airdrop: (address: string) =>
    postJson<{ signature: string }>(`/wallets/${enc(address)}/airdrop`, {}),
};

/**
 * The platform fee wallet, built into the app at build time. The app checks every trade
 * against this, never against an address the API sends, so a compromised API can't
 * redirect fees.
 */
// Unset: Sift's fee wallet. Set to empty: a build that accepts no fee at all.
const configuredFeeWallet = process.env.EXPO_PUBLIC_FEE_WALLET;
export const FEE_WALLET: string | null =
  configuredFeeWallet === undefined ? SIFT_FEE_WALLET : configuredFeeWallet || null;
