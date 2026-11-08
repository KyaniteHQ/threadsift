import { expect, test } from "@playwright/test";

import { GithubSettingsViewSchema } from "../src/core/github-contract.ts";
import { GITHUB_TEXT, TOKEN_STATES } from "../web/src/github-text.ts";
import { aiScreen, newSealingKey, openSealed, saveInBrowser } from "./ai.ts";
import type { FreshScreen } from "./fresh-screen.ts";
import {
  aiRow,
  attach,
  expectNoToken,
  fillToken,
  githubRows,
  githubSection,
  jsonOf,
  pressGithub,
  saveInScreen,
  sealedGithubToken,
} from "./github-token.ts";
import { GITHUB_SETTINGS_ENDPOINT, deleteGithubToken, madeUpGithubToken } from "./github.ts";

test.use({ trace: "off", video: "off", screenshot: "off" });

test.describe.configure({ timeout: 240_000 });

interface Run {
  readonly screen: FreshScreen;
  readonly secret: string;
  readonly tokens: readonly string[];
  readonly captured: string[];
}

function tokenAt(run: Readonly<Run>, index: number): string {
  const token = run.tokens[index];

  if (token === undefined) throw new Error(`no token ${index}`);

  return token;
}

async function startEmpty({ screen }: Readonly<Run>): Promise<void> {
  const { page } = screen;
  await page.goto("/settings");
  const section = githubSection(page);

  await expect(section.getByText(TOKEN_STATES.none, { exact: true })).toBeVisible();

  for (const name of [GITHUB_TEXT.verify, GITHUB_TEXT.remove])
    await expect(section.getByRole("button", { name, exact: true })).toHaveAttribute(
      "aria-disabled",
      "true",
    );

  await fillToken(page, "has a space");
  await section.getByRole("button", { name: GITHUB_TEXT.save, exact: true }).click();
  await expect(section.getByText(GITHUB_TEXT.invalidToken, { exact: true })).toBeVisible();
  expect(githubRows(screen), "a token with a space is not sent").toBe(0);
}

async function saveAndReplace(run: Readonly<Run>): Promise<void> {
  const { screen, secret, captured } = run;
  const { page } = screen;
  const section = githubSection(page);

  captured.push(await saveInScreen(page, tokenAt(run, 0)));
  await expect(section.getByText(TOKEN_STATES.saved, { exact: true })).toBeVisible();
  await expect(section.getByText(GITHUB_TEXT.saved, { exact: true })).toBeVisible();
  expect(aiRow(screen), "the AI settings are not set yet").toEqual([]);

  const sealedFirst = sealedGithubToken(screen) ?? "";

  expect(openSealed(sealedFirst, secret), "the sealing key opens the saved token").toBe(
    tokenAt(run, 0),
  );
  expect(sealedFirst.includes(tokenAt(run, 0)), "the database holds no plaintext token").toBe(
    false,
  );

  captured.push(await saveInScreen(page, tokenAt(run, 1)));

  const sealedSecond = sealedGithubToken(screen) ?? "";

  expect(sealedSecond === sealedFirst, "a replacement uses a new seal").toBe(false);
  expect(openSealed(sealedSecond, secret), "the replacement opens to the new token").toBe(
    tokenAt(run, 1),
  );
  expect(() => openSealed(sealedSecond, newSealingKey())).toThrow();
  expect(githubRows(screen)).toBe(1);
}

async function restartKeepsToken({ screen }: Readonly<Run>): Promise<void> {
  screen.fresh.restart();
  await screen.page.reload();

  const response = await screen.context.request.get(GITHUB_SETTINGS_ENDPOINT);

  expect(await jsonOf(response, GithubSettingsViewSchema)).toEqual({
    token: "saved",
    secretReady: true,
  });
  await expect(
    githubSection(screen.page).getByText(TOKEN_STATES.saved, { exact: true }),
  ).toBeVisible();
}

async function removeAndKeepAiApart(run: Readonly<Run>): Promise<void> {
  const { screen, captured } = run;
  const { page } = screen;

  await saveInBrowser(screen, "ai-key-proof", "https://example.com", "example");

  const savedAi = aiRow(screen);

  expect(savedAi).toHaveLength(1);
  captured.push(await saveInScreen(page, tokenAt(run, 2)));
  expect(aiRow(screen), "a GitHub save leaves the AI settings as saved").toEqual(savedAi);

  captured.push(await pressGithub(page, GITHUB_TEXT.remove, "DELETE"));
  await expect(githubSection(page).getByText(TOKEN_STATES.none, { exact: true })).toBeVisible();
  expect(githubRows(screen)).toBe(0);
  expect(aiRow(screen), "a GitHub remove leaves the AI settings as saved").toEqual(savedAi);

  const again = await deleteGithubToken(screen.context.request);

  expect(await jsonOf(again, GithubSettingsViewSchema)).toEqual({
    token: "none",
    secretReady: true,
  });
}

async function aiSaveLeavesTokenAlone(run: Readonly<Run>): Promise<void> {
  const { screen, captured } = run;

  captured.push(await saveInScreen(screen.page, tokenAt(run, 3)));

  const sealed = sealedGithubToken(screen);
  const before = aiRow(screen);

  await saveInBrowser(screen, "ai-key-proof-two", "https://example.org", "example-two");
  expect(aiRow(screen)).not.toEqual(before);
  expect(sealedGithubToken(screen), "an AI save leaves the GitHub token as saved").toBe(sealed);
}

test("a token saved through the screen before any AI setup is sealed, replaced, kept across a restart and removed, and the AI settings stay as saved", async ({
  browser,
}, info) => {
  const secret = newSealingKey();
  const screen = await aiScreen(browser, secret);

  try {
    const run: Run = {
      screen,
      secret,
      tokens: ["first", "second", "third", "fourth"].map((label) => madeUpGithubToken(label)),
      captured: [],
    };

    await startEmpty(run);
    await saveAndReplace(run);
    await restartKeepsToken(run);
    await removeAndKeepAiApart(run);
    await aiSaveLeavesTokenAlone(run);

    const log = screen.fresh.logs();

    expectNoToken([...run.captured, log].join("\n"), run.tokens);
    await attach(info, "github-settings-responses", run.captured.join("\n"));
    await attach(info, "server-log", log);
  } finally {
    await screen.close();
  }
});
