import type { Digest } from "./ai-contract.ts";
import { saveFailedResolution } from "./failed-resolution.ts";
import { resolveShortLink } from "./fetch-link.ts";
import { type Paste, type SaveResult, foundItem, queuedWrites, saveQueued } from "./items.ts";
import { enqueueRows } from "./job-rows.ts";
import { type Link, isRefusedLink, isShortLink, parseLink } from "./links.ts";
import type { Ports } from "./ports.ts";
import { guards, insertGuard } from "./schema.ts";
import {
  aliasedItem,
  holdsNoRival,
  promoteFailedItem,
  recordAlias,
  unlessAliased,
} from "./short-link-aliases.ts";

function saveResolved(
  ports: Ports,
  shortLink: string,
  paste: Readonly<Paste>,
  link: Readonly<Link>,
): Promise<SaveResult | null> {
  const { db } = ports;
  const noRival = holdsNoRival(db, shortLink, link);

  return unlessAliased(db, noRival, async () => {
    const [, , inserted, , , queued, [item]] = await db.batch([
      insertGuard(db, noRival),
      promoteFailedItem(db, shortLink, link),
      ...queuedWrites(db, paste, link),
      recordAlias(db, shortLink, paste.address, link),
      db.delete(guards),
    ]);

    await enqueueRows(ports, queued);

    return {
      kind: "saved",
      item: foundItem(item, link.normalizedUrl),
      created: inserted.length > 0,
    } as const;
  });
}

async function saveShortLink(ports: Ports, pasted: string, digest?: Digest): Promise<SaveResult> {
  const { normalizedUrl: shortLink } = parseLink(pasted);
  const known = await aliasedItem(ports.db, shortLink);

  if (known !== undefined) {
    return saveQueued(ports, { originalUrl: pasted, address: known.address, digest }, known);
  }

  const resolution = await resolveShortLink(ports.network, pasted);

  const saved =
    resolution.kind === "failed"
      ? await saveFailedResolution(ports.db, pasted, parseLink(pasted), resolution.fetched)
      : await saveResolved(
          ports,
          shortLink,
          { originalUrl: pasted, address: resolution.address, digest },
          parseLink(resolution.address),
        );

  return saved ?? saveShortLink(ports, pasted, digest);
}

export function saveItem(ports: Ports, absoluteUrl: string, digest?: Digest): Promise<SaveResult> {
  if (isRefusedLink(absoluteUrl)) {
    return Promise.resolve({ kind: "refused" });
  }

  return isShortLink(absoluteUrl)
    ? saveShortLink(ports, absoluteUrl, digest)
    : saveQueued(
        ports,
        { originalUrl: absoluteUrl, address: absoluteUrl, digest },
        parseLink(absoluteUrl),
      );
}
