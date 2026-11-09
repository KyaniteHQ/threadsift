import { browser } from "wxt/browser";
import { z } from "zod";

const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(["localhost", "127.0.0.1"]);

const StoredSchema = z.object({ instance: z.string(), token: z.string().min(1) });

export interface Config {
  readonly origin: string;
  readonly token: string;
}

export function instanceOrigin(address: string): string | null {
  const url = URL.parse(address.trim());

  if (url === null || url.username !== "" || url.password !== "") return null;

  const isLocal = url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname);

  return url.protocol === "https:" || isLocal ? url.origin : null;
}

export function hostPattern(origin: string): string {
  const { protocol, hostname } = new URL(origin);

  return `${protocol}//${hostname}/*`;
}

export async function loadConfig(): Promise<Config | null> {
  const stored = StoredSchema.safeParse(await browser.storage.local.get(["instance", "token"]));
  const origin = stored.success ? instanceOrigin(stored.data.instance) : null;

  return stored.success && origin !== null ? { origin, token: stored.data.token } : null;
}

export function storeConfig({ origin, token }: Readonly<Config>): Promise<void> {
  return browser.storage.local.set({ instance: origin, token });
}

export async function restrictStorage(): Promise<void> {
  if ("setAccessLevel" in browser.storage.local) {
    await browser.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  }
}
