import { rowNames } from "./preview-migrations.ts";

const SCHEMA_PROBES = {
  proposals: { table: "proposals", column: "id" },
  topicProposals: { table: "proposals", column: "from_topic_id" },
  highlightProposals: { table: "proposals", column: "highlight_id" },
  overviewProposals: { table: "proposals", column: "topic_id" },
  disagreementProposals: { table: "proposals", column: "from_item_id" },
  pins: { table: "pins", column: "id" },
  topicPins: { table: "pins", column: "into_topic_id" },
  itemPins: { table: "pins", column: "from_item_id" },
} as const;

type ProbeName = keyof typeof SCHEMA_PROBES;

export type SchemaFacts = readonly ProbeName[];

function isProbeName(name: string): name is ProbeName {
  return Object.hasOwn(SCHEMA_PROBES, name);
}

export function schemaFacts(
  run: (args: readonly string[]) => string,
  scope: readonly string[],
): SchemaFacts {
  const probes = Object.entries(SCHEMA_PROBES)
    .map(([fact, { table, column }]) => `('${fact}', '${table}', '${column}')`)
    .join(", ");

  const query = `WITH probe (fact, tbl, col) AS (VALUES ${probes})
SELECT probe.fact AS name
FROM probe
WHERE EXISTS (SELECT 1 FROM pragma_table_info(probe.tbl) WHERE name = probe.col)`;

  return rowNames(run, scope, query).filter((name) => isProbeName(name));
}
