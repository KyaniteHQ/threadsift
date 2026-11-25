import type { Digest } from "../../../core/contract/digest-schema.ts";
import { aliasAnswers, needsResolving, parseLink } from "../../../core/contract/links.ts";
import { FETCH_DEADLINE_MS } from "../../../core/contract/request-waits.ts";
import type { Refused } from "../../../core/kernel/paste-outcome.ts";
import type { Ports } from "../../../core/kernel/ports.ts";
import { type Caller, tokenIdOf } from "../../access/core/caller.ts";
import { resolveShortLink } from "../../fetch/core/fetch-link.ts";
import { refusedHost } from "../../item/core/admission.ts";
import {
  type Existing,
  type Saved,
  type ShortLinkPaste,
  saveLinked,
  saveResolution,
} from "./item-save.ts";
import { aliasedItem } from "./short-link-aliases.ts";

export type SaveResult = Saved | Refused;

async function saveShortLink(ports: Ports, paste: Readonly<ShortLinkPaste>): Promise<Saved> {
  const { pasted, digest, existing, addedByToken } = paste;
  const known = await aliasedItem(ports.db, parseLink(pasted).normalizedUrl);

  if (known !== undefined && aliasAnswers(known.address)) {
    return saveLinked(
      ports,
      { originalUrl: pasted, address: known.address, digest, addedByToken },
      known,
      existing,
    );
  }

  const resolution = await resolveShortLink(
    ports.network,
    pasted,
    AbortSignal.timeout(FETCH_DEADLINE_MS),
  );

  return (await saveResolution(ports, paste, resolution, known)) ?? saveShortLink(ports, paste);
}

export function saveItem(
  ports: Ports,
  absoluteUrl: string,
  digest: Digest | undefined,
  existing: Existing,
  caller: Caller,
): Promise<SaveResult> {
  const refused = refusedHost(absoluteUrl);

  if (refused !== null) return Promise.resolve(refused);

  const addedByToken = tokenIdOf(caller);

  return needsResolving(absoluteUrl)
    ? saveShortLink(ports, { pasted: absoluteUrl, digest, existing, addedByToken })
    : saveLinked(
        ports,
        { originalUrl: absoluteUrl, address: absoluteUrl, digest, addedByToken },
        parseLink(absoluteUrl),
        existing,
      );
}
