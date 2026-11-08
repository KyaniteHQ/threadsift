import { expect, test } from "@playwright/test";

import {
  GithubSaveResponseSchema,
  GithubSettingsViewSchema,
  GithubVerifyResultSchema,
} from "../src/core/github-contract.ts";
import { AI_TEXT } from "../web/src/ai-text.ts";
import { GITHUB_TEXT, TOKEN_STATES } from "../web/src/github-text.ts";
import { aiScreen, newSealingKey, openSealed } from "./ai.ts";
import { postLink } from "./api.ts";
import type { FreshScreen } from "./fresh-screen.ts";
import {
  attach,
  expectNoToken,
  githubRows,
  githubSection,
  jsonOf,
  pressGithub,
  saveInScreen,
  sealedGithubToken,
} from "./github-token.ts";
import {
  GITHUB_SETTINGS_ENDPOINT,
  deleteGithubToken,
  madeUpGithubToken,
  verifyGithubCall,
} from "./github.ts";
import { newRunId } from "./links.ts";

test.use({ trace: "off", video: "off", screenshot: "off" });

test.describe.configure({ timeout: 240_000 });

const REFUSAL = { kind: "refused", reason: "secret-missing", status: null } as const;

async function viewOf(screen: Readonly<FreshScreen>) {
  return jsonOf(
    await screen.context.request.get(GITHUB_SETTINGS_ENDPOINT),
    GithubSettingsViewSchema,
  );
}

async function expectBlockedWithoutKey(
  secret: string | undefined,
  browser: Parameters<typeof aiScreen>[0],
) {
  const screen = await aiScreen(browser, secret);

  try {
    const { request } = screen.context;
    const token = madeUpGithubToken("blocked");

    await screen.page.goto("/settings");
    const section = githubSection(screen.page);

    await expect(section.getByText(AI_TEXT["secret-missing"], { exact: true })).toBeVisible();
    await expect(
      section.getByRole("button", { name: GITHUB_TEXT.save, exact: true }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(await viewOf(screen)).toEqual({ token: "none", secretReady: false });

    const put = await request.put(GITHUB_SETTINGS_ENDPOINT, { data: { token } });
    const verify = await verifyGithubCall(request);

    expect(await jsonOf(put, GithubSaveResponseSchema)).toEqual(REFUSAL);
    expect(await jsonOf(verify, GithubVerifyResultSchema)).toEqual(REFUSAL);
    expect(githubRows(screen)).toBe(0);

    const removed = await deleteGithubToken(request);

    expect(await jsonOf(removed, GithubSettingsViewSchema)).toEqual({
      token: "none",
      secretReady: false,
    });
  } finally {
    await screen.close();
  }
}

async function expectUnreadableAfterChangedKey(screen: Readonly<FreshScreen>, token: string) {
  const { request } = screen.context;
  const put = await request.put(GITHUB_SETTINGS_ENDPOINT, { data: { token } });

  expect(await jsonOf(put, GithubSaveResponseSchema)).toEqual({
    token: "saved",
    secretReady: true,
  });

  screen.fresh.restart({ THREADSIFT_SECRET_KEY: newSealingKey() });
  await screen.page.goto("/settings");

  expect(await viewOf(screen)).toEqual({ token: "unreadable", secretReady: true });
  await expect(
    githubSection(screen.page).getByText(TOKEN_STATES.unreadable, { exact: true }),
  ).toBeVisible();
  expect(await jsonOf(await verifyGithubCall(request), GithubVerifyResultSchema)).toEqual(REFUSAL);

  const unreadable = await postLink(request, `https://github.com/example/unreadable-${newRunId()}`);

  expect(unreadable.body.item).toMatchObject({
    status: "ready",
    fetch: "github-token",
    title: null,
    postText: null,
    repository: null,
  });
}

async function replaceUnreadable(screen: Readonly<FreshScreen>, replacement: string, key: string) {
  const { page } = screen;
  const raw = await saveInScreen(page, replacement);

  await expect(githubSection(page).getByText(TOKEN_STATES.saved, { exact: true })).toBeVisible();
  expect(openSealed(sealedGithubToken(screen) ?? "", key)).toBe(replacement);

  const verify = await verifyGithubCall(screen.context.request);

  expect(await jsonOf(verify, GithubVerifyResultSchema)).not.toEqual(REFUSAL);

  return raw;
}

async function removeInEveryState(screen: Readonly<FreshScreen>, token: string): Promise<string> {
  const { request } = screen.context;

  screen.fresh.restart({ THREADSIFT_SECRET_KEY: newSealingKey() });
  expect(await viewOf(screen)).toEqual({ token: "unreadable", secretReady: true });

  const raw = await pressGithub(screen.page, GITHUB_TEXT.remove, "DELETE");

  expect(githubRows(screen)).toBe(0);

  await saveInScreen(screen.page, token);
  screen.fresh.restart({});
  expect(await viewOf(screen)).toEqual({ token: "unreadable", secretReady: false });

  const removed = await deleteGithubToken(request);

  expect(await jsonOf(removed, GithubSettingsViewSchema)).toEqual({
    token: "none",
    secretReady: false,
  });
  expect(githubRows(screen)).toBe(0);

  return raw;
}

test("a missing, malformed or changed sealing key blocks Save and Verify, and a valid key replaces an unreadable token while Remove works in every state", async ({
  browser,
}, info) => {
  await expectBlockedWithoutKey(undefined, browser);
  await expectBlockedWithoutKey("malformed", browser);

  const screen = await aiScreen(browser, newSealingKey());

  const [saved = "", replacement = ""] = ["saved", "replacement"].map((label) =>
    madeUpGithubToken(label),
  );

  try {
    await expectUnreadableAfterChangedKey(screen, saved);

    const second = newSealingKey();

    screen.fresh.restart({ THREADSIFT_SECRET_KEY: second });
    const replaced = await replaceUnreadable(screen, replacement, second);
    const removed = await removeInEveryState(screen, saved);
    const log = screen.fresh.logs();

    expectNoToken([replaced, removed, log].join("\n"), [saved, replacement]);
    await attach(info, "server-log", log);
  } finally {
    await screen.close();
  }
});
