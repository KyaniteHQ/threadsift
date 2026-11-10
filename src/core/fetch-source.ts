import { type ArchivedThread, archivedThread } from "./archive-fill.ts";
import { type Concluded, type Fetched, detailsOfSuppliedPage } from "./details.ts";
import { fetchLink, readOrTimeOut } from "./fetch-link.ts";
import { redditRefOf } from "./links.ts";
import type { Ports } from "./ports.ts";
import { SuppliedPageSchema } from "./supplied-page.ts";

type SourcePorts = Readonly<Pick<Ports, "db" | "ai" | "network" | "pages">>;

function archiveFilled(
  oembed: Readonly<Concluded>,
  { thread, archivedAt }: Readonly<ArchivedThread>,
): Concluded {
  const known = oembed.status === "ok" ? oembed.found : null;

  return {
    status: "ok",
    found: {
      title: known?.title ?? thread.title,
      author: known?.author ?? thread.author,
      community: known?.community ?? thread.community,
      content: { kind: "thread", thread, archivedAt },
    },
  };
}

async function fetchedWithArchive(
  ports: SourcePorts,
  { address, attempts, itemId }: Readonly<{ address: string; attempts: number; itemId: number }>,
  deadline: AbortSignal,
): Promise<Fetched> {
  const fetched = await fetchLink(ports, address, attempts, deadline);
  const ref = redditRefOf(address);

  if (ref === null || fetched.status === "waiting") return fetched;

  const archived = await archivedThread(ports, itemId, ref, deadline);

  return archived === null ? fetched : archiveFilled(fetched, archived);
}

export function fetchedForJob(
  ports: SourcePorts,
  {
    address,
    attempts,
    itemId,
    page,
  }: Readonly<{ address: string; attempts: number; itemId: number; page: string | null }>,
  deadline: AbortSignal,
): Promise<Fetched> {
  return page === null
    ? fetchedWithArchive(ports, { address, attempts, itemId }, deadline)
    : readOrTimeOut(() =>
        detailsOfSuppliedPage(
          ports.pages,
          SuppliedPageSchema.parse(JSON.parse(page)),
          address,
          deadline,
        ),
      );
}
