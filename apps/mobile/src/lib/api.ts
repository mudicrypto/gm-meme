const DEFAULT_API_URL = 'http://localhost:3000';

/** Join the API base URL and a path, tolerating stray slashes on either side. */
export function apiUrl(path: string, base: string = getApiBaseUrl()): string {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

export function getApiBaseUrl(): string {
  return process.env.EXPO_PUBLIC_API_URL || DEFAULT_API_URL;
}
