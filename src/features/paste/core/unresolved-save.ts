import { type SQLWrapper, and, eq, notExists } from "drizzle-orm";

import type { Link } from "../../../core/contract/links.ts";
import type { Database } from "../../../core/kernel/database.ts";
import { guards, holdsNoRow, insertGuard, unlessRefused } from "../../../core/kernel/guards.ts";
import { hasOpenJob } from "../../../core/kernel/job-rows.ts";
import type { Ports } from "../../../core/kernel/ports.ts";
import { restoreGuard } from "../../../core/kernel/restore-hold.ts";
import { itemAliases, items } from "../../../core/kernel/schema.ts";
import { STALE } from "../../../core/kernel/vault-stale.ts";
import {
  type Existing,
  type Paste,
  type Saved,
  foundItem,
  holdsNoItem,
  itemInsert,
  knownItem,
} from "../../item/core/item-rows.ts";
import { itemRead, itemWhere } from "../../item/core/item-selection.ts";
import { settle } from "../../item/core/settle.ts";
import type { Concluded } from "../../media/core/details.ts";

type FailedFetch = Exclude<Concluded, { status: "ok" }>;

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

const INSERTED_ITEM = 4;

const REFRESHED_ITEM = 4;

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

  const inserted = await unlessRefused(() =>
    db.batch([
      heldGuard,
      insertGuard(db, noAlias),
      insertGuard(db, missing),
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
        item: foundItem(inserted[INSERTED_ITEM][0], normalizedUrl),
        created: true,
      };
}

async function refreshedFailure(
  db: Database,
  noAlias: Readonly<SQLWrapper>,
  { link: { normalizedUrl }, fetched, now }: Readonly<Failure>,
): Promise<Saved | null> {
  const known = await itemWhere(db, eq(items.normalizedUrl, normalizedUrl));

  if (known === undefined) return null;

  const refreshed = await db.batch([
    restoreGuard(db),
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

  const [item] = refreshed[REFRESHED_ITEM];

  return item === undefined ? null : { kind: "saved", item, created: false };
}

export function saveUnresolved(
  ports: Ports,
  { paste: { address, addedByToken }, link, fetched, existing }: Readonly<Unresolved>,
): Promise<Saved | null> {
  const { db } = ports;
  const noAlias = holdsNoRow(db, itemAliases, eq(itemAliases.normalizedUrl, link.normalizedUrl));
  const failure = { address, link, fetched, now: Date.now(), addedByToken };

  return unlessRefused(
    async () =>
      (await insertedFailure(db, noAlias, failure)) ??
      (existing === "keep"
        ? knownItem(db, link.normalizedUrl)
        : refreshedFailure(db, noAlias, failure)),
  );
}
