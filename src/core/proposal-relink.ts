import { type SQL, type SQLWrapper, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

import type { Database } from "./ports.ts";
import { proposals } from "./schema.ts";

const other = alias(proposals, "other");

export type ProposalSubject = "tag" | "topic";

interface Columns {
  readonly id: Readonly<SQLWrapper>;
  readonly from: Readonly<SQLWrapper>;
  readonly into: Readonly<SQLWrapper>;
  readonly state: Readonly<SQLWrapper>;
}

// oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- a Drizzle table type holds mutable column objects, so it cannot be deeply readonly.
function columnsOf(row: typeof proposals | typeof other, subject: ProposalSubject): Columns {
  return {
    id: row.id,
    from: subject === "tag" ? row.fromTagId : row.fromTopicId,
    into: subject === "tag" ? row.intoTagId : row.intoTopicId,
    state: row.state,
  };
}

function names({ from, into }: Readonly<Columns>, subjectId: number): SQL {
  return sql`(${from} = ${subjectId} or ${into} = ${subjectId})`;
}

function partner({ from, into }: Readonly<Columns>, subjectId: number): SQL {
  return sql`(case when ${from} = ${subjectId} then ${into} else ${from} end)`;
}

function strength({ state }: Readonly<Columns>): SQL {
  return sql`(case ${state} when 'accepting' then 0 when 'rejected' then 1 else 2 end)`;
}

function outranks(first: Readonly<Columns>, second: Readonly<Columns>): SQL {
  return sql`(${strength(first)} < ${strength(second)} or (${strength(first)} = ${strength(second)} and ${first.id} < ${second.id}))`;
}

export function proposalRelinks(
  db: Database,
  subject: ProposalSubject,
  loser: number,
  survivor: number,
) {
  const outer = columnsOf(proposals, subject);
  const inner = columnsOf(other, subject);

  return [
    db
      .delete(proposals)
      .where(
        sql`(${outer.from} = ${loser} and ${outer.into} = ${survivor}) or (${outer.from} = ${survivor} and ${outer.into} = ${loser})`,
      ),
    db
      .delete(proposals)
      .where(
        sql`${names(outer, loser)} and exists (select 1 from ${proposals} as other where ${names(inner, survivor)} and ${partner(inner, survivor)} = ${partner(outer, loser)} and not ${outranks(outer, inner)})`,
      ),
    db
      .delete(proposals)
      .where(
        sql`${names(outer, survivor)} and exists (select 1 from ${proposals} as other where ${names(inner, loser)} and ${partner(inner, loser)} = ${partner(outer, survivor)} and ${outranks(inner, outer)})`,
      ),
    db
      .update(proposals)
      .set(
        subject === "tag"
          ? {
              fromTagId: sql`case when ${outer.from} = ${loser} then ${survivor} else ${outer.from} end`,
              intoTagId: sql`case when ${outer.into} = ${loser} then ${survivor} else ${outer.into} end`,
            }
          : {
              fromTopicId: sql`case when ${outer.from} = ${loser} then ${survivor} else ${outer.from} end`,
              intoTopicId: sql`case when ${outer.into} = ${loser} then ${survivor} else ${outer.into} end`,
            },
      )
      .where(names(outer, loser)),
  ];
}
