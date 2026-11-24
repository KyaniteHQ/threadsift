import type { Link } from "../../../core/contract/links.ts";
import type { SuppliedPage } from "../../../core/contract/supplied-page.ts";
import { guards } from "../../../core/kernel/guards.ts";
import { closeItemJobs } from "../../../core/kernel/job-close.ts";
import { enqueueItemJobs } from "../../../core/kernel/job-rows.ts";
import type { Ports } from "../../../core/kernel/ports.ts";
import {
  type Around,
  type Existing,
  type Paste,
  type Saved,
  guardedItemWrite,
  holdsNoItem,
  itemAt,
  queuedRows,
  writeQueued,
} from "../../item/core/item-rows.ts";
import { hasNoThread, ownerOf } from "../../thread/core/thread-store.ts";

export type { Existing, Paste, Saved } from "../../item/core/item-rows.ts";
export { type ShortLinkPaste, saveResolution, saveResolved } from "./short-link-save.ts";
export { saveUnresolved } from "./unresolved-save.ts";

export async function savedItem(
  ports: Ports,
  normalizedUrl: string,
  created: boolean,
): Promise<Saved> {
  const item = await itemAt(ports.db, normalizedUrl);

  await enqueueItemJobs(ports, item.id);

  return { kind: "saved", item, created };
}

export async function saveLinked(
  ports: Ports,
  paste: Readonly<Paste>,
  link: Readonly<Link>,
  existing: Existing,
): Promise<Saved> {
  const { db } = ports;

  const around: Around | undefined =
    existing === "keep"
      ? { guard: holdsNoItem(db, link.normalizedUrl), before: [], after: [] }
      : undefined;

  const saved = await writeQueued(ports, paste, link, around);

  return saved ?? { kind: "saved", item: await itemAt(db, link.normalizedUrl), created: false };
}

export async function savePaged(
  ports: Ports,
  paste: Readonly<Paste>,
  link: Readonly<Link>,
  page: Readonly<SuppliedPage>,
): Promise<Saved | null> {
  const { db } = ports;
  const { normalizedUrl } = link;
  const { heldGuard, insert, rest } = queuedRows(db, paste, link, JSON.stringify(page));
  const writes = [...closeItemJobs(db, ownerOf(normalizedUrl).id), ...rest];

  if (link.source === "reddit") {
    const inserted = await guardedItemWrite(
      db,
      hasNoThread(normalizedUrl),
      { heldGuard, insert },
      writes,
    );

    return inserted === null ? null : savedItem(ports, normalizedUrl, inserted.length > 0);
  }

  const [, inserted] = await db.batch([heldGuard, insert, ...writes, db.delete(guards)]);

  return savedItem(ports, normalizedUrl, inserted.length > 0);
}
