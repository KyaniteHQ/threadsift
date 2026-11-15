import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { type BrowserContext, type Page, type Worker, chromium } from "@playwright/test";
import { z } from "zod";

import { TEXT } from "../../extension/lib/text.ts";
import type { Instance } from "./instance.ts";
import { REDDIT_HOST } from "./stand-in.ts";

const EXTENSION_BUILD = resolve("extension/.output/chrome-mv3");

const ManifestSchema = z.looseObject({
  permissions: z.array(z.string()),
  optional_permissions: z.array(z.string()),
  host_permissions: z.array(z.string()).optional(),
  optional_host_permissions: z.array(z.string()),
});

const ObservedMessagesSchema = z.array(z.object({ origin: z.string(), data: z.string() }));

const RECORD_MESSAGES = `
  window.__relayMessages = [];
  window.addEventListener("message", (event) => {
    let data;
    try { data = JSON.stringify(event.data); } catch { data = "[unserializable]"; }
    window.__relayMessages.push({ origin: event.origin, data });
  });
`;

export interface Observed {
  readonly console: string[];
  readonly worker: string[];
  readonly dom: string[];
  readonly messages: string[];
  readonly api: string[];
}

export interface Session {
  readonly context: BrowserContext;
  readonly worker: Worker;
  readonly extensionId: string;
  readonly options: Page;
  readonly observed: Observed;
  readonly cleanup: () => Promise<void>;
}

function copyWithGrantedPermissions(directory: string): string {
  const copy = join(directory, "extension");
  cpSync(EXTENSION_BUILD, copy, { recursive: true });

  const file = join(copy, "manifest.json");
  const manifest = ManifestSchema.parse(JSON.parse(readFileSync(file, "utf8")));

  const granted = {
    ...manifest,
    permissions: [...manifest.permissions, ...manifest.optional_permissions],
    host_permissions: [...(manifest.host_permissions ?? []), ...manifest.optional_host_permissions],
    optional_permissions: undefined,
    optional_host_permissions: undefined,
  };

  writeFileSync(file, JSON.stringify(granted, null, 2));

  return copy;
}

function watchPage(page: Page, observed: Readonly<Observed>): void {
  page.on("console", (message) => {
    observed.console.push(message.text());
  });
}

export async function snapshot(page: Page, observed: Readonly<Observed>): Promise<void> {
  observed.dom.push(await page.content());
}

export async function messagesOf(
  page: Page,
): Promise<readonly { frame: string; origin: string; data: string }[]> {
  const found = await Promise.all(
    page.frames().map(async (frame) => {
      const read = await frame
        .evaluate("JSON.stringify(window.__relayMessages ?? [])")
        .then((text) => ObservedMessagesSchema.parse(JSON.parse(z.string().parse(text))))
        .catch(() => []);

      return read.map(({ origin, data }) => ({ frame: frame.url(), origin, data }));
    }),
  );

  return found.flat();
}

function launch(directory: string, extension: string, standInPort: number) {
  return chromium.launchPersistentContext(join(directory, "profile"), {
    channel: "chromium",
    headless: true,
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
      "--ignore-certificate-errors",
      `--host-resolver-rules=MAP ${REDDIT_HOST} 127.0.0.1:${standInPort}`,
    ],
  });
}

async function configure(options: Page, instance: Readonly<Instance>): Promise<void> {
  await options.locator("#address").fill(instance.origin);
  await options.locator("#token").fill(instance.token);
  await options.getByRole("button", { name: TEXT.saveSettings }).click();
  await options.getByText(TEXT.settingsSaved).waitFor({ timeout: 15_000 });
}

function observe(
  context: BrowserContext,
  instance: Readonly<Instance>,
  observed: Readonly<Observed>,
): (worker: Worker) => void {
  const watched = new Set<Worker>();

  const watchWorker = (worker: Worker): void => {
    if (watched.has(worker)) return;

    watched.add(worker);
    worker.on("console", (message) => {
      observed.worker.push(message.text());
    });
  };

  context.on("page", (page) => {
    watchPage(page, observed);
  });
  context.on("serviceworker", watchWorker);
  context.on("response", async (response) => {
    if (response.url().startsWith(instance.origin)) {
      observed.api.push(await response.text().catch(() => ""));
    }
  });

  return watchWorker;
}

export async function openSession(
  instance: Readonly<Instance>,
  standInPort: number,
  redditSession: string,
): Promise<{ session: Session; chromium: string }> {
  const directory = mkdtempSync(join(tmpdir(), "threadsift-extension-chromium-"));
  const observed: Observed = { console: [], worker: [], dom: [], messages: [], api: [] };
  const context = await launch(directory, copyWithGrantedPermissions(directory), standInPort);
  const watchWorker = observe(context, instance, observed);

  await context.addInitScript({ content: RECORD_MESSAGES });
  await context.addCookies([
    {
      name: "reddit_session",
      value: redditSession,
      url: `https://${REDDIT_HOST}/`,
      httpOnly: true,
      secure: true,
    },
  ]);

  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker", { timeout: 15_000 }));

  watchWorker(worker);

  const extensionId = new URL(worker.url()).host;
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await configure(options, instance);

  const cleanup = async (): Promise<void> => {
    await context.close().catch(() => null);
    rmSync(directory, { recursive: true, force: true });
  };

  return {
    chromium: context.browser()?.version() ?? "unknown",
    session: { context, worker, extensionId, options, observed, cleanup },
  };
}

export async function setFill(options: Page, wantOn: boolean): Promise<void> {
  const press = options.getByRole("button", {
    name: wantOn ? TEXT.fillTurnOn : TEXT.fillTurnOff,
    exact: true,
  });

  if ((await press.count()) > 0) await press.click();

  await options.getByText(wantOn ? TEXT.fillIsOn : TEXT.fillIsOff).waitFor({ timeout: 10_000 });
}
