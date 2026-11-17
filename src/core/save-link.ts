import type { Digest } from "./ai-contract.ts";
import { type Caller, tokenIdOf } from "./caller.ts";
import { saveFailedResolution } from "./failed-resolution.ts";
import { resolveShortLink } from "./fetch-link.ts";
import { type Existing, type SaveResult, saveQueued } from "./items.ts";
import { isRedditShareLink, isRefusedLink, isShortLink, parseLink } from "./links.ts";
import type { Ports } from "./ports.ts";
import { FETCH_DEADLINE_MS } from "./request-waits.ts";
import { saveResolved } from "./resolved-save.ts";
import { aliasedItem } from "./short-link-aliases.ts";

async function saveShortLink(
  ports: Ports,
  pasted: string,
  digest: Digest | undefined,
  existing: Existing,
  addedByToken: number | null,
): Promise<SaveResult> {
  const shortLink = parseLink(pasted);
  const known = await aliasedItem(ports.db, shortLink.normalizedUrl);

  if (known !== undefined) {
    return saveQueued(
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
      ? await saveFailedResolution(
          ports.db,
          pasted,
          shortLink,
          resolution.fetched,
          existing,
          addedByToken,
        )
      : await saveResolved(
          ports,
          shortLink.normalizedUrl,
          { originalUrl: pasted, address: resolution.address, digest, addedByToken },
          parseLink(resolution.address),
          existing,
        );

  return saved ?? saveShortLink(ports, pasted, digest, existing, addedByToken);
}

export function saveItem(
  ports: Ports,
  absoluteUrl: string,
  digest: Digest | undefined,
  existing: Existing,
  caller: Caller,
): Promise<SaveResult> {
  if (isRefusedLink(absoluteUrl)) {
    return Promise.resolve({ kind: "refused" });
  }

  const addedByToken = tokenIdOf(caller);

  return isShortLink(absoluteUrl) || isRedditShareLink(absoluteUrl)
    ? saveShortLink(ports, absoluteUrl, digest, existing, addedByToken)
    : saveQueued(
        ports,
        { originalUrl: absoluteUrl, address: absoluteUrl, digest, addedByToken },
        parseLink(absoluteUrl),
        existing,
      );
}
