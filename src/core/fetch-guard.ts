import { isRefusedHost, resolveUrl } from "./addresses.ts";
import type { FetchFailure } from "./fetch-results.ts";
import { metaRefreshTarget } from "./meta-refresh.ts";
import {
  HOP_DEADLINE_MS,
  type Network,
  NetworkFailure,
  type NetworkFailureReason,
} from "./ports.ts";

const MAX_REDIRECTS = 20;
const DEADLINE_REASON = "deadline";
const REDIRECT_STATUSES: ReadonlySet<number> = new Set([301, 302, 303, 307, 308]);
const OTHER_TYPE_CAP_BYTES = 512 * 1024;
const HTML_TYPES: ReadonlySet<string> = new Set(["text/html", "application/xhtml+xml"]);
const CHARSET = /;\s*charset\s*=\s*"?(?<label>[^";\s]+)/iu;

type GuardFailure = Exclude<FetchFailure, "no-title" | "unreadable" | "redirect-stopped">;

interface Failed {
  readonly kind: "failed";
  readonly reason: GuardFailure;
}

export interface FetchPolicy {
  readonly stopAt: (url: string) => boolean;
  readonly followMetaRefresh: (url: string) => boolean;
  readonly maxBytes: (url: string) => number;
}

export interface Page {
  readonly kind: "page";
  readonly url: string;
  readonly text: string;
  readonly html: boolean;
  readonly cut: boolean;
}

export type GuardOutcome = Page | { readonly kind: "stopped"; readonly url: string } | Failed;

interface Capped {
  readonly bytes: Uint8Array;
  readonly cut: boolean;
}

type Hop =
  | { readonly kind: "redirect"; readonly location: string }
  | ({
      readonly kind: "page";
      readonly contentType: string | null;
      readonly html: boolean;
    } & Capped)
  | Failed;

const failed = (reason: GuardFailure): Failed => ({ kind: "failed", reason });

async function readCapped(body: AsyncIterable<Uint8Array>, maxBytes: number): Promise<Capped> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  let cut = false;

  for await (const chunk of body) {
    const room = maxBytes - size;
    cut = chunk.length > room;
    const kept = cut ? chunk.subarray(0, room) : chunk;
    chunks.push(kept);
    size += kept.length;

    if (cut) {
      break;
    }
  }

  const bytes = new Uint8Array(size);
  let at = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.length;
  }

  return { bytes, cut };
}

function failureOf(deadlineHit: boolean, reason: NetworkFailureReason | null): GuardFailure {
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
    const response = await network.get(url, AbortSignal.any([controller.signal, deadline]));

    if (REDIRECT_STATUSES.has(response.status) && response.location !== null) {
      return { kind: "redirect", location: response.location };
    }

    if (response.status < 200 || response.status > 299) {
      return failed("status");
    }

    const html = isHtmlType(response.contentType);
    const cap = policy.maxBytes(url);

    return {
      kind: "page",
      contentType: response.contentType,
      html,
      ...(await readCapped(response.body, html ? cap : Math.min(cap, OTHER_TYPE_CAP_BYTES))),
    };
  } catch (error) {
    const deadlineHit = controller.signal.reason === DEADLINE_REASON || deadline.aborted;

    return failed(failureOf(deadlineHit, error instanceof NetworkFailure ? error.reason : null));
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

function isHtmlType(contentType: string | null): boolean {
  const [mediaType = ""] = (contentType ?? "").split(";");

  return HTML_TYPES.has(mediaType.trim().toLowerCase());
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
  const url = resolveUrl(address, base);

  if (url === null || (url.protocol !== "http:" && url.protocol !== "https:")) {
    return failed("unsupported");
  }

  url.username = "";
  url.password = "";

  return isRefusedHost(url.hostname) ? failed("refused") : { kind: "target", url };
}

function advance(
  network: Network,
  policy: Readonly<FetchPolicy>,
  deadline: AbortSignal,
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
): Promise<GuardOutcome> {
  const hop = await requestHop(network, url.href, deadline, policy);

  if (hop.kind === "failed") {
    return hop;
  }

  if (hop.kind === "redirect") {
    return advance(network, policy, deadline, url, hop.location, redirects);
  }

  const text = decoderFor(hop.contentType).decode(hop.bytes);

  const refreshTo =
    policy.followMetaRefresh(url.href) && hop.html ? metaRefreshTarget(text, url.href) : null;

  return refreshTo === null
    ? { kind: "page", url: url.href, text, html: hop.html, cut: hop.cut }
    : advance(network, policy, deadline, url, refreshTo, redirects);
}

export function guardedFetch(
  network: Network,
  address: string,
  policy: Readonly<FetchPolicy>,
  deadline: AbortSignal,
): Promise<GuardOutcome> {
  const first = hopTarget(address);

  return first.kind === "failed"
    ? Promise.resolve(first)
    : follow(network, policy, deadline, first.url, 0);
}
