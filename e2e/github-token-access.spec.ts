import { expect, test } from "@playwright/test";

import { GithubSaveResponseSchema } from "../src/core/github-contract.ts";
import { createToken } from "./access-helpers.ts";
import { anonymous, bearer } from "./access.ts";
import { aiScreen, newSealingKey } from "./ai.ts";
import type { FreshScreen } from "./fresh-screen.ts";
import {
  GITHUB_TOKEN_CAP,
  GITHUB_VERIFY_ENDPOINT,
  attach,
  githubRows,
  jsonOf,
} from "./github-token.ts";
import { GITHUB_SETTINGS_ENDPOINT, madeUpGithubToken } from "./github.ts";

test.use({ trace: "off", video: "off", screenshot: "off" });

const ROUTES = [
  ["GET", GITHUB_SETTINGS_ENDPOINT],
  ["PUT", GITHUB_SETTINGS_ENDPOINT],
  ["DELETE", GITHUB_SETTINGS_ENDPOINT],
  ["POST", GITHUB_VERIFY_ENDPOINT],
] as const;

const INVALID_BODIES = [
  {},
  { token: "" },
  { token: 5 },
  { token: "has space" },
  { token: "line\nbreak" },
  { token: "tab\there" },
  { token: "nul\u0000char" },
  { token: "no\u00A0break" },
  { token: "x".repeat(GITHUB_TOKEN_CAP + 1) },
];

async function refuseStrangers(screen: Readonly<FreshScreen>, agentToken: string): Promise<void> {
  const signedOut = await anonymous(screen.fresh.url);
  const refused = madeUpGithubToken("refused");

  try {
    for (const [method, path] of ROUTES) {
      const data = method === "PUT" ? { token: refused } : undefined;
      const stranger = await signedOut.fetch(path, { method, data });
      const holder = await signedOut.fetch(path, { method, data, headers: bearer(agentToken) });

      expect(stranger.status(), `signed out ${method} ${path}`).toBe(401);
      expect(holder.status(), `agent token ${method} ${path}`).toBe(403);
    }
  } finally {
    await signedOut.dispose();
  }
}

async function refuseBadInput(screen: Readonly<FreshScreen>): Promise<string> {
  const bodies: string[] = [];

  for (const data of INVALID_BODIES) {
    const response = await screen.context.request.put(GITHUB_SETTINGS_ENDPOINT, { data });

    expect(response.status(), JSON.stringify(data).slice(0, 60)).toBe(400);
    bodies.push(await response.text());
  }

  return bodies.join("\n");
}

test("only the signed-in owner reaches the GitHub token routes, and bad input is refused without a write, with 4,096 characters the longest token", async ({
  browser,
}, info) => {
  const screen = await aiScreen(browser, newSealingKey());

  try {
    const agent = await createToken(screen.context.request, "GitHub token proof");

    await refuseStrangers(screen, agent.value);
    expect(githubRows(screen), "no refused call wrote a token").toBe(0);

    const refusals = await refuseBadInput(screen);

    expect(githubRows(screen), "no refused input wrote a token").toBe(0);

    const atCap = await screen.context.request.put(GITHUB_SETTINGS_ENDPOINT, {
      data: { token: "x".repeat(GITHUB_TOKEN_CAP) },
    });

    expect(await jsonOf(atCap, GithubSaveResponseSchema)).toEqual({
      token: "saved",
      secretReady: true,
    });
    expect(githubRows(screen)).toBe(1);
    await attach(info, "refusals", refusals);
  } finally {
    await screen.close();
  }
});
