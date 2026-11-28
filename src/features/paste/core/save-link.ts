import type { Digest } from "../../../core/contract/digest-schema.ts";
import { aliasAnswers, parseLink } from "../../../core/contract/links.ts";
import { FETCH_DEADLINE_MS } from "../../../core/contract/request-waits.ts";
import { aliasedItem, namingOf } from "../../../core/kernel/link-naming.ts";
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

export type SaveResult = Saved | Refused;

async function saveShortLink(
  ports: Ports,
  paste: Readonly<ShortLinkPaste>,
  shortLink: string,
): Promise<Saved> {
  const { pasted, digest, existing, addedByToken } = paste;
  const known = await aliasedItem(ports.db, shortLink);

  if (known !== undefined && aliasAnswers(known.address)) {
    return (
      (await saveLinked(
        ports,
        { originalUrl: pasted, address: known.address, digest, addedByToken },
        known,
        existing,
      )) ?? saveShortLink(ports, paste, shortLink)
    );
  }

  const resolution = await resolveShortLink(
    ports.network,
    pasted,
    AbortSignal.timeout(FETCH_DEADLINE_MS),
  );

  return (
    (await saveResolution(ports, paste, resolution, known)) ??
    saveShortLink(ports, paste, shortLink)
  );
}

export async function saveItem(
  ports: Ports,
  absoluteUrl: string,
  digest: Digest | undefined,
  existing: Existing,
  caller: Caller,
): Promise<SaveResult> {
  const refused = refusedHost(absoluteUrl);

  if (refused !== null) return refused;

  const addedByToken = tokenIdOf(caller);

  const naming = namingOf(absoluteUrl);

  if (naming.kind === "alias") {
    return saveShortLink(
      ports,
      { pasted: absoluteUrl, digest, existing, addedByToken },
      naming.shortLink,
    );
  }

  return (
    (await saveLinked(
      ports,
      { originalUrl: absoluteUrl, address: absoluteUrl, digest, addedByToken },
      parseLink(absoluteUrl),
      existing,
    )) ?? saveItem(ports, absoluteUrl, digest, existing, caller)
  );
}
