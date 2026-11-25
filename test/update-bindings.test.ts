import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempDisposableSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { parse } from "jsonc-parser";
import { z } from "zod";

const Bindings = z.array(z.record(z.string(), z.string()));

const ConfigSchema = z.object({
  name: z.string(),
  main: z.string(),
  d1_databases: Bindings,
  r2_buckets: Bindings,
  kv_namespaces: Bindings,
  vectorize: Bindings,
  env: z.object({ staging: z.object({ d1_databases: Bindings }) }),
});

function configOf(text: string) {
  const raw: unknown = parse(text);

  return ConfigSchema.parse(raw);
}

const TOOL = join(import.meta.dirname, "..", "tools", "update-bindings.ts");

const RELEASE = `{
  // the release's own comment
  "name": "threadsift",
  "main": "src/targets/worker/index.ts",
  "d1_databases": [
    { "binding": "DB", "database_name": "threadsift", "database_id": "release-db", "migrations_dir": "migrations", },
    { "binding": "REPORTS", "database_name": "threadsift-reports", "database_id": "release-reports" },
  ],
  "r2_buckets": [
    { "binding": "FILES", "bucket_name": "threadsift-files" },
    { "binding": "EXPORTS", "bucket_name": "threadsift-exports" },
  ],
  "kv_namespaces": [{ "binding": "CACHE", "id": "release-kv" }],
  "queues": {
    "producers": [{ "binding": "JOBS", "queue": "threadsift-jobs" }],
    "consumers": [{ "queue": "threadsift-jobs" }],
  },
  "vectorize": [{ "binding": "INDEX", "index_name": "release-index" }],
  "ai": { "binding": "AI" },
  "env": {
    "staging": {
      "d1_databases": [
        { "binding": "DB", "database_name": "staging", "database_id": "release-staging-db" },
        { "binding": "REPORTS", "database_name": "staging-reports", "database_id": "release-staging-reports" },
      ],
    },
  },
}
`;

const COPY = `{
  "name": "my-copy",
  "d1_databases": [
    { "binding": "REPORTS", "database_name": "my-reports", "database_id": "copy-reports" },
    { "binding": "DB", "database_name": "my-db", "database_id": "copy-db" },
  ],
  "r2_buckets": [
    { "binding": "EXPORTS", "bucket_name": "my-exports" },
    { "binding": "FILES", "bucket_name": "my-files" },
  ],
  "kv_namespaces": [{ "binding": "OWN_ONLY", "id": "copy-only-kv" }],
  "env": {
    "staging": {
      "d1_databases": [
        { "binding": "REPORTS", "database_name": "my-staging-reports", "database_id": "copy-staging-reports" },
        { "binding": "DB", "database_name": "my-staging", "database_id": "copy-staging-db" },
      ],
    },
  },
}
`;

function listed(body: string, heading: RegExp): readonly string[] {
  const lines = body.split("\n");
  const start = lines.findIndex((line) => heading.test(line));

  assert.notEqual(start, -1, `no line of the body matches ${String(heading)}`);

  const rest = lines.slice(start + 1).filter((line) => line !== "");
  const end = rest.findIndex((line) => !line.startsWith("- "));

  return rest.slice(0, end === -1 ? rest.length : end);
}

