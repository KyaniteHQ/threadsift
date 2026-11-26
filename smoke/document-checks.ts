import { type Browser, type BrowserContext, type Page, expect } from "@playwright/test";
import { z } from "zod";

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

const ManifestIconsSchema = z.object({ icons: z.array(z.object({ src: z.string() })) });

const ICON_RELS: ReadonlySet<string> = new Set(["icon", "apple-touch-icon"]);

const PAGE_ICON_KINDS = ["apple-touch-icon png", "icon png", "icon svg"];

const ICON_TYPES: ReadonlyMap<string, string> = new Map([
  ["png", "image/png"],
  ["svg", "image/svg+xml"],
]);

function extensionOf(address: string): string {
  return /\.(?<extension>[a-z0-9]+)$/u.exec(address)?.groups?.["extension"] ?? "";
}

function pageIcons(document: string): { rel: string; href: string }[] {
  return [...document.matchAll(/<link\b[^>]*>/giu)].flatMap(([tag]) => {
    const attributes = new Map(
      [...tag.matchAll(/(?<name>[\w-]+)\s*=\s*(?:"(?<double>[^"]*)"|'(?<single>[^']*)')/gu)].map(
        ({ groups }) => [
          (groups?.["name"] ?? "").toLowerCase(),
          groups?.["double"] ?? groups?.["single"] ?? "",
        ],
      ),
    );
    const rel = (attributes.get("rel") ?? "")
      .toLowerCase()
      .split(/\s+/u)
      .find((token) => ICON_RELS.has(token));
    const href = attributes.get("href");

    return rel === undefined || href === undefined ? [] : [{ rel, href }];
  });
}

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
  const document = (await answers.find(({ address }) => address === "/")?.response.text()) ?? "";
  const script = /src="(?<asset>\/assets\/[^"]+)"/u.exec(document)?.groups?.["asset"];

  if (script === undefined) throw new Error("The page names no script under /assets/");

  const manifest = ManifestIconsSchema.parse(
    await answers.find(({ address }) => address === "/manifest.webmanifest")?.response.json(),
  );
  const linked = pageIcons(document);

  expect(
    linked.map(({ rel, href }) => `${rel} ${extensionOf(href)}`).toSorted(),
    "the icon links of the page",
  ).toEqual(PAGE_ICON_KINDS);
  expect(manifest.icons.length, "the icons of the manifest").toBeGreaterThan(0);

  const icons = [...linked.map(({ href }) => href), ...manifest.icons.map(({ src }) => src)];

  answers.push(
    ...(await Promise.all(
      [script, ...icons].map(async (address) => ({
        address,
        status: 200,
        response: await page.request.get(address, { maxRedirects: 0 }),
      })),
    )),
  );

  for (const icon of icons) {
    const response = answers.find(({ address }) => address === icon)?.response;

    expect
      .soft(response?.headers()["content-type"]?.split(";")[0], `Content-Type of ${icon}`)
      .toBe(ICON_TYPES.get(extensionOf(icon)) ?? `an image type for ${icon}`);
  }

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
