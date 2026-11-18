import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import type { SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";

import type {
  AiExecution,
  AiTaskRequest,
  CliAiConnection,
  CliSelection,
  CliProvider,
  CliRecommendation,
  Provider,
} from "./ai-contract.ts";
import type { ArticleReading } from "./article.ts";
import type { LoadedFetcher } from "./fetcher.ts";
import type { OpenRouterExchange } from "./openrouter-contract.ts";
import type { Sealer } from "./sealed-secret.ts";
import type { SuppliedPage } from "./supplied-page.ts";
import type { VaultTargets } from "./vault-target.ts";
import type { XFetcher } from "./x-fetcher.ts";

export type Database = BaseSQLiteDatabase<"async", unknown> & Pick<SqliteRemoteDatabase, "batch">;

export interface RateLimitHeaders {
  readonly retryAfter: string | null;
  readonly remaining: string | null;
  readonly reset: string | null;
}

export function rateLimitHeadersOf(header: (name: string) => string | null): RateLimitHeaders {
  return {
    retryAfter: header("retry-after"),
    remaining: header("x-ratelimit-remaining"),
    reset: header("x-ratelimit-reset"),
  };
}

export interface NetworkResponse {
  readonly status: number;
  readonly location: string | null;
  readonly contentType: string | null;
  readonly rateLimit: RateLimitHeaders;
  readonly body: AsyncIterable<Uint8Array>;
}

export interface JobQueue {
  readonly enqueue: (jobIds: readonly number[], delayMs: number) => Promise<void>;
}

export interface FilePage {
  readonly keys: readonly string[];
  readonly cursor: string | null;
}

export interface FileStore {
  readonly put: (key: string, bytes: Uint8Array) => Promise<void>;
  readonly get: (key: string) => Promise<ReadableStream<Uint8Array> | null>;
  readonly delete: (keys: readonly string[]) => Promise<void>;
  readonly list: (prefix: string, cursor: string | null, limit: number) => Promise<FilePage>;
}

export type RequestHeaders = Readonly<Record<string, string>>;

export interface Network {
  readonly get: (
    url: string,
    signal: AbortSignal,
    headers: RequestHeaders,
  ) => Promise<NetworkResponse>;
  readonly post: (
    url: string,
    body: string,
    signal: AbortSignal,
    headers: RequestHeaders,
  ) => Promise<NetworkResponse>;
}

export interface RedditSession {
  readonly get: (path: string, cookie: string, signal: AbortSignal) => Promise<NetworkResponse>;
}

export interface PageReader {
  readonly maxHtmlBytes: number;
  readonly title: (html: string, deadline: AbortSignal) => Promise<string>;
  readonly article: (html: string, url: string, deadline: AbortSignal) => Promise<ArticleReading>;
  readonly page: (page: SuppliedPage, deadline: AbortSignal) => Promise<ArticleReading>;
}

export type NetworkFailureReason = "refused" | "timeout";

export class NetworkFailure extends Error {
  readonly reason: NetworkFailureReason;

  constructor(reason: NetworkFailureReason, message: string) {
    super(message);
    this.reason = reason;
  }
}

export interface ScryptCost {
  readonly N: number;
  readonly r: number;
  readonly p: number;
}

export interface Crypto {
  readonly randomBytes: (length: number) => Uint8Array;
  readonly sha256: (value: string) => Uint8Array;
  readonly scrypt: (password: string, salt: Uint8Array, cost: ScryptCost) => Promise<Uint8Array>;
  readonly equal: (left: Uint8Array, right: Uint8Array) => boolean;
}

export interface AiRuntime {
  readonly providers: readonly Provider[];
  readonly recommendations: Readonly<Partial<Record<CliProvider, CliRecommendation>>>;
  readonly publicOnly: boolean;
  readonly allowsUrl: (url: string) => boolean;
  readonly resolveCli: (config: Readonly<CliAiConnection>) => CliSelection;
  readonly signedIn: () => Promise<readonly CliProvider[]>;
  readonly run: <Result>(
    task: AiTaskRequest<Result>,
    signal: AbortSignal,
  ) => Promise<AiExecution<Result>>;
  readonly exchangeOpenRouterCode: (
    input: Readonly<{ code: string; verifier: string }>,
    signal: AbortSignal,
  ) => Promise<OpenRouterExchange>;
  readonly awaitOpenRouterActivation: (key: string) => Promise<boolean>;
}

export interface Ports {
  readonly db: Database;
  readonly files: FileStore;
  readonly network: Network;
  readonly vaultTargets: VaultTargets;
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

export const REQUEST_HEADERS = {
  "user-agent": "Threadsift/1 (+https://github.com/KyaniteHQ/threadsift)",
  accept: "text/html,application/json;q=0.9,*/*;q=0.8",
} as const;

export type AiPorts = Pick<Ports, "db" | "ai" | "secrets">;

export type SettingsPorts = Pick<Ports, "db" | "ai" | "secrets" | "publicOrigin">;
