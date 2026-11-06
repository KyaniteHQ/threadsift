import { base64url, fromBase64url } from "./encoding.ts";

const KEY_PATTERN = /^[\da-f]{64}$/iu;
const IV_BYTES = 12;

function sealingKey(configured: string | undefined): Promise<CryptoKey | null> {
  if (configured === undefined || !KEY_PATTERN.test(configured)) {
    return Promise.resolve(null);
  }

  const bytes = Uint8Array.from(configured.match(/../gu) ?? [], (pair) =>
    Number.parseInt(pair, 16),
  );

  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function sealedSecrets(configured: string | undefined) {
  const key = await sealingKey(configured);

  if (key === null) return null;

  return {
    seal: async (value: string): Promise<string> => {
      const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));

      const encrypted = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        new TextEncoder().encode(value),
      );

      return `v1.${base64url(iv)}.${base64url(new Uint8Array(encrypted))}`;
    },
    open: async (value: string): Promise<string | null> => {
      const [version, iv, encrypted, extra] = value.split(".");

      if (version !== "v1" || iv === undefined || encrypted === undefined || extra !== undefined)
        return null;

      try {
        const plain = await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: new Uint8Array(fromBase64url(iv)) },
          key,
          new Uint8Array(fromBase64url(encrypted)),
        );

        return new TextDecoder().decode(plain);
      } catch {
        return null;
      }
    },
  } as const;
}

export type Sealer = NonNullable<Awaited<ReturnType<typeof sealedSecrets>>>;
