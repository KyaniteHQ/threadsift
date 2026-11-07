import { type Browser, expect, test } from "@playwright/test";
import { z } from "zod";

import { redirectListener } from "./ai-redirect.ts";
import { aiScreen, countRows, newSealingKey } from "./ai.ts";
import { SENT_DIGEST } from "./catalog.ts";
import { configureDigest } from "./digest.ts";
import { storeFileItem } from "./files.ts";
import { jobsOf, onFirstClaim, sweepNow } from "./ingest.ts";
import { isContainerTarget } from "./target.ts";

const WAIT = 120_000;

const UNREACHABLE_URL = "https://threadsift-digest-unreachable.invalid/v1";

const TEXT = "A short essay about harbour logistics, long enough to be digested.";

test.use({ trace: "off", video: "off", screenshot: "off" });

let screen: Awaited<ReturnType<typeof aiScreen>>;

test.afterEach(async () => {
  await screen?.close();
});

const Tasks = z.array(
  z.object({ itemId: z.number().nullable(), executor: z.string(), state: z.string() }),
);

function tasks() {
  return screen.fresh.query(
    "SELECT item_id AS itemId, executor, state FROM ai_tasks ORDER BY id",
    Tasks,
  );
}

const Counts = z.array(z.object({ n: z.number() }));

function digestsOf(itemId: number): number {
  return (
    screen.fresh.query(`SELECT count(*) AS n FROM digests WHERE item_id = ${itemId}`, Counts)[0]
      ?.n ?? -1
  );
}

async function providerCalls(): Promise<{
  baseUrl: string;
  calls: () => Promise<number | null>;
  close: () => Promise<void>;
}> {
  if (!isContainerTarget())
    return { baseUrl: UNREACHABLE_URL, calls: () => Promise.resolve(null), close: async () => {} };

  const listener = await redirectListener(screen.fresh);

  return {
    baseUrl: listener.baseUrl,
    calls: async () => (await listener.stats()).sourceRequests,
    close: listener.close,
  };
}

type Path = "model" | "caller";

function seedItems(path: Path) {
  const lost = storeFileItem(screen.fresh, {
    url: `https://example.com/lost-${path}`,
    title: "Lost",
    postText: TEXT,
  });

  const kept = storeFileItem(screen.fresh, {
    url: `https://example.com/kept-${path}`,
    title: "Kept",
    postText: TEXT,
  });

  if (path === "caller")
    screen.fresh.sql(
      `UPDATE items SET pending_digest = '${JSON.stringify(SENT_DIGEST)}' WHERE id IN (${lost}, ${kept})`,
    );

  return { lost, kept };
}

function expectOnlyKeptTask(path: Path, ids: { lost: number; kept: number }): void {
  const logs = screen.fresh.logs();

  expect(jobsOf(ids.lost, screen.fresh), "the trigger removed the job at its claim").toEqual([]);
  expect(tasks()).toMatchObject([
    { itemId: ids.kept, executor: path === "caller" ? "caller" : "http" },
  ]);
  expect(countRows(screen, "ai_tasks"), "no task for the Item that lost its claim").toBe(1);
  expect(digestsOf(ids.lost)).toBe(0);
  expect(logs.match(/"event":"job-claim-lost"/gu)).toHaveLength(1);

  const lostJob = /"event":"job-claim-lost","jobId":(?<id>\d+)/u.exec(logs)?.groups?.["id"];

  expect(
    logs.split("\n").filter((line) => line.includes(`"jobId":${lostJob},`)),
    "the lost job logs its lost claim and nothing else",
  ).toHaveLength(1);
}

async function proveLostClaim(browser: Browser, path: Path): Promise<void> {
  screen = await aiScreen(browser, newSealingKey());
  const ids = seedItems(path);
  const provider = await providerCalls();

  try {
    onFirstClaim(
      screen.fresh,
      `NEW.kind = 'digest' AND NEW.item_id = ${ids.lost}`,
      "DELETE FROM jobs WHERE id = NEW.id",
    );
    await configureDigest(screen, {
      provider: "openai-compatible",
      baseUrl: provider.baseUrl,
      model: "unreachable",
      key: "task-owner-proof",
    });
    expect(jobsOf(ids.lost, screen.fresh, "digest")).toHaveLength(1);
    expect(jobsOf(ids.kept, screen.fresh, "digest")).toHaveLength(1);

    if (!isContainerTarget()) await sweepNow(screen.context.request, screen.fresh);

    await expect
      .poll(() => screen.fresh.logs().includes('"event":"job-claim-lost"'), { timeout: WAIT })
      .toBe(true);
    await expect.poll(() => tasks().length, { timeout: WAIT }).toBe(1);
    expectOnlyKeptTask(path, ids);

    const calls = await provider.calls();

    if (calls !== null) expect(calls, "Provider requests").toBe(path === "model" ? 1 : 0);
  } finally {
    await provider.close();
  }
}

for (const path of ["model", "caller"] as const) {
  test(`a ${path} Digest whose job row is gone at its claim writes no AI task and ends as a lost claim, while the Item beside it keeps its task`, ({
    browser,
  }) => {
    test.setTimeout(WAIT * 2);

    return proveLostClaim(browser, path);
  });
}
