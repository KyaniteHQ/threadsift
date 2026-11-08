import { expect, test } from "@playwright/test";

import { AI_SETTINGS_ENDPOINT } from "./ai.ts";
import { CLAUDE_PROVIDER, claudeScreen, claudeToken, CLAUDE_CLI } from "./claude-code.ts";
import { cliRuns, installCli, taskRows, verifyCall } from "./cli.ts";
import {
  CODEX_PROVIDER,
  CODEX_AUTH,
  CODEX_CLI,
  saveRefreshedAuth,
  writeCodexAuth,
} from "./codex.ts";
import type { FreshScreen } from "./fresh-screen.ts";
import { isContainerTarget } from "./target.ts";

test.use({ trace: "off", video: "off", screenshot: "off" });

test.describe.configure({ timeout: 600_000 });

const claude = claudeToken();
const login = CODEX_AUTH;

test.skip(
  !isContainerTarget() || claude === undefined || login === undefined,
  "The shared limit needs the container, CLAUDE_CODE_OAUTH_TOKEN and CODEX_AUTH_JSON_B64; CI holds no Codex login.",
);

async function saveProvider(target: FreshScreen, provider: string): Promise<void> {
  const saved = await target.context.request.put(AI_SETTINGS_ENDPOINT, {
    data: { provider, model: "" },
  });

  expect(saved.status()).toBe(200);
}

function running(target: FreshScreen): string[] {
  return cliRuns(target)
    .map(({ cli }) => cli)
    .toSorted();
}

async function peakWhileFinishing(target: FreshScreen, done: () => boolean): Promise<number> {
  let peak = 0;

  await expect
    .poll(
      () => {
        peak = Math.max(peak, cliRuns(target).length);

        return done();
      },
      { timeout: 360_000, intervals: [100] },
    )
    .toBe(true);

  return peak;
}

test("Claude Code and Codex share one limit of 2 and each task goes to the Provider saved when it started", async ({
  browser,
}) => {
  const both = await claudeScreen(browser, claude);

  try {
    installCli(both, CLAUDE_CLI);
    installCli(both, CODEX_CLI);
    writeCodexAuth(both, login ?? "");
    await saveProvider(both, CLAUDE_PROVIDER);
    const first = verifyCall(both);

    await expect
      .poll(() => running(both), { timeout: 120_000, intervals: [100] })
      .toEqual(["claude"]);
    await saveProvider(both, CODEX_PROVIDER);
    const second = verifyCall(both);

    await expect
      .poll(() => running(both), { timeout: 120_000, intervals: [100] })
      .toEqual(["claude", "codex"]);
    await saveProvider(both, CLAUDE_PROVIDER);

    let finished = false;

    const all = Promise.all([first, second, verifyCall(both)]).then((results) => {
      finished = true;

      return results;
    });

    expect(await peakWhileFinishing(both, () => finished)).toBe(2);
    expect((await all).map(({ kind }) => kind)).toEqual(["done", "done", "done"]);
    expect(taskRows(both)).toMatchObject([
      { executor: "cli", provider: CLAUDE_PROVIDER, model: null, state: "done" },
      { executor: "cli", provider: CODEX_PROVIDER, model: null, state: "done" },
      { executor: "cli", provider: CLAUDE_PROVIDER, model: null, state: "done" },
    ]);
  } finally {
    saveRefreshedAuth(both);
    await both.close();
  }
});
