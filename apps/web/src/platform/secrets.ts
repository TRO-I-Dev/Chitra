/**
 * Secrets — Notion / Confluence tokens encrypted at rest in IndexedDB.
 *
 * Encryption: AES-GCM with a key derived from a user-set passphrase via
 * PBKDF2-SHA256 (200k iters). On first `set`, the user is prompted for a
 * passphrase that's verified against a stored sentinel so subsequent reads
 * can detect a wrong passphrase. The derived key is held in memory for
 * the lifetime of the page.
 *
 * This is a reasonable local-first compromise — weaker than an OS keystore
 * (a stolen passphrase exposes everything), but stronger than plaintext
 * localStorage. Documented in the Settings panel.
 */
import { sharedDb } from "./handleStore.js";

const STORE = "kv";
const SENTINEL_KEY = "secrets:sentinel";
const SENTINEL_PLAINTEXT = "chitra-secret-ok-v1";
const PBKDF_ITERS = 200_000;

export type SecretKey =
  | "notion-token"
  | "confluence-token"
  | "ai-openai-key"
  | "ai-anthropic-key"
  | "ai-ollama-url";

interface Encrypted {
  iv: number[]; // 12 bytes
  data: number[]; // ciphertext+tag
}

let cachedKey: CryptoKey | null = null;
let passphraseProvider: (() => Promise<string | null>) | null = null;

/**
 * Set the function that prompts the user for a passphrase. The renderer
 * wires this up at boot so the platform layer doesn't depend on UI.
 * If no provider is set, secrets fall back to memory-only (lost on reload).
 */
export function setPassphraseProvider(fn: (() => Promise<string | null>) | null): void {
  passphraseProvider = fn;
}

/* ------------------------------------------------------------------ */

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF_ITERS, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encrypt(key: CryptoKey, plain: string): Promise<Encrypted> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plain),
  );
  return { iv: Array.from(iv), data: Array.from(new Uint8Array(ct)) };
}

async function decrypt(key: CryptoKey, blob: Encrypted): Promise<string> {
  const iv = new Uint8Array(blob.iv);
  const data = new Uint8Array(blob.data);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  return new TextDecoder().decode(pt);
}

interface Sentinel {
  salt: number[]; // 16 bytes
  enc: Encrypted; // ciphertext of SENTINEL_PLAINTEXT
}

async function loadSentinel(): Promise<Sentinel | null> {
  const d = await sharedDb.db();
  const v = (await d.get(STORE, SENTINEL_KEY)) as Sentinel | undefined;
  return v ?? null;
}

async function storeSentinel(s: Sentinel): Promise<void> {
  const d = await sharedDb.db();
  await d.put(STORE, s, SENTINEL_KEY);
}

async function ensureKey(): Promise<CryptoKey | null> {
  if (cachedKey) return cachedKey;
  const sentinel = await loadSentinel();

  if (!passphraseProvider) {
    // No UI wired up — caller must explicitly opt into ephemeral mode.
    return null;
  }

  if (sentinel) {
    // Existing user — ask for passphrase and verify.
    while (true) {
      const pass = await passphraseProvider();
      if (!pass) return null;
      try {
        const key = await deriveKey(pass, new Uint8Array(sentinel.salt));
        const plain = await decrypt(key, sentinel.enc);
        if (plain !== SENTINEL_PLAINTEXT) continue;
        cachedKey = key;
        return key;
      } catch {
        // Wrong passphrase, loop and ask again.
      }
    }
  }

  // First-time setup
  const pass = await passphraseProvider();
  if (!pass) return null;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(pass, salt);
  const enc = await encrypt(key, SENTINEL_PLAINTEXT);
  await storeSentinel({ salt: Array.from(salt), enc });
  cachedKey = key;
  return key;
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export async function get(args: { key: SecretKey }): Promise<{ value: string | null }> {
  const sentinel = await loadSentinel();
  if (!sentinel) return { value: null }; // No secrets ever set.
  const key = await ensureKey();
  if (!key) return { value: null };
  const d = await sharedDb.db();
  const blob = (await d.get(STORE, `secret:${args.key}`)) as Encrypted | undefined;
  if (!blob) return { value: null };
  try {
    return { value: await decrypt(key, blob) };
  } catch {
    return { value: null };
  }
}

export async function set(args: { key: SecretKey; value: string }): Promise<{ ok: true }> {
  const key = await ensureKey();
  if (!key) throw new Error("Cannot store secret: passphrase not provided.");
  const blob = await encrypt(key, args.value);
  const d = await sharedDb.db();
  await d.put(STORE, blob, `secret:${args.key}`);
  return { ok: true };
}

export async function del(args: { key: SecretKey }): Promise<{ ok: true }> {
  const d = await sharedDb.db();
  await d.delete(STORE, `secret:${args.key}`);
  return { ok: true };
}

/** Forget the cached derived key (e.g. on "lock" button). */
export function lock(): void {
  cachedKey = null;
}
