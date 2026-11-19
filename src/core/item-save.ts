import { guardedWrite } from "./guards.ts";
import {
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
import { type Resolved, type Unresolved, saveResolved, saveUnresolved } from "./short-link-save.ts";
import type { SuppliedPage } from "./supplied-page.ts";

interface Linked {
  readonly kind: "link";
  readonly paste: Readonly<Paste>;
  readonly link: Readonly<Link>;
  readonly existing: Existing;
}

interface Paged {
  readonly kind: "page";
  readonly paste: Readonly<Paste>;
  readonly link: Readonly<Link>;
  readonly page: Readonly<SuppliedPage>;
  readonly keepsThread: boolean;
}

type ItemSave =
  | Linked
  | ({ readonly kind: "resolved" } & Resolved)
  | ({ readonly kind: "unresolved" } & Unresolved)
  | Paged;

export async function savedItem(
  ports: Ports,
  normalizedUrl: string,
  created: boolean,
): Promise<Saved> {
  const item = await itemAt(ports.db, normalizedUrl);

  await enqueueItemJobs(ports, item.id);

  return { kind: "saved", item, created };
}

async function saveLinked(
  ports: Ports,
  { paste, link, existing }: Readonly<Linked>,
): Promise<Saved> {
  const { db } = ports;

  const saved = await writeQueued(
    ports,
    paste,
    link,
    existing === "keep"
      ? { kind: "guarded", guard: holdsNoItem(db, link.normalizedUrl), after: [] }
      : { kind: "open" },
  );

  return saved ?? { kind: "saved", item: await itemAt(db, link.normalizedUrl), created: false };
}

async function savePaged(
  ports: Ports,
  { paste, link, page, keepsThread }: Readonly<Paged>,
): Promise<Saved | null> {
  const { db } = ports;
  const [insert, ...rest] = queuedRows(db, paste, link, JSON.stringify(page));
  const writes = [...closeItemJobs(db, ownerOf(link.normalizedUrl).id), ...rest];

  const [inserted] = keepsThread
    ? [await guardedWrite(db, hasNoThread(link.normalizedUrl), insert, writes)]
    : await db.batch([insert, ...writes]);

  return inserted === null ? null : savedItem(ports, link.normalizedUrl, inserted.length > 0);
}

export function writeItem(ports: Ports, request: Readonly<Linked>): Promise<Saved>;
export function writeItem(
  ports: Ports,
  request: Readonly<Exclude<ItemSave, Linked>>,
): Promise<Saved | null>;
export function writeItem(ports: Ports, request: Readonly<ItemSave>): Promise<Saved | null> {
  switch (request.kind) {
    case "link": {
      return saveLinked(ports, request);
    }

    case "resolved": {
      return saveResolved(ports, request);
    }

    case "unresolved": {
      return saveUnresolved(ports, request);
    }

    case "page": {
      return savePaged(ports, request);
    }

    default: {
      const exhaustive: never = request;

      return exhaustive;
    }
  }
}
