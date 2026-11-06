import { type TestInfo, expect, test } from "@playwright/test";
import { z } from "zod";

import { AiSettingsViewSchema, VerifyResultSchema } from "../src/core/ai-contract.ts";
import { AI_TEXT } from "../web/src/ai-text.ts";
import { createToken } from "./access-helpers.ts";
import { newCode, newPassword } from "./access.ts";
import {
  aiCall,
  aiScreen,
  assertNoSecret,
  newSealingKey,
  proofProvider,
  saveInBrowser,
  searchArtifacts,
} from "./ai.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";

const hasCredentials =
  (process.env["CLOUDFLARE_WORKERS_AI_TOKEN"] ?? "") !== "" &&
  (process.env["CLOUDFLARE_ACCOUNT_ID"] ?? "") !== "";

test.use({ trace: "off", video: "off", screenshot: "off" });

test.describe.configure({ mode: "serial", timeout: 180_000 });

let screen: FreshScreen;

test.afterEach(async () => {
  await screen?.close();
});

const endpoint = "/api/settings/ai";
const verifyEndpoint = `${endpoint}/verify`;
const Counts = z.array(z.object({ count: z.number() }));

function countRows(table: string): number {
  return screen.fresh.query(`SELECT count(*) AS count FROM ${table}`, Counts)[0]?.count ?? -1;
}

test("AI settings refuse a missing or malformed sealing key without a write", async ({
  browser,
}) => {
  for (const secret of [undefined, "malformed"] as const) {
    screen = await aiScreen(browser, secret);
    await screen.page.goto("/settings");
    await expect(screen.page.getByText(AI_TEXT.secretMissing, { exact: true })).toBeVisible();
    await expect(
      screen.page.getByRole("button", { name: AI_TEXT.save, exact: true }),
    ).toBeDisabled();

    const raw = await aiCall(
      screen,
      "PUT",
      endpoint,
      JSON.stringify({
        provider: "openai-compatible",
        baseUrl: "https://example.com",
        model: "example",
        key: "not-a-real-key",
      }),
    );

    expect(VerifyResultSchema.parse(JSON.parse(raw))).toEqual({
      kind: "refused",
      reason: "secret-missing",
      status: null,
    });
    expect(countRows("settings")).toBe(0);
    await screen.close();
  }
});

test("agent tokens cannot read, save or Verify AI settings", async ({ browser }) => {
  screen = await openSignedIn(browser, newCode(), newPassword());
  const token = await createToken(screen.context.request, "AI access proof");

  for (const [method, path] of [
    ["GET", endpoint],
    ["PUT", endpoint],
    ["POST", verifyEndpoint],
  ] as const) {
    const response = await fetch(new URL(path ?? "", screen.fresh.url), {
      method,
      headers: { authorization: `Bearer ${token.value}` },
    });

    expect(response.status).toBe(403);
  }
});

type ProofProvider = Readonly<ReturnType<typeof proofProvider>>;

async function retainAndRestart(provider: ProofProvider): Promise<void> {
  const first =
    screen.fresh.query(
      "SELECT sealed_key AS value FROM settings",
      z.array(z.object({ value: z.string() })),
    )[0]?.value ?? "";

  expect(first.startsWith("v1.")).toBe(true);
  expect(first.includes(provider.key), "database contains no plaintext key").toBe(false);

  const resealed = AiSettingsViewSchema.parse(
    JSON.parse(
      await aiCall(
        screen,
        "PUT",
        endpoint,
        JSON.stringify({
          provider: "openai-compatible",
          baseUrl: provider.baseUrl,
          model: provider.model,
        }),
      ),
    ),
  );

  expect(resealed.settings?.keySet).toBe(true);

  const second =
    screen.fresh.query(
      "SELECT sealed_key AS value FROM settings",
      z.array(z.object({ value: z.string() })),
    )[0]?.value ?? "";

  expect(first === second, "a fresh IV changes the ciphertext when retaining the same key").toBe(
    false,
  );
  screen.fresh.restart();
  await screen.page.reload();
  const read = AiSettingsViewSchema.parse(JSON.parse(await aiCall(screen, "GET", endpoint)));
  expect(read.settings?.keySet).toBe(true);
  expect(read.secretReady).toBe(true);
}

