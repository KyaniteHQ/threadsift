import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import type { SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";

export type Database = BaseSQLiteDatabase<"async", unknown> & Pick<SqliteRemoteDatabase, "batch">;

export const HOP_DEADLINE_MS = 8000;

export interface NetworkResponse {
  readonly status: number;
  readonly location: string | null;
  readonly contentType: string | null;
  readonly body: AsyncIterable<Uint8Array>;
}

export interface JobQueue {
  readonly enqueue: (jobId: number, delayMs: number) => Promise<void>;
}

export interface Network {
  readonly get: (url: string, signal: AbortSignal) => Promise<NetworkResponse>;
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

export interface Ports {
  readonly db: Database;
  readonly network: Network;
  readonly jobs: JobQueue;
  readonly crypto: Crypto;
  readonly setupCode: string | undefined;
}

export const REQUEST_HEADERS = {
  "user-agent": "Threadsift/1 (+https://github.com/KyaniteHQ/threadsift)",
  accept: "text/html,application/json;q=0.9,*/*;q=0.8",
} as const;
