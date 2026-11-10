import { isRefusedHost, webUrlOf } from "./addresses.ts";
import { decoderFor, isHtmlType } from "./body-text.ts";
import { type Capped, readCapped } from "./capped.ts";
import { failedAnswer } from "./failed-answer.ts";
import type { FetchFailure } from "./fetch-results.ts";
import type { RateLimit } from "./github-rate-limit.ts";
import { metaRefreshTarget } from "./meta-refresh.ts";
import {
  HOP_DEADLINE_MS,
  type Network,
  NetworkFailure,
  type NetworkFailureReason,
  type RequestHeaders,
} from "./ports.ts";

const MAX_REDIRECTS = 20;
const DEADLINE_REASON = "deadline";
const REDIRECT_STATUSES: ReadonlySet<number> = new Set([301, 302, 303, 307, 308]);
export const SMALL_BODY_BYTES = 512 * 1024;

export const NO_HEADERS: RequestHeaders = {};

type GuardFailure = Exclude<
  FetchFailure,
  "no-title" | "unreadable" | "redirect-stopped" | "github-token"
>;

export interface RateLimited {
  readonly kind: "failed";
  readonly reason: "rate-limited";
  readonly httpStatus: number;
  readonly limit: RateLimit;
}

export type Failed =
  | { readonly kind: "failed"; readonly reason: Exclude<GuardFailure, "status"> }
  | {
      readonly kind: "failed";
      readonly reason: "status";
      readonly httpStatus: number;
      readonly reset: string | null;
    }
  | RateLimited;

export interface FetchPolicy {
  readonly stopAt: (url: string) => boolean;
  readonly followMetaRefresh: (url: string) => boolean;
  readonly readsBody: (url: string) => boolean;
  readonly headers: (url: string) => RequestHeaders;
  readonly readsLimits: (url: string) => boolean;
  readonly htmlMaxBytes: number;
  readonly dataMaxBytes: number;
}

export interface Page {
  readonly kind: "page";
  readonly url: string;
  readonly text: string;
  readonly html: boolean;
  readonly cut: boolean;
}

export interface Bytes {
  readonly kind: "bytes";
  readonly url: string;
  readonly contentType: string | null;
  readonly text: string | null;
  readonly bytes: Uint8Array;
  readonly cut: boolean;
}

interface Stopped {
  readonly kind: "stopped";
  readonly url: string;
}

export type GuardOutcome = Page | Stopped | Failed;

export type BytesOutcome = Bytes | Stopped | Failed;

const NO_BODY: Capped = { bytes: new Uint8Array(0), cut: false };

type Hop =
  | { readonly kind: "redirect"; readonly location: string }
  | ({
      readonly kind: "page";
      readonly contentType: string | null;
      readonly html: boolean;
    } & Capped)
  | Failed;

const failed = (reason: Exclude<GuardFailure, "status">): Failed => ({ kind: "failed", reason });

function failureOf(
  deadlineHit: boolean,
  reason: NetworkFailureReason | null,
): Exclude<GuardFailure, "status"> {
  return deadlineHit ? "timeout" : (reason ?? "network");
}

async function requestHop(
  network: Network,
  url: string,
  deadline: AbortSignal,
  policy: Readonly<FetchPolicy>,
): Promise<Hop> {
  if (deadline.aborted) {
    return failed("timeout");
  }

  const controller = new AbortController();

  const timer = setTimeout(() => {
    controller.abort(DEADLINE_REASON);
  }, HOP_DEADLINE_MS);

  try {
    const response = await network.get(
      url,
      AbortSignal.any([controller.signal, deadline]),
      policy.headers(url),
    );

    if (REDIRECT_STATUSES.has(response.status) && response.location !== null) {
      return { kind: "redirect", location: response.location };
    }

    if (response.status < 200 || response.status > 299) {
      return await failedAnswer(response, url, policy);
    }

    const html = isHtmlType(response.contentType);

    const body = policy.readsBody(url)
      ? await readCapped(response.body, html ? policy.htmlMaxBytes : policy.dataMaxBytes)
      : NO_BODY;

    return { kind: "page", contentType: response.contentType, html, ...body };
  } catch (error) {
    const deadlineHit = controller.signal.reason === DEADLINE_REASON || deadline.aborted;

    return failed(failureOf(deadlineHit, error instanceof NetworkFailure ? error.reason : null));
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

type Target = { readonly kind: "target"; readonly url: URL } | Failed;

function hopTarget(address: string, base?: string): Target {
  const url = webUrlOf(address, base);

  if (url === null) {
    return failed("unsupported");
  }

  return isRefusedHost(url.hostname) ? failed("refused") : { kind: "target", url };
}

function advance(
  network: Network,
  policy: Readonly<FetchPolicy>,
  deadline: AbortSignal,
  from: URL,
  location: string,
  redirects: number,
): Promise<BytesOutcome> {
  const next = hopTarget(location, from.href);

  if (next.kind === "failed") {
    return Promise.resolve(next);
  }

  if (redirects === MAX_REDIRECTS) {
    return Promise.resolve(failed("redirect-limit"));
  }

  return policy.stopAt(next.url.href)
    ? Promise.resolve({ kind: "stopped", url: next.url.href })
    : follow(network, policy, deadline, next.url, redirects + 1);
}

async function follow(
  network: Network,
  policy: Readonly<FetchPolicy>,
  deadline: AbortSignal,
  url: URL,
  redirects: number,
): Promise<BytesOutcome> {
  const hop = await requestHop(network, url.href, deadline, policy);

  if (hop.kind === "failed") {
    return hop;
  }

  if (hop.kind === "redirect") {
    return advance(network, policy, deadline, url, hop.location, redirects);
  }

  const text =
    policy.followMetaRefresh(url.href) && hop.html
      ? decoderFor(hop.contentType).decode(hop.bytes)
      : null;

  const refreshTo = text === null ? null : metaRefreshTarget(text, url.href);

  return refreshTo === null
    ? {
        kind: "bytes",
        url: url.href,
        contentType: hop.contentType,
        text,
        bytes: hop.bytes,
        cut: hop.cut,
      }
    : advance(network, policy, deadline, url, refreshTo, redirects);
}

export function guardedFetchBytes(
  network: Network,
  address: string,
  policy: Readonly<FetchPolicy>,
  deadline: AbortSignal,
): Promise<BytesOutcome> {
  const first = hopTarget(address);

  return first.kind === "failed"
    ? Promise.resolve(first)
    : follow(network, policy, deadline, first.url, 0);
}

export async function guardedFetch(
  network: Network,
  address: string,
  policy: Readonly<FetchPolicy>,
  deadline: AbortSignal,
): Promise<GuardOutcome> {
  const outcome = await guardedFetchBytes(network, address, policy, deadline);

  return outcome.kind === "bytes"
    ? {
        kind: "page",
        url: outcome.url,
        text: outcome.text ?? decoderFor(outcome.contentType).decode(outcome.bytes),
        html: isHtmlType(outcome.contentType),
        cut: outcome.cut,
      }
    : outcome;
}

export function loggedFailureOf(
  outcome: Exclude<BytesOutcome, Bytes>,
  whenStopped: FetchFailure = "redirect-stopped",
): FetchFailure {
  if (outcome.kind === "stopped") {
    return whenStopped;
  }

  if (outcome.reason === "status" || outcome.reason === "rate-limited") {
    console.warn(JSON.stringify({ event: "fetch-status", httpStatus: outcome.httpStatus }));
  }

  return outcome.reason === "rate-limited" ? "status" : outcome.reason;
}