async function verifyDigest(info: TestInfo): Promise<void> {
  await screen.page.getByRole("button", { name: AI_TEXT.verify, exact: true }).click();
  await expect(screen.page.getByText(AI_TEXT.verified, { exact: true })).toBeVisible({
    timeout: 120_000,
  });
  expect(countRows("items")).toBe(0);

  const task = screen.fresh.query(
    "SELECT state, result, attempts FROM ai_tasks",
    z.array(z.object({ state: z.string(), result: z.string(), attempts: z.number() })),
  );

  expect(task[0]?.state).toBe("done");
  expect(task[0]?.attempts).toBe(1);

  const stored = z
    .object({
      title: z.string(),
      topic: z.string(),
      tags: z.array(z.string()).max(3),
      summary: z.string(),
      keyPoints: z.array(z.string()).min(1),
    })
    .parse(JSON.parse(task[0]?.result ?? "null"));

  const result = VerifyResultSchema.parse({ kind: "done", taskId: 1, digest: stored });
  expect(result.kind).toBe("done");
  await info.attach("digest", { body: JSON.stringify(result), contentType: "application/json" });
}

async function refuseWrongKey(
  wrong: string,
  provider: ProofProvider,
  info: TestInfo,
): Promise<void> {
  await saveInBrowser(screen, wrong, provider.baseUrl);

  const responsePromise = screen.page.waitForResponse((response) =>
    response.url().endsWith(verifyEndpoint),
  );

  await screen.page.getByRole("button", { name: AI_TEXT.verify, exact: true }).click();
  const response = await responsePromise;
  const raw = await response.text();
  expect(VerifyResultSchema.parse(JSON.parse(raw))).toEqual({
    kind: "refused",
    reason: "wrong-key",
    status: 401,
  });
  await expect(screen.page.getByText(AI_TEXT["wrong-key"], { exact: true })).toBeVisible();
  const log = screen.fresh.logs();
  assertNoSecret(raw, [wrong, provider.key]);
  assertNoSecret(log, [wrong, provider.key]);
  await info.attach("verify-refusal", { body: raw, contentType: "application/json" });
  await info.attach("server-log", { body: log, contentType: "text/plain" });
  await privacyArtifacts(wrong, provider.key, info);
}

async function privacyArtifacts(wrong: string, key: string, info: TestInfo): Promise<void> {
  const tasks = screen.fresh.query(
    "SELECT kind, inputs, input_revision, executor, attempts, deadline, state, result, refusal, status FROM ai_tasks",
    z.array(z.record(z.string(), z.union([z.string(), z.number(), z.null()]))),
  );

  assertNoSecret(JSON.stringify(tasks), [wrong, key]);
  await info.attach("ai-task-rows", {
    body: JSON.stringify(tasks),
    contentType: "application/json",
  });
  const scanned = searchArtifacts(info.outputDir, [wrong, key]);
  await info.attach("privacy-search", {
    body: JSON.stringify({
      command:
        "search response, server log and Playwright output bytes for both key values and credential header names",
      response: "no matches",
      log: "no matches",
      artifactFiles: scanned,
      artifacts: "no matches",
    }),
    contentType: "application/json",
  });
}

test("saved keys are sealed, survive restart, and Verify returns a real Digest or a clean wrong-key refusal", async ({
  browser,
}, info) => {
  test.skip(
    !hasCredentials && process.env["THREADSIFT_AI_REQUIRED"] !== "true",
    "Workers AI credentials are unavailable; fork pull requests skip the real AI proof.",
  );
  expect(hasCredentials, "same-repository AI proof requires Workers AI credentials").toBe(true);
  screen = await aiScreen(browser, newSealingKey());
  const provider = proofProvider();
  const wrong = process.env["THREADSIFT_WRONG_AI_KEY"] ?? newSealingKey();
  await saveInBrowser(screen, provider.key, provider.baseUrl);

  await retainAndRestart(provider);
  await verifyDigest(info);
  await refuseWrongKey(wrong, provider, info);
  screen.fresh.sql("UPDATE settings SET sealed_key = 'v1.invalid.invalid'");
  await screen.page.reload();
  await expect(screen.page.getByText(AI_TEXT.secretMissing, { exact: true })).toBeVisible();
  expect(
    VerifyResultSchema.parse(JSON.parse(await aiCall(screen, "POST", verifyEndpoint))).kind,
  ).toBe("refused");
});
