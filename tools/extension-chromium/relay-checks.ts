import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { Server } from "node:http";

import type { Frame, Page } from "@playwright/test";

import { pause as sleep } from "../../src/core/pause.ts";
import { SETTINGS } from "../../web/src/access-text.ts";
import { REDDIT_ACCOUNT_TEXT } from "../../web/src/reddit-account-text.ts";
import { messagesOf, snapshot } from "./browser.ts";
import { accountState, disconnectAccount } from "./instance.ts";
import { freePort } from "./instance.ts";
import { record } from "./report.ts";
import type { Run } from "./run-types.ts";

type Message =
  | string
  | number
  | null
  | readonly string[]
  | Readonly<Record<string, string | number>>;

const SETTLE_MS = 1500;

function request() {
  return { threadsift: "reconnect-reddit", id: randomUUID() };
}

function malformedMessages(): ReadonlyMap<string, Message> {
  const id = randomUUID();

  return new Map<string, Message>([
    ["an extra field", { threadsift: "reconnect-reddit", id, extra: 1 }],
    ["no id", { threadsift: "reconnect-reddit" }],
    ["an id that is not a UUID", { threadsift: "reconnect-reddit", id: "not-a-uuid" }],
    ["an upper-case UUID", { threadsift: "reconnect-reddit", id: id.toUpperCase() }],
    ["another tag", { threadsift: "reconnect", id }],
    ["a reply shape in place of a request", { threadsift: "reddit-state", id, state: "connected" }],
    ["the request as a JSON string", JSON.stringify({ threadsift: "reconnect-reddit", id })],
    ["the request as an array", ["reconnect-reddit", id]],
    ["null", null],
    ["a number", 7],
  ]);
}

function testPage(otherPort: number): string {
  return `<!doctype html><title>relay test page</title><body>
<iframe name="same" src="/relay-test/frame"></iframe>
<iframe name="cross" src="http://127.0.0.1:${otherPort}/frame"></iframe>
<iframe name="host" src="http://localhost:${otherPort}/frame"></iframe></body>`;
}

async function openSettings(run: Readonly<Run>): Promise<Page> {
  const page = await run.session.context.newPage();
  await page.goto(`${run.instance.origin}/`);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("link", { name: SETTINGS.instanceSettings }).click();
  await page
    .getByRole("heading", { name: REDDIT_ACCOUNT_TEXT.sectionTitle })
    .waitFor({ timeout: 15_000 });

  return page;
}

async function newMessages(page: Page, send: () => Promise<void>): Promise<readonly string[]> {
  const known = new Map<string, number>();

  for (const { frame, origin, data } of await messagesOf(page)) {
    const key = `${frame}|${origin}|${data}`;
    known.set(key, (known.get(key) ?? 0) + 1);
  }

  await send();
  await sleep(SETTLE_MS);

  const fresh: string[] = [];

  for (const { frame, origin, data } of await messagesOf(page)) {
    const key = `${frame}|${origin}|${data}`;
    const left = known.get(key) ?? 0;

    if (left > 0) known.set(key, left - 1);
    else fresh.push(data);
  }

  return fresh;
}

async function quiet(
  run: Readonly<Run>,
  page: Page,
  label: string,
  sent: Message,
  send: () => Promise<void>,
): Promise<void> {
  const logsBefore = run.session.observed.worker.length;
  const fresh = await newMessages(page, send);
  const others = fresh.filter((data) => data !== JSON.stringify(sent));
  const state = await accountState(run.instance);

  record(
    `relay: ${label}`,
    others.length === 0 && state === "none",
    JSON.stringify({
      messagesOtherThanTheSentOne: others.length,
      accountState: state,
      workerLog: run.session.observed.worker.slice(logsBefore),
    }),
  );
}

function frameNamed(page: Page, name: string): Frame {
  const found = page.frames().find((frame) => frame.name() === name);

  if (found === undefined) throw new Error(`the test page has no iframe ${name}`);

  return found;
}

async function frameChecks(run: Readonly<Run>, top: Page): Promise<void> {
  const parentPost = (name: string, label: string) => {
    const message = request();

    return quiet(run, top, label, message, () =>
      frameNamed(top, name).evaluate((sent) => {
        window.parent.postMessage(sent, "*");
      }, message),
    );
  };

  await parentPost(
    "same",
    "another frame: a same-origin iframe posts a valid request to its parent",
  );

  const selfMessage = request();
  await quiet(
    run,
    top,
    "another frame: a same-origin iframe posts a valid request to itself",
    selfMessage,
    () =>
      frameNamed(top, "same").evaluate((sent) => {
        window.postMessage(sent, location.origin);
      }, selfMessage),
  );
  await parentPost(
    "cross",
    "another origin: an iframe of 127.0.0.1 on another port posts a valid request to the Instance page",
  );
  await parentPost(
    "host",
    "another origin: an iframe of localhost posts a valid request to the Instance page",
  );
}

