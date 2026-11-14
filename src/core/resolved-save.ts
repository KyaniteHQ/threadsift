import { eq, sql } from "drizzle-orm";

import { guardHolds, guards, insertGuard, unlessRefused } from "./guards.ts";
import { LISTED_COLUMNS, selectItems } from "./item-selection.ts";
import {
  type Existing,
  type Paste,
  type SaveResult,
  foundItem,
  holdsNoItem,
  queuedWrites,
} from "./items.ts";
import { enqueueRows } from "./job-rows.ts";
import type { Link } from "./links.ts";
import type { Ports } from "./ports.ts";
import { items } from "./schema.ts";
import {
  holdsNoFailedItem,
  holdsNoRival,
  promoteFailedItem,
  recordAlias,
} from "./short-link-aliases.ts";

function saveResolvedRefreshing(
  ports: Ports,
  shortLink: string,
  paste: Readonly<Paste>,
  link: Readonly<Link>,
): Promise<SaveResult | null> {
  const { db } = ports;
  const noRival = holdsNoRival(db, shortLink, link);

  return unlessRefused(db, noRival, async () => {
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

async function saveResolvedNewOnly(
  ports: Ports,
  shortLink: string,
  paste: Readonly<Paste>,
  link: Readonly<Link>,
): Promise<SaveResult | null> {
  const { db } = ports;
  const noRival = holdsNoRival(db, shortLink, link);
  const bothHold = sql`${noRival} and ${holdsNoItem(db, link.normalizedUrl)} and ${holdsNoFailedItem(db, shortLink)}`;

  const added = await unlessRefused(db, bothHold, async () => {
    const [, , , , queued, [item]] = await db.batch([
      insertGuard(db, bothHold),
      ...queuedWrites(db, paste, link),
      recordAlias(db, shortLink, paste.address, link),
      db.delete(guards),
    ]);

    await enqueueRows(ports, queued);

    return { kind: "saved", item: foundItem(item, link.normalizedUrl), created: true } as const;
  });

  if (added !== null || !(await guardHolds(db, noRival))) return added;

  return unlessRefused(db, noRival, async () => {
    const [, , , [item]] = await db.batch([
      insertGuard(db, noRival),
      promoteFailedItem(db, shortLink, link),
      recordAlias(db, shortLink, paste.address, link),
      selectItems(db, LISTED_COLUMNS).where(eq(items.normalizedUrl, link.normalizedUrl)),
      db.delete(guards),
    ]);

    return item === undefined ? null : ({ kind: "saved", item, created: false } as const);
  });
}

export function saveResolved(
  ports: Ports,
  shortLink: string,
  paste: Readonly<Paste>,
  link: Readonly<Link>,
  existing: Existing,
): Promise<SaveResult | null> {
  return existing === "keep"
    ? saveResolvedNewOnly(ports, shortLink, paste, link)
    : saveResolvedRefreshing(ports, shortLink, paste, link);
}
