import {
  type APIResponse,
  type Browser,
  type BrowserContext,
  type Page,
  expect,
} from "@playwright/test";

import { DOCUMENT_HEADERS, NO_INDEX_HEADERS } from "../src/http/web-headers.ts";

const DOCUMENT_ADDRESSES = ["/", "/log"];

const ANSWER_ADDRESSES = [
  ...DOCUMENT_ADDRESSES,
  "/manifest.webmanifest",
  "/api/session",
  "/api/items",
];

const PROBE_SCRIPT = "https://csp-probe.invalid/probe.js";

export async function watchContext(
  context: BrowserContext,
): Promise<(page: Page) => Promise<void>> {
  const violations: string[] = [];

  await context.addInitScript(
    (report: (violation: string) => void) => {
      document.addEventListener("securitypolicyviolation", (event) => {
        report(`${event.violatedDirective} ${event.blockedURI} ${event.sourceFile}`);
      });
    },
    (violation: string) => {
      violations.push(violation);
    },
    { exposeFunctions: true },
  );

  return async (page) => {
    await page.evaluate((src) => {
      const script = document.createElement("script");

      script.src = src;
      document.head.append(script);
    }, PROBE_SCRIPT);
    await expect
      .poll(() => violations.some((violation) => violation.includes(PROBE_SCRIPT)), {
        message: "the probe script's violation arrived",
      })
      .toBe(true);
    expect(violations.filter((violation) => !violation.includes(PROBE_SCRIPT))).toEqual([]);
  };
}

export async function visitSignedOut(browser: Browser, address: string): Promise<void> {
  const context = await browser.newContext();

  try {
    const expectNoViolations = await watchContext(context);
    const visitor = await context.newPage();

    await visitor.goto(address);
    await expect(visitor).toHaveTitle("Sign in to Threadsift");
    await expectNoViolations(visitor);
  } finally {
    await context.close();
  }
}

function expectHeaders(
  responses: readonly APIResponse[],
  headers: Readonly<Record<string, string>>,
): void {
  for (const response of responses) {
    for (const [name, value] of Object.entries(headers)) {
      expect
        .soft(response.headers()[name.toLowerCase()], `${name} of ${response.url()}`)
        .toBe(value);
    }
  }
}

export async function expectDocumentHeaders(page: Page): Promise<void> {
  const responses = await Promise.all(
    DOCUMENT_ADDRESSES.map((address) => page.request.get(address)),
  );

  expectHeaders(responses, DOCUMENT_HEADERS);
}

export async function expectNoIndexHeaders(page: Page): Promise<void> {
  const document = await (await page.request.get("/")).text();
  const script = /src="(?<asset>\/assets\/[^"]+)"/u.exec(document)?.groups?.["asset"];

  if (script === undefined) throw new Error("The page names no script under /assets/");

  const robots = await page.request.get("/robots.txt");
  const responses = [
    robots,
    ...(await Promise.all(
      [...ANSWER_ADDRESSES, script].map((address) => page.request.get(address)),
    )),
  ];

  expectHeaders(responses, NO_INDEX_HEADERS);

  expect(await robots.text()).not.toMatch(/^\s*disallow:\s*\/\s*$/imu);
}
