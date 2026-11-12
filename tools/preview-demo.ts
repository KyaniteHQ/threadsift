import { catalogKey } from "../src/core/catalog-key.ts";
import { CommandFailure } from "./command-failure.ts";
import { columnNames, rowNames } from "./preview-migrations.ts";

type Pair = { readonly from: string; readonly into: string; readonly reason: string };

export const demoTagMerges = [
  {
    from: "machine-learning",
    into: "Machine Learning",
    reason: "Same concept, machine-learning is just the hyphenated spelling of Machine Learning.",
  },
  {
    from: "LLMs",
    into: "LLM",
    reason: "LLMs is the plural of LLM, both name large language models.",
  },
  {
    from: "deep-learning",
    into: "deep learning",
    reason: "deep-learning and deep learning are the same term with a hyphen versus a space.",
  },
  {
    from: "nodejs",
    into: "node.js",
    reason: "nodejs and node.js are two spellings of the Node.js runtime.",
  },
  {
    from: "data-science",
    into: "data science",
    reason: "data-science and data science are the same term with a hyphen versus a space.",
  },
  {
    from: "web-assembly",
    into: "WebAssembly",
    reason: "web-assembly and WebAssembly are two spellings of the same technology.",
  },
] as const satisfies readonly Pair[];

export const demoTopicMerges = [
  {
    from: "ML",
    into: "Machine learning",
    reason: "ML is the usual short form of Machine learning, so both Topics cover the same field.",
  },
  {
    from: "Game",
    into: "Games",
    reason: "Game is the singular of Games, and both Topics hold writing about video games.",
  },
  {
    from: "Home lab",
    into: "Homelab",
    reason: "Home lab and Homelab are two spellings of the same hobby of running servers at home.",
  },
] as const satisfies readonly Pair[];

type DemoDigestPaste = {
  readonly url: string;
  readonly page: { readonly markdown: string; readonly title: string };
  readonly digest: {
    readonly title: string;
    readonly topic: string;
    readonly tags: readonly string[];
    readonly summary: string;
    readonly keyPoints: readonly string[];
  };
};

function demoDigestPaste(
  number: number,
  digest: { readonly topic: string; readonly tags: readonly string[] },
): DemoDigestPaste {
  const label = `Demo item ${String(number)}`;

  return {
    url: `https://example.com/demo/${String(number)}`,
    page: {
      markdown: Array.from({ length: 30 }, () => `${label} text.`).join("\n\n"),
      title: label,
    },
    digest: {
      title: label,
      ...digest,
      summary: `${label} summary.`,
      keyPoints: [`${label} key point.`],
    },
  };
}

const tagPastes = demoTagMerges.map(({ from, into }, index) =>
  demoDigestPaste(index + 1, { topic: "Demo topic", tags: [from, into] }),
);

const topicPastes = demoTopicMerges.flatMap(({ from, into }, index) => {
  const first = tagPastes.length + 2 * index + 1;

  return [
    demoDigestPaste(first, { topic: from, tags: [] }),
    demoDigestPaste(first + 1, { topic: into, tags: [] }),
  ];
});

export const demoDigestPastes: readonly DemoDigestPaste[] = [...tagPastes, ...topicPastes];

type Subject = {
  readonly kind: "tag-merge" | "topic-merge";
  readonly label: "Tags" | "Topics";
  readonly table: "tags" | "topics";
  readonly fromColumn: "from_tag_id" | "from_topic_id";
  readonly intoColumn: "into_tag_id" | "into_topic_id";
  readonly pairs: readonly Pair[];
};

const tagSubject: Subject = {
  kind: "tag-merge",
  label: "Tags",
  table: "tags",
  fromColumn: "from_tag_id",
  intoColumn: "into_tag_id",
  pairs: demoTagMerges,
};

const topicSubject: Subject = {
  kind: "topic-merge",
  label: "Topics",
  table: "topics",
  fromColumn: "from_topic_id",
  intoColumn: "into_topic_id",
  pairs: demoTopicMerges,
};

function quoted(text: string): string {
  return `'${text.replaceAll("'", "''")}'`;
}

function pairsCte({ pairs }: Subject): string {
  const rows = pairs
    .map(
      ({ from, into, reason }) =>
        `(${quoted(catalogKey(from))}, ${quoted(catalogKey(into))}, ${quoted(reason)})`,
    )
    .join(", ");

  return `WITH demo (from_key, into_key, reason) AS (VALUES ${rows})`;
}

function insertProposals(subject: Subject): string {
  const { kind, table, fromColumn, intoColumn } = subject;

  return `${pairsCte(subject)}
INSERT INTO proposals (kind, ${fromColumn}, ${intoColumn}, reason, state, created_at)
SELECT '${kind}', from_subject.id, into_subject.id, demo.reason, 'open', CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM demo
JOIN ${table} AS from_subject ON from_subject.key = demo.from_key
JOIN ${table} AS into_subject ON into_subject.key = demo.into_key
WHERE true
ON CONFLICT DO NOTHING`;
}

function missingPairs(subject: Subject, pinsReadable: boolean): string {
  const { kind, label, table, fromColumn, intoColumn } = subject;

  const accepted = pinsReadable
    ? `AND NOT EXISTS (SELECT 1 FROM pins WHERE pins.kind = '${kind}' AND pins.from_key = demo.from_key)`
    : "";

  return `${pairsCte(subject)}
SELECT '${label} ' || demo.from_key || ' and ' || demo.into_key AS name
FROM demo
WHERE NOT EXISTS (
  SELECT 1
  FROM proposals
  JOIN ${table} AS from_subject ON from_subject.id = proposals.${fromColumn}
  JOIN ${table} AS into_subject ON into_subject.id = proposals.${intoColumn}
  WHERE (from_subject.key = demo.from_key AND into_subject.key = demo.into_key)
    OR (from_subject.key = demo.into_key AND into_subject.key = demo.from_key)
) ${accepted}`;
}

export function seedDemoProposals(
  run: (args: readonly string[]) => string,
  scope: readonly string[],
): void {
  const columns = columnNames(run, scope, ["pins", "proposals"]);

  if (!columns.has("proposals.id")) return;

  const seeded = columns.has("proposals.from_topic_id")
    ? [
        { subject: tagSubject, pinsReadable: columns.has("pins.id") },
        { subject: topicSubject, pinsReadable: columns.has("pins.into_topic_id") },
      ]
    : [{ subject: tagSubject, pinsReadable: columns.has("pins.id") }];

  const inserts = seeded.map(({ subject }) => insertProposals(subject)).join(";\n");

  run(["d1", "execute", "DB", "--json", "--command", inserts, ...scope]);

  const missing = rowNames(
    run,
    scope,
    seeded.map(({ subject, pinsReadable }) => missingPairs(subject, pinsReadable)).join(";\n"),
  );

  if (missing.length > 0)
    throw new CommandFailure({
      kind: "check",
      reason: `Preview demo Proposals missing for the pairs ${missing.join(", ")}`,
      recovery:
        "Check that the preview's Tags and Topics carry the demo names and that Digest publication finished, then rerun deploy.",
    });
}
