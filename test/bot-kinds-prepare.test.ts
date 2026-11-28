import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import { executeClaimed } from "../src/core/compose/jobs.ts";
import type { OwnedJobKind } from "../src/core/contract/job-contract.ts";
import { KIND_CASES } from "./bot-kinds-cases.ts";
import { botInstance, openJobOf, selectGrokBot } from "./bot-kinds-fixtures.ts";
import { openJob, openJobOfKind, retireTasks } from "./bot-task-fixtures.ts";
import { jobRow, taskRows } from "./bot-task-rows.ts";
import type { Instance } from "./instance.ts";
import { paste } from "./library-fixtures.ts";
import { thread } from "./x-thread-fixtures.ts";

type Pasted = Omit<Parameters<typeof paste>[2], "url" | "content">;

interface XApiCase {
  readonly kind: OwnedJobKind;
  readonly items: readonly Pasted[];
}

const X_API_CASES: readonly XApiCase[] = [
  { kind: "digest", items: [{ title: "X", noDigest: true }] },
  {
    kind: "related_pick",
    items: [
      { title: "Quasar lattice", tags: ["quasar"] },
      { title: "Quasar notes", tags: ["quasar"] },
      { title: "Quasar lattice decoder", tags: ["quasar"] },
    ],
  },
  {
    kind: "topic_overview",
    items: [
      { title: "Alpha one", topic: "Alpha" },
      { title: "Alpha two", topic: "Alpha" },
    ],
  },
  {
    kind: "proposals",
    items: [
      { title: "A", tags: ["machine learning", "ml"] },
      { title: "B", tags: ["machine-learning"] },
    ],
  },
  {
    kind: "topic_proposals",
    items: [
      { title: "A", topic: "Machine learning" },
      { title: "B", topic: "machine-learning" },
      { title: "C", topic: "Games" },
    ],
  },
  {
    kind: "disagreement_proposals",
    items: [
      { title: "A", topic: "Alpha", summary: "Use a file copy." },
      { title: "B", topic: "Alpha", summary: "Never use a file copy." },
    ],
  },
];

async function xItems(instance: Instance, pasted: readonly Pasted[]): Promise<number[]> {
  const ids: number[] = [];

  for (const [at, fields] of pasted.entries()) {
    const id = `19000000000000003${String(at).padStart(2, "0")}`;

    // oxlint-disable-next-line eslint/no-await-in-loop -- each paste takes the next Item id.
    const item = await paste(instance, `x-${String(at)}`, {
      ...fields,
      url: `https://x.com/someone/status/${id}`,
      content: JSON.stringify(
        thread([], { id, text: `Quasar lattice decoder notes, part ${String(at)}.` }),
      ),
    });

    ids.push(item);
  }

  return ids;
}

function markedXApi(instance: Instance, read: boolean): void {
  instance.database.exec("update threads set x_api_read = ?", read ? 1 : 0);
}

async function ranJob(instance: Instance, kind: OwnedJobKind, itemId: number) {
  const job =
    kind === "related_pick"
      ? await openJob(instance, itemId)
      : await openJobOfKind(instance, { kind, itemId });

  await executeClaimed(instance.core, job);

  return job.id;
}

describe("what a kind does when there is nothing to ask the bot", () => {
  let instance: Instance;

  before(async () => {
    instance = await botInstance();
  });

  after(() => instance.close());

  it("settles a weekly run with no pairs to compare, closes the job and starts no task", async () => {
    instance.database.exec(
      "insert into items (id, source, kind, normalized_url, original_url, saved_at) values (1, 'article', 'article', 'https://example.com/1', 'https://example.com/1', 1)",
    );

    const job = await openJobOf(instance, { kind: "proposals", itemId: 1 });

    await selectGrokBot(instance);
    await executeClaimed(instance.core, job);

    assert.equal(jobRow(instance, job.id).state, "done");
    assert.equal(instance.database.rowCount("ai_tasks"), 0);
  });
});

describe("a kind whose input holds only Items read through the X API asks the Provider nothing and ends", () => {
  for (const xCase of X_API_CASES) {
    it(xCase.kind, async () => {
      const instance = await botInstance();

      try {
        const ids = await xItems(instance, xCase.items);
        const owner = ids.at(-1) ?? 0;

        await selectGrokBot(instance);
        markedXApi(instance, true);
        retireTasks(instance);

        const marked = await ranJob(instance, xCase.kind, owner);

        assert.deepEqual(
          [jobRow(instance, marked).state, taskRows(instance, "job_id = ?", marked).length],
          ["done", 0],
        );

        markedXApi(instance, false);

        const control = await ranJob(instance, xCase.kind, owner);

        assert.equal(taskRows(instance, "job_id = ?", control).length, 1);
      } finally {
        await instance.close();
      }
    });
  }
});

describe("a Digest of another Item carries no Topic or Tag name that only Items read through the X API use", () => {
  it("leaves out the names while the Items are marked, and sends them once the mark is gone", async () => {
    const instance = await botInstance();
    const SentSchema = z.object({ inputs: z.string(), context: z.string().nullable() });
    const sentText = (jobId: number) =>
      instance.database
        .rows(SentSchema, "select inputs, context from ai_tasks where job_id = ?", jobId)
        .map(({ inputs, context }) => `${inputs}${context ?? ""}`)
        .join("");

    try {
      await xItems(instance, [{ title: "X", topic: "Zephyr lattices", tags: ["zephyrtag"] }]);
      const article = await paste(instance, "article", { title: "Article", noDigest: true });

      await selectGrokBot(instance);
      markedXApi(instance, true);

      const marked = sentText(await ranJob(instance, "digest", article));

      markedXApi(instance, false);
      retireTasks(instance);

      const control = sentText(await ranJob(instance, "digest", article));

      assert.deepEqual(
        [marked.includes("Zephyr lattices"), marked.includes("zephyrtag"), marked.length > 0],
        [false, false, true],
      );
      assert.deepEqual(
        [control.includes("Zephyr lattices"), control.includes("zephyrtag")],
        [true, true],
      );
    } finally {
      await instance.close();
    }
  });
});

describe("the payload of each kind builds, so the send reaches the network and fails as unreachable", () => {
  for (const kindCase of KIND_CASES) {
    it(kindCase.kind, async () => {
      const instance = await botInstance();

      try {
        const owner = await kindCase.library(instance);
        const job = await openJobOf(instance, { kind: kindCase.kind, itemId: owner });

        await selectGrokBot(instance);
        await executeClaimed(instance.core, job);

        assert.deepEqual(
          taskRows(instance, "job_id = ?", job.id).map(({ state, refusal }) => [state, refusal]),
          [["failed", "unreachable"]],
        );
        assert.deepEqual(
          [jobRow(instance, job.id).state, jobRow(instance, job.id).attempts],
          ["queued", 1],
        );
      } finally {
        await instance.close();
      }
    });
  }
});
