import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, request, test } from "@playwright/test";
import { z } from "zod";

import { ItemDetailResponseSchema, ItemListResponseSchema } from "../src/http/schemas.ts";
import {
  type Instance,
  freshDir,
  launchAt,
  newCode,
  sessionStateOf,
  sessionValueOf,
} from "./access.ts";
import { setUpByApi } from "./fresh-screen.ts";
import { isContainerTarget } from "./target.ts";

const ROOT = join(import.meta.dirname, "..");
const BEFORE_INGEST = ["0000_init.sql", "0001_link_details.sql", "0002_access.sql"];

function wrangler(args: readonly string[]): void {
  execFileSync("pnpm", ["exec", "wrangler", ...args], {
    cwd: ROOT,
    env: { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false" },
    stdio: ["ignore", "ignore", "inherit"],
  });
}

function storeBeforeIngest(dir: string): void {
  const migrations = join(dir, "old-migrations");
  const config = join(dir, "old.jsonc");
  const state = join(dir, "state");
  mkdirSync(migrations, { recursive: true });
  mkdirSync(state, { recursive: true });

  for (const file of BEFORE_INGEST) {
    copyFileSync(join(ROOT, "migrations", file), join(migrations, file));
  }

  writeFileSync(
    config,
    JSON.stringify({
      name: "threadsift",
      compatibility_date: "2026-10-23",
      d1_databases: [{ binding: "DB", database_name: "threadsift", migrations_dir: migrations }],
    }),
  );

  const options = ["DB", "--local", "--persist-to", state, "--config", config];
  wrangler(["d1", "migrations", "apply", ...options]);

  wrangler([
    "d1",
    "execute",
    ...options,
    "--command",
    `INSERT INTO items (source, kind, normalized_url, original_url, saved_at, title) VALUES
      ('other', 'link', 'https://example.com/a', 'https://example.com/a', 1111, 'A saved title'),
      ('reddit', 'link', 'https://reddit.com/r/x/comments/1', 'https://reddit.com/r/x/comments/1', 2222, NULL)`,
  ]);
}

async function ownerOf({ url }: Instance, code: string, password: string) {
  const session = sessionValueOf(await setUpByApi(url, code, password));

  return request.newContext({ baseURL: url, storageState: sessionStateOf(session, url) });
}

test("on the Worker, Items stored before the ingest and article migrations are ready with a null fetch result, keep their Source, titles and saved dates, have no post text and have no job", async () => {
  test.skip(
    isContainerTarget(),
    "the container harness always starts on an empty volume, so the migration of existing rows is not proven there (docs/architecture.md, Open items)",
  );
  test.setTimeout(180_000);
  const dir = freshDir();
  storeBeforeIngest(dir);
  const code = newCode();
  const instance = launchAt(dir, code);

  try {
    const owner = await ownerOf(instance, code, "m".repeat(20));
    const { items } = ItemListResponseSchema.parse(await (await owner.get("/api/items")).json());

    const details = await Promise.all(
      items.map(async ({ id }) =>
        ItemDetailResponseSchema.parse(await (await owner.get(`/api/items/${id}`)).json()),
      ),
    );

    await owner.dispose();

    const kept = { status: "ready", reason: null, fetch: null, postText: null, postedAt: null };

    expect(
      details.map(({ item }) => item).toSorted((left, right) => left.id - right.id),
    ).toMatchObject([
      { id: 1, source: "other", title: "A saved title", savedAt: 1111, ...kept },
      { id: 2, source: "reddit", title: null, savedAt: 2222, ...kept },
    ]);

    expect(
      instance.query("SELECT count(*) AS n FROM jobs", z.array(z.object({ n: z.number() }))),
    ).toEqual([{ n: 0 }]);
  } finally {
    instance.stop();
  }
});
