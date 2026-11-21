import { type SQLWrapper, and, eq, notExists, sql } from "drizzle-orm";

import type { Link } from "../../../core/contract/links.ts";
import type { Database } from "../../../core/kernel/database.ts";
import {
  guardHolds,
  guards,
  holdsNoRow,
  insertGuard,
  unlessRefused,
} from "../../../core/kernel/guards.ts";
import { hasOpenJob } from "../../../core/kernel/job-rows.ts";
import type { Ports } from "../../../core/kernel/ports.ts";
import { orRestoreHolds } from "../../../core/kernel/restore-hold.ts";
import { itemAliases, items } from "../../../core/kernel/schema.ts";
import { STALE } from "../../../core/kernel/vault-stale.ts";
import {
  type Around,
  type Existing,
  type Paste,
  type Saved,
  holdsNoItem,
  foundItem,
  itemAt,
  itemInsert,
  writeQueued,
} from "../../item/core/item-rows.ts";
import { itemRead } from "../../item/core/item-selection.ts";
import { settle } from "../../item/core/settle.ts";
import type { Concluded } from "../../media/core/details.ts";
import {
  holdsNoFailedItem,
  holdsNoRival,
  promoteFailedItem,
  promotableFailedItem,
  recordAlias,
} from "./short-link-aliases.ts";

type FailedFetch = Exclude<Concluded, { status: "ok" }>;

export interface Resolved {
  readonly shortLink: string;
  readonly paste: Readonly<Paste>;
  readonly link: Readonly<Link>;
  readonly existing: Existing;
}

interface Unresolved {
  readonly paste: Readonly<Pick<Paste, "address" | "addedByToken">>;
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

const PROMOTED_ITEM = 4;

const FAILED_ITEM = 3;

const INSERTED_FAILURE_ITEM = 4;

async function promotedAndKept(
  ports: Ports,
  { shortLink, paste, link }: Readonly<Resolved>,
): Promise<Saved | null> {
  const { db } = ports;
  const noRival = holdsNoRival(db, shortLink, link);

  const promoted = await unlessRefused(db, noRival, () => {
    const promotable = promotableFailedItem(db, shortLink, link.normalizedUrl);
    const changed = sql`(${items.source}, ${items.kind}) is not (${link.source}, ${link.kind})`;

    return db.batch([
      insertGuard(db, noRival),
      ...STALE.itemChanged(db, sql`${promotable} and ${changed}`),
      promoteFailedItem(db, shortLink, link),
      recordAlias(db, shortLink, paste.address, link),
      itemRead(db, eq(items.normalizedUrl, link.normalizedUrl)),
      db.delete(guards),
    ]);
  });

  const item = promoted?.[PROMOTED_ITEM][0];

  return item === undefined ? null : { kind: "saved", item, created: false };
}

export async function saveResolved(
  ports: Ports,
  resolved: Readonly<Resolved>,
): Promise<Saved | null> {
  const { db } = ports;
  const { shortLink, paste, link, existing } = resolved;
  const noRival = holdsNoRival(db, shortLink, link);
  const after = [recordAlias(db, shortLink, paste.address, link)];

  const around: Around =
    existing === "refresh"
      ? { guard: noRival, before: [promoteFailedItem(db, shortLink, link)], after }
      : {
          guard: sql`${noRival} and ${holdsNoItem(db, link.normalizedUrl)} and ${holdsNoFailedItem(db, shortLink)}`,
          before: [],
          after,
        };

  const added = await writeQueued(ports, paste, link, around);

  if (added !== null || existing === "refresh" || !(await guardHolds(db, noRival))) return added;

  return promotedAndKept(ports, resolved);
}

async function insertedFailure(
  db: Database,
  noAlias: Readonly<SQLWrapper>,
  { address, link, fetched, now, addedByToken }: Readonly<Failure>,
): Promise<Saved | null> {
  const { normalizedUrl } = link;
  const missing = holdsNoItem(db, normalizedUrl);
  const itemKey = eq(items.normalizedUrl, normalizedUrl);

  const { heldGuard, insert } = itemInsert(db, {
    link,
    originalUrl: address,
    savedAt: now,
    addedByToken,
    fetched: settle(fetched, null, now),
  });

  const inserted = await unlessRefused(db, orRestoreHolds(db, missing), () =>
    db.batch([
      insertGuard(db, noAlias),
      insertGuard(db, missing),
      heldGuard,
      insert,
      itemRead(db, itemKey),
      ...STALE.itemChanged(db, itemKey),
      db.delete(guards),
    ]),
  );

  return inserted === null
    ? null
    : {
        kind: "saved",
        item: foundItem(inserted[INSERTED_FAILURE_ITEM][0], normalizedUrl),
        created: true,
      };
}

async function refreshedFailure(
  db: Database,
  noAlias: Readonly<SQLWrapper>,
  { link: { normalizedUrl }, fetched, now }: Readonly<Failure>,
): Promise<Saved> {
  const known = await itemAt(db, normalizedUrl);

  const refreshed = await db.batch([
    insertGuard(db, noAlias),
    db
      .update(items)
      .set({ pendingDigest: null })
      .where(and(eq(items.id, known.id), notExists(hasOpenJob("digest")))),
    db
      .update(items)
      .set(settle(fetched, known.title, now))
      .where(and(eq(items.id, known.id), notExists(hasOpenJob()))),
    itemRead(db, eq(items.id, known.id)),
    db.delete(guards),
  ]);

  return {
    kind: "saved",
    item: foundItem(refreshed[FAILED_ITEM][0], normalizedUrl),
    created: false,
  };
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
