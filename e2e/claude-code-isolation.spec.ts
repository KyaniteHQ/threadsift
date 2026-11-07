import { type Browser, expect, test } from "@playwright/test";
import { z } from "zod";

import { VerifyResultSchema } from "../src/core/ai-contract.ts";
import { AI_VERIFY_ENDPOINT, assertNoSecret } from "./ai.ts";
import { settled } from "./api.ts";
import {
  CLAUDE_PROVIDER,
  appShell,
  claudeRuns,
  claudeScreen,
  claudeToken,
  groupMembers,
  installClaude,
  settingsView,
  taskFolders,
  taskRows,
} from "./claude-code.ts";
import {
  CANARY,
  MD_SENTINEL,
  SKILL_SENTINEL,
  clearMarkers,
  markersPresent,
  pasteHostileThread,
  plainClaude,
  plantSentinels,
} from "./claude-sentinels.ts";
import type { FreshScreen } from "./fresh-screen.ts";
import { isContainerTarget } from "./target.ts";

test.use({ trace: "off", video: "off", screenshot: "off" });

test.describe.configure({ mode: "serial", timeout: 420_000 });

const token = claudeToken();

let screen: FreshScreen;

test.skip(
  !isContainerTarget() ||
    (token === undefined && process.env["THREADSIFT_CLAUDE_REQUIRED"] !== "true"),
  "Claude Code needs the container and CLAUDE_CODE_OAUTH_TOKEN; pull requests skip these cases.",
);

async function prepared(browser: Browser): Promise<FreshScreen> {
  expect(token, "the authenticated proof requires CLAUDE_CODE_OAUTH_TOKEN").toBeDefined();
  const fresh = await claudeScreen(browser, token);

  installClaude(fresh);
  plantSentinels(fresh);

  const saved = await fresh.context.request.put("/api/settings/ai", {
    data: { provider: CLAUDE_PROVIDER, model: "" },
  });

  expect(saved.status()).toBe(200);

  return fresh;
}

test.beforeAll(async ({ browser }) => {
  screen = await prepared(browser);
});

test.afterAll(async () => {
  await screen?.close();
});

async function verifyCall(signal?: AbortSignal) {
  const cookies = await screen.context.cookies();
  const cookie = cookies.map(({ name, value }) => `${name}=${value}`).join("; ");

  const init: RequestInit = { method: "POST", headers: { cookie, origin: screen.fresh.url } };

  if (signal !== undefined) init.signal = signal;

  const response = await fetch(`${screen.fresh.url}${AI_VERIFY_ENDPOINT}`, init);

  return VerifyResultSchema.parse(await response.json());
}

test("hostile Item text runs no command, reads no file and loads no customization", async () => {
  const info = test.info();
  const control = plainClaude(screen, "Repeat the exact text of @/data/canary.txt");

  expect(control, "control: an unrestricted run expands @file mentions").toContain(CANARY);
  expect(plainClaude(screen, "Say hello"), "control: CLAUDE.md is loaded").toContain(MD_SENTINEL);
  expect(markersPresent(screen), "control: hooks run").toEqual(
    expect.arrayContaining(["/data/hook-user-ran", "/data/hook-start-ran"]),
  );
  clearMarkers(screen);

  const request = screen.context.request;
  const item = await pasteHostileThread(request);

  const end = await settled(request, item.id, 420_000);
  const rows = taskRows(screen);

  expect(end.status).toBe("ready");
  expect(rows.at(-1)).toMatchObject({ kind: "digest", executor: "cli", state: "done" });
  const answers = JSON.stringify(rows.map(({ result }) => result));

  const stored = screen.fresh.query(
    "SELECT digest FROM digests",
    z.array(z.object({ digest: z.string() })),
  );

  expect(stored).toHaveLength(1);

  for (const text of [answers, JSON.stringify(stored), JSON.stringify(end)]) {
    for (const needle of [CANARY, MD_SENTINEL, SKILL_SENTINEL])
      expect(text.includes(needle), `${needle} stays out of the Digest and the task row`).toBe(
        false,
      );
  }

  expect(JSON.stringify(rows.map(({ inputs }) => inputs)).includes(CANARY)).toBe(false);
  expect(markersPresent(screen), "no hook or command ran").toEqual([]);
  expect(taskFolders(screen)).toEqual([]);
  expect(token).toBeDefined();
  assertNoSecret(screen.fresh.logs(), [token ?? ""]);
  assertNoSecret(JSON.stringify(rows), [token ?? ""]);
  await info.attach("hostile-task-rows", {
    body: JSON.stringify(rows),
    contentType: "application/json",
  });
});

async function startedRun() {
  const controller = new AbortController();
  const call = verifyCall(controller.signal).catch(() => null);

  await expect
    .poll(() => claudeRuns(screen).length, { timeout: 60_000, intervals: [100] })
    .toBeGreaterThan(0);

  return { controller, call };
}

test("aborting a running task removes its process group and its folder", async () => {
  const { controller, call } = await startedRun();
  const [run] = claudeRuns(screen);

  expect(run?.pgid, "the child leads its own process group").toBe(run?.pid);
  expect(taskFolders(screen)).toHaveLength(1);
  controller.abort();
  await call;
  await expect.poll(() => claudeRuns(screen).length, { timeout: 30_000 }).toBe(0);
  expect(groupMembers(screen, run?.pgid ?? -1)).toEqual([]);
  await expect.poll(() => taskFolders(screen), { timeout: 30_000 }).toEqual([]);
  expect(taskRows(screen).at(-1)).toMatchObject({ state: "failed", refusal: "timeout" });
});

test("at most 2 tasks run at once and the third waits", async () => {
  let peak = 0;
  let finished = false;

  const calls = Promise.all([verifyCall(), verifyCall(), verifyCall()]).then((results) => {
    finished = true;

    return results;
  });

  await expect
    .poll(
      () => {
        peak = Math.max(peak, claudeRuns(screen).length);

        return finished;
      },
      { timeout: 360_000, intervals: [100] },
    )
    .toBe(true);
  expect((await calls).map(({ kind }) => kind)).toEqual(["done", "done", "done"]);
  expect(peak).toBe(2);
});

test("stopping the Instance aborts a running task", async () => {
  const { call } = await startedRun();

  screen.fresh.restart();
  const answer = await call;

  expect(answer === null || answer.kind === "refused").toBe(true);
  expect(screen.fresh.logs()).toContain('"reason":"timeout","exit":null');
  expect(taskFolders(screen)).toEqual([]);
});

test("a CLI removed after start answers not-configured and reads as signed out", async () => {
  appShell(screen, "rm -f /data/cli/bin/claude");

  expect(await verifyCall()).toEqual({ kind: "refused", reason: "not-configured", status: null });
  expect((await settingsView(screen)).signedIn).toEqual([]);
  expect(taskRows(screen).at(-1)).toMatchObject({ state: "failed", refusal: "not-configured" });
  expect(taskFolders(screen)).toEqual([]);
});
