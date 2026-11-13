import { loggedOverview } from "./log-writes.ts";
import type { Database } from "./ports.ts";
import type { OverviewPrompt, OverviewRead } from "./topic-overview-input.ts";
import { overviewStored } from "./topic-overview-run.ts";

function revisedPage(
  topicId: number,
  read: Readonly<OverviewRead>,
  prompt: Readonly<OverviewPrompt>,
  overview: string | null,
) {
  const gone = new Set(read.removed);
  const replaced = new Set(prompt.included.map(({ id }) => id));

  const kept =
    prompt.current === null
      ? []
      : (read.page?.builtFrom ?? []).filter(({ item }) => !gone.has(item) && !replaced.has(item));

  return {
    topicId,
    overview,
    revision: (read.page?.revision ?? 0) + 1,
    builtFrom: [...kept, ...prompt.included.map(({ id, digest }) => ({ item: id, digest }))],
  };
}

export function storedPage(
  db: Database,
  {
    topicId,
    read,
    prompt,
    overview,
  }: Readonly<{
    topicId: number;
    read: Readonly<OverviewRead>;
    prompt: Readonly<OverviewPrompt>;
    overview: string | null;
  }>,
) {
  return [
    overviewStored(db, revisedPage(topicId, read, prompt, overview)),
    loggedOverview(db, topicId, {
      added: prompt.included.length,
      removed: read.removed.length,
    }),
  ];
}
