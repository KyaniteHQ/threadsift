import { execFile } from "node:child_process";

import { type Browser, type Page, expect, test } from "@playwright/test";

import { CreatedTokenResponseSchema } from "../src/http/schemas.ts";
import { OBSIDIAN_TEXT } from "../web/src/obsidian-text.ts";
import { backupFlow } from "./backup-flow.ts";
import { grokBotFlow } from "./grok-bot-flow.ts";
import { proposalsFlow } from "./proposals-flow.ts";
import { redditAccountFlow } from "./reddit-account-flow.ts";
import { PHONE, expectNoSidewaysScroll } from "./screen-checks.ts";

function folderIndexArrived(): Promise<boolean> {
  const name = `threadsift-smoke-${process.env["THREADSIFT_SMOKE_PORT"] ?? "8799"}`;
  return new Promise((resolve) => {
    execFile(
      "podman",
      ["exec", name, "test", "-f", "/tmp/Threadsift/Index.md"],
      { timeout: 5000 },
      (error) => {
        resolve(error === null);
      },
    );
  });
}

export async function settingsSteps(page: Page, browser: Browser): Promise<void> {
  await test.step("follow the settings panel's Proposals link, see the no-Provider empty state with no Reject, reload on the address, fit a phone width, and visit it signed out", () =>
    proposalsFlow(page, browser));
  await test.step("save a Grok Bot address and key in Settings, see the key marked saved after a reload, see a new address ask for a key, fit a phone width, and remove it", () =>
    grokBotFlow(page));
  await test.step("save a made-up Reddit session in Settings, see it connected after a reload, fit a phone width, and disconnect it", () =>
    redditAccountFlow(page));
  await test.step("save and reload the Obsidian settings, hide the saved token, refuse agent-token access, fit a phone, capture every theme, and disconnect", () =>
    obsidianFlow(page));
  await test.step("start an export in Settings, wait for it to be ready, download the zip and find every saved Item in its manifest and records, fit a phone width, and delete the export", () =>
    backupFlow(page));
}

