import { type SQL, type SQLWrapper, asc, eq, getTableColumns, inArray, sql } from "drizzle-orm";

import { type Anchor, anchorIn } from "./highlight-anchor.ts";
import type { AnchoredOutcome, SettledOutcome } from "./job-outcome.ts";
import type { Database } from "./ports.ts";
import { publishedGeneration } from "./reddit-thread.ts";
import { type HighlightRow, highlights, items } from "./schema.ts";
import { projectText } from "./text-projection.ts";

export interface AnchorSnapshot {
  readonly itemId: number | null;
  readonly threaded: boolean;
  readonly highlights: readonly Readonly<HighlightRow>[];
}

interface DisplayedAfter {
  readonly post?: string | null | undefined;
  readonly comments?: readonly Readonly<{ id: string; body: string | null }>[] | undefined;
}

export interface Publication {
  readonly owner: Readonly<SQLWrapper>;
  readonly displayed: (
    snapshot: Readonly<AnchorSnapshot>,
  ) => DisplayedAfter | Promise<DisplayedAfter>;
}

export function displayedBesideThread(after: Readonly<DisplayedAfter>): Publication["displayed"] {
  return ({ threaded }) => ({ post: after.post, comments: threaded ? undefined : after.comments });
}

type Project = (key: string, markdown: string) => string;

function memoProjection(): Project {
  const known = new Map<string, string>();

  return (key, markdown) => {
    const cached = known.get(key);

    if (cached !== undefined) return cached;

    const text = projectText(markdown);
    known.set(key, text);

    return text;
  };
}

export function anchorReads(db: Database, owner: Readonly<SQLWrapper>) {
  return [
    db
      .select({
        itemId: items.id,
        threaded: sql<boolean>`exists (${publishedGeneration(items.id)})`.mapWith(Boolean),
      })
      .from(items)
      .where(sql`${owner}`),
    db
      .select(getTableColumns(highlights))
      .from(highlights)
      .innerJoin(items, eq(items.id, highlights.itemId))
      .where(sql`${owner}`)
      .orderBy(asc(highlights.id)),
  ] as const;
}

export function snapshotOf([[item], held]: Readonly<
  [readonly Readonly<{ itemId: number; threaded: boolean }>[], readonly Readonly<HighlightRow>[]]
>): AnchorSnapshot {
  return item === undefined
    ? { itemId: null, threaded: false, highlights: [] }
    : { ...item, highlights: held };
}

async function anchorSnapshot(db: Database, owner: Readonly<SQLWrapper>): Promise<AnchorSnapshot> {
  return snapshotOf(await db.batch(anchorReads(db, owner)));
}

export function commentIdsOf(snapshot: Readonly<AnchorSnapshot>): string[] {
  return [...new Set(snapshot.highlights.flatMap(({ commentId }) => commentId ?? []))];
}

function anchorsHold(owner: Readonly<SQLWrapper>, snapshot: Readonly<AnchorSnapshot>): SQL {
  if (snapshot.itemId === null) return sql`not exists (select 1 from ${items} where ${owner})`;

  const ids = JSON.stringify(snapshot.highlights.map(({ id }) => id));

  return sql`exists (select 1 from ${items} where ${items.id} = ${snapshot.itemId} and exists (${publishedGeneration(items.id)}) = ${snapshot.threaded ? 1 : 0} and (select json_group_array(id) from (select ${highlights.id} as id from ${highlights} where ${highlights.itemId} = ${items.id} order by ${highlights.id})) = ${ids})`;
}

function anchorOf(
  row: Readonly<HighlightRow>,
  after: Readonly<DisplayedAfter>,
  project: Project,
): Anchor | null {
  const selector = { exact: row.exact, prefix: row.prefix, suffix: row.suffix };

  if (row.commentId === null) {
    return after.post === undefined ? null : anchorIn(project("post", after.post ?? ""), selector);
  }

  if (after.comments === undefined) return null;

  const body = after.comments.find(({ id }) => id === row.commentId)?.body;

  return body === undefined || body === null
    ? { status: "gone" }
    : anchorIn(project(row.commentId, body), selector);
}

function anchorWrites(
  db: Database,
  snapshot: Readonly<AnchorSnapshot>,
  after: Readonly<DisplayedAfter>,
  project: Project,
) {
  if (snapshot.highlights.length === 0) return [];

  const places = snapshot.highlights.flatMap((row) => {
    const anchor = anchorOf(row, after, project);

    return anchor === null
      ? []
      : [
          {
            id: row.id,
            status: anchor.status,
            start: anchor.status === "attached" ? anchor.start : null,
          },
        ];
  });

  if (places.length === 0) return [];

  const json = JSON.stringify(places);

  const placed = (field: "status" | "start") =>
    sql`(select json_extract(value, ${`$.${field}`}) from json_each(${json}) where json_extract(value, '$.id') = ${highlights.id})`;

  return [
    db
      .update(highlights)
      .set({ status: placed("status"), start: placed("start") })
      .where(
        inArray(highlights.id, sql`(select json_extract(value, '$.id') from json_each(${json}))`),
      ),
  ];
}

async function anchoredAttempt(
  db: Database,
  outcome: SettledOutcome,
  publication: Readonly<Publication>,
  snapshot: Readonly<AnchorSnapshot>,
  project: Project,
): Promise<AnchoredOutcome> {
  const after = await publication.displayed(snapshot);

  return {
    ...outcome,
    writes: [...outcome.writes, ...anchorWrites(db, snapshot, after, project)],
    precondition: {
      holds: anchorsHold(publication.owner, snapshot),
      rebuild: async () =>
        anchoredAttempt(
          db,
          outcome,
          publication,
          await anchorSnapshot(db, publication.owner),
          project,
        ),
    },
  };
}

export async function anchoredOutcome(
  db: Database,
  outcome: SettledOutcome,
  publication: Readonly<Publication>,
  taken?: Readonly<AnchorSnapshot>,
): Promise<AnchoredOutcome> {
  const snapshot = taken ?? (await anchorSnapshot(db, publication.owner));

  return anchoredAttempt(db, outcome, publication, snapshot, memoProjection());
}
