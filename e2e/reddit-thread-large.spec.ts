import { expect, test } from "@playwright/test";
import { z } from "zod";

import { mainInstance } from "./access.ts";
import { attachJson } from "./card.ts";
import { sweepNow } from "./ingest.ts";
import { find, marker, post, postUrl, run } from "./thread-fixtures.ts";
import { AUTHORED_DIGEST, type Node, comment, savedThread, threadJson } from "./threads.ts";

test.describe.configure({ timeout: 300_000 });

const FOUR_MIB = 4 * 1024 * 1024;
const BIG_BODY_UNITS = 82_500;

function bigBody(end: string): string {
  return `${"lorem ipsum ".repeat(BIG_BODY_UNITS)}${end}`;
}

function paddedToFourMib(json: string): string {
  const bytes = Buffer.byteLength(json);

  if (bytes > FOUR_MIB) throw new Error(`the thread is ${bytes} bytes`);

  return json + " ".repeat(FOUR_MIB - bytes);
}

const Lengths = z.array(z.object({ id: z.string(), length: z.number() }));

function fourBigComments(id: string, tag = ""): string {
  return paddedToFourMib(
    threadJson(post(id, "A thread of long comments."), [
      comment("l1", "reader_a", bigBody(marker("endone", tag))),
      comment("l2", "reader_b", bigBody(marker("endtwo", tag))),
      comment("l3", "reader_c", bigBody(marker("endthree", tag))),
      comment("l4", "reader_d", bigBody(marker("endfour", tag))),
    ]),
  );
}

function storedLengths(itemId: number) {
  return mainInstance().query(
    `SELECT id, length(CAST(body AS BLOB)) AS length FROM reddit_comments WHERE item_id = ${itemId} ORDER BY position`,
    Lengths,
  );
}

test("a thread of exactly 4 MiB with four near-limit comments is stored in several statements, read back whole and searched to its last word", async ({
  request,
}, info) => {
  const id = `j${run}`;
  const content = fourBigComments(id);

  expect(Buffer.byteLength(content)).toBe(FOUR_MIB);

  const { status, item } = await savedThread(request, {
    url: postUrl(id),
    content,
    digest: { ...AUTHORED_DIGEST, keptComments: ["t1_l1", "t1_l4"] },
  });

  expect(status).toBe(201);
  expect(item.comments).toMatchObject({ received: 4, kept: 2 });
  expect(item.comments.nodes.map((node) => node.kind)).toEqual(["comment", "comment"]);

  const bodies = item.comments.nodes.flatMap((node) =>
    node.kind === "comment" ? [node.body] : [],
  );

  expect(bodies).toEqual([bigBody(marker("endone")), bigBody(marker("endfour"))]);

  const lengths = storedLengths(item.id);
  expect(lengths.map((row) => row.length)).toEqual(
    ["endone", "endtwo", "endthree", "endfour"].map((end) =>
      Buffer.byteLength(bigBody(marker(end))),
    ),
  );
  expect(await find(request, marker("endone"))).toEqual([item.id]);
  expect(await find(request, marker("endfour"))).toEqual([item.id]);
  expect(await find(request, marker("endtwo"))).toEqual([]);
  expect(await find(request, marker("endthree"))).toEqual([]);
  await attachJson(info, "large-lengths.json", JSON.stringify(lengths));
});

const SUBTREE = 13;

const KEPT_OFFSETS = [[7], [5, 12]] as const;

function wideTree() {
  const order: string[] = [];
  let next = 0;

  const make = (depth: number): Node => {
    next += 1;

    const id = `w${next}`;
    order.push(id);
    const children = depth === 2 ? [] : [make(depth + 1), make(depth + 1), make(depth + 1)];

    return comment(
      id,
      `reader_${next % 7}`,
      `A comment of the wide thread, number ${next}. ${"Some words. ".repeat(20)}`,
      children,
    );
  };

  return { tree: Array.from({ length: 50 }, () => make(0)), order };
}

