import { expect, test } from "@playwright/test";

import { GithubVerifyResultSchema } from "../src/core/github-contract.ts";
import { GITHUB_TEXT, verifiedText } from "../web/src/github-text.ts";
import { NOTICES } from "../web/src/text.ts";
import { postLink } from "./api.ts";
import { openLibrary, pasteForId } from "./card.ts";
import {
  ANONYMOUS_LIMIT,
  GITHUB_SETTINGS_ENDPOINT,
  attach,
  expectAnonymousRead,
  expectNoToken,
  expectSavedRepositoryKept,
  githubSection,
  mainLog,
  pressGithub,
  saveInScreen,
} from "./github-token.ts";
import {
  DEFUDDLE,
  madeUpGithubToken,
  requireGithubBudget,
  storeStaleRepository,
  suiteGithubToken,
  useSuiteGithubToken,
} from "./github.ts";
import { forgetItem } from "./ingest.ts";
import { newRunId } from "./links.ts";

test.use({ trace: "off", video: "off", screenshot: "off" });

test.describe.configure({ mode: "serial", timeout: 240_000 });

test("GitHub rejects a made-up token on Verify and on a repository fetch, the owner stays signed in, the saved repository is kept, and removing the token reads the repository anonymously", async ({
  page,
  request,
}, info) => {
  await requireGithubBudget(2, true);
  const bad = madeUpGithubToken("rejected");
  const word = `zzrejected${newRunId()}`;
  const captured: string[] = [];

  forgetItem(DEFUDDLE);
  const id = storeStaleRepository(DEFUDDLE, word);

  try {
    await page.goto("/settings");
    captured.push(
      await saveInScreen(page, bad),
      await pressGithub(page, GITHUB_TEXT.verify, "POST"),
    );
    expect(GithubVerifyResultSchema.parse(JSON.parse(captured.at(-1) ?? ""))).toEqual({
      kind: "refused",
      reason: "wrong-token",
      status: 401,
    });
    await expect(
      githubSection(page).getByText(GITHUB_TEXT.wrongToken, { exact: true }),
    ).toBeVisible();
    expect((await request.get(GITHUB_SETTINGS_ENDPOINT)).status(), "still signed in").toBe(200);

    await openLibrary(page);
    expect(await pasteForId(page, DEFUDDLE)).toBe(id);
    await expect(page.locator(".paste .ps")).toContainText(NOTICES["github-token"].text);
    await expectSavedRepositoryKept(page, request, id, word);
    await expectAnonymousRead(request, id);
  } finally {
    await useSuiteGithubToken(request);
  }

  expectNoToken([...captured, mainLog()].join("\n"), [bad]);
  await attach(info, "github-settings-responses", captured.join("\n"));
});

test("a real token verifies with GitHub's higher hourly limit and reads a repository", async ({
  page,
  request,
}, info) => {
  const token = suiteGithubToken();

  if (token === undefined) {
    test.skip(
      true,
      "THREADSIFT_E2E_GITHUB_TOKEN is not set: the gate passes its own GITHUB_TOKEN, and a development machine passes `gh auth token`",
    );

    return;
  }

  await requireGithubBudget(2);
  await useSuiteGithubToken(request);
  await page.goto("/settings");

  const raw = await pressGithub(page, GITHUB_TEXT.verify, "POST");
  const verified = GithubVerifyResultSchema.parse(JSON.parse(raw));

  if (verified.kind !== "verified") throw new Error(`Verify answered ${verified.reason}`);

  expect(verified.limit, "the token's hourly limit").toBeGreaterThan(ANONYMOUS_LIMIT);
  expect(verified.remaining).toBeLessThanOrEqual(verified.limit);
  await expect(
    githubSection(page).getByText(verifiedText(verified.limit, verified.remaining), {
      exact: true,
    }),
  ).toBeVisible();

  forgetItem(DEFUDDLE);
  const { item } = (await postLink(request, DEFUDDLE)).body;

  expect(item).toMatchObject({ status: "ready", fetch: "ok", title: "kepano/defuddle" });
  expect(item.postText).toContain("Defuddle");
  expectNoToken([raw, mainLog()].join("\n"), [token]);
  await attach(info, "github-verify-response", raw);
});
