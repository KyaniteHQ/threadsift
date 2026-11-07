import { ItemListResponseSchema, SessionStateSchema } from "../../src/http/schemas.ts";
import type { AccessCodes } from "./codes.ts";
import { type Copy, callCopy } from "./copy-calls.ts";
import { type Item, awaitServing, endState, expectOk, paste } from "./copy-client.ts";
import { signIn } from "./demo-access.ts";

const RETRY_BUDGET_MS = 120_000;

const CHECKED_FIELDS = ["status", "source", "title", "fetch"] as const;

interface DemoItem {
  readonly url: string;
  readonly expected: Readonly<Partial<Pick<Item, (typeof CHECKED_FIELDS)[number]>>>;
}

const DEMO_ITEMS: readonly DemoItem[] = [
  {
    url: "https://stephango.com/saw",
    expected: { status: "ready", source: "article", fetch: "ok" },
  },
  {
    url: "https://matklad.github.io/2023/10/12/lsp-could-have-been-better.html",
    expected: { status: "ready", source: "article", fetch: "ok" },
  },
  {
    url: "https://example.com/",
    expected: { status: "ready", source: "other", title: "Example Domain", fetch: "ok" },
  },
  {
    url: "https://threadsift-demo.invalid/",
    expected: { status: "failed", title: null, fetch: "network" },
  },
];

function misses(item: Readonly<Item>, expected: DemoItem["expected"]): string[] {
  return CHECKED_FIELDS.filter(
    (field) => expected[field] !== undefined && item[field] !== expected[field],
  );
}

async function seedItem(copy: Readonly<Copy>, demo: Readonly<DemoItem>): Promise<string | null> {
  const { id } = await paste(copy, demo.url);
  const item = await endState(copy, id);
  const wrong = misses(item, demo.expected);
  process.stdout.write(
    `Item ${String(id)} ${demo.url}: ${item.status} ${item.source} ${item.fetch ?? "no fetch"}\n`,
  );

  return wrong.length === 0 ? null : `${demo.url} ended with a different ${wrong.join(", ")}`;
}

export async function seedDemo(url: string, codes: Readonly<AccessCodes>): Promise<void> {
  const copy = await openDemo(url, codes);

  const outcomes = await Promise.all(DEMO_ITEMS.map((demo) => seedItem(copy, demo)));
  const failed = outcomes.filter((outcome) => outcome !== null);

  if (failed.length > 0) {
    throw new Error(`Demo data did not reach its end state: ${failed.join("; ")}`);
  }
}

async function openDemo(url: string, codes: Readonly<AccessCodes>): Promise<Copy> {
  await awaitServing(url);

  return signIn({ url, retryUntil: Date.now() + RETRY_BUDGET_MS }, codes);
}

export async function ensureDemo(url: string, codes: Readonly<AccessCodes>): Promise<void> {
  const copy = await openDemo(url, codes);
  const response = await callCopy(copy, { path: "/api/items", cookie: copy.cookie });

  await expectOk(response, "/api/items");
  const { items } = ItemListResponseSchema.parse(await response.json());

  await Promise.all(
    DEMO_ITEMS.map(async (demo) => {
      const existing = items.find((item) => item.originalUrl === demo.url);

      if (existing === undefined) {
        await endState(copy, (await paste(copy, demo.url)).id);
      } else if (existing.status === "processing") {
        await endState(copy, existing.id);
      }
    }),
  );

  const session = await callCopy(copy, { path: "/api/session", cookie: copy.cookie });

  await expectOk(session, "/api/session");

  if (SessionStateSchema.parse(await session.json()).state !== "signed-in")
    throw new Error("Live signed-in session check failed");
  process.stdout.write("Live signed-in GET /api/session passed\n");
}