async function otherPortCheck(run: Readonly<Run>, otherPort: number): Promise<void> {
  const page = await run.session.context.newPage();
  await page.goto(`http://127.0.0.1:${otherPort}/top`);
  await sleep(1000);

  const sent = request();
  const logsBefore = run.session.observed.worker.length;

  const fresh = await newMessages(page, () =>
    page.evaluate((message) => {
      window.postMessage(message, location.origin);
    }, sent),
  );

  const others = fresh.filter((data) => data !== JSON.stringify(sent));

  const refusals = run.session.observed.worker
    .slice(logsBefore)
    .filter((line) => line.includes("relay-answer-failed"));

  const state = await accountState(run.instance);

  record(
    "relay: another origin: a page on another port of the Instance's host (the relay script runs there) posts a valid request to itself and the worker refuses it",
    others.length === 0 && state === "none" && refusals.length === 1,
    JSON.stringify({
      messagesOtherThanTheSentOne: others.length,
      accountState: state,
      workerRefusals: refusals,
    }),
  );
  await page.close();
}

async function malformedChecks(run: Readonly<Run>, top: Page): Promise<void> {
  for (const [label, message] of malformedMessages()) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- each message is sent alone so a reply can be matched to it.
    await quiet(run, top, `another shape: ${label}`, message, () =>
      top.evaluate((sent) => {
        window.postMessage(sent, location.origin);
      }, message),
    );
  }
}

async function controls(run: Readonly<Run>, top: Page): Promise<void> {
  const valid = request();

  const fresh = await newMessages(top, () =>
    top.evaluate((sent) => {
      window.postMessage(sent, location.origin);
    }, valid),
  );

  await sleep(1500);

  const state = await accountState(run.instance);

  const answered = fresh.filter(
    (data) => data.includes("reddit-working") || data.includes('"state":"connected"'),
  );

  record(
    "relay: control, a valid request from the Instance page itself connects the account",
    state === "connected" && answered.length === 2,
    JSON.stringify({ accountState: state, replies: answered.length }),
  );

  await disconnectAccount(run.instance);

  const settings = await openSettings(run);
  await settings
    .getByRole("button", { name: REDDIT_ACCOUNT_TEXT.connectExtension, exact: true })
    .click();
  await settings
    .getByText(REDDIT_ACCOUNT_TEXT.connected, { exact: true })
    .waitFor({ timeout: 15_000 });
  await snapshot(settings, run.session.observed);

  const connected = await accountState(run.instance);
  record(
    "relay: control, the Settings button connects the account through the Extension",
    connected === "connected",
    JSON.stringify({ accountState: connected }),
  );
  await disconnectAccount(run.instance);
  await settings.close();
}

async function startOtherOrigin(port: number): Promise<Server> {
  const server = createServer((_, response) => {
    response.setHeader("content-type", "text/html");
    response.end("<!doctype html><title>other origin</title><body>other origin</body>");
  });

  await new Promise<void>((done) => {
    server.listen(port, "127.0.0.1", () => {
      done();
    });
  });

  return server;
}

export async function relayChecks(run: Readonly<Run>): Promise<void> {
  const { context, observed } = run.session;
  const otherPort = await freePort();
  const other = await startOtherOrigin(otherPort);
  await context.request.post(`${run.instance.origin}/api/login`, {
    data: { password: run.instance.password },
  });
  await disconnectAccount(run.instance);
  record(
    "relay: setup, the Instance holds no Reddit account",
    (await accountState(run.instance)) === "none",
    "none",
  );

  await context.route(`${run.instance.origin}/relay-test/**`, (route) => {
    const isFrame = new URL(route.request().url()).pathname.endsWith("/frame");

    return route.fulfill({
      contentType: "text/html",
      body: isFrame ? "<!doctype html><title>frame</title>" : testPage(otherPort),
    });
  });

  const top = await context.newPage();
  await top.goto(`${run.instance.origin}/relay-test/top`);
  await sleep(1000);
  await frameChecks(run, top);
  await otherPortCheck(run, otherPort);
  await malformedChecks(run, top);
  await controls(run, top);
  observed.messages.push(...(await messagesOf(top)).map(({ data }) => data));
  await snapshot(top, observed);
  await top.close();
  other.close();
}
