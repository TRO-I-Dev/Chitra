/**
 * Thin wrapper around `keytar` so the rest of main never touches the native
 * module directly. Falls back to an in-memory map if keytar fails to load
 * (e.g. on a CI box without libsecret) so the app stays usable.
 */
const SERVICE = "Chitra";

type KeytarLike = {
  getPassword: (service: string, account: string) => Promise<string | null>;
  setPassword: (service: string, account: string, password: string) => Promise<void>;
  deletePassword: (service: string, account: string) => Promise<boolean>;
};

let backend: KeytarLike | null = null;
const memory = new Map<string, string>();

async function load(): Promise<KeytarLike> {
  if (backend) return backend;
  try {
    backend = (await import("keytar")) as unknown as KeytarLike;
    return backend;
  } catch (err) {
    console.warn("[secrets] keytar unavailable, falling back to in-memory store:", err);
    backend = {
      async getPassword(_s, account) {
        return memory.get(account) ?? null;
      },
      async setPassword(_s, account, value) {
        memory.set(account, value);
      },
      async deletePassword(_s, account) {
        return memory.delete(account);
      },
    };
    return backend;
  }
}

export async function getSecret(account: string): Promise<string | null> {
  const k = await load();
  return k.getPassword(SERVICE, account);
}

export async function setSecret(account: string, value: string): Promise<void> {
  const k = await load();
  await k.setPassword(SERVICE, account, value);
}

export async function deleteSecret(account: string): Promise<void> {
  const k = await load();
  await k.deletePassword(SERVICE, account);
}
