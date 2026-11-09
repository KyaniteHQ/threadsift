import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  type BrowserContext,
  type CDPSession,
  type Page,
  type Worker,
  chromium,
  expect,
} from "@playwright/test";
import { z } from "zod";

import { TEXT } from "../extension/lib/text.ts";

const BUILD = join(import.meta.dirname, "..", "extension", ".output", "chrome-mv3");

const Targets = z.array(
  z.object({
    id: z.string(),
    type: z.string(),
    url: z.string(),
    webSocketDebuggerUrl: z.string().optional(),
  }),
);

const Evaluated = z.object({
  id: z.literal(1),
  result: z.object({ result: z.object({ value: z.string().nullable() }) }),
});

export const ACTION_TEXT = TEXT;

export interface Popup {
  status(): Promise<string>;
  itemLink(): Promise<string | null>;
  click(label: string): Promise<void>;
}

export interface Extension {
  readonly id: string;
  readonly context: BrowserContext;
  tab(url: string): Promise<Page>;
  press(tab: Page): Promise<Popup>;
  settings(): Promise<Page>;
  configure(address: string, token: string): Promise<void>;
  storeWithoutAsking(address: string, token: string): Promise<void>;
  close(): Promise<void>;
}

export interface Grant {
  readonly instanceUrl: string | null;
}

function manifestWithGrant(directory: string, instanceUrl: string | null): void {
  if (instanceUrl === null) return;

  const file = join(directory, "manifest.json");
  const manifest = z.looseObject({}).parse(JSON.parse(readFileSync(file, "utf8")));
  const { protocol, hostname } = new URL(instanceUrl);

  writeFileSync(
    file,
    JSON.stringify({ ...manifest, host_permissions: [`${protocol}//${hostname}/*`] }),
  );
}

async function evaluateIn(socketUrl: string, expression: string): Promise<string | null> {
  const socket = new WebSocket(socketUrl);

  await new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => {
      resolve();
    });
    socket.addEventListener("error", () => {
      reject(new Error(`could not open ${socketUrl}`));
    });
  });

  const answered = new Promise<string | null>((resolve, reject) => {
    socket.addEventListener("message", (event) => {
      const answer = Evaluated.safeParse(JSON.parse(String(event.data)));

      if (answer.success) resolve(answer.data.result.result.value);
    });
    socket.addEventListener("close", () => {
      reject(new Error(`${socketUrl} closed before it answered`));
    });
  });

  socket.send(
    JSON.stringify({
      id: 1,
      method: "Runtime.evaluate",
      params: { expression, returnByValue: true },
    }),
  );

  const value = await answered;
  socket.close();

  return value;
}

interface Launched {
  readonly home: string;
  readonly profile: string;
  readonly context: BrowserContext;
  readonly worker: Worker;
  readonly id: string;
}

async function launch(instanceUrl: string | null): Promise<Launched> {
  const home = mkdtempSync(join(tmpdir(), "threadsift-extension-"));
  const directory = join(home, "extension");
  cpSync(BUILD, directory, { recursive: true });
  manifestWithGrant(directory, instanceUrl);

  const profile = join(home, "profile");

  const context = await chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: true,
    args: [
      `--disable-extensions-except=${directory}`,
      `--load-extension=${directory}`,
      "--remote-debugging-port=0",
    ],
  });

  const [running] = context.serviceWorkers();
  const worker = running ?? (await context.waitForEvent("serviceworker"));

  return { home, profile, context, worker, id: new URL(worker.url()).host };
}

function popupOf(socketUrl: string): Popup {
  const read = (expression: string) => evaluateIn(socketUrl, expression);

  return {
    status: async () =>
      (await read("document.querySelector('.ext-status')?.textContent ?? ''")) ?? "",
    itemLink: () => read("document.querySelector('a.btn')?.href ?? null"),
    async click(label) {
      const finder = `[...document.querySelectorAll('button, a.btn')].find((control) => control.textContent === ${JSON.stringify(label)})`;

      const outcome = await read(
        `(() => { const control = ${finder}; setTimeout(() => control?.click(), 0); return control === undefined ? 'missing' : 'clicked'; })()`,
      );

      expect(outcome, `the popup control ${label}`).toBe("clicked");
    },
  };
}

async function tabTargetOf(control: CDPSession, url: string): Promise<string> {
  const { targetInfos } = await control.send("Target.getTargets", {
    filter: [{ exclude: false }],
  });

  const tab = targetInfos.find((info) => info.type === "tab" && info.url === url);

  if (tab === undefined) throw new Error(`no tab shows ${url}`);

  return tab.targetId;
}

async function popupPresser({
  context,
  profile,
  id,
}: Readonly<Launched>): Promise<(tab: Page) => Promise<Popup>> {
  const [port = ""] = readFileSync(join(profile, "DevToolsActivePort"), "utf8").split("\n");
  const browser = context.browser();

  if (browser === null) throw new Error("the extension context has no browser");

  const control = await browser.newBrowserCDPSession();
  const popupUrl = `chrome-extension://${id}/popup.html`;

  async function popupTargets() {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`);

    return Targets.parse(await response.json()).filter(({ url }) => url === popupUrl);
  }

  return async (tab) => {
    await tab.bringToFront();

    const known = new Set((await popupTargets()).map((target) => target.id));
    const targetId = await tabTargetOf(control, tab.url());
    await control.send("Extensions.triggerAction", { id, targetId });

    let socketUrl: string | undefined;

    await expect
      .poll(async () => {
        const opened = (await popupTargets()).find((target) => !known.has(target.id));
        socketUrl = opened?.webSocketDebuggerUrl;

        return socketUrl !== undefined;
      })
      .toBe(true);

    return popupOf(socketUrl ?? "");
  };
}

async function openSettings({ context, id }: Readonly<Launched>): Promise<Page> {
  const settings = await context.newPage();
  await settings.goto(`chrome-extension://${id}/options.html`);

  return settings;
}

async function configureIn(
  launched: Readonly<Launched>,
  address: string,
  token: string,
): Promise<void> {
  const settings = await openSettings(launched);
  await settings.getByLabel(TEXT.addressLabel).fill(address);
  await settings.getByLabel(TEXT.tokenLabel).fill(token);
  await settings.getByRole("button", { name: TEXT.saveSettings }).click();
  await expect(settings.getByRole("status")).toHaveText(TEXT.settingsSaved);
  await settings.close();
}

export async function loadExtension({ instanceUrl }: Readonly<Grant>): Promise<Extension> {
  const launched = await launch(instanceUrl);
  const { context, worker, id, home } = launched;
  const press = await popupPresser(launched);

  return {
    id,
    context,
    async tab(url) {
      const page = await context.newPage();
      await page.goto(url);
      await page.bringToFront();

      return page;
    },
    press,
    settings: () => openSettings(launched),
    configure: (address, token) => configureIn(launched, address, token),
    async storeWithoutAsking(address, token) {
      await worker.evaluate(
        `chrome.storage.local.set(${JSON.stringify({ instance: address, token })})`,
      );
    },
    async close() {
      await context.close();
      rmSync(home, { recursive: true, force: true });
    },
  };
}
