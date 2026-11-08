import { type APIRequestContext, type Locator, type Page, expect } from "@playwright/test";

import { ADD_LABEL, DISMISS_LABEL, PASTE_LABEL, RETRY_LABEL } from "../web/src/text.ts";
import { listAll, settled } from "./api.ts";
import { waitForRedditTurnIfNeeded } from "./reddit.ts";

const PASTE_TIMEOUT_MS = 20_000;

const PID_DIGITS = 7;
let lastRunTime = 0;

export function newRunId(): string {
  lastRunTime = Math.max(Date.now(), lastRunTime + 1);

  return `${lastRunTime}${String(process.pid).padStart(PID_DIGITS, "0")}`;
}

const HTTPBIN = "https://httpbin.org";
const REDIRECTOR = "https://httpbin.dev/redirect-to?url=";
const LONG_SEGMENT = `${"segment-".repeat(30)}end`;

export const SHORT_LINK = "https://is.gd/hK2a1W";
export const SHORT_LINK_TARGET = "https://www.iana.org/help/example-domains";
export const SHORT_LINK_TARGET_NORMALIZED = "https://iana.org/help/example-domains";
export const X_POST = "https://x.com/jack/status/20";
export const X_POST_IDENTITY = "https://x.com/i/status/20";
export const MOVED_PAGE = "https://www.rfc-editor.org/rfc/rfc9110";
export const MOVED_PAGE_NORMALIZED = "https://rfc-editor.org/rfc/rfc9110";
export const MOVED_PAGE_TITLE = "RFC 9110: HTTP Semantics | RFC Editor";

export function throughRedirects(target: string, count: number): string {
  let url = target;

  for (let hop = 0; hop < count; hop += 1) {
    url = `${REDIRECTOR}${encodeURIComponent(url)}`;
  }

  return url;
}

export function httpbinPagePath(html: string): string {
  const encoded = Buffer.from(html).toString("base64url");

  return `/base64/${encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=")}`;
}

export function htmlPage(html: string): string {
  return `${HTTPBIN}${httpbinPagePath(html)}`;
}

export function titledPage(title: string): string {
  return htmlPage(`<!doctype html><html><head><title>${title}</title></head></html>`);
}

export function scenarioLinks(run: string): string[] {
  return [
    `https://www.reddit.com/r/typescript/comments/r${run}/a_post_title/?utm_source=share&utm_medium=web`,
    `https://old.reddit.com/r/typescript/comments/r${run}/a_post_title/k9xyz12/`,
    `https://x.com/someone/status/${run}1?s=20`,
    `https://twitter.com/someone/status/${run}2?t=abc`,
    `https://github.com/KyaniteHQ/repo-${run}`,
    `https://github.com/KyaniteHQ/repo-${run}/issues/6?tab=readme`,
    `https://blog.example.com/${run}/posts/2026/11/${LONG_SEGMENT}?id=alpha&page=2&ref=newsletter`,
    `https://blog.example.com/${run}/posts/2026/11/${LONG_SEGMENT}?id=beta&page=2&ref=newsletter`,
    `https://example.com/${run}/query?token=${"x".repeat(180)}`,
    `https://news.example.org/${run}/article`,
    `https://NEWS.example.org/${run}/article?utm_source=x&fbclid=abc#comments`,
    `https://docs.example.dev/${run}/guide`,
  ];
}

export function scenarioUrls(run: string): string[] {
  return [
    `https://reddit.com/r/all/comments/r${run}/`,
    `https://reddit.com/r/all/comments/r${run}/_/k9xyz12/`,
    `https://x.com/i/status/${run}1`,
    `https://x.com/i/status/${run}2`,
    `https://github.com/kyanitehq/repo-${run}`,
    `https://github.com/KyaniteHQ/repo-${run}/issues/6?tab=readme`,
    `https://blog.example.com/${run}/posts/2026/11/${LONG_SEGMENT}?id=alpha&page=2&ref=newsletter`,
    `https://blog.example.com/${run}/posts/2026/11/${LONG_SEGMENT}?id=beta&page=2&ref=newsletter`,
    `https://example.com/${run}/query?token=${"x".repeat(180)}`,
    `https://news.example.org/${run}/article`,
    `https://docs.example.dev/${run}/guide`,
  ];
}

export function pasteField(page: Page): Locator {
  return page.getByRole("textbox", { name: PASTE_LABEL });
}

export function addButton(page: Page): Locator {
  return page.getByRole("button", { name: ADD_LABEL });
}

export function retryButton(page: Page): Locator {
  return pasteCard(page).getByRole("button", { name: RETRY_LABEL });
}

export function dismissButton(page: Page): Locator {
  return pasteCard(page).getByRole("button", { name: DISMISS_LABEL });
}

export function rowOf(page: Page, id: number): Locator {
  return page.locator(`.it[data-key="${id}"]`);
}

export async function submitLink(page: Page, url: string): Promise<void> {
  await pasteField(page).fill(url);
  await addButton(page).click();
}

export function pasteCard(page: Page): Locator {
  return page.locator(".paste .ps");
}

export async function pasteLink(page: Page, url: string): Promise<void> {
  await waitForRedditTurnIfNeeded(url);
  await submitLink(page, url);
  await expect(pasteField(page)).toHaveValue("", { timeout: PASTE_TIMEOUT_MS });
  await expect(pasteCard(page).locator(".ps-acts")).toBeVisible({ timeout: PASTE_TIMEOUT_MS });
}

export function pasteStatus(page: Page): Locator {
  return page.locator(".paste").getByRole("status");
}

export async function settleLibrary(request: APIRequestContext): Promise<void> {
  for (const item of await listAll(request)) {
    if (item.status === "processing") await settled(request, item.id);
  }
}