async function obsidianFlow(page: Page): Promise<void> {
  await page.goto("/settings");
  await expect(page.getByRole("link", { name: OBSIDIAN_TEXT.title, exact: true })).toBeVisible();
  await captureThemes(page, { themes: ["light", "dark", "sepia"], prefix: "settings" });
  await page.setViewportSize(PHONE);
  await expectNoSidewaysScroll(page);
  await page.screenshot({ path: test.info().outputPath("settings-phone.png") });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole("link", { name: OBSIDIAN_TEXT.title, exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: OBSIDIAN_TEXT.title })).toBeVisible();
  const destination = page.getByRole("radiogroup", { name: OBSIDIAN_TEXT.modeLabel });
  if (process.env["THREADSIFT_TARGET"] === "container") {
    await expect(destination.getByRole("radio", { name: OBSIDIAN_TEXT.githubMode })).toBeChecked();
    await destination.getByRole("radio", { name: OBSIDIAN_TEXT.folderMode }).check();
    await page.getByLabel(OBSIDIAN_TEXT.folderLabel).fill("/tmp");
    await page.getByRole("button", { name: OBSIDIAN_TEXT.verify, exact: true }).click();
    await expect(page.getByText(OBSIDIAN_TEXT.folderVerified, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: OBSIDIAN_TEXT.save, exact: true }).click();
    await expect(page.getByText(OBSIDIAN_TEXT.folderConfigured, { exact: true })).toBeVisible();
    await expect.poll(folderIndexArrived, { timeout: 75_000, intervals: [1000] }).toBe(true);
    await page.reload();
    await expect(page.getByLabel(OBSIDIAN_TEXT.folderLabel)).toHaveValue("/tmp");
    await captureThemes(page, { themes: ["light", "dark", "sepia"], prefix: "obsidian-folder" });
    await page.setViewportSize(PHONE);
    await expectNoSidewaysScroll(page);
    await page.screenshot({ path: test.info().outputPath("obsidian-folder-phone.png") });
    await page.setViewportSize({ width: 1280, height: 800 });
    await destination.getByRole("radio", { name: OBSIDIAN_TEXT.githubMode }).check();
  } else {
    await expect(destination).toHaveCount(0);
    const data = { mode: "folder", folder: "/vault" };
    const [saved, verified] = await Promise.all([
      page.request.put("/api/settings/obsidian", { data }),
      page.request.post("/api/settings/obsidian/verify", { data }),
    ]);
    const refusal = { kind: "refused", reason: "folder-unavailable" };
    expect(await saved.json()).toEqual(refusal);
    expect(await verified.json()).toEqual(refusal);
  }
  await page
    .getByLabel(OBSIDIAN_TEXT.repositoryLabel, { exact: true })
    .fill("example/threadsift-vault");
  await page.getByLabel(OBSIDIAN_TEXT.branchLabel, { exact: true }).fill("main");
  await page
    .getByLabel(OBSIDIAN_TEXT.tokenLabel, { exact: true })
    .fill("made-up-vault-token-for-local-smoke");
  await page.getByRole("button", { name: OBSIDIAN_TEXT.save, exact: true }).click();
  await expect(page.getByText(OBSIDIAN_TEXT.saved, { exact: true })).toBeVisible();
  await expect(page.getByLabel(OBSIDIAN_TEXT.tokenLabel, { exact: true })).toHaveValue("");
  await page.reload();
  await expect(page.getByLabel(OBSIDIAN_TEXT.repositoryLabel, { exact: true })).toHaveValue(
    "example/threadsift-vault",
  );
  const settings = await page.request.get("/api/settings/obsidian");
  expect(settings.status()).toBe(200);
  expect(await settings.text()).not.toContain("made-up-vault-token-for-local-smoke");
  const created = await page.request.post("/api/tokens", {
    data: { name: "Vault settings refusal" },
  });
  expect(created.status()).toBe(201);
  const token = CreatedTokenResponseSchema.parse(await created.json());
  await Promise.all(
    ["GET", "PUT", "DELETE", "POST"].map(async (method) => {
      const endpoint =
        method === "POST" ? "/api/settings/obsidian/verify" : "/api/settings/obsidian";
      const refused = await page.request.fetch(endpoint, {
        method,
        headers: { authorization: `Bearer ${token.value}` },
      });
      expect(refused.status()).toBe(403);
    }),
  );
  await page.request.delete(`/api/tokens/${String(token.token.id)}`);
  await captureThemes(page, { themes: ["light", "dark", "sepia"], prefix: "obsidian" });
  await page.setViewportSize(PHONE);
  await expectNoSidewaysScroll(page);
  await page.screenshot({ path: test.info().outputPath("obsidian-phone.png") });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole("button", { name: OBSIDIAN_TEXT.remove, exact: true }).click();
  await expect(page.getByText(OBSIDIAN_TEXT.removed, { exact: true })).toBeVisible();
  await expect(page.getByText(OBSIDIAN_TEXT.missing, { exact: true })).toBeVisible();
  await page.getByRole("link", { name: OBSIDIAN_TEXT.backToSettings, exact: true }).click();
  await expect(page).toHaveURL(/\/settings$/u);
}

async function captureThemes(
  page: Page,
  input: Readonly<{ themes: readonly string[]; prefix: string }>,
): Promise<void> {
  const { themes, prefix } = input;
  const [theme, ...rest] = themes;
  if (theme === undefined) return;
  await page.locator(".app").evaluate((element, value) => {
    element.dataset["theme"] = value;
    document.documentElement.dataset["theme"] = value;
  }, theme);
  await page.screenshot({ path: test.info().outputPath(`${prefix}-${theme}.png`) });
  await captureThemes(page, { themes: rest, prefix });
}
