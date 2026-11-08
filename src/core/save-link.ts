import type { Digest } from "./ai-contract.ts";
import { resolveShortLink } from "./fetch-link.ts";
import {
  type Paste,
  type SaveResult,
  foundItem,
  queuedWrites,
  saveQueued,
  saveSettled,
} from "./items.ts";
import { enqueueRows } from "./job-rows.ts";
import { type Link, isRefusedLink, isShortLink, parseLink } from "./links.ts";
import type { Ports } from "./ports.ts";
import { guardHolds, guards, insertGuard } from "./schema.ts";
import { aliasedLink, holdsNoRival, promoteFailedItem, recordAlias } from "./short-link-aliases.ts";

async function saveResolved(
  ports: Ports,
  shortLink: string,
  paste: Readonly<Paste>,
  link: Readonly<Link>,
): Promise<SaveResult | null> {
  const { db } = ports;
  const noRival = holdsNoRival(db, shortLink, link);

  try {
    const [, , inserted, , , queued, [item]] = await db.batch([
      insertGuard(db, noRival),
      promoteFailedItem(db, shortLink, link),
      ...queuedWrites(db, paste, link),
      recordAlias(db, shortLink, link),
      db.delete(guards),
    ]);

    await enqueueRows(ports, queued);

    return {
      kind: "saved",
      item: foundItem(item, link.normalizedUrl),
      created: inserted.length > 0,
    };
  } catch (error) {
    if (await guardHolds(db, noRival)) throw error;

    return null;
  }
}

async function saveShortLink(ports: Ports, pasted: string, digest?: Digest): Promise<SaveResult> {
  const { normalizedUrl: shortLink } = parseLink(pasted);
  const known = await aliasedLink(ports.db, shortLink);

  if (known !== undefined) {
    return saveQueued(ports, { originalUrl: pasted, address: known.normalizedUrl, digest }, known);
  }

  const resolution = await resolveShortLink(ports.network, pasted);

  if (resolution.kind === "failed") {
    return saveSettled(ports.db, pasted, parseLink(pasted), resolution.fetched);
  }

  const { address } = resolution;

  const saved = await saveResolved(
    ports,
    shortLink,
    { originalUrl: pasted, address, digest },
    parseLink(address),
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
