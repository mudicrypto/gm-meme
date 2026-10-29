import { createPrivateKey, sign } from 'node:crypto';
import {
  ASSOCIATED_TOKEN_PROGRAM,
  COMPUTE_BUDGET_PROGRAM,
  PUMP_PROGRAM,
  TOKEN_2022_PROGRAM,
  TOKEN_PROGRAM,
} from '@sift/shared';
import { z } from 'zod';

/**
 * Where Sift wallets' keys live: a signing provider (Privy). Sift asks it to create wallets
 * and sign; the provider enforces a policy on every signature, and keys never leave it,
 * except encrypted straight to the owner's phone on export.
 */
export interface WalletSigner {
  createWallet(opts: { allowedRecipients: string[] }): Promise<{
    providerId: string;
    address: string;
  }>;
  /** Replace the SOL recipients the provider's policy allows (fee wallet, saved address). */
  setAllowedRecipients(providerId: string, recipients: string[]): Promise<void>;
  /** Sign a base64 transaction; returns the signed transaction, base64. */
  signTransaction(providerId: string, transaction: string): Promise<string>;
  /** The private key, HPKE-encrypted to the phone's one-time public key. */
  exportKey(
    providerId: string,
    recipientPublicKey: string,
  ): Promise<{ ciphertext: string; encapsulatedKey: string }>;
}

export class SignerError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'SignerError';
  }
}

/** Programs a Sift wallet may call besides System (whose transfers are limited separately). */
export const SIFT_WALLET_PROGRAMS = [
  COMPUTE_BUDGET_PROGRAM,
  PUMP_PROGRAM,
  ASSOCIATED_TOKEN_PROGRAM,
  TOKEN_PROGRAM,
  TOKEN_2022_PROGRAM,
];

/**
 * The provider-side policy for one Sift wallet. Anything not allowed is refused by the
 * provider, whatever Sift's server asks: only the swap programs, and plain SOL transfers
 * only to the fee wallet and the owner's saved withdrawal address, up to a cap.
 */
export function siftWalletPolicy(opts: { recipients: string[]; maxTransferLamports: number }) {
  return {
    version: '1.0',
    name: 'Sift wallet',
    chain_type: 'solana',
    rules: [
      {
        name: 'Swap programs only',
        method: 'signTransaction',
        conditions: [
          {
            field_source: 'solana_program_instruction',
            field: 'programId',
            operator: 'in',
            value: SIFT_WALLET_PROGRAMS,
          },
        ],
        action: 'ALLOW',
      },
      {
        name: 'SOL transfers to the fee wallet or the saved address, capped',
        method: 'signTransaction',
        conditions: [
          {
            field_source: 'solana_system_program_instruction',
            field: 'Transfer.to',
            operator: 'in',
            value: opts.recipients,
          },
          {
            field_source: 'solana_system_program_instruction',
            field: 'Transfer.lamports',
            operator: 'lte',
            value: String(opts.maxTransferLamports),
          },
        ],
        action: 'ALLOW',
      },
    ],
  };
}

/** JSON canonicalization (RFC 8785) for the request bodies Sift sends: no floats. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

const walletSchema = z.object({ id: z.string().min(1), address: z.string().min(32).max(44) });
const walletPoliciesSchema = z.object({ policy_ids: z.array(z.string()) });
const policySchema = z.object({ id: z.string().min(1) });
const signedSchema = z.object({ data: z.object({ signed_transaction: z.string().min(1) }) });
const exportSchema = z.object({
  ciphertext: z.string().min(1),
  encapsulated_key: z.string().min(1),
});

export interface PrivySignerOptions {
  appId: string;
  appSecret: string;
  /** The authorization key that owns Sift wallets ("wallet-auth:…", PKCS#8 base64). */
  authorizationKey: string;
  /** The key quorum (or key) id that owns the wallets and their policies. */
  ownerId: string;
  /** The SOL transfer cap written into each wallet's policy. */
  maxTransferLamports: number;
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

/** WalletSigner on Privy's REST API, with every request signed by Sift's owner key. */
export function createPrivySigner(opts: PrivySignerOptions): WalletSigner {
  const base = opts.baseUrl ?? 'https://api.privy.io';
  const fetchFn = opts.fetchFn ?? fetch;
  const key = createPrivateKey({
    key: `-----BEGIN PRIVATE KEY-----\n${opts.authorizationKey.replace(/^wallet-auth:/, '')}\n-----END PRIVATE KEY-----`,
    format: 'pem',
  });

  async function request<T>(
    method: 'GET' | 'POST' | 'PATCH',
    path: string,
    schema: z.ZodType<T>,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const url = `${base}${path}`;
    const headers: Record<string, string> = {
      authorization: `Basic ${Buffer.from(`${opts.appId}:${opts.appSecret}`).toString('base64')}`,
      'privy-app-id': opts.appId,
      'content-type': 'application/json',
    };
    if (method !== 'GET') {
      const payload = canonicalJson({
        version: 1,
        method,
        url,
        body,
        headers: { 'privy-app-id': opts.appId },
      });
      headers['privy-authorization-signature'] = sign('sha256', Buffer.from(payload), key).toString(
        'base64',
      );
    }
    const res = await fetchFn(url, {
      method,
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    // Never pass the provider's error text on: it can echo request details.
    if (!res.ok) throw new SignerError(`signing provider refused (${res.status})`, res.status);
    const parsed = schema.safeParse(await res.json());
    if (!parsed.success) throw new SignerError('unexpected signing provider response');
    return parsed.data;
  }

  const policyBody = (recipients: string[]) =>
    siftWalletPolicy({ recipients, maxTransferLamports: opts.maxTransferLamports });

  return {
    async createWallet({ allowedRecipients }) {
      const policy = await request('POST', '/v1/policies', policySchema, {
        ...policyBody(allowedRecipients),
        owner_id: opts.ownerId,
      });
      const wallet = await request('POST', '/v1/wallets', walletSchema, {
        chain_type: 'solana',
        owner_id: opts.ownerId,
        policy_ids: [policy.id],
      });
      return { providerId: wallet.id, address: wallet.address };
    },

    async setAllowedRecipients(providerId, recipients) {
      const wallet = await request('GET', `/v1/wallets/${providerId}`, walletPoliciesSchema);
      const policyId = wallet.policy_ids[0];
      if (!policyId) throw new SignerError('wallet has no policy');
      const { rules } = policyBody(recipients);
      await request('PATCH', `/v1/policies/${policyId}`, policySchema, { rules });
    },

    async signTransaction(providerId, transaction) {
      const result = await request('POST', `/v1/wallets/${providerId}/rpc`, signedSchema, {
        method: 'signTransaction',
        params: { transaction, encoding: 'base64' },
      });
      return result.data.signed_transaction;
    },

    async exportKey(providerId, recipientPublicKey) {
      const result = await request('POST', `/v1/wallets/${providerId}/export`, exportSchema, {
        encryption_type: 'HPKE',
        recipient_public_key: recipientPublicKey,
      });
      return { ciphertext: result.ciphertext, encapsulatedKey: result.encapsulated_key };
    },
  };
}
