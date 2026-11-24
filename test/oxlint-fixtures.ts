import type { DummyRuleMap } from "oxlint";

import repositoryConfig from "../oxlint.config.ts";

const TRUSTED_MODULE = "src/core/kernel/failure-log.ts";

const threadsiftRules = (rules: DummyRuleMap | undefined) =>
  Object.fromEntries(
    Object.entries(rules ?? {}).filter(([name]) => name.startsWith("threadsift/")),
  );

export const CONFIG = {
  jsPlugins: [{ name: "threadsift", specifier: "./tools/oxlint/threadsift/index.ts" }],
  rules: threadsiftRules(repositoryConfig.rules),
  overrides: (repositoryConfig.overrides ?? []).flatMap(({ files, excludeFiles, rules }) => {
    const kept = threadsiftRules(rules);

    return Object.keys(kept).length === 0 ? [] : [{ files, excludeFiles, rules: kept }];
  }),
};

export const FIXTURES = {
  [TRUSTED_MODULE]: [
    "export async function bestEffort(): Promise<void> {}",
    "export async function readOrAssume(): Promise<void> {}",
    "",
  ].join("\n"),

  "src/core/kernel/up.ts":
    'import { entry } from "../../features/item/core/entry.ts";\nexport { entry };\n',
  "src/core/kernel/down.ts": 'import { sibling } from "./sibling.ts";\nexport { sibling };\n',
  "src/core/kernel/computed-core.ts":
    'export const load = (name: string) => import("../../features/item/core/" + name);\n',
  "src/core/misplaced/stray.ts": "export const stray = 1;\n",
  "web/src/to-http.ts": 'import type { App } from "../../src/http/app.ts";\nexport type { App };\n',
  "web/src/to-contract.ts":
    'import type { Shape } from "../../src/core/contract/shape.ts";\nexport type { Shape };\n',
  "extension/lib/alias-to-kernel.ts":
    'import { clock } from "@/../src/core/kernel/clock.ts";\nexport { clock };\n',
  "extension/lib/alias-to-contract.ts":
    'import { limit } from "@/../src/core/contract/limit.ts";\nexport { limit };\n',

  "src/core/kernel/prose.ts": "// This explains the line below.\nexport const answer = 42;\n",
  "src/core/kernel/block-prose.ts":
    "/* This explains the line below. */\nexport const answer = 42;\n",
  "src/core/kernel/kept.ts": [
    "// SPDX-License-Identifier: MIT",
    "// oxlint-disable-next-line no-var -- the loop needs function scope",
    "var kept = 1;",
    "// A constraint of the host runtime https://example.com/constraint",
    "export const value = kept;",
    "",
  ].join("\n"),

  "src/features/item/core/direct-insert.ts":
    "export const save = (database: Database) => database.insert(items).values({ id: 1 });\n",
  "src/features/item/core/item-rows.ts":
    "export const save = (database: Database) => database.insert(items).values({ id: 1 });\n",
  "src/features/item/core/other-insert.ts":
    "export const save = (database: Database) => database.insert(labels).values({ id: 1 });\n",

  "src/core/kernel/computed-import.ts": "export const load = (name: string) => import(name);\n",
  "src/core/kernel/plain-import.ts": 'export const load = () => import("./down.ts");\n',

  "src/core/kernel/import-type.ts": 'export type Fs = import("node:fs").Stats;\n',
  "src/core/kernel/local-import-type.ts": 'export type Down = import("./down.ts").Down;\n',

  "web/src/value-node.ts": 'import { readFileSync } from "node:fs";\nexport { readFileSync };\n',
  "web/src/type-node.ts": 'import type { Stats } from "node:fs";\nexport type { Stats };\n',
  "web/src/value-hono-package.ts":
    'import { serve } from "@hono/node-server";\nexport { serve };\n',
  "web/src/value-cloudflare.ts": 'import { env } from "cloudflare:workers";\nexport { env };\n',
  "web/src/value-drizzle.ts": 'import { sql } from "drizzle-orm";\nexport { sql };\n',
  "web/shared/serving.ts": 'export { serve } from "hono";\n',
  "web/shared/types.ts": 'export type { Context } from "hono";\n',
  "web/src/through-value.ts": 'import { serve } from "../shared/serving.ts";\nexport { serve };\n',
  "web/src/through-type.ts":
    'import { type Context } from "../shared/types.ts";\nexport type { Context };\n',
  "extension/entrypoints/value-node.ts":
    'import { readFileSync } from "node:fs";\nexport { readFileSync };\n',
  "extension/shared/runtime.ts":
    'import { readFileSync } from "node:fs";\nexport { readFileSync };\n',
  "extension/lib/through-alias.ts":
    'import { readFileSync } from "@/shared/runtime.ts";\nexport { readFileSync };\n',

  "src/core/kernel/await-in-catch.ts": [
    "export async function bad(work: () => Promise<void>, clean: () => Promise<void>) {",
    "  try {",
    "    await work();",
    "  } catch (error) {",
    "    await clean();",
    "    throw error;",
    "  }",
    "}",
    "",
  ].join("\n"),
  "src/core/kernel/await-in-finally.ts": [
    "export async function bad(work: () => Promise<void>, clean: () => Promise<void>) {",
    "  try {",
    "    await work();",
    "  } finally {",
    "    await clean();",
    "  }",
    "}",
    "",
  ].join("\n"),
  "src/core/kernel/no-await-in-catch.ts": [
    "export async function good(work: () => Promise<void>, clean: () => void) {",
    "  try {",
    "    await work();",
    "  } catch (error) {",
    "    clean();",
    "    throw error;",
    "  }",
    "}",
    "",
  ].join("\n"),
  "src/core/kernel/trusted-await.ts": [
    'import { bestEffort } from "./failure-log.ts";',
    "export async function good(work: () => Promise<void>) {",
    "  try {",
    "    await work();",
    "  } catch (error) {",
    "    await bestEffort();",
    "    throw error;",
    "  }",
    "}",
    "",
  ].join("\n"),
} satisfies Readonly<Record<string, string>>;
