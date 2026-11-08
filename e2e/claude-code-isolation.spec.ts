import { type Browser, expect, test } from "@playwright/test";
import { z } from "zod";

import { assertNoSecret } from "./ai.ts";
import { settled } from "./api.ts";
import { CLAUDE_PROVIDER, claudeScreen, claudeToken, CLAUDE_CLI } from "./claude-code.ts";
import {
  CANARY,
  MD_SENTINEL,
  SKILL_SENTINEL,
  markersPresent,
  pasteHostileThread,
  pasteWithoutWaiting,
  expectClaudeControls,
  CLAUDE_PLANT,
} from "./cli-sentinels.ts";
import {
  appShell,
  cliRuns,
  installCli,
  groupMembers,
  settingsView,
  taskFolders,
  taskRows,
  verifyCall,
} from "./cli.ts";
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

  installCli(fresh, CLAUDE_CLI);
  appShell(fresh, CLAUDE_PLANT);

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

test("hostile Item text runs no command, reads no file and loads no customization", async () => {
  const info = test.info();

  expectClaudeControls(screen);

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
  const call = verifyCall(screen, controller.signal).catch(() => null);

  await expect
    .poll(() => cliRuns(screen).length, { timeout: 60_000, intervals: [100] })
    .toBeGreaterThan(0);

  return { controller, call };
}

test("aborting a running task removes its process group and its folder", async () => {
  const { controller, call } = await startedRun();
  const [run] = cliRuns(screen);
  const leader = run?.pgid;

  expect(leader, "the child leads its own process group").toBeDefined();
  expect(taskFolders(screen)).toHaveLength(1);
  controller.abort();
  await call;
  await expect.poll(() => cliRuns(screen).length, { timeout: 30_000 }).toBe(0);
  expect(groupMembers(screen, leader ?? -1)).toEqual([]);
  await expect.poll(() => taskFolders(screen), { timeout: 30_000 }).toEqual([]);
  expect(taskRows(screen).at(-1)).toMatchObject({ state: "failed", refusal: "timeout" });
});

test("at most 2 tasks run at once and the third waits", async () => {
  let peak = 0;
  let finished = false;

  const calls = Promise.all([verifyCall(screen), verifyCall(screen), verifyCall(screen)]).then(
    (results) => {
      finished = true;

      return results;
    },
  );

  await expect
    .poll(
      () => {
        peak = Math.max(peak, cliRuns(screen).length);

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

test("stopping the Instance during an automatic Digest, with no request waiting, cleans up before it exits", async () => {
  const id = await pasteWithoutWaiting(screen.context.request);

  await expect
    .poll(() => cliRuns(screen).length, { timeout: 120_000, intervals: [100] })
    .toBeGreaterThan(0);
  const [folder] = taskFolders(screen);

  expect(folder).toBeDefined();
  screen.fresh.restart();
  expect(taskFolders(screen)).not.toContain(folder);
  expect(screen.fresh.logs()).toContain('"reason":"timeout","exit":null');
  await settled(screen.context.request, id, 420_000);
});

test("a CLI removed after start answers not-configured and reads as signed out", async () => {
  appShell(screen, "rm -f /data/cli/bin/claude");

  expect(await verifyCall(screen)).toEqual({
    kind: "refused",
    reason: "not-configured",
    status: null,
  });
  expect((await settingsView(screen)).signedIn).toEqual([]);
  expect(taskRows(screen).at(-1)).toMatchObject({ state: "failed", refusal: "not-configured" });
  expect(taskFolders(screen)).toEqual([]);
});
