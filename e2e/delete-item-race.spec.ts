import { type Browser, expect, test } from "@playwright/test";
import { z } from "zod";

import { aiScreen, newSealingKey } from "./ai.ts";
import { SENT_DIGEST, agentHeaders } from "./catalog.ts";
import { expectNoOwnedRows, ownedRows, removeBehindTheApp } from "./deletion.ts";
import { configureDigest } from "./digest.ts";
import { storeFileItem } from "./files.ts";
import type { FreshScreen } from "./fresh-screen.ts";
import { STALLED, deferJobs, jobsOf, makeJobDue, onFirstClaim, sweepNow } from "./ingest.ts";
import { isContainerTarget } from "./target.ts";

const WAIT_MS = 150_000;

const UNREACHABLE_URL = "https://threadsift-delete-unreachable.invalid/v1";

const CLAIM_LOST = '"event":"job-claim-lost"';

test.use({ trace: "off", video: "off", screenshot: "off" });

test.describe.configure({ timeout: 360_000 });

let screen: FreshScreen;

test.afterEach(async () => {
  await screen?.close();
});

const Counts = z.array(z.object({ n: z.number() }));

function rowsIn(table: string): number | undefined {
  return screen.fresh.query(`SELECT count(*) AS n FROM ${table}`, Counts)[0]?.n;
}

async function pasteStalled(): Promise<number> {
  const response = await screen.context.request.post("/api/items", { data: { url: STALLED } });
  expect(response.status()).toBe(201);

  return z.object({ item: z.object({ id: z.number() }) }).parse(await response.json()).item.id;
}

async function callerDigestItem(browser: Browser, name: string) {
  screen = await aiScreen(browser, newSealingKey());

  const id = storeFileItem(screen.fresh, {
    url: `https://example.com/delete-${name}`,
    title: `Delete ${name}`,
    postText: "A short essay about harbour logistics, long enough to be digested.",
  });

  screen.fresh.sql(
    `UPDATE items SET pending_digest = '${JSON.stringify(SENT_DIGEST)}' WHERE id = ${id}`,
  );

  const release = deferJobs(screen.fresh, "digest");

  await configureDigest(screen, {
    provider: "openai-compatible",
    baseUrl: UNREACHABLE_URL,
    model: "unreachable",
    key: name,
  });
  release();

  return id;
}

test("a fetch job whose Item is deleted by the database between its claim and its finish writes nothing and ends as a lost claim", async ({
  browser,
}) => {
  screen = await aiScreen(browser, newSealingKey());

  onFirstClaim(screen.fresh, "NEW.kind = 'fetch'", "DELETE FROM items WHERE id = NEW.item_id");

  const id = await pasteStalled();

  await expect
    .poll(() => screen.fresh.logs().includes(CLAIM_LOST), { timeout: WAIT_MS })
    .toBe(true);
  expectNoOwnedRows(screen.fresh, id);
  expect(rowsIn("jobs")).toBe(0);
});

test("a Digest job whose Item is deleted by the database after its task row and before its publication writes nothing and ends as a lost claim", async ({
  browser,
}) => {
  const id = await callerDigestItem(browser, "race");

  screen.fresh.sql(
    `CREATE TRIGGER delete_at_task AFTER INSERT ON ai_tasks WHEN NEW.item_id = ${id} BEGIN ${removeBehindTheApp(id)}; END`,
  );

  const [job] = jobsOf(id, screen.fresh, "digest");
  expect(job, "the Digest job opened by the settings save").toBeDefined();
  makeJobDue(job?.id ?? 0, screen.fresh);

  if (!isContainerTarget()) await sweepNow(screen.context.request, screen.fresh);

  await expect
    .poll(() => screen.fresh.logs().includes(CLAIM_LOST), { timeout: WAIT_MS })
    .toBe(true);
  expectNoOwnedRows(screen.fresh, id);
  expect(rowsIn("ai_tasks"), "no AI task is left").toBe(0);
});

test("an HTTP delete of an Item whose fetch job or Digest job is queued leaves no job to run, and a sweep afterwards runs nothing", async ({
  browser,
}) => {
  const id = await callerDigestItem(browser, "queued");
  const token = await agentHeaders(screen);
  const releaseFetch = deferJobs(screen.fresh, "fetch");
  const pasted = await pasteStalled();
  releaseFetch();

  expect(jobsOf(id, screen.fresh).map(({ kind, state }) => `${kind} ${state}`)).toEqual([
    "digest queued",
  ]);
  expect(jobsOf(pasted, screen.fresh).map(({ kind, state }) => `${kind} ${state}`)).toEqual([
    "fetch queued",
  ]);

  for (const target of [id, pasted]) {
    expect(ownedRows(screen.fresh, target)["jobs"], `the open job of Item ${target}`).toBe(1);

    const deleted = await screen.context.request.delete(`/api/items/${target}`, { headers: token });
    expect(deleted.status()).toBe(204);
    expectNoOwnedRows(screen.fresh, target);
  }

  await sweepNow(screen.context.request, screen.fresh);
  const logs = screen.fresh.logs();
  expect(logs).not.toContain('"event":"job-attempt-failed"');
  expect(logs).not.toContain(CLAIM_LOST);
  expect(rowsIn("jobs")).toBe(0);
});
