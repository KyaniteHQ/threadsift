import { isRefusedHost } from "./addresses.ts";
import type { FetchFailure } from "./fetch-results.ts";
import { isRedditOrXLink, isShortLink } from "./links.ts";
import { metaRefreshTarget } from "./meta-refresh.ts";
import {
  HOP_DEADLINE_MS,
  type Network,
  NetworkFailure,
  type NetworkFailureReason,
} from "./ports.ts";

const MAX_REDIRECTS = 20;
const MAX_BODY_BYTES = 512 * 1024;
const DEADLINE_REASON = "deadline";
const REDIRECT_STATUSES: ReadonlySet<number> = new Set([301, 302, 303, 307, 308]);
const HTML_TYPE = /^(?:text\/html|application\/xhtml\+xml)\b/iu;
const CHARSET = /;\s*charset\s*=\s*"?(?<label>[^";\s]+)/iu;

type GuardFailure = Exclude<FetchFailure, "no-title" | "unreadable" | "redirect-stopped">;

interface Failed {
  readonly kind: "failed";
  readonly reason: GuardFailure;
}

export type GuardOutcome =
  | { readonly kind: "page"; readonly url: string; readonly text: string }
  | { readonly kind: "stopped"; readonly url: string }
  | Failed;

type Hop =
  | { readonly kind: "redirect"; readonly location: string }
  | { readonly kind: "page"; readonly contentType: string | null; readonly bytes: Uint8Array }
  | Failed;

const failed = (reason: GuardFailure): Failed => ({ kind: "failed", reason });

async function readCapped(body: AsyncIterable<Uint8Array>): Promise<Uint8Array> {
  const bytes = new Uint8Array(MAX_BODY_BYTES);
  let size = 0;

  for await (const chunk of body) {
    const taken = chunk.subarray(0, MAX_BODY_BYTES - size);
    bytes.set(taken, size);
    size += taken.length;

    if (size === MAX_BODY_BYTES) {
      break;
    }
  }

  return bytes.subarray(0, size);
}

function failureOf(deadlineHit: boolean, reason: NetworkFailureReason | null): GuardFailure {
  return deadlineHit ? "timeout" : (reason ?? "network");
}

async function requestHop(network: Network, url: string): Promise<Hop> {
  const controller = new AbortController();

  const timer = setTimeout(() => {
    controller.abort(DEADLINE_REASON);
  }, HOP_DEADLINE_MS);

  try {
    const response = await network.get(url, controller.signal);

    if (REDIRECT_STATUSES.has(response.status) && response.location !== null) {
      return { kind: "redirect", location: response.location };
    }

    if (response.status < 200 || response.status > 299) {
      return failed("status");
    }

    return {
      kind: "page",
      contentType: response.contentType,
      bytes: await readCapped(response.body),
    };
  } catch (error) {
    const deadlineHit = controller.signal.reason === DEADLINE_REASON;

    return failed(failureOf(deadlineHit, error instanceof NetworkFailure ? error.reason : null));
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

function decoderFor(contentType: string | null): TextDecoder {
  const label = CHARSET.exec(contentType ?? "")?.groups?.["label"] ?? "utf-8";

  try {
    return new TextDecoder(label);
  } catch {
    return new TextDecoder("utf-8");
  }
}

type Target = { readonly kind: "target"; readonly url: URL } | Failed;

function hopTarget(address: string, base?: string): Target {
  const url = URL.canParse(address, base) ? new URL(address, base) : null;

  if (url === null || (url.protocol !== "http:" && url.protocol !== "https:")) {
    return failed("unsupported");
  }

  url.username = "";
  url.password = "";

  return isRefusedHost(url.hostname) ? failed("refused") : { kind: "target", url };
}

function advance(
  network: Network,
  from: URL,
  location: string,
  redirects: number,
): Promise<GuardOutcome> {
  const next = hopTarget(location, from.href);

  if (next.kind === "failed") {
    return Promise.resolve(next);
  }

  if (redirects === MAX_REDIRECTS) {
    return Promise.resolve(failed("redirect-limit"));
  }

  return isRedditOrXLink(next.url.href)
    ? Promise.resolve({ kind: "stopped", url: next.url.href })
    : follow(network, next.url, redirects + 1);
}

async function follow(network: Network, url: URL, redirects: number): Promise<GuardOutcome> {
  const hop = await requestHop(network, url.href);

  if (hop.kind === "failed") {
    return hop;
  }

  if (hop.kind === "redirect") {
    return advance(network, url, hop.location, redirects);
  }

  const text = decoderFor(hop.contentType).decode(hop.bytes);

  const refreshTo =
    isShortLink(url.href) && HTML_TYPE.test(hop.contentType ?? "")
      ? metaRefreshTarget(text, url.href)
      : null;

  return refreshTo === null
    ? { kind: "page", url: url.href, text }
    : advance(network, url, refreshTo, redirects);
}

export function guardedFetch(network: Network, address: string): Promise<GuardOutcome> {
  const first = hopTarget(address);

  return first.kind === "failed" ? Promise.resolve(first) : follow(network, first.url, 0);
}
