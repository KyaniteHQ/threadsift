import { type SQL, and, eq, sql } from "drizzle-orm";

import type { Digest } from "./ai-contract.ts";
import { catalogKey } from "./catalog-key.ts";
import type { Database } from "./ports.ts";
import { pins, tags } from "./schema.ts";

interface Resolution {
  readonly key: string;
  readonly pin: string;
}

export interface PinnedDigest {
  readonly tags: readonly string[];
  readonly renamed: boolean;
  readonly current: SQL;
}

export function renamedTags(
  names: readonly string[],
  rename: (key: string) => string | undefined,
): readonly string[] {
  const kept = new Map<string, string>();

  for (const name of names) {
    const renamed = rename(catalogKey(name)) ?? name;
    const key = catalogKey(renamed);

    if (!kept.has(key)) kept.set(key, renamed);
  }

  return [...kept.values()];
}

export function repointedPins(db: Database, loser: number, survivor: number) {
  return db.update(pins).set({ intoTagId: survivor }).where(eq(pins.intoTagId, loser));
}

function pinToken(id: number, intoTagId: number): string {
  return `${String(id)}:${String(intoTagId)}`;
}

function resolutionHolds(resolutions: readonly Readonly<Resolution>[]): SQL {
  const wanted = JSON.stringify(resolutions);

  return sql`not exists (select 1 from json_each(${wanted}) as wanted where coalesce((select ${pins.id} || ':' || ${pins.intoTagId} from ${pins} where ${pins.kind} = 'tag-merge' and ${pins.fromKey} = json_extract(wanted.value, '$.key')), '') <> json_extract(wanted.value, '$.pin'))`;
}

export async function pinnedDigest(
  db: Database,
  digest: Readonly<Pick<Digest, "tags">>,
): Promise<PinnedDigest> {
  const keys = [...new Set(digest.tags.map((name) => catalogKey(name)))];

  const found = await db
    .select({
      key: pins.fromKey,
      id: pins.id,
      intoTagId: pins.intoTagId,
      intoName: tags.name,
    })
    .from(pins)
    .innerJoin(tags, eq(tags.id, pins.intoTagId))
    .where(
      and(
        eq(pins.kind, "tag-merge"),
        sql`${pins.fromKey} in (select value from json_each(${JSON.stringify(keys)}))`,
      ),
    );

  const byKey = new Map(found.map((row) => [row.key, row]));

  const resolutions = keys.map((key): Resolution => {
    const row = byKey.get(key);

    return { key, pin: row === undefined ? "" : pinToken(row.id, row.intoTagId) };
  });

  const renamed = found.length > 0;

  return {
    tags: renamed ? renamedTags(digest.tags, (key) => byKey.get(key)?.intoName) : digest.tags,
    renamed,
    current: resolutionHolds(resolutions),
  };
}
