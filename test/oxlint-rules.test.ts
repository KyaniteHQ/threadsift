import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempDisposableSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import repositoryConfig from "../oxlint.config.ts";
import { CONFIG, FIXTURES } from "./oxlint-fixtures.ts";

const ROOT = join(import.meta.dirname, "..");

const OutputSchema = z.object({
  diagnostics: z.array(
    z.object({
      code: z.string(),
      filename: z.string(),
      message: z.string(),
      labels: z.array(z.object({ span: z.object({ line: z.number() }) })),
    }),
  ),
});

const RestrictedSchema = z.tuple([
  z.string(),
  z.object({ patterns: z.array(z.object({ regex: z.string(), message: z.string() })) }),
]);

const coreMessages = (source: string) => [
  ...new Set(
    (repositoryConfig.overrides ?? [])
      .filter(({ files }) => files.includes("src/core/**"))
      .flatMap(({ rules }) => {
        const setting = Object.entries(rules ?? {}).find(
          ([name]) => name === "threadsift/no-restricted-import-types",
        )?.[1];
        const parsed = RestrictedSchema.safeParse(setting);

        return parsed.success ? parsed.data[1].patterns : [];
      })
      .filter(({ regex }) => new RegExp(regex, "u").test(source))
      .map(({ message }) => message),
  ),
];

const enabledRules = (sets: readonly (object | undefined)[]) =>
  [
    ...new Set(
      sets.flatMap((rules) =>
        Object.entries(rules ?? {})
          .filter(([name, setting]) => name.startsWith("threadsift/") && setting !== "off")
          .map(([name]) => name),
      ),
    ),
  ].toSorted((left, right) => left.localeCompare(right));

type Found = readonly Readonly<{ rule: string; line: number; message: string }>[];

type FixturePath = keyof typeof FIXTURES;

