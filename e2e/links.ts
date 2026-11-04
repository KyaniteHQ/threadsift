import { type Page, expect } from "@playwright/test";

export function newRunId(): string {
  return String(Date.now());
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
    `https://reddit.com/r/typescript/comments/r${run}/a_post_title/`,
    `https://old.reddit.com/r/typescript/comments/r${run}/a_post_title/k9xyz12/`,
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

export async function pasteLink(page: Page, url: string): Promise<void> {
  await page.getByRole("textbox", { name: "Paste a link to save" }).fill(url);
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("textbox", { name: "Paste a link to save" })).toHaveValue("");
}
