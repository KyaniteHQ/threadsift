import { type Caller, tokenIdOf } from "../access/caller.ts";
import type { Digest } from "../contract/digest-schema.ts";
import { isRedditShareLink, isShortLink, parseLink } from "../contract/links.ts";
import { FETCH_DEADLINE_MS } from "../contract/request-waits.ts";
import { resolveShortLink } from "../fetch/fetch-link.ts";
import { refusedHost } from "../item/admission.ts";
import type { Refused } from "../kernel/paste-outcome.ts";
import type { Ports } from "../kernel/ports.ts";
import {
  type Existing,
  type Saved,
  saveLinked,
  saveResolved,
  saveUnresolved,
} from "./item-save.ts";
import { aliasedItem } from "./short-link-aliases.ts";

export type SaveResult = Saved | Refused;

async function saveShortLink(
  ports: Ports,
  pasted: string,
  digest: Digest | undefined,
  existing: Existing,
  addedByToken: number | null,
): Promise<Saved> {
  const shortLink = parseLink(pasted);
  const known = await aliasedItem(ports.db, shortLink.normalizedUrl);

  if (known !== undefined) {
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

  const saved =
    resolution.kind === "failed"
      ? await saveUnresolved(ports, {
          paste: { address: pasted, addedByToken },
          link: shortLink,
          fetched: resolution.fetched,
          existing,
        })
      : await saveResolved(ports, {
          shortLink: shortLink.normalizedUrl,
          paste: { originalUrl: pasted, address: resolution.address, digest, addedByToken },
          link: parseLink(resolution.address),
          existing,
        });

  return saved ?? saveShortLink(ports, pasted, digest, existing, addedByToken);
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

  return isShortLink(absoluteUrl) || isRedditShareLink(absoluteUrl)
    ? saveShortLink(ports, absoluteUrl, digest, existing, addedByToken)
    : saveLinked(
        ports,
        { originalUrl: absoluteUrl, address: absoluteUrl, digest, addedByToken },
        parseLink(absoluteUrl),
        existing,
      );
}
