import { guardedWrite } from "./guards.ts";
import {
  type Around,
  type Existing,
  type Paste,
  type Saved,
  holdsNoItem,
  itemAt,
  queuedRows,
  writeQueued,
} from "./item-rows.ts";
import { closeItemJobs } from "./job-close.ts";
import { enqueueItemJobs } from "./job-rows.ts";
import type { Link } from "./links.ts";
import type { Ports } from "./ports.ts";
import { hasNoThread, ownerOf } from "./reddit-thread.ts";
import type { SuppliedPage } from "./supplied-page.ts";

export type { Existing, Paste, Saved } from "./item-rows.ts";
export { saveResolved, saveUnresolved } from "./short-link-save.ts";

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
  const [insert, ...rest] = queuedRows(db, paste, link, JSON.stringify(page));
  const writes = [...closeItemJobs(db, ownerOf(normalizedUrl).id), ...rest];

  if (link.source === "reddit") {
    const inserted = await guardedWrite(db, hasNoThread(normalizedUrl), insert, writes);

    return inserted === null ? null : savedItem(ports, normalizedUrl, inserted.length > 0);
  }

  const [inserted] = await db.batch([insert, ...writes]);

  return savedItem(ports, normalizedUrl, inserted.length > 0);
}
