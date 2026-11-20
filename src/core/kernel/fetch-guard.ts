import { isRefusedHost, webUrlOf } from "../contract/addresses.ts";
import { decoderFor, isHtmlType } from "../contract/body-text.ts";
import type { FetchFailure } from "../contract/fetch-results.ts";
import { HOP_DEADLINE_MS } from "../contract/request-waits.ts";
import { type Capped, readCapped } from "./capped.ts";
import { report } from "./failure-log.ts";
import { metaRefreshTarget } from "./meta-refresh.ts";
import {
  type Network,
  NetworkFailure,
  type NetworkFailureReason,
  type NetworkResponse,
  type RequestHeaders,
} from "./network.ts";

const MAX_REDIRECTS = 20;
const DEADLINE_REASON = "deadline";
const REDIRECT_STATUSES: ReadonlySet<number> = new Set([301, 302, 303, 307, 308]);
const DEFAULT_BODY_BYTES = 512 * 1024;
const NO_HEADERS: RequestHeaders = {};

type GuardFailure = Extract<
  FetchFailure,
  "timeout" | "refused" | "unsupported" | "redirect-limit" | "network"
>;

export type Failed<Answer = never> =
  | { readonly kind: "failed"; readonly reason: GuardFailure }
  | {
      readonly kind: "failed";
      readonly reason: "status";
      readonly httpStatus: number;
      readonly answer: Answer | null;
    };

export type BodyUse = "skip" | "read" | "follow-refresh";

export interface FetchPolicy<Answer = never> {
  readonly stopAt: (url: string) => boolean;
  readonly body?: (url: string) => BodyUse;
  readonly headers?: (url: string) => RequestHeaders;
  readonly answerStatus?: (
    response: Readonly<NetworkResponse>,
    url: string,
  ) => Promise<Answer | null>;
  readonly htmlMaxBytes?: number;
  readonly dataMaxBytes?: number;
}

export interface Page {
  readonly kind: "page";
  readonly url: string;
  readonly text: string;
  readonly html: boolean;
  readonly cut: boolean;
}

interface Bytes {
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

export type GuardOutcome<Answer = never> = Page | Stopped | Failed<Answer>;

type BytesOutcome<Answer> = Bytes | Stopped | Failed<Answer>;

const NO_BODY: Capped = { bytes: new Uint8Array(0), cut: false };

type Hop<Answer> =
  | { readonly kind: "redirect"; readonly location: string }
  | ({
      readonly kind: "page";
      readonly contentType: string | null;
      readonly html: boolean;
      readonly refresh: boolean;
    } & Capped)
  | Failed<Answer>;

const failed = (reason: GuardFailure): Failed => ({ kind: "failed", reason });

function failureOf(deadlineHit: boolean, reason: NetworkFailureReason | null): GuardFailure {
  return deadlineHit ? "timeout" : (reason ?? "network");
}

async function failedStatus<Answer>(
  response: Readonly<NetworkResponse>,
  url: string,
  policy: Readonly<FetchPolicy<Answer>>,
): Promise<Failed<Answer>> {
  return {
    kind: "failed",
    reason: "status",
    httpStatus: response.status,
    answer: (await policy.answerStatus?.(response, url)) ?? null,
  };
}

async function readBody<Answer>(
  response: Readonly<NetworkResponse>,
  url: string,
  policy: Readonly<FetchPolicy<Answer>>,
): Promise<Hop<Answer>> {
  const html = isHtmlType(response.contentType);
  const use = policy.body?.(url) ?? "read";

  const body =
    use === "skip"
      ? NO_BODY
      : await readCapped(
          response.body,
          (html ? policy.htmlMaxBytes : policy.dataMaxBytes) ?? DEFAULT_BODY_BYTES,
        );

  return {
    kind: "page",
    contentType: response.contentType,
    html,
    refresh: use === "follow-refresh",
    ...body,
  };
}

async function requestHop<Answer>(
  network: Network,
  url: string,
  deadline: AbortSignal,
  policy: Readonly<FetchPolicy<Answer>>,
): Promise<Hop<Answer>> {
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
      policy.headers?.(url) ?? NO_HEADERS,
    );

    if (REDIRECT_STATUSES.has(response.status) && response.location !== null) {
      return { kind: "redirect", location: response.location };
    }

    if (response.status < 200 || response.status > 299) {
      return await failedStatus(response, url, policy);
    }

    return await readBody(response, url, policy);
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

function advance<Answer>(
  network: Network,
  policy: Readonly<FetchPolicy<Answer>>,
  deadline: AbortSignal,
  from: URL,
  location: string,
  redirects: number,
): Promise<BytesOutcome<Answer>> {
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

async function follow<Answer>(
  network: Network,
  policy: Readonly<FetchPolicy<Answer>>,
  deadline: AbortSignal,
  url: URL,
  redirects: number,
): Promise<BytesOutcome<Answer>> {
  const hop = await requestHop(network, url.href, deadline, policy);

  if (hop.kind === "failed") {
    return hop;
  }

  if (hop.kind === "redirect") {
    return advance(network, policy, deadline, url, hop.location, redirects);
  }

  const text = hop.refresh && hop.html ? decoderFor(hop.contentType).decode(hop.bytes) : null;

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

export function guardedFetchBytes<Answer = never>(
  network: Network,
  address: string,
  policy: Readonly<FetchPolicy<Answer>>,
  deadline: AbortSignal,
): Promise<BytesOutcome<Answer>> {
  const first = hopTarget(address);

  return first.kind === "failed"
    ? Promise.resolve(first)
    : follow(network, policy, deadline, first.url, 0);
}

export async function guardedFetch<Answer = never>(
  network: Network,
  address: string,
  policy: Readonly<FetchPolicy<Answer>>,
  deadline: AbortSignal,
): Promise<GuardOutcome<Answer>> {
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

export function loggedFailureOf<Answer>(
  outcome: Exclude<BytesOutcome<Answer>, Bytes>,
  whenStopped: FetchFailure = "redirect-stopped",
): FetchFailure {
  if (outcome.kind === "stopped") {
    return whenStopped;
  }

  if (outcome.reason === "status") {
    report("fetch-status", { httpStatus: outcome.httpStatus });
  }

  return outcome.reason;
}
