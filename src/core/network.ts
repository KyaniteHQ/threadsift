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

export type NetworkFailureReason = "refused" | "timeout";

export class NetworkFailure extends Error {
  readonly reason: NetworkFailureReason;

  constructor(reason: NetworkFailureReason, message: string) {
    super(message);
    this.reason = reason;
  }
}

export const REQUEST_HEADERS = {
  "user-agent": "Threadsift/1 (+https://github.com/KyaniteHQ/threadsift)",
  accept: "text/html,application/json;q=0.9,*/*;q=0.8",
} as const;
