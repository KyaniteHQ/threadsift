import { expect, test } from "@playwright/test";

import { AiSaveResponseSchema, VerifyResultSchema } from "../src/core/ai-contract.ts";
import { AI_TEXT } from "../web/src/ai-text.ts";
import {
  AI_SETTINGS_ENDPOINT,
  AI_VERIFY_ENDPOINT,
  aiJson,
  assertNoSecret,
  countRows,
  putSettings,
} from "./ai.ts";
import {
  appShell,
  cliRuns,
  installCli,
  proveStoredDigest,
  saveProvider,
  saveAndVerify,
  settingsView,
  taskFolders,
  taskRows,
  verifyCall,
} from "./cli.ts";
import {
  CODEX_HOME,
  CODEX_PROVIDER,
  CODEX_AUTH,
  codexScreen,
  CODEX_CLI,
  homeIsReserved,
  inventedCodexAuth,
  pickCodex,
  readCodexAuth,
  saveRefreshedAuth,
  tokensOf,
  writeCodexAuth,
} from "./codex.ts";
import type { FreshScreen } from "./fresh-screen.ts";
import { isContainerTarget } from "./target.ts";

test.use({ trace: "off", video: "off", screenshot: "off" });

test.describe.configure({ mode: "serial", timeout: 420_000 });

let screen: FreshScreen;

test.afterEach(async () => {
  await screen?.close();
});

test("without the CLI the Codex row is absent and the API refuses it", async ({ browser }) => {
  screen = await codexScreen(browser);
  const view = await settingsView(screen);

  expect(view.providers).not.toContain(CODEX_PROVIDER);
  expect(view.signedIn).toEqual([]);
  await screen.page.goto("/settings");
  await expect(screen.page.getByLabel(AI_TEXT.provider, { exact: true })).toBeVisible();
  await expect(screen.page.getByRole("option", { name: AI_TEXT.codex })).toHaveCount(0);

  const refused = await screen.context.request.put(AI_SETTINGS_ENDPOINT, {
    data: { provider: CODEX_PROVIDER, model: "" },
  });

  expect(refused.status()).toBe(400);
  expect(countRows(screen, "settings")).toBe(0);
  expect(countRows(screen, "ai_tasks")).toBe(0);
});

test("an installed Codex with no login shows the sign-in command and keeps Save and Verify off", async ({
  browser,
}) => {
  test.skip(!isContainerTarget(), "Codex runs only on the container");
  screen = await codexScreen(browser);
  installCli(screen, CODEX_CLI);

  const view = await settingsView(screen);

  expect(view.providers).toContain(CODEX_PROVIDER);
  expect(view.signedIn).toEqual([]);
  expect(homeIsReserved(screen), "the sign-in probe leaves the reservations alone").toBe(true);
  await pickCodex(screen.page);
  await expect(screen.page.getByText(AI_TEXT.codexSignedOut)).toBeVisible();
  await expect(screen.page.getByText(AI_TEXT.codexSignInCommand, { exact: true })).toBeVisible();
  await expect(screen.page.getByRole("button", { name: AI_TEXT.save, exact: true })).toBeDisabled();
  await expect(
    screen.page.getByRole("button", { name: AI_TEXT.verify, exact: true }),
  ).toBeDisabled();

  expect(
    await putSettings(screen, AiSaveResponseSchema, { provider: CODEX_PROVIDER, model: "" }),
  ).toEqual({ kind: "refused", reason: "not-configured", status: null });
  expect(await aiJson(screen, VerifyResultSchema, "POST", AI_VERIFY_ENDPOINT)).toEqual({
    kind: "refused",
    reason: "not-configured",
    status: null,
  });
  expect(countRows(screen, "settings")).toBe(0);
});

test("a Codex home that holds an AGENTS.md or a skill leaves the row out, keeps every file and returns when the owner removes them", async ({
  browser,
}) => {
  test.skip(!isContainerTarget(), "Codex runs only on the container");
  screen = await codexScreen(browser);
  installCli(screen, CODEX_CLI);

  expect((await settingsView(screen)).providers).toContain(CODEX_PROVIDER);
  expect(appShell(screen, `ls -dp ${CODEX_HOME}/AGENTS.md ${CODEX_HOME}/skills`)).toBe(
    `${CODEX_HOME}/AGENTS.md/\n${CODEX_HOME}/skills\n`,
  );

  for (const [planted, kept, removed, reserved] of [
    [
      `rmdir ${CODEX_HOME}/AGENTS.md && echo owner > ${CODEX_HOME}/AGENTS.md`,
      `${CODEX_HOME}/AGENTS.md`,
      `rm ${CODEX_HOME}/AGENTS.md`,
      `${CODEX_HOME}/AGENTS.md`,
    ],
    [
      `rm ${CODEX_HOME}/skills && mkdir -p ${CODEX_HOME}/skills/mine && echo owner > ${CODEX_HOME}/skills/mine/SKILL.md`,
      `${CODEX_HOME}/skills/mine/SKILL.md`,
      `rm -r ${CODEX_HOME}/skills`,
      `${CODEX_HOME}/skills`,
    ],
    [
      `rm ${CODEX_HOME}/skills && mkdir -p ${CODEX_HOME}/skills/.system && echo bundled > ${CODEX_HOME}/skills/.system/keep`,
      `${CODEX_HOME}/skills/.system/keep`,
      `rm -r ${CODEX_HOME}/skills`,
      `${CODEX_HOME}/skills`,
    ],
  ] as const) {
    appShell(screen, planted);
    screen.fresh.restart();
    expect((await settingsView(screen)).providers).not.toContain(CODEX_PROVIDER);
    expect(screen.fresh.logs()).toContain(`"event":"codex-home-refused","path":"${reserved}"`);
    expect(appShell(screen, `cat ${kept}`).trim(), `${kept} survives the start-up`).not.toBe("");

    appShell(screen, removed);
    screen.fresh.restart();
    expect((await settingsView(screen)).providers).toContain(CODEX_PROVIDER);
  }
});

