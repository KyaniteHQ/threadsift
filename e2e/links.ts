import { type Locator, type Page, expect } from "@playwright/test";

import { PASTE_LABEL } from "../web/src/text.ts";
import { waitForRedditTurnIfNeeded } from "./reddit.ts";

const PASTE_TIMEOUT_MS = 20_000;

export function newRunId(): string {
  return String(Date.now());
}

const HTTPBIN = "https://httpbin.org";

export function httpbinPagePath(html: string): string {
  const encoded = Buffer.from(html).toString("base64url");

  return `/base64/${encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=")}`;
}

export function titledPage(title: string): string {
  return `${HTTPBIN}${httpbinPagePath(`<!doctype html><html><head><title>${title}</title></head></html>`)}`;
}

export function scenarioLinks(run: string): string[] {
  const long = `${"segment-".repeat(30)}end`;

  return [
    `https://www.reddit.com/r/typescript/comments/r${run}/a_post_title/?utm_source=share&utm_medium=web`,
    `https://old.reddit.com/r/typescript/comments/r${run}/a_post_title/k9xyz12/`,
    `https://x.com/someone/status/${run}1?s=20`,
    `https://twitter.com/someone/status/${run}2?t=abc`,
    `https://github.com/KyaniteHQ/repo-${run}`,
    `https://github.com/KyaniteHQ/repo-${run}/issues/6?tab=readme`,
    `https://blog.example.com/${run}/posts/2026/11/${long}?id=alpha&page=2&ref=newsletter`,
    `https://blog.example.com/${run}/posts/2026/11/${long}?id=beta&page=2&ref=newsletter`,
    `https://example.com/${run}/query?token=${"x".repeat(180)}`,
    `https://news.example.org/${run}/article`,
    `https://NEWS.example.org/${run}/article?utm_source=x&fbclid=abc#comments`,
    `https://docs.example.dev/${run}/guide`,
  ];
}

export function scenarioUrls(run: string): string[] {
  const long = `${"segment-".repeat(30)}end`;

  return [
    `https://reddit.com/r/all/comments/r${run}/`,
    `https://reddit.com/r/all/comments/r${run}/_/k9xyz12/`,
    `https://x.com/someone/status/${run}1`,
    `https://twitter.com/someone/status/${run}2`,
    `https://github.com/KyaniteHQ/repo-${run}`,
    `https://github.com/KyaniteHQ/repo-${run}/issues/6?tab=readme`,
    `https://blog.example.com/${run}/posts/2026/11/${long}?id=alpha&page=2&ref=newsletter`,
    `https://blog.example.com/${run}/posts/2026/11/${long}?id=beta&page=2&ref=newsletter`,
    `https://example.com/${run}/query?token=${"x".repeat(180)}`,
    `https://news.example.org/${run}/article`,
    `https://docs.example.dev/${run}/guide`,
  ];
}

export function pasteField(page: Page): Locator {
  return page.getByRole("textbox", { name: PASTE_LABEL });
}

export async function pasteLink(page: Page, url: string): Promise<void> {
  await waitForRedditTurnIfNeeded(url);
  await pasteField(page).fill(url);
  await page.getByRole("button", { name: "Add" }).click();
  await expect(pasteField(page)).toHaveValue("", { timeout: PASTE_TIMEOUT_MS });
}

export function pasteStatus(page: Page): Locator {
  return page.locator(".paste").getByRole("status");
}