describe("the update tool writes a copy's resource ids into the release's Worker configuration and lists the new bindings", () => {
  let folder = "";
  let scratch: ReturnType<typeof mkdtempDisposableSync>;

  const write = (name: string, text: string): string => {
    writeFileSync(join(folder, name), text);

    return join(folder, name);
  };

  const run = (args: readonly string[]) =>
    spawnSync(process.execPath, [TOOL, ...args], { cwd: folder, encoding: "utf8", env: {} });

  const update = (copy: string, release: string, body = "The release body.\n") => {
    const answer = run([
      write("copy.jsonc", copy),
      write("release.jsonc", release),
      write("body.md", body),
    ]);

    return {
      ...answer,
      release: readFileSync(join(folder, "release.jsonc"), "utf8"),
      body: readFileSync(join(folder, "body.md"), "utf8"),
    };
  };

  beforeEach(() => {
    scratch = mkdtempDisposableSync(join(tmpdir(), "threadsift-update-bindings-"));
    folder = scratch.path;
  });

  afterEach(() => {
    scratch.remove();
  });

  it("copies the ids and names of the copy's bindings, by binding name and not by position, in every environment", () => {
    const { status, release } = update(COPY, RELEASE);
    const config = configOf(release);

    assert.equal(status, 0);
    assert.deepEqual(config.d1_databases, [
      {
        binding: "DB",
        database_name: "my-db",
        database_id: "copy-db",
        migrations_dir: "migrations",
      },
      { binding: "REPORTS", database_name: "my-reports", database_id: "copy-reports" },
    ]);
    assert.deepEqual(config.r2_buckets, [
      { binding: "FILES", bucket_name: "my-files" },
      { binding: "EXPORTS", bucket_name: "my-exports" },
    ]);
    assert.deepEqual(config.env.staging.d1_databases, [
      { binding: "DB", database_name: "my-staging", database_id: "copy-staging-db" },
      {
        binding: "REPORTS",
        database_name: "my-staging-reports",
        database_id: "copy-staging-reports",
      },
    ]);
  });

  it("keeps the rest of the release configuration, comments included, takes the copy's Worker name and adds no binding that only the copy has", () => {
    const { status, release } = update(COPY, RELEASE);
    const config = configOf(release);

    assert.equal(status, 0);
    assert.match(release, /\/\/ the release's own comment/u);
    assert.equal(config.name, "my-copy");
    assert.equal(config.main, "src/targets/worker/index.ts");
    assert.deepEqual(config.kv_namespaces, [{ binding: "CACHE", id: "release-kv" }]);
    assert.deepEqual(config.vectorize, [{ binding: "INDEX", index_name: "release-index" }]);
  });

  it("lists the new bindings in the pull request body, to provision or to review, and keeps the body it had", () => {
    const { status, body } = update(COPY, RELEASE);

    assert.equal(status, 0);
    assert.ok(body.startsWith("The release body.\n"));
    assert.deepEqual(listed(body, /^Provision /u).toSorted(), ["- `CACHE`", "- `JOBS`"]);
    assert.deepEqual(listed(body, /^Review /u).toSorted(), ["- `AI`", "- `INDEX`"]);
  });

  it("changes nothing in the configuration and adds nothing to the body when the release has no new binding and the ids match", () => {
    const { status, release, body } = update(RELEASE, RELEASE);

    assert.equal(status, 0);
    assert.equal(release, RELEASE);
    assert.equal(body, "The release body.\n");
  });

  it("gives a second run the same configuration as the first", () => {
    const first = update(COPY, RELEASE);
    const second = update(COPY, first.release);

    assert.deepEqual([first.status, second.status], [0, 0]);
    assert.equal(second.release, first.release);
  });

  it("refuses a release that holds a binding kind it does not know how to match", () => {
    const unsafe = RELEASE.replace(
      '"ai": { "binding": "AI" },',
      '"unsafe": { "bindings": [{ "name": "X", "type": "y" }] },',
    );
    const { status, stderr } = update(COPY, unsafe);

    assert.notEqual(status, 0);
    assert.match(stderr, /Unsupported Wrangler binding kind: unsafe\.bindings/u);
  });

  it("refuses a configuration key it does not know", () => {
    const { status, stderr } = update(COPY, RELEASE.replace('"main"', '"mystery_key"'));

    assert.notEqual(status, 0);
    assert.match(stderr, /Unsupported Wrangler configuration key: mystery_key/u);
  });

  it("refuses a configuration that repeats a key, or that is not JSON", () => {
    const repeated = update(COPY, RELEASE.replace('"main"', '"name": "again", "main"'));
    const broken = update(COPY, "{ not json");

    assert.notEqual(repeated.status, 0);
    assert.match(repeated.stderr, /Duplicate key name/u);
    assert.notEqual(broken.status, 0);
    assert.match(broken.stderr, /Invalid Wrangler configuration/u);
  });

  it("refuses fewer or more than three paths", () => {
    const paths = ["copy.jsonc", "release.jsonc", "body.md", "extra.md"].map((name) =>
      write(name, ""),
    );

    for (const given of [paths.slice(0, 2), paths]) {
      const { status, stderr } = run(given);

      assert.notEqual(status, 0);
      assert.match(stderr, /Expected copy config, release config and pull request body paths/u);
    }
  });
});
