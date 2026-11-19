import type { AiRuntime } from "./ai-runtime.ts";
import type { Crypto } from "./crypto.ts";
import type { Database } from "./database.ts";
import type { LoadedFetcher } from "./fetcher.ts";
import type { FileStore } from "./file-store.ts";
import type { JobQueue } from "./job-queue.ts";
import type { Network, RedditSession } from "./network.ts";
import type { PageReader } from "./page-reader.ts";
import type { Sealer } from "./sealed-secret.ts";
import type { VaultFolder } from "./vault-target.ts";
import type { XFetcher } from "./x-fetcher-port.ts";

export interface Ports {
  readonly db: Database;
  readonly files: FileStore;
  readonly network: Network;
  readonly vaultFolder: VaultFolder | null;
  readonly redditSession: RedditSession;
  readonly pages: PageReader;
  readonly jobs: JobQueue;
  readonly crypto: Crypto;
  readonly secrets: Sealer | null;
  readonly setupCode: string | undefined;
  readonly resetCode: string | undefined;
  readonly publicOrigin: string | null;
  readonly ai: AiRuntime;
  readonly fetchers: readonly LoadedFetcher[];
  readonly xFetcher: XFetcher | null;
}

export type AiPorts = Pick<Ports, "db" | "ai" | "secrets">;

export type SettingsPorts = Pick<Ports, "db" | "ai" | "secrets" | "publicOrigin">;
