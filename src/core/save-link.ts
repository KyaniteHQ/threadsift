import type { Digest } from "./ai-contract.ts";
import { saveFailedResolution } from "./failed-resolution.ts";
import { resolveShortLink } from "./fetch-link.ts";
import { type Existing, type SaveResult, saveQueued } from "./items.ts";
import { isRedditShareLink, isRefusedLink, isShortLink, parseLink } from "./links.ts";
import type { Ports } from "./ports.ts";
import { saveResolved } from "./resolved-save.ts";
import { aliasedItem } from "./short-link-aliases.ts";

async function saveShortLink(
  ports: Ports,
  pasted: string,
  digest: Digest | undefined,
  existing: Existing,
): Promise<SaveResult> {
  const { normalizedUrl: shortLink } = parseLink(pasted);
  const known = await aliasedItem(ports.db, shortLink);

  if (known !== undefined) {
    return saveQueued(
      ports,
      { originalUrl: pasted, address: known.address, digest },
      known,
      existing,
    );
  }

  const resolution = await resolveShortLink(ports.network, pasted);

  const saved =
    resolution.kind === "failed"
      ? await saveFailedResolution(
          ports.db,
          pasted,
          parseLink(pasted),
          resolution.fetched,
          existing,
        )
      : await saveResolved(
          ports,
          shortLink,
          { originalUrl: pasted, address: resolution.address, digest },
          parseLink(resolution.address),
          existing,
        );

  return saved ?? saveShortLink(ports, pasted, digest, existing);
}

export function saveItem(
  ports: Ports,
  absoluteUrl: string,
  digest?: Digest,
  existing: Existing = "refresh",
): Promise<SaveResult> {
  if (isRefusedLink(absoluteUrl)) {
    return Promise.resolve({ kind: "refused" });
  }

  return isShortLink(absoluteUrl) || isRedditShareLink(absoluteUrl)
    ? saveShortLink(ports, absoluteUrl, digest, existing)
    : saveQueued(
        ports,
        { originalUrl: absoluteUrl, address: absoluteUrl, digest },
        parseLink(absoluteUrl),
        existing,
      );
}
