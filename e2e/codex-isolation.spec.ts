import { type Browser, expect, test } from "@playwright/test";
import { z } from "zod";

import { assertNoSecret } from "./ai.ts";
import { settled } from "./api.ts";
import {
  AGENTS_SENTINEL,
  CANARY,
  SKILL_SENTINEL,
  expectCodexControls,
  markersPresent,
  pasteHostileThread,
  pasteWithoutWaiting,
  CODEX_PLANT,
} from "./cli-sentinels.ts";
import {
  appShell,
  cliRuns,
  installCli,
  saveProvider,
  groupMembers,
  taskFolders,
  taskRows,
  verifyCall,
} from "./cli.ts";
import {
  CODEX_PROVIDER,
  CODEX_AUTH,
  codexScreen,
  CODEX_CLI,
  saveRefreshedAuth,
  tokensOf,
  writeCodexAuth,
} from "./codex.ts";
import type { FreshScreen } from "./fresh-screen.ts";
import { isContainerTarget } from "./target.ts";

test.use({ trace: "off", video: "off", screenshot: "off" });

test.describe.configure({ mode: "serial", timeout: 420_000 });

const login = CODEX_AUTH;

let screen: FreshScreen;

test.skip(
  !isContainerTarget() || login === undefined,
  "Codex needs the container and CODEX_AUTH_JSON_B64; CI holds no Codex login, so these cases run on the owner's machine.",
);

function secrets(): string[] {
  return tokensOf(login ?? "");
}

async function prepared(browser: Browser): Promise<FreshScreen> {
  expect(login, "the isolation proof requires CODEX_AUTH_JSON_B64").toBeDefined();
  const fresh = await codexScreen(browser);

  installCli(fresh, CODEX_CLI);
  writeCodexAuth(fresh, login ?? "");
  appShell(fresh, CODEX_PLANT);
  await saveProvider(fresh, CODEX_PROVIDER);

  return fresh;
}

test.beforeAll(async ({ browser }) => {
  screen = await prepared(browser);
});

test.afterAll(async () => {
  saveRefreshedAuth(screen);
  await screen?.close();
});

test("a model that follows hostile Item text finds no command, file or customization to use in the Digest", async () => {
  const info = test.info();

  expectCodexControls(screen);

  const request = screen.context.request;
  const item = await pasteHostileThread(request);
  const end = await settled(request, item.id, 420_000);
  const rows = taskRows(screen);

  expect(end.status).toBe("ready");
  expect(rows.at(-1)).toMatchObject({
    kind: "digest",
    executor: "cli",
    provider: CODEX_PROVIDER,
    model: null,
    state: "done",
  });

  const stored = screen.fresh.query(
    "SELECT digest FROM digests",
    z.array(z.object({ digest: z.string() })),
  );

  expect(stored).toHaveLength(1);

  for (const text of [
    JSON.stringify(rows.map(({ result }) => result)),
    JSON.stringify(stored),
    JSON.stringify(end),
  ]) {
    for (const needle of [CANARY, AGENTS_SENTINEL, SKILL_SENTINEL])
      expect(text.includes(needle), `${needle} stays out of the Digest and the task row`).toBe(
        false,
      );
  }

  expect(markersPresent(screen), "no hook, MCP server or command ran").toEqual([]);
  expect(taskFolders(screen)).toEqual([]);
  assertNoSecret(screen.fresh.logs(), secrets());
  assertNoSecret(JSON.stringify(rows), secrets());
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

  expect(run?.cli).toBe("codex");
  expect(taskFolders(screen)).toHaveLength(1);
  controller.abort();
  await call;
  await expect.poll(() => cliRuns(screen).length, { timeout: 30_000 }).toBe(0);
  expect(groupMembers(screen, run?.pgid ?? -1)).toEqual([]);
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
  expect(screen.fresh.logs()).toContain('"provider":"codex","reason":"timeout","exit":null');
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
  await settled(screen.context.request, id, 420_000);
});