describe("the custom oxlint rules refuse what the lint and format architecture says and pass what it allows", () => {
  let repository = "";
  let scratch: ReturnType<typeof mkdtempDisposableSync>;
  const found = new Map<string, Found[number][]>();

  const at = (path: FixturePath): Found => {
    if (!Object.hasOwn(FIXTURES, path)) throw new Error(`${path} is not a lint fixture`);

    return found.get(path) ?? [];
  };

  const messageOf = (path: FixturePath, rule: string) =>
    at(path).find((diagnostic) => diagnostic.rule === rule)?.message ?? "";

  const rulesAt = (path: FixturePath) =>
    at(path)
      .map(({ rule, line }) => `${rule}:${String(line)}`)
      .toSorted((left, right) => left.localeCompare(right));

  before(() => {
    scratch = mkdtempDisposableSync(join(tmpdir(), "threadsift-oxlint-rules-"));
    repository = scratch.path;
    cpSync(
      join(ROOT, "tools", "oxlint", "threadsift"),
      join(repository, "tools", "oxlint", "threadsift"),
      {
        recursive: true,
      },
    );
    cpSync(join(ROOT, "tools", "core-layout.json"), join(repository, "tools", "core-layout.json"));
    symlinkSync(join(ROOT, "node_modules"), join(repository, "node_modules"));
    writeFileSync(join(repository, ".oxlintrc.json"), JSON.stringify(CONFIG));

    for (const [path, text] of Object.entries(FIXTURES)) {
      mkdirSync(dirname(join(repository, path)), { recursive: true });
      writeFileSync(join(repository, path), text);
    }

    const run = spawnSync(
      join(ROOT, "node_modules", ".bin", "oxlint"),
      ["--format=json", "src", "web", "extension"],
      { cwd: repository, encoding: "utf8", env: { PATH: dirname(process.execPath) } },
    );

    assert.equal(run.stderr, "", "oxlint loads the plug-in without a message");
    assert.equal(run.status, 1, "oxlint reports the fixture diagnostics");

    for (const { code, filename, message, labels } of OutputSchema.parse(JSON.parse(run.stdout))
      .diagnostics) {
      const [, rule = ""] = /^threadsift\(([^)]+)\)$/u.exec(code) ?? [];

      if (rule !== "") {
        found.set(filename, [
          ...(found.get(filename) ?? []),
          { rule, line: labels[0]?.span.line ?? 0, message },
        ]);
      }
    }
  });

  after(() => {
    scratch.remove();
  });

  it("refuses a fixture with every Threadsift rule that the repository's configuration enables, and with no other", () => {
    assert.deepEqual(
      [
        ...new Set(
          [...found.values()].flatMap((diagnostics) => diagnostics.map(({ rule }) => rule)),
        ),
      ]
        .map((rule) => `threadsift/${rule}`)
        .toSorted((left, right) => left.localeCompare(right)),
      enabledRules([
        repositoryConfig.rules,
        ...(repositoryConfig.overrides ?? []).map(({ rules }) => rules),
      ]),
    );
  });

  describe("threadsift/layer-imports", () => {
    it("refuses an import of a module that ranks higher in the import order", () => {
      assert.deepEqual(rulesAt("src/core/kernel/up.ts"), ["layer-imports:1"]);
      assert.match(messageOf("src/core/kernel/up.ts", "layer-imports"), /import order/u);
      assert.deepEqual(rulesAt("src/core/kernel/down.ts"), []);
    });

    it("refuses a computed import() that names a path under src/features", () => {
      assert.deepEqual(rulesAt("src/core/kernel/computed-core.ts"), [
        "layer-imports:1",
        "static-import-source:1",
      ]);
      assert.match(messageOf("src/core/kernel/computed-core.ts", "layer-imports"), /computed/u);
    });

    it("refuses a file under src/core that the layout has no place for", () => {
      assert.deepEqual(rulesAt("src/core/misplaced/stray.ts"), ["layer-imports:1"]);
    });

    it("lets the browser import contract modules only, types included", () => {
      assert.deepEqual(rulesAt("web/src/to-http.ts"), ["layer-imports:1"]);
      assert.deepEqual(rulesAt("web/src/to-contract.ts"), []);
    });

    it("resolves the Extension's WXT aliases, so an alias cannot reach past the contract", () => {
      assert.deepEqual(rulesAt("extension/lib/alias-to-kernel.ts"), ["layer-imports:1"]);
      assert.deepEqual(rulesAt("extension/lib/alias-to-contract.ts"), []);
    });
  });

  describe("threadsift/no-comments", () => {
    it("refuses a line comment and a block comment of prose", () => {
      assert.deepEqual(rulesAt("src/core/kernel/prose.ts"), ["no-comments:1"]);
      assert.deepEqual(rulesAt("src/core/kernel/block-prose.ts"), ["no-comments:1"]);
    });

    it("keeps a licence line, a suppression with its reason and a constraint that ends with an upstream link", () => {
      assert.deepEqual(rulesAt("src/core/kernel/kept.ts"), []);
    });
  });

  describe("threadsift/no-item-insert", () => {
    it("refuses insert(items) and passes the insert of another table", () => {
      assert.deepEqual(rulesAt("src/features/item/core/direct-insert.ts"), ["no-item-insert:1"]);
      assert.deepEqual(rulesAt("src/features/item/core/other-insert.ts"), []);
    });

    it("passes insert(items) in the one file that owns the Item insert", () => {
      assert.deepEqual(rulesAt("src/features/item/core/item-rows.ts"), []);
    });
  });

  describe("threadsift/static-import-source", () => {
    it("refuses an import() with a computed source and passes a plain string", () => {
      assert.deepEqual(rulesAt("src/core/kernel/computed-import.ts"), ["static-import-source:1"]);
      assert.deepEqual(rulesAt("src/core/kernel/plain-import.ts"), []);
    });
  });

  describe("threadsift/no-restricted-import-types", () => {
    it("refuses an import() type whose source matches a pattern, with the message of the pattern", () => {
      assert.deepEqual(rulesAt("src/core/kernel/import-type.ts"), ["no-restricted-import-types:1"]);
      assert.deepEqual(
        [messageOf("src/core/kernel/import-type.ts", "no-restricted-import-types")],
        coreMessages("node:fs"),
      );
      assert.deepEqual(rulesAt("src/core/kernel/local-import-type.ts"), []);
    });
  });

  describe("threadsift/no-server-value-import", () => {
    it("refuses a value import of a server module and passes a type-only one", () => {
      assert.deepEqual(rulesAt("web/src/value-node.ts"), ["no-server-value-import:1"]);
      assert.deepEqual(rulesAt("web/src/type-node.ts"), []);
    });

    it("refuses a value import of each server module pattern of the configuration", () => {
      for (const path of [
        "web/src/value-hono-package.ts",
        "web/src/value-cloudflare.ts",
        "web/src/value-drizzle.ts",
        "extension/entrypoints/value-node.ts",
      ] as const) {
        assert.deepEqual(rulesAt(path), ["no-server-value-import:1"], path);
      }
    });

    it("follows a value import to the server module it reaches, and names the chain", () => {
      assert.deepEqual(rulesAt("web/src/through-value.ts"), ["no-server-value-import:1"]);
      assert.match(
        messageOf("web/src/through-value.ts", "no-server-value-import"),
        /through-value\.ts.*serving\.ts.*hono/u,
      );
      assert.deepEqual(rulesAt("web/src/through-type.ts"), []);
    });

    it("follows an Extension alias to the server module it reaches", () => {
      assert.deepEqual(rulesAt("extension/lib/through-alias.ts"), ["no-server-value-import:1"]);
    });
  });

  describe("threadsift/no-await-before-rethrow", () => {
    it("refuses an await in a catch block that then throws the caught error", () => {
      assert.deepEqual(rulesAt("src/core/kernel/await-in-catch.ts"), ["no-await-before-rethrow:5"]);
    });

    it("refuses an await in a finally block", () => {
      assert.deepEqual(rulesAt("src/core/kernel/await-in-finally.ts"), [
        "no-await-before-rethrow:5",
      ]);
    });

    it("passes a catch block with no await, and a call of a function the configuration says cannot throw", () => {
      assert.deepEqual(rulesAt("src/core/kernel/no-await-in-catch.ts"), []);
      assert.deepEqual(rulesAt("src/core/kernel/trusted-await.ts"), []);
      assert.deepEqual(rulesAt("src/core/kernel/failure-log.ts"), []);
    });
  });
});
