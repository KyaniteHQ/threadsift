import { type SQLWrapper, and, eq, notExists, sql } from "drizzle-orm";

import type { Database } from "./database.ts";
import type { Concluded } from "./details.ts";
import { guardHolds, guards, holdsNoRow, insertGuard, unlessRefused } from "./guards.ts";
import {
  type Around,
  type Existing,
  type Paste,
  type Saved,
  holdsNoItem,
  itemAt,
  itemFound,
  writeQueued,
} from "./item-rows.ts";
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
      queueVaultItems(db, sql`${promotable} and ${changed}`),
      promoteFailedItem(db, shortLink, link),
      recordAlias(db, shortLink, paste.address, link),
      db.delete(guards),
    ]);
  });

  if (promoted === null) return null;

  const item = await itemFound(db, link.normalizedUrl);

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
  { address, link: { normalizedUrl, kind, source }, fetched, now, addedByToken }: Readonly<Failure>,
): Promise<Saved | null> {
  const missing = holdsNoItem(db, normalizedUrl);

  const inserted = await unlessRefused(db, missing, () =>
    db.batch([
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
      queueVaultItems(db, eq(items.normalizedUrl, normalizedUrl)),
      db.delete(guards),
    ]),
  );

  return inserted === null
    ? null
    : { kind: "saved", item: await itemAt(db, normalizedUrl), created: true };
}

async function refreshedFailure(
  db: Database,
  noAlias: Readonly<SQLWrapper>,
  { link: { normalizedUrl }, fetched, now }: Readonly<Failure>,
): Promise<Saved> {
  const known = await itemAt(db, normalizedUrl);

  await db.batch([
    insertGuard(db, noAlias),
    db
      .update(items)
      .set({ pendingDigest: null })
      .where(and(eq(items.id, known.id), notExists(hasOpenJob("digest")))),
    db
      .update(items)
      .set(settle(fetched, known.title, now))
      .where(and(eq(items.id, known.id), notExists(hasOpenJob()))),
    db.delete(guards),
  ]);

  return { kind: "saved", item: await itemAt(db, normalizedUrl), created: false };
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