test("a thread of 650 comments over 64 KiB is stored and its selection keeps tree order, with every ancestor of a Kept descendant present", async ({
  request,
}) => {
  const id = `k${run}`;
  const { tree, order } = wideTree();

  const kept = order.filter((_, index) =>
    (KEPT_OFFSETS[Math.floor(index / SUBTREE) % KEPT_OFFSETS.length] ?? []).some(
      (offset) => offset === index % SUBTREE,
    ),
  );

  const content = threadJson(post(id, "A wide thread."), tree);

  expect(Buffer.byteLength(content)).toBeGreaterThan(64 * 1024);

  const { item } = await savedThread(request, {
    url: postUrl(id),
    content,
    digest: { ...AUTHORED_DIGEST, keptComments: kept.map((name) => `t1_${name}`) },
  });

  expect(item.comments).toMatchObject({ received: 650, kept: kept.length });

  const { nodes } = item.comments;
  const shown = nodes.map((node) => node.id);
  const position = new Map(order.map((name, index) => [`t1_${name}`, index]));
  const known = shown.map((name) => position.get(name) ?? -1);
  expect(known, "preorder of the authored tree").toEqual(known.toSorted((a, b) => a - b));

  for (const node of nodes) {
    if (node.parentId !== null) {
      const parentAt = shown.indexOf(node.parentId);

      expect(parentAt, `the parent of ${node.id} is in the answer`).toBeGreaterThanOrEqual(0);
      expect(parentAt, `the parent of ${node.id} comes first`).toBeLessThan(shown.indexOf(node.id));
    }
  }

  const keptNodes = nodes.filter((node) => node.kind === "comment");
  expect(keptNodes.map((node) => node.id)).toEqual(kept.map((name) => `t1_${name}`));
  expect([...new Set(keptNodes.map((node) => node.depth))].toSorted((a, b) => a - b)).toEqual([
    1, 2,
  ]);
  expect(nodes.filter((node) => node.kind === "stub").length).toBeGreaterThan(0);
});

const SearchLengths = z.array(z.object({ length: z.number() }));

function escapedBody(): string {
  return `${marker("openword")}\n${"a\n".repeat(399_000)}${marker("closeword")}`;
}

test("a Kept comment of 800,000 bytes whose escaped JSON is over 1,000,000 bytes is stored whole and its search parts are chunked", async ({
  request,
}) => {
  const id = `l${run}`;
  const body = escapedBody();

  expect(Buffer.byteLength(body)).toBeLessThan(1_000_000);
  expect(JSON.stringify(body).length).toBeGreaterThan(1_000_000);

  const { item } = await savedThread(request, {
    url: postUrl(id),
    content: threadJson(post(id, "A thread with one dense comment."), [
      comment("dense", "reader_a", body),
    ]),
    digest: { ...AUTHORED_DIGEST, keptComments: ["t1_dense"] },
  });

  expect(item.comments).toMatchObject({ received: 1, kept: 1 });
  expect(item.comments.nodes).toMatchObject([{ kind: "comment", id: "t1_dense", body }]);

  const parts = mainInstance().query(
    `SELECT length(body) AS length FROM search_parts WHERE item_id = ${item.id} AND kind = 'comment' ORDER BY id`,
    SearchLengths,
  );

  expect(parts.length).toBeGreaterThanOrEqual(7);
  expect(Math.max(...parts.map((part) => part.length))).toBeLessThanOrEqual(125_000);
  expect(parts.reduce((total, part) => total + part.length, 0)).toBe(body.length);
  expect(await find(request, marker("openword"))).toEqual([item.id]);
  expect(await find(request, marker("closeword"))).toEqual([item.id]);
});

test("the search reconciler writes the parts of Kept comments that total over 2,000,000 bytes, and the last Kept comment is found", async ({
  request,
}) => {
  const id = `p${run}`;
  const tag = "recon";

  const { item } = await savedThread(request, {
    url: postUrl(id),
    content: fourBigComments(id, tag),
    digest: { ...AUTHORED_DIGEST, keptComments: ["t1_l1", "t1_l2", "t1_l4"] },
  });

  const kept = storedLengths(item.id).filter((row) => row.id !== "t1_l3");
  expect(kept.reduce((total, row) => total + row.length, 0)).toBeGreaterThan(2_000_000);

  const instance = mainInstance();
  instance.sql(
    `DELETE FROM search_parts WHERE item_id = ${item.id} AND kind = 'comment'; DELETE FROM search_fingerprints WHERE item_id = ${item.id}`,
  );
  expect(await find(request, marker("endfour", tag))).toEqual([]);

  await sweepNow(request, instance);
  await expect
    .poll(() => find(request, marker("endfour", tag)), { timeout: 150_000 })
    .toEqual([item.id]);
  expect(await find(request, marker("endone", tag))).toEqual([item.id]);
  expect(await find(request, marker("endtwo", tag))).toEqual([item.id]);
  expect(await find(request, marker("endthree", tag))).toEqual([]);
});
