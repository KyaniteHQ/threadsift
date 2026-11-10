import { browser } from "wxt/browser";

const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(["localhost", "127.0.0.1"]);

export const REDDIT_HOSTS = ["https://*.reddit.com/*"];

export const THREAD_PAGES = [
  "https://*.reddit.com/r/*/comments/*",
  "https://*.reddit.com/user/*/comments/*",
  "https://*.reddit.com/u/*/comments/*",
  "https://*.reddit.com/comments/*",
];

export const FILL_SCRIPT_ID = "fill";

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

export function storeOrigin(origin: string): Promise<void> {
  return browser.storage.local.set({ instance: origin });
}

export function storeConfig({ origin, token }: Readonly<Config>): Promise<void> {
  return browser.storage.local.set({ instance: origin, token });
}

export async function restrictStorage(): Promise<void> {
  if ("setAccessLevel" in browser.storage.local) {
    await browser.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  }
}
