import { type Page, expect } from "@playwright/test";

import { DOCUMENT_HEADERS } from "../src/http/web-headers.ts";

const DOCUMENT_ADDRESSES = ["/", "/log"];

const PROBE_SCRIPT = "https://csp-probe.invalid/probe.js";

export async function collectCspViolations(page: Page): Promise<string[]> {
  const violations: string[] = [];

  await page.context().addInitScript(
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

  return violations;
}

export async function expectNoCspViolations(page: Page, violations: string[]): Promise<void> {
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
}

export async function expectDocumentHeaders(page: Page): Promise<void> {
  const responses = await Promise.all(
    DOCUMENT_ADDRESSES.map((address) => page.request.get(address)),
  );

  for (const response of responses) {
    for (const [name, value] of Object.entries(DOCUMENT_HEADERS)) {
      expect
        .soft(response.headers()[name.toLowerCase()], `${name} of ${response.url()}`)
        .toBe(value);
    }
  }
}
