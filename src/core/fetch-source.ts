import { type ArchivedThread, archivedThread } from "./archive-fill.ts";
import { type Concluded, type Fetched, detailsOfSuppliedPage } from "./details.ts";
import { fetchLink, readOrTimeOut } from "./fetch-link.ts";
import { guardHolds } from "./guards.ts";
import { redditRefOf, takesPage } from "./links.ts";
import { pluginPage } from "./plugin-fetch.ts";
import type { PageReader, Ports } from "./ports.ts";
import { noThreadFor } from "./reddit-thread.ts";
import { type SuppliedPage, SuppliedPageSchema } from "./supplied-page.ts";

interface JobSource {
  readonly address: string;
  readonly attempts: number;
  readonly itemId: number;
  readonly page: string | null;
}

type SourcePorts = Readonly<Pick<Ports, "db" | "secrets" | "network" | "pages" | "fetchers">>;

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

function suppliedDetails(
  pages: Readonly<PageReader>,
  page: SuppliedPage,
  address: string,
  deadline: AbortSignal,
): Promise<Concluded> {
  return readOrTimeOut(() => detailsOfSuppliedPage(pages, page, address, deadline));
}

async function fetchedByPlugin(
  { db, pages, network, fetchers }: SourcePorts,
  { address, itemId }: Readonly<JobSource>,
  deadline: AbortSignal,
): Promise<Concluded | null> {
  if (fetchers.length === 0 || !takesPage(address)) return null;

  if (redditRefOf(address) !== null && !(await guardHolds(db, noThreadFor(itemId)))) return null;

  if (!(await network.reachable(address, deadline))) return { status: "refused" };

  const result = await pluginPage(fetchers, address, deadline);

  if (result.kind === "unclaimed") return null;

  return result.kind === "failed"
    ? { status: result.status }
    : suppliedDetails(pages, result.page, address, deadline);
}

export async function fetchedForJob(
  ports: SourcePorts,
  source: Readonly<JobSource>,
  deadline: AbortSignal,
): Promise<Fetched> {
  const { address, page } = source;

  if (page !== null) {
    return suppliedDetails(
      ports.pages,
      SuppliedPageSchema.parse(JSON.parse(page)),
      address,
      deadline,
    );
  }

  return (
    (await fetchedByPlugin(ports, source, deadline)) ?? fetchedWithArchive(ports, source, deadline)
  );
}