test("an invented login shows the rejection on Verify and leaks nothing", async ({
  browser,
}, info) => {
  test.skip(!isContainerTarget(), "Codex runs only on the container");
  const invented = inventedCodexAuth();

  screen = await codexScreen(browser);
  installCli(screen, CODEX_CLI);
  writeCodexAuth(screen, invented);
  expect((await settingsView(screen)).signedIn).toEqual([CODEX_PROVIDER]);
  await saveAndVerify(screen, CODEX_PROVIDER);
  await expect(screen.page.getByText(AI_TEXT.codexRejected, { exact: true })).toBeVisible({
    timeout: 120_000,
  });

  const rows = taskRows(screen);

  expect(rows).toMatchObject([
    { kind: "digest", executor: "cli", provider: CODEX_PROVIDER, model: null, state: "failed" },
  ]);
  expect(rows[0]?.refusal).toBe("wrong-key");
  expect(rows[0]?.status).toBe(401);
  assertNoSecret(screen.fresh.logs(), tokensOf(invented));
  assertNoSecret(JSON.stringify(rows), tokensOf(invented));
  await info.attach("invented-login-task-rows", {
    body: JSON.stringify(rows),
    contentType: "application/json",
  });
});

test("a model that Codex does not list is refused before any process starts and leaves a failed task", async ({
  browser,
}) => {
  test.skip(!isContainerTarget(), "Codex runs only on the container");
  screen = await codexScreen(browser);
  installCli(screen, CODEX_CLI);
  writeCodexAuth(screen, inventedCodexAuth());
  await saveProvider(screen, CODEX_PROVIDER, "gpt-reserve");

  expect(await verifyCall(screen)).toEqual({
    kind: "refused",
    reason: "model-not-found",
    status: 404,
  });
  expect(cliRuns(screen)).toEqual([]);
  expect(taskRows(screen)).toMatchObject([
    { model: "gpt-reserve", state: "failed", refusal: "model-not-found", status: 404 },
  ]);
  expect(taskFolders(screen)).toEqual([]);
});

test("a Codex removed after start answers not-configured, reads as signed out and leaves a failed task", async ({
  browser,
}) => {
  test.skip(!isContainerTarget(), "Codex runs only on the container");
  screen = await codexScreen(browser);
  installCli(screen, CODEX_CLI);
  writeCodexAuth(screen, inventedCodexAuth());
  await saveProvider(screen, CODEX_PROVIDER);
  appShell(screen, "rm -f /data/cli/bin/codex");

  expect(await verifyCall(screen)).toEqual({
    kind: "refused",
    reason: "not-configured",
    status: null,
  });
  expect((await settingsView(screen)).signedIn).toEqual([]);
  expect(taskRows(screen)).toMatchObject([{ state: "failed", refusal: "not-configured" }]);
  expect(taskFolders(screen)).toEqual([]);
});

test("Codex in the volume verifies, digests a pasted article and keeps its login in a recreated container", async ({
  browser,
}, info) => {
  const login = CODEX_AUTH;

  test.skip(
    !isContainerTarget() || login === undefined,
    "Codex needs the container and CODEX_AUTH_JSON_B64; CI holds no Codex login.",
  );
  expect(login, "the signed-in proof requires CODEX_AUTH_JSON_B64").toBeDefined();

  if (login === undefined) return;
  screen = await codexScreen(browser);
  installCli(screen, CODEX_CLI);
  writeCodexAuth(screen, login);
  await saveAndVerify(screen, CODEX_PROVIDER);
  await expect(screen.page.getByText(AI_TEXT.verified, { exact: true })).toBeVisible({
    timeout: 120_000,
  });
  await expect(screen.page.locator(".ai-digest h3")).not.toBeEmpty();
  await proveStoredDigest(screen, info, CODEX_PROVIDER, tokensOf(login));

  screen.fresh.restart({});
  const view = await settingsView(screen);

  expect(view.settings).toEqual({ provider: CODEX_PROVIDER, model: "" });
  expect(view.signedIn).toEqual([CODEX_PROVIDER]);
  expect(homeIsReserved(screen), "Verify and a Digest leave the reservations alone").toBe(true);
  expect(countRows(screen, "digests")).toBe(1);

  const again = await aiJson(screen, VerifyResultSchema, "POST", AI_VERIFY_ENDPOINT);

  expect(again.kind).toBe("done");

  const secrets = [...tokensOf(login), ...tokensOf(readCodexAuth(screen))];
  const log = screen.fresh.logs();

  assertNoSecret(log, secrets);
  assertNoSecret(JSON.stringify(taskRows(screen)), secrets);
  saveRefreshedAuth(screen);
  await info.attach("server-log", { body: log, contentType: "text/plain" });
});
