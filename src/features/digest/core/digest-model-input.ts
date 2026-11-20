import { desc, eq } from "drizzle-orm";

import type { Database } from "../../../core/kernel/database.ts";
import { redditThreads } from "../../../core/kernel/schema.ts";
import { commentCandidates } from "../../thread/core/thread-selection.ts";
import type { DigestInput } from "./digest-input.ts";
import {
  type CatalogNames,
  type DigestPrompt,
  type LinkedPage,
  digestPrompt,
} from "./digest-prompt.ts";

async function joinedFollowUps(db: Database, itemId: number): Promise<number> {
  const [newest] = await db
    .select({ followUps: redditThreads.followUps })
    .from(redditThreads)
    .where(eq(redditThreads.itemId, itemId))
    .orderBy(desc(redditThreads.generation))
    .limit(1);

  return newest?.followUps ?? 0;
}

export async function modelInput(
  db: Database,
  item: Readonly<DigestInput>,
  postText: string | null,
  catalog: Readonly<CatalogNames>,
  page: Readonly<LinkedPage> | null,
): Promise<DigestPrompt> {
  const comments =
    item.source === "reddit" || item.source === "x"
      ? await commentCandidates(db, { itemId: item.id, generation: item.generation })
      : [];

  return digestPrompt(
    {
      title: item.title,
      source: item.source,
      postText,
      authorThread: item.source === "x" && (await joinedFollowUps(db, item.id)) > 0,
    },
    comments,
    catalog,
    page,
  );
}
