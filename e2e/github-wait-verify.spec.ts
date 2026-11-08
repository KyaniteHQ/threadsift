import { expect, test } from "@playwright/test";

import { GithubVerifyResultSchema } from "../src/core/github-contract.ts";
import { GITHUB_TEXT } from "../web/src/github-text.ts";
import { mainInstance } from "./access.ts";
import {
  attach,
  expectNoToken,
  githubSection,
  mainLog,
  pressGithub,
  saveInScreen,
} from "./github-token.ts";
import { cooldownRows, endCooldown, startCooldown } from "./github-wait.ts";
import { madeUpGithubToken, useSuiteGithubToken } from "./github.ts";

test.use({ trace: "off", video: "off", screenshot: "off" });

test.describe.configure({ timeout: 240_000 });

const HOUR_MS = 3_600_000;

test("Verify during a stored cooldown sends no request, answers that GitHub is limiting requests, and leaves the cooldown as it was", async ({
  page,
  request,
}, info) => {
  const token = madeUpGithubToken("cooldown");
  const until = Date.now() + HOUR_MS;

  try {
    await page.goto("/settings");
    await saveInScreen(page, token);
    startCooldown(mainInstance(), until);

    const raw = await pressGithub(page, GITHUB_TEXT.verify, "POST");

    expect(GithubVerifyResultSchema.parse(JSON.parse(raw))).toEqual({
      kind: "refused",
      reason: "rate-limited",
      status: null,
    });
    await expect(
      githubSection(page).getByText(GITHUB_TEXT.rateLimited, { exact: true }),
    ).toBeVisible();
    expect(cooldownRows(mainInstance()), "the stored cooldown is unchanged").toEqual([until]);
    expectNoToken([raw, mainLog()].join("\n"), [token]);
    await attach(info, "github-verify-during-cooldown", raw);
  } finally {
    endCooldown(mainInstance());
    await useSuiteGithubToken(request);
  }
});
