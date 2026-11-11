import { type SQL, type SQLWrapper, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

import type { Database } from "./ports.ts";
import { proposals } from "./schema.ts";

const other = alias(proposals, "other");

interface Columns {
  readonly id: Readonly<SQLWrapper>;
  readonly from: Readonly<SQLWrapper>;
  readonly into: Readonly<SQLWrapper>;
  readonly state: Readonly<SQLWrapper>;
}

const OUTER: Columns = {
  id: proposals.id,
  from: proposals.fromTagId,
  into: proposals.intoTagId,
  state: proposals.state,
};

const INNER: Columns = {
  id: other.id,
  from: other.fromTagId,
  into: other.intoTagId,
  state: other.state,
};

function names({ from, into }: Readonly<Columns>, tagId: number): SQL {
  return sql`(${from} = ${tagId} or ${into} = ${tagId})`;
}

function partner({ from, into }: Readonly<Columns>, tagId: number): SQL {
  return sql`(case when ${from} = ${tagId} then ${into} else ${from} end)`;
}

function decided({ state }: Readonly<Columns>): SQL {
  return sql`(case when ${state} in ('rejected', 'accepting') then 0 else 1 end)`;
}

function outranks(first: Readonly<Columns>, second: Readonly<Columns>): SQL {
  return sql`(${decided(first)} < ${decided(second)} or (${decided(first)} = ${decided(second)} and ${first.id} < ${second.id}))`;
}

function sharesPartner(
  first: Readonly<Columns>,
  firstTag: number,
  second: Readonly<Columns>,
  secondTag: number,
): SQL {
  return sql`(${names(second, secondTag)} and ${partner(second, secondTag)} = ${partner(first, firstTag)})`;
}

export function proposalRelinks(db: Database, loser: number, survivor: number) {
  return [
    db
      .delete(proposals)
      .where(
        sql`(${OUTER.from} = ${loser} and ${OUTER.into} = ${survivor}) or (${OUTER.from} = ${survivor} and ${OUTER.into} = ${loser})`,
      ),
    db
      .delete(proposals)
      .where(
        sql`${names(OUTER, loser)} and exists (select 1 from ${proposals} as other where ${sharesPartner(OUTER, loser, INNER, survivor)} and not ${outranks(OUTER, INNER)})`,
      ),
    db
      .delete(proposals)
      .where(
        sql`${names(OUTER, survivor)} and exists (select 1 from ${proposals} as other where ${sharesPartner(OUTER, survivor, INNER, loser)} and ${outranks(INNER, OUTER)})`,
      ),
    db
      .update(proposals)
      .set({
        fromTagId: sql`case when ${OUTER.from} = ${loser} then ${survivor} else ${OUTER.from} end`,
        intoTagId: sql`case when ${OUTER.into} = ${loser} then ${survivor} else ${OUTER.into} end`,
      })
      .where(names(OUTER, loser)),
  ];
}
