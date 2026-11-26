import { type Browser, type BrowserContext, type Page, expect } from "@playwright/test";

import { DOCUMENT_HEADERS } from "../src/http/web-headers.ts";

const DOCUMENT_ADDRESSES: ReadonlySet<string> = new Set(["/", "/log"]);

const NO_INDEX = "noindex, nofollow";

const ANSWERS = [
  { address: "/", status: 200 },
  { address: "/log", status: 200 },
  { address: "/manifest.webmanifest", status: 200 },
  { address: "/api/session", status: 200 },
  { address: "/api/items", status: 401 },
  { address: "/robots.txt", status: 404 },
  { address: "/index.html", status: 307 },
  { address: "/share", status: 303 },
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

export async function expectAnswerHeaders(page: Page): Promise<void> {
  const answers = await Promise.all(
    ANSWERS.map(async ({ address, status }) => ({
      address,
      status,
      response: await page.request.get(address, { maxRedirects: 0 }),
    })),
  );
  const document = answers.find(({ address }) => address === "/");
  const script = /src="(?<asset>\/assets\/[^"]+)"/u.exec((await document?.response.text()) ?? "")
    ?.groups?.["asset"];

  if (script === undefined) throw new Error("The page names no script under /assets/");

  answers.push({
    address: script,
    status: 200,
    response: await page.request.get(script, { maxRedirects: 0 }),
  });

  for (const { address, status, response } of answers) {
    expect.soft(response.status(), `status of ${address}`).toBe(status);
    expect.soft(response.headers()["x-robots-tag"], `X-Robots-Tag of ${address}`).toBe(NO_INDEX);

    if (DOCUMENT_ADDRESSES.has(address)) {
      for (const [name, value] of Object.entries(DOCUMENT_HEADERS)) {
        expect.soft(response.headers()[name.toLowerCase()], `${name} of ${address}`).toBe(value);
      }
    }
  }
}
