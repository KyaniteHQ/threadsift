import { type Page, expect } from "@playwright/test";

import { DOCUMENT_HEADERS } from "../src/http/web-headers.ts";

const DOCUMENT_ADDRESSES = ["/", "/log"];

const SECURITY_HEADERS = [
  "Content-Security-Policy",
  "X-Content-Type-Options",
  "Referrer-Policy",
] as const;

export async function collectCspViolations(page: Page): Promise<string[]> {
  const violations: string[] = [];

  await page.addInitScript(
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

export async function expectDocumentHeaders(page: Page): Promise<void> {
  const responses = await Promise.all(
    DOCUMENT_ADDRESSES.map((address) => page.request.get(address)),
  );

  for (const response of responses) {
    for (const name of SECURITY_HEADERS) {
      expect(response.headers()[name.toLowerCase()], `${name} of ${response.url()}`).toBe(
        DOCUMENT_HEADERS[name],
      );
    }
  }
}
