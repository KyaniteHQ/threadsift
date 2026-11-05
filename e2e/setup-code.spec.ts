import { type APIRequestContext, type APIResponse, expect, test } from "@playwright/test";

import { SETUP } from "../web/src/access-text.ts";
import { ErrorBody, expectRefusal } from "./access-helpers.ts";
import { type Instance, anonymous, launchFresh, newCode } from "./access.ts";
import { codeField } from "./setup-screens.ts";
import { isContainerTarget } from "./target.ts";

const SHORT_LENGTH = 15;
const LOG_LINE = /^Setup code: (\S+)$/gmu;
const PASSWORD = "p".repeat(20);

const running: Instance[] = [];
const strangers: APIRequestContext[] = [];

test.afterEach(async () => {
  await Promise.all(strangers.splice(0).map((stranger) => stranger.dispose()));

  for (const instance of running.splice(0)) {
    instance.stop();
  }
});

function start(code: string | null): Instance {
  const instance = launchFresh(code);
  running.push(instance);

  return instance;
}

interface SetupBody {
  readonly code: string;
  readonly password?: string;
}

async function post(instance: Instance, path: string, data: SetupBody): Promise<APIResponse> {
  const stranger = await anonymous(instance.url);
  strangers.push(stranger);

  return stranger.post(path, { data });
}

function loggedCodes(instance: Instance): string[] {
  return [...instance.logs().matchAll(LOG_LINE)].flatMap((match) => match[1] ?? []);
}

async function expectUnavailable(
  instance: Instance,
  setup: "missing" | "short",
  code: string,
): Promise<void> {
  for (const [path, data] of [
    ["/api/setup/code", { code }],
    ["/api/setup", { code, password: PASSWORD }],
  ] as const) {
    const response = await post(instance, path, data);
    expect(response.status(), path).toBe(503);
    const body = ErrorBody.extend({ setup: ErrorBody.shape.error }).parse(await response.json());
    expect(body.setup, `${path}: setup`).toBe(setup);
  }
}

test("a setup code of 15 characters is refused on both calls, shown as too short, and never logged", async ({
  page,
}) => {
  const short = newCode().slice(0, SHORT_LENGTH);
  const instance = start(short);

  await expectUnavailable(instance, "short", short);
  expect(loggedCodes(instance), "no generated code is logged").toEqual([]);

  await page.goto(instance.url);
  await codeField(page).fill(short);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: SETUP.shortTitle })).toBeVisible();
});

test("a setup code of 16 characters works", async () => {
  const code = newCode().slice(0, SHORT_LENGTH + 1);
  const instance = start(code);

  expect((await post(instance, "/api/setup/code", { code })).status()).toBe(204);
  expect((await post(instance, "/api/setup", { code, password: PASSWORD })).status()).toBe(204);
});

test("the container makes one setup code per start when none is set, and the old one stops working", async () => {
  test.skip(!isContainerTarget(), "only the container generates a setup code");

  const instance = start(null);
  const [first = "", ...others] = loggedCodes(instance);
  expect(others, "one log line on the first start").toEqual([]);
  expect(first.length).toBeGreaterThan(SHORT_LENGTH);

  expect((await post(instance, "/api/setup/code", { code: first })).status()).toBe(204);

  instance.restart();
  const codes = loggedCodes(instance);
  expect(codes.length, "one more line after a restart").toBe(2);
  const second = codes.at(-1) ?? "";
  expect(second).not.toBe(first);

  await expectRefusal(
    await post(instance, "/api/setup/code", { code: first }),
    401,
    "the old code",
  );
  expect((await post(instance, "/api/setup/code", { code: second })).status()).toBe(204);
});

test("the Worker with no SETUP_CODE answers 503 missing and the screen names the command", async ({
  page,
}) => {
  test.skip(isContainerTarget(), "only the Worker has no way to make a code");

  const instance = start(null);
  await expectUnavailable(instance, "missing", newCode());

  await page.goto(instance.url);
  await codeField(page).fill(newCode());
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: SETUP.missingTitle })).toBeVisible();
  await expect(page.getByText(SETUP.missingCommand)).toBeVisible();
});
