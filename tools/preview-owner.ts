import { setTimeout } from "node:timers/promises";

import type { APIResponse } from "@playwright/test";
import { z } from "zod";

import { SaveItemRequestSchema } from "../src/http/save-schemas.ts";
import { ErrorResponseSchema, type Item, ItemListResponseSchema } from "../src/http/schemas.ts";
import { CommandFailure } from "./command-failure.ts";
import { type InstanceApi, openInstanceApi, signIn, signOut } from "./instance-api.ts";
import type { Wrangler } from "./preview-cloudflare.ts";
import { demoDigestPastes, seedDemoProposals } from "./preview-demo.ts";

type Paste = Pick<z.input<typeof SaveItemRequestSchema>, "digest" | "page" | "url">;

const demoPastes: readonly Paste[] = [
  { url: "https://stephango.com/saw" },
  { url: "https://matklad.github.io/2023/10/12/lsp-could-have-been-better.html" },
  { url: "https://matklad.github.io/2022/04/25/why-lsp.html" },
  { url: "https://example.com/" },
  ...demoDigestPastes,
];

const READ_ATTEMPTS = 11;
const READ_PAUSE_MS = 5000;
const ROUTE_READ_TIMEOUT_MS = 10_000;
const DIGEST_WAIT_MS = 120_000;

type Attempt<T> =
  | { readonly kind: "answered"; readonly value: T }
  | { readonly kind: "pending"; readonly observed: string };

interface Retry<T> {
  readonly read: () => Promise<Attempt<T>>;
  readonly reason: string;
  readonly recovery: string;
}

function pending(observed: string): Attempt<never> {
  return { kind: "pending", observed };
}

function untilAnswered<T>({ read, reason, recovery }: Retry<T>): Promise<T> {
  const attemptFrom = async (attempt: number): Promise<T> => {
    const result = await read();

    if (result.kind === "answered") return result.value;

    if (attempt >= READ_ATTEMPTS)
      throw new CommandFailure({
        kind: "check",
        reason: `${reason} (last answer: ${result.observed})`,
        recovery,
      });

    await setTimeout(READ_PAUSE_MS);

    return attemptFrom(attempt + 1);
  };

  return attemptFrom(1);
}

type Reply =
  | { readonly kind: "reply"; readonly response: APIResponse }
  | { readonly kind: "failed"; readonly observed: string };

interface Query {
  readonly params?: Readonly<Record<string, string>>;
  readonly timeout?: number;
}

async function get(api: InstanceApi, path: string, query: Query): Promise<Reply> {
  try {
    return {
      kind: "reply",
      response: await api.get(path, query),
    };
  } catch (error) {
    return {
      kind: "failed",
      observed:
        error instanceof Error
          ? `${error.name}: ${error.message.split("\n")[0] ?? ""}`
          : "transport error",
    };
  }
}

async function readItems(api: InstanceApi, url: string): Promise<Attempt<readonly Item[]>> {
  const reply = await get(api, "/api/items", { params: { url } });

  if (reply.kind === "failed") return pending(reply.observed);

  const status = reply.response.status();

  if (status === 200)
    return {
      kind: "answered",
      value: ItemListResponseSchema.parse(await reply.response.json()).items,
    };

  if (status === 404 || status >= 500) return pending(`status ${status}`);

  throw new CommandFailure({
    kind: "http",
    status,
    reason: "Preview demo inventory failed",
    recovery: "Check the preview HTTP API and rerun deploy.",
  });
}

function demoItems(api: InstanceApi, url: string): Promise<readonly Item[]> {
  return untilAnswered({
    read: () => readItems(api, url),
    reason: "Preview demo inventory did not answer",
    recovery: "Check the preview HTTP API and rerun deploy.",
  });
}

async function readRoute(api: InstanceApi): Promise<Attempt<void>> {
  const reply = await get(api, "/api/session", { timeout: ROUTE_READ_TIMEOUT_MS });

  if (reply.kind === "failed") return pending(reply.observed);

  const status = reply.response.status();

  if (status === 200) return { kind: "answered", value: undefined };

  if (status === 404 || status >= 500) return pending(`status ${status}`);

  throw new CommandFailure({
    kind: "http",
    status,
    reason: "Preview readiness check failed",
    recovery: "Check the preview HTTP API and rerun deploy.",
  });
}

function awaitRoute(api: InstanceApi): Promise<void> {
  return untilAnswered({
    read: () => readRoute(api),
    reason: "Preview Worker did not answer GET /api/session with 200",
    recovery:
      "Check that the new workers.dev route serves the Worker and that the migrations are applied, then rerun deploy.",
  });
}

async function openOwner(api: InstanceApi): Promise<void> {
  const code = z.string().min(16).parse(process.env["PREVIEW_SETUP_CODE"]);
  const password = z.string().min(15).parse(process.env["DEMO_OWNER_PASSWORD"]);
  const setup = await api.post("/api/setup", { data: { code, password } });
  const status = setup.status();

  if (status === 204) return;

  const refusal = ErrorResponseSchema.safeParse(await setup.json().catch(() => null));
  const refused = refusal.success ? refusal.data.code : undefined;

  if (status !== 409 || refused !== "owner-exists")
    throw new CommandFailure({
      kind: "http",
      status,
      reason: `Preview owner provisioning failed (${refused ?? "no known refusal code"})`,
      recovery: "Check setup credentials, migrations and Worker readiness, then rerun deploy.",
    });

  await signIn(api, password, {
    reason: "Preview owner sign-in failed",
    recovery: "Restore the preview owner's saved password, then rerun deploy.",
  });
}

function hasDigest(item: Item | undefined): boolean {
  return item !== undefined && item.digestTitle !== null;
}

async function awaitDigest(api: InstanceApi, url: string, deadline: number): Promise<void> {
  const read = await readItems(api, url);
  const [item] = read.kind === "answered" ? read.value : [];

  if (hasDigest(item)) return;

  if (item?.status === "failed" || Date.now() >= deadline)
    throw new CommandFailure({
      kind: "check",
      reason: "Preview demo Digest did not publish",
      recovery: "Check the preview Queue and fetch jobs, then rerun deploy.",
    });

  await setTimeout(READ_PAUSE_MS);

  return awaitDigest(api, url, deadline);
}

async function seedDemo(api: InstanceApi): Promise<void> {
  await Promise.all(
    demoPastes.map(async (data) => {
      const [item] = await demoItems(api, data.url);

      if (item !== undefined && (data.digest === undefined || hasDigest(item))) return;

      const saved = await api.post("/api/items", { data });

      if (saved.status() !== 201 && saved.status() !== 200)
        throw new CommandFailure({
          kind: "http",
          status: saved.status(),
          reason: "Preview demo Paste failed",
          recovery: "Check the preview HTTP API and rerun deploy; existing Items are retained.",
        });
    }),
  );

  const deadline = Date.now() + DIGEST_WAIT_MS;

  await Promise.all(demoDigestPastes.map(({ url }) => awaitDigest(api, url, deadline)));
}

export async function provisionPreviewOwner(origin: string, wrangler: Wrangler): Promise<void> {
  const api = await openInstanceApi(origin);

  try {
    await awaitRoute(api);
    await openOwner(api);

    try {
      await seedDemo(api);
    } finally {
      await signOut(api, {
        reason: "Preview setup session cleanup failed",
        recovery:
          "Delete and recreate this disposable preview to end its sessions, then rerun deploy.",
      });
    }
  } finally {
    await api.dispose();
  }

  seedDemoProposals(wrangler, ["--remote"]);
}
