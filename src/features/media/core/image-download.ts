import { fromBase64 } from "../../../core/contract/encoding.ts";
import { fits } from "../../../core/contract/image-rules.ts";
import {
  type ImageType,
  declaredImageType,
  sniffImageType,
} from "../../../core/contract/image-type.ts";
import { IMAGE_MAX_BYTES } from "../../../core/contract/limits.ts";
import { guardedFetchBytes } from "../../../core/kernel/fetch-guard.ts";
import type { MediaFailure } from "../../../core/kernel/media-tables.ts";
import type { Network } from "../../../core/kernel/network.ts";

const BASE64_CHARACTERS = Math.ceil((IMAGE_MAX_BYTES * 4) / 3) + 4;

const PERCENT_ESCAPE_CHARACTERS = 3;

const PAYLOAD_CHARACTERS = BASE64_CHARACTERS * PERCENT_ESCAPE_CHARACTERS;

const BASE64_WHITESPACE = /[\t\n\f\r ]+/gu;

const IMAGE_HEADERS = { accept: "image/avif,image/webp,image/png,image/jpeg,image/gif" } as const;

export type Downloaded =
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

function checked(contentType: string | null, bytes: Uint8Array, cut: boolean): Checked {
  if (cut) return { ok: false, reason: "too-large" };

  const declared = declaredImageType(contentType);

  if (declared === null) return { ok: false, reason: "not-an-image" };

  return sniffImageType(bytes) === declared
    ? { ok: true, type: declared }
    : { ok: false, reason: "type-mismatch" };
}

export function decoded(dataUrl: string): Downloaded {
  const comma = dataUrl.indexOf(",");
  const [type = "", ...parameters] = dataUrl.slice("data:".length, comma).split(";");

  if (comma < 0 || parameters.at(-1)?.toLowerCase() !== "base64") {
    return { ok: false, reason: "not-an-image" };
  }

  const payload = dataUrl.slice(comma + 1);

  if (payload.length > PAYLOAD_CHARACTERS) return { ok: false, reason: "too-large" };

  try {
    const base64 = decodeURIComponent(payload).replaceAll(BASE64_WHITESPACE, "");

    if (base64.length > BASE64_CHARACTERS) return { ok: false, reason: "too-large" };

    const bytes = fromBase64(base64);
    const verdict = checked(type, bytes, bytes.length > IMAGE_MAX_BYTES);

    return verdict.ok ? { ...verdict, bytes, finalUrl: null } : verdict;
  } catch {
    return { ok: false, reason: "not-an-image" };
  }
}

export async function downloaded(
  network: Network,
  url: string,
  deadline: AbortSignal,
  stopAt: (address: string) => boolean,
): Promise<Downloaded> {
  if (stopAt(url)) return { ok: false, reason: "refused" };

  const outcome = await guardedFetchBytes(
    network,
    url,
    {
      stopAt,
      headers: () => IMAGE_HEADERS,
      htmlMaxBytes: IMAGE_MAX_BYTES,
      dataMaxBytes: IMAGE_MAX_BYTES,
    },
    deadline,
  );

  if (outcome.kind === "stopped") return { ok: false, reason: "refused" };

  if (outcome.kind === "failed") return { ok: false, reason: outcome.reason };

  const verdict = checked(outcome.contentType, outcome.bytes, outcome.cut);

  return verdict.ok
    ? { ...verdict, bytes: outcome.bytes, finalUrl: fits(outcome.url) ? outcome.url : null }
    : verdict;
}
