import { type Server, createServer } from "node:http";

import { type Page, test } from "@playwright/test";
import { z } from "zod";

import { mainInstance } from "./access.ts";
import { jobsOf } from "./ingest.ts";

export const SHARE_ACTION = "/share";

export interface SharedFields {
  readonly title?: string;
  readonly text?: string;
  readonly url?: string;
}

export function shareCounter(page: Page): () => number {
  let seen = 0;

  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === SHARE_ACTION) {
      seen += 1;
    }
  });

  return () => seen;
}

interface FormPost {
  readonly action: string;
  readonly entries: readonly (readonly [string, string])[];
}

export async function shareFromThisPage(page: Page, fields: SharedFields): Promise<void> {
  const post: FormPost = { action: SHARE_ACTION, entries: Object.entries(fields) };

  await page.evaluate(({ action, entries }: FormPost) => {
    const form = document.createElement("form");
    form.method = "post";
    form.action = action;
    form.enctype = "application/x-www-form-urlencoded";

    for (const [name, value] of entries) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = value;
      form.append(input);
    }

    document.body.append(form);
    form.submit();
  }, post);
}

export function fetchJobCount(itemId: number): number {
  return jobsOf(itemId, mainInstance(), "fetch").length;
}

const FOREIGN_KINDS = [
  "link",
  "no-referrer-link",
  "get-form",
  "post-form",
  "sandboxed-form",
] as const;

const BoundSchema = z.object({ port: z.number().int() });

const ForeignKindSchema = z.enum(FOREIGN_KINDS);

export type ForeignKind = z.infer<typeof ForeignKindSchema>;

function attribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function foreignPage(kind: ForeignKind, target: string, text: string): string {
  const action = attribute(`${target}${SHARE_ACTION}`);
  const query = attribute(`${target}${SHARE_ACTION}?text=${encodeURIComponent(text)}`);

  const form = (method: string, targetWindow: string) =>
    `<form method="${method}" action="${action}"${targetWindow}><input type="hidden" name="text" value="${attribute(text)}"><button id="go" type="submit">Share</button></form>`;

  switch (kind) {
    case "link": {
      return `<a id="go" href="${query}">Share</a>`;
    }

    case "no-referrer-link": {
      return `<a id="go" rel="noreferrer" href="${query}">Share</a>`;
    }

    case "get-form": {
      return form("get", "");
    }

    case "post-form": {
      return form("post", "");
    }

    case "sandboxed-form": {
      return `<iframe sandbox="allow-forms allow-scripts allow-top-navigation" srcdoc="${attribute(form("post", ' target="_top"'))}"></iframe>`;
    }

    default: {
      const exhaustive: never = kind;

      return exhaustive;
    }
  }
}

export interface ForeignSites {
  readonly sameSite: string;
  readonly crossSite: string;
  pageFor(origin: string, kind: ForeignKind, text: string): string;
  stop(): Promise<void>;
}

function aliasOf(host: string): string {
  return host === "localhost" ? "127.0.0.1" : "localhost";
}

export async function startForeignSites(instanceUrl: string): Promise<ForeignSites> {
  const { hostname, protocol } = new URL(instanceUrl);

  const server: Server = createServer((incoming, outgoing) => {
    const { searchParams } = new URL(incoming.url ?? "/", "http://placeholder");
    const kind = ForeignKindSchema.safeParse(searchParams.get("kind"));
    const target = searchParams.get("target") ?? "";
    const text = searchParams.get("text") ?? "";

    outgoing.setHeader("content-type", "text/html; charset=utf-8");
    outgoing.end(
      kind.success
        ? `<!doctype html><title>A page on another origin</title>${foreignPage(kind.data, target, text)}`
        : "<!doctype html><title>A page with no manifest</title>",
    );
  });

  await new Promise<void>((done) => {
    server.listen(0, "127.0.0.1", done);
  });

  const { port } = BoundSchema.parse(server.address());

  return {
    sameSite: `${protocol}//${hostname}:${port}`,
    crossSite: `${protocol}//${aliasOf(hostname)}:${port}`,
    pageFor: (origin, kind, text) =>
      `${origin}/?${new URLSearchParams({ kind, target: instanceUrl, text }).toString()}`,
    stop: () =>
      new Promise<void>((done) => {
        server.close(() => {
          done();
        });
      }),
  };
}

export function foreignSitesPerFile(): () => ForeignSites {
  let sites: ForeignSites | undefined;

  test.beforeAll(async ({ baseURL }) => {
    sites = await startForeignSites(baseURL ?? "");
  });

  test.afterAll(async () => {
    await sites?.stop();
  });

  return () => {
    if (sites === undefined) {
      throw new Error("The foreign sites are not started");
    }

    return sites;
  };
}
