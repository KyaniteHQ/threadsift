import { and, asc, count, eq, gt, inArray, min } from "drizzle-orm";

import type { Advance } from "./data-step-contract.ts";
import { dataStepRenames } from "./data-step-tables.ts";
import { STEP } from "./item-identity-staging.ts";
import type { Database } from "./ports.ts";
import { items } from "./schema.ts";

const REPORT_GROUPS = 20;
const IDENTITY_LOG_CHARS = 1000;

export function report(
  event: string,
  fields: Readonly<Record<string, number | string | readonly number[]>>,
) {
  console.warn(JSON.stringify({ event, ...fields }));
}

function groupsAfter(db: Database, from: number) {
  const leader = min(dataStepRenames.subject);

  return db
    .select({ identity: dataStepRenames.newKey, leader })
    .from(dataStepRenames)
    .where(eq(dataStepRenames.step, STEP))
    .groupBy(dataStepRenames.newKey)
    .having(gt(leader, from))
    .orderBy(asc(leader))
    .limit(REPORT_GROUPS);
}

async function membersOf(db: Database, identities: readonly string[]) {
  const [staged, holders] = await Promise.all([
    db
      .select({ id: dataStepRenames.subject, identity: dataStepRenames.newKey })
      .from(dataStepRenames)
      .where(and(eq(dataStepRenames.step, STEP), inArray(dataStepRenames.newKey, [...identities]))),
    db
      .select({ id: items.id, identity: items.normalizedUrl })
      .from(items)
      .where(inArray(items.normalizedUrl, [...identities])),
  ]);

  return [...staged, ...holders];
}

export async function reportCollisions(db: Database, from: number): Promise<Advance> {
  const groups = await groupsAfter(db, from);
  const last = groups.at(-1);

  if (last === undefined) {
    return { writes: [], cursor: "finish:0" };
  }

  const members = await membersOf(
    db,
    groups.map(({ identity }) => identity),
  );

  for (const { identity } of groups) {
    report("item-identity-collision", {
      identity: identity.slice(0, IDENTITY_LOG_CHARS),
      itemIds: members
        .filter((member) => member.identity === identity)
        .map(({ id }) => id)
        .toSorted((left, right) => left - right),
    });
  }

  return {
    writes: [],
    cursor: groups.length < REPORT_GROUPS ? "finish:0" : `report:${last.leader}`,
  };
}

export async function finish(db: Database): Promise<Advance> {
  const [left] = await db
    .select({ n: count() })
    .from(dataStepRenames)
    .where(eq(dataStepRenames.step, STEP));

  report("item-identity-finished", { collided: left?.n ?? 0 });

  return {
    writes: [db.delete(dataStepRenames).where(eq(dataStepRenames.step, STEP))],
    cursor: null,
  };
}
