import { eq, sql } from "drizzle-orm";

import { type Link, parseLink, redditRefOf } from "../../../core/contract/links.ts";
import { guardHolds, guards, insertGuard, unlessRefused } from "../../../core/kernel/guards.ts";
import type { Ports } from "../../../core/kernel/ports.ts";
import { restoreGuard } from "../../../core/kernel/restore-hold.ts";
import { items } from "../../../core/kernel/schema.ts";
import { STALE } from "../../../core/kernel/vault-stale.ts";
import type { ShortLinkResolution } from "../../fetch/core/fetch-link.ts";
import {
  type Existing,
  type Paste,
  type Saved,
  holdsNoItem,
  writeQueued,
} from "../../item/core/item-rows.ts";
import { itemRead } from "../../item/core/item-selection.ts";
import {
  type AliasedItem,
  holdsAlias,
  holdsNoFailedItem,
  holdsNoRival,
  itemAddress,
  promotableFailedItem,
  promotionClosingJobs,
  recordAlias,
} from "./short-link-aliases.ts";
import { saveUnresolved } from "./unresolved-save.ts";

export interface Resolved {
  readonly shortLink: string;
  readonly paste: Readonly<Paste>;
  readonly link: Readonly<Link>;
  readonly existing: Existing;
  readonly stale: Readonly<AliasedItem> | undefined;
}

interface Kept {
  readonly shortLink: string;
  readonly paste: Readonly<Paste>;
  readonly existing: Existing;
  readonly stale: Readonly<AliasedItem>;
}

export interface ShortLinkPaste {
  readonly pasted: string;
  readonly digest: Paste["digest"];
  readonly existing: Existing;
  readonly addedByToken: Paste["addedByToken"];
}

const PROMOTED_ITEM = 8;

const KEPT_ITEM = 2;

async function promotedAndKept(ports: Ports, resolved: Readonly<Resolved>): Promise<Saved | null> {
  const { paste, link } = resolved;
  const { db } = ports;
  const noRival = holdsNoRival(db, resolved, link);

  const promoted = await unlessRefused(() => {
    const promotable = promotableFailedItem(db, resolved, link.normalizedUrl);
    const changed = sql`(${items.source}, ${items.kind}) is not (${link.source}, ${link.kind})`;

    return db.batch([
      restoreGuard(db),
      insertGuard(db, noRival),
      ...STALE.itemChanged(db, sql`${promotable} and ${changed}`),
      ...promotionClosingJobs(db, resolved, link),
      recordAlias(db, resolved, paste.address, link),
      itemRead(db, eq(items.normalizedUrl, link.normalizedUrl)),
      db.delete(guards),
    ]);
  });

  const item = promoted?.[PROMOTED_ITEM][0];

  return item === undefined ? null : { kind: "saved", item, created: false };
}

function promotedOnRefresh(ports: Ports, resolved: Readonly<Resolved>): Promise<Saved | null> {
  const { paste, link } = resolved;
  const { db } = ports;

  return writeQueued(ports, paste, link, {
    guard: holdsNoRival(db, resolved, link),
    before: promotionClosingJobs(db, resolved, link),
    after: [recordAlias(db, resolved, paste.address, link)],
  });
}

export async function saveResolved(
  ports: Ports,
  resolved: Readonly<Resolved>,
): Promise<Saved | null> {
  if (resolved.existing === "refresh") return promotedOnRefresh(ports, resolved);

  const { db } = ports;
  const { paste, link } = resolved;
  const noRival = holdsNoRival(db, resolved, link);

  const added = await writeQueued(ports, paste, link, {
    guard: sql`${noRival} and ${holdsNoItem(db, link.normalizedUrl)} and ${holdsNoFailedItem(db, resolved)}`,
    after: [recordAlias(db, resolved, paste.address, link)],
  });

  if (added !== null || !(await guardHolds(db, noRival))) return added;

  return promotedAndKept(ports, resolved);
}

async function saveKept(
  ports: Ports,
  { shortLink, paste, existing, stale }: Readonly<Kept>,
): Promise<Saved | null> {
  const { db } = ports;
  const holds = holdsAlias(db, shortLink, stale);

  if (existing === "refresh") {
    return writeQueued(ports, paste, stale, { guard: holds, after: [] });
  }

  const kept = await unlessRefused(() =>
    db.batch([
      restoreGuard(db),
      insertGuard(db, holds),
      itemRead(db, eq(items.id, stale.id)),
      db.delete(guards),
    ]),
  );

  const item = kept?.[KEPT_ITEM][0];

  return item === undefined ? null : { kind: "saved", item, created: false };
}

export function saveResolution(
  ports: Ports,
  { pasted, digest, existing, addedByToken }: Readonly<ShortLinkPaste>,
  resolution: Readonly<ShortLinkResolution>,
  stale: Readonly<AliasedItem> | undefined,
): Promise<Saved | null> {
  const shortLink = parseLink(pasted);

  if (
    stale !== undefined &&
    (resolution.kind === "failed" || redditRefOf(resolution.address) === null)
  ) {
    return saveKept(ports, {
      shortLink: shortLink.normalizedUrl,
      paste: { originalUrl: pasted, address: itemAddress(stale), digest, addedByToken },
      existing,
      stale,
    });
  }

  return resolution.kind === "failed"
    ? saveUnresolved(ports, {
        paste: { address: pasted, addedByToken },
        link: shortLink,
        fetched: resolution.fetched,
        existing,
      })
    : saveResolved(ports, {
        shortLink: shortLink.normalizedUrl,
        paste: { originalUrl: pasted, address: resolution.address, digest, addedByToken },
        link: parseLink(resolution.address),
        existing,
        stale,
      });
}
