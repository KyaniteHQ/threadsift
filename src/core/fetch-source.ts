import { type ArchivedThread, archivedThread } from "./archive-fill.ts";
import { type Concluded, type Fetched, detailsOfSuppliedPage } from "./details.ts";
import { fetchLink, readOrTimeOut } from "./fetch-link.ts";
import { redditRefOf } from "./links.ts";
import type { Ports } from "./ports.ts";
import { SuppliedPageSchema } from "./supplied-page.ts";

interface JobSource {
  readonly address: string;
  readonly attempts: number;
  readonly itemId: number;
  readonly page: string | null;
}

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
  { address, attempts, itemId }: Readonly<JobSource>,
  deadline: AbortSignal,
): Promise<Fetched> {
  const ref = redditRefOf(address);

  const [fetched, archived] = await Promise.all([
    fetchLink(ports, address, attempts, deadline),
    ref === null ? null : archivedThread(ports, itemId, ref, deadline),
  ]);

  return archived === null || fetched.status === "waiting"
    ? fetched
    : archiveFilled(fetched, archived);
}

export function fetchedForJob(
  ports: SourcePorts,
  source: Readonly<JobSource>,
  deadline: AbortSignal,
): Promise<Fetched> {
  const { address, page } = source;

  return page === null
    ? fetchedWithArchive(ports, source, deadline)
    : readOrTimeOut(() =>
        detailsOfSuppliedPage(
          ports.pages,
          SuppliedPageSchema.parse(JSON.parse(page)),
          address,
          deadline,
        ),
      );
}
