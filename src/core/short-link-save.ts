import { type SQLWrapper, and, eq, notExists, sql } from "drizzle-orm";

import type { Database } from "./database.ts";
import type { Concluded } from "./details.ts";
import { guardHolds, guards, holdsNoRow, insertGuard, unlessRefused } from "./guards.ts";
import {
  type Existing,
  type Paste,
  type Saved,
  foundItem,
  holdsNoItem,
  itemAt,
  writeQueued,
} from "./item-rows.ts";
import { LISTED_COLUMNS, selectItems } from "./item-selection.ts";
import { hasOpenJob } from "./job-rows.ts";
import type { Link } from "./links.ts";
import type { Ports } from "./ports.ts";
import { itemAliases, items } from "./schema.ts";
import { settle } from "./settle.ts";
import {
  holdsNoFailedItem,
  holdsNoRival,
  promoteFailedItem,
  promotableFailedItem,
  recordAlias,
} from "./short-link-aliases.ts";
import { queueVaultItems } from "./vault-queue.ts";

type FailedFetch = Exclude<Concluded, { status: "ok" }>;

export interface Resolved {
  readonly shortLink: string;
  readonly paste: Readonly<Paste>;
  readonly link: Readonly<Link>;
  readonly existing: Existing;
}

export interface Unresolved {
  readonly paste: Readonly<Paste>;
  readonly link: Readonly<Link>;
  readonly fetched: Readonly<FailedFetch>;
  readonly existing: Existing;
}

interface Failure {
  readonly address: string;
  readonly link: Readonly<Link>;
  readonly fetched: Readonly<FailedFetch>;
  readonly now: number;
  readonly addedByToken: Paste["addedByToken"];
}

function promotedAndKept(
  ports: Ports,
  { shortLink, paste, link }: Readonly<Resolved>,
): Promise<Saved | null> {
  const { db } = ports;
  const noRival = holdsNoRival(db, shortLink, link);

  return unlessRefused(db, noRival, async () => {
    const promotable = promotableFailedItem(db, shortLink, link.normalizedUrl);
    const changed = sql`(${items.source}, ${items.kind}) is not (${link.source}, ${link.kind})`;

    const [, , , , [item]] = await db.batch([
      insertGuard(db, noRival),
      queueVaultItems(db, sql`${promotable} and ${changed}`),
      promoteFailedItem(db, shortLink, link),
      recordAlias(db, shortLink, paste.address, link),
      selectItems(db, LISTED_COLUMNS).where(eq(items.normalizedUrl, link.normalizedUrl)),
      db.delete(guards),
    ]);

    return item === undefined ? null : { kind: "saved", item, created: false };
  });
}

export async function saveResolved(
  ports: Ports,
  resolved: Readonly<Resolved>,
): Promise<Saved | null> {
  const { db } = ports;
  const { shortLink, paste, link, existing } = resolved;
  const noRival = holdsNoRival(db, shortLink, link);
  const alias = recordAlias(db, shortLink, paste.address, link);

  if (existing === "refresh") {
    return writeQueued(ports, paste, link, {
      kind: "promoting",
      guard: noRival,
      promote: promoteFailedItem(db, shortLink, link),
      alias,
    });
  }

  const bothHold = sql`${noRival} and ${holdsNoItem(db, link.normalizedUrl)} and ${holdsNoFailedItem(db, shortLink)}`;

  const added = await writeQueued(ports, paste, link, {
    kind: "guarded",
    guard: bothHold,
    after: [alias],
  });

  if (added !== null || !(await guardHolds(db, noRival))) return added;

  return promotedAndKept(ports, resolved);
}

function insertedFailure(
  db: Database,
  noAlias: Readonly<SQLWrapper>,
  { address, link: { normalizedUrl, kind, source }, fetched, now, addedByToken }: Readonly<Failure>,
): Promise<Saved | null> {
  const missing = holdsNoItem(db, normalizedUrl);
  const itemKey = eq(items.normalizedUrl, normalizedUrl);

  return unlessRefused(db, missing, async () => {
    const [, , , [item]] = await db.batch([
      insertGuard(db, noAlias),
      insertGuard(db, missing),
      db.insert(items).values({
        source,
        kind,
        normalizedUrl,
        originalUrl: address,
        savedAt: now,
        addedByToken,
        ...settle(fetched, null, now),
      }),
      selectItems(db, LISTED_COLUMNS).where(itemKey),
      queueVaultItems(db, itemKey),
      db.delete(guards),
    ]);

    return { kind: "saved", item: foundItem(item, normalizedUrl), created: true };
  });
}

async function refreshedFailure(
  db: Database,
  noAlias: Readonly<SQLWrapper>,
  { link: { normalizedUrl }, fetched, now }: Readonly<Failure>,
): Promise<Saved> {
  const known = await itemAt(db, normalizedUrl);

  const [, , , [item]] = await db.batch([
    insertGuard(db, noAlias),
    db
      .update(items)
      .set({ pendingDigest: null })
      .where(and(eq(items.id, known.id), notExists(hasOpenJob("digest")))),
    db
      .update(items)
      .set(settle(fetched, known.title, now))
      .where(and(eq(items.id, known.id), notExists(hasOpenJob()))),
    selectItems(db, LISTED_COLUMNS).where(eq(items.id, known.id)),
    db.delete(guards),
  ]);

  return { kind: "saved", item: foundItem(item, normalizedUrl), created: false };
}

export function saveUnresolved(
  ports: Ports,
  { paste: { address, addedByToken }, link, fetched, existing }: Readonly<Unresolved>,
): Promise<Saved | null> {
  const { db } = ports;
  const noAlias = holdsNoRow(db, itemAliases, eq(itemAliases.normalizedUrl, link.normalizedUrl));
  const failure = { address, link, fetched, now: Date.now(), addedByToken };

  return unlessRefused(
    db,
    noAlias,
    async () =>
      (await insertedFailure(db, noAlias, failure)) ??
      (existing === "keep"
        ? { kind: "saved", item: await itemAt(db, link.normalizedUrl), created: false }
        : refreshedFailure(db, noAlias, failure)),
  );
}
