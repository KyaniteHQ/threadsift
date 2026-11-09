import { utf8Length } from "./digest-prompt.ts";
import { fromBase64 } from "./encoding.ts";
import { type Failed, type FetchPolicy, NO_HEADERS, guardedFetchBytes } from "./fetch-guard.ts";
import { type ImageType, declaredImageType, sniffImageType } from "./image-type.ts";
import type { MediaFailure } from "./kinds.ts";
import { isRedditOrXLink } from "./links.ts";
import type { Network } from "./ports.ts";

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_URL_BYTES = 4096;

const BASE64_CHARACTERS = Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 4;

const IMAGE_POLICY: FetchPolicy = {
  stopAt: isRedditOrXLink,
  followMetaRefresh: () => false,
  readsBody: () => true,
  headers: () => ({
    ...NO_HEADERS,
    accept: "image/avif,image/webp,image/png,image/jpeg,image/gif",
  }),
  readsLimits: () => false,
  htmlMaxBytes: MAX_IMAGE_BYTES,
  dataMaxBytes: MAX_IMAGE_BYTES,
};

const FAILURES: Readonly<Record<Failed["reason"], MediaFailure>> = {
  timeout: "timeout",
  refused: "refused",
  unsupported: "unsupported",
  "redirect-limit": "redirect-limit",
  unresolved: "network",
  network: "network",
  status: "status",
  "rate-limited": "status",
};

export type Fetched =
  | {
      readonly ok: true;
      readonly type: ImageType;
      readonly bytes: Uint8Array;
      readonly finalUrl: string | null;
    }
  | { readonly ok: false; readonly reason: MediaFailure };

type Checked =
  | { readonly ok: true; readonly type: ImageType }
  | { readonly ok: false; readonly reason: MediaFailure };

export function fits(url: string): boolean {
  return utf8Length(url) <= MAX_URL_BYTES;
}

function checked(contentType: string | null, bytes: Uint8Array, cut: boolean): Checked {
  if (cut) return { ok: false, reason: "too-large" };

  const declared = declaredImageType(contentType);

  if (declared === null) return { ok: false, reason: "not-an-image" };

  return sniffImageType(bytes) === declared
    ? { ok: true, type: declared }
    : { ok: false, reason: "type-mismatch" };
}

export function decoded(dataUrl: string): Fetched {
  const comma = dataUrl.indexOf(",");
  const [type = "", ...parameters] = dataUrl.slice("data:".length, comma).split(";");

  if (comma < 0 || parameters.at(-1)?.toLowerCase() !== "base64") {
    return { ok: false, reason: "not-an-image" };
  }

  const payload = dataUrl.slice(comma + 1);

  if (payload.length > BASE64_CHARACTERS) return { ok: false, reason: "too-large" };

  try {
    const bytes = fromBase64(payload.replaceAll(/\s+/gu, ""));
    const verdict = checked(type, bytes, bytes.length > MAX_IMAGE_BYTES);

    return verdict.ok ? { ...verdict, bytes, finalUrl: null } : verdict;
  } catch {
    return { ok: false, reason: "not-an-image" };
  }
}

export async function downloaded(
  network: Network,
  url: string,
  deadline: AbortSignal,
): Promise<Fetched> {
  const outcome = await guardedFetchBytes(network, url, IMAGE_POLICY, deadline);

  if (outcome.kind === "stopped") return { ok: false, reason: "refused" };

  if (outcome.kind === "failed") return { ok: false, reason: FAILURES[outcome.reason] };

  const verdict = checked(outcome.contentType, outcome.bytes, outcome.cut);

  return verdict.ok
    ? { ...verdict, bytes: outcome.bytes, finalUrl: fits(outcome.url) ? outcome.url : null }
    : verdict;
}
