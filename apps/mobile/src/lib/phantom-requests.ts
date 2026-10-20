import { PhantomError } from './phantom-protocol';

export type RedirectParams = Record<string, string | undefined>;

/**
 * Pairs each request we send to Phantom with the redirect that answers it. One request at a
 * time: Phantom itself refuses a second while one is open.
 */
export function createRequestRegistry() {
  let pending: {
    action: string;
    resolve: (params: RedirectParams) => void;
    reject: (error: Error) => void;
  } | null = null;

  const cancel = (message = 'The Phantom request was cancelled.') => {
    pending?.reject(new PhantomError('CANCELLED', message));
    pending = null;
  };

  return {
    /** Wait for Phantom's redirect for `action`. Replaces (cancels) any request still open. */
    start(action: string): Promise<RedirectParams> {
      cancel();
      return new Promise((resolve, reject) => {
        pending = { action, resolve, reject };
      });
    },
    /** Hand over a redirect. False if nothing was waiting for it (e.g. the app restarted). */
    deliver(action: string, params: RedirectParams): boolean {
      if (!pending || pending.action !== action) return false;
      pending.resolve(params);
      pending = null;
      return true;
    },
    cancel,
    get waiting() {
      return pending !== null;
    },
  };
}
