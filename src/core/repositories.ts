import { eq } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import type { Fetched, Repository } from "./details.ts";
import type { Database } from "./ports.ts";
import { githubRepos, items } from "./schema.ts";
import { repositoryPartWrites } from "./search.ts";

export const REPOSITORY_COLUMNS = {
  description: githubRepos.description,
  stars: githubRepos.stars,
  language: githubRepos.language,
  license: githubRepos.license,
  topics: githubRepos.topics,
  pushedAt: githubRepos.pushedAt,
};

export function repositoryWrites(
  db: Database,
  itemId: number,
  repository: Readonly<Repository>,
): readonly BatchItem<"sqlite">[] {
  return [
    db
      .insert(githubRepos)
      .values({ itemId, ...repository })
      .onConflictDoUpdate({ target: githubRepos.itemId, set: repository }),
    ...repositoryPartWrites(db, eq(items.id, itemId)),
  ];
}

export function fetchedRepository(fetched: Readonly<Fetched>): Repository | null {
  if (fetched.status !== "ok") return null;

  const { content } = fetched.found;

  return content?.kind === "github-repo" ? content.repository : null;
}
