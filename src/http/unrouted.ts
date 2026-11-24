import { EXPORT_DOWNLOAD_PATH } from "../core/contract/export-contract.ts";
import { FILE_ROUTE } from "../core/contract/file-keys.ts";
import { AI_TASK_PATH } from "../core/contract/grok-bot-contract.ts";
import { CONNECT_CALLBACK_PATH, CONNECT_START_PATH } from "../core/contract/openrouter-contract.ts";
import type { Ctx, Plan } from "./access-steps.ts";
import type { CacheKind } from "./response-headers.ts";

interface PathRule {
  readonly path: RegExp;
  readonly cache: CacheKind;
}

function literal(text: string): string {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
}

const FILES = new RegExp(`^${literal(FILE_ROUTE.slice(0, -1))}(?:/|$)`, "u");

const CONNECT = new RegExp(
  `^(?:${literal(CONNECT_START_PATH)}|${literal(CONNECT_CALLBACK_PATH)})$`,
  "u",
);

function withId(path: string): RegExp {
  return new RegExp(
    `^${path
      .split("{id}")
      .map((part) => literal(part))
      .join("[^/]+")}$`,
    "u",
  );
}

const DOWNLOAD = withId(EXPORT_DOWNLOAD_PATH);

const AI_TASK = withId(AI_TASK_PATH);

const UNROUTED_PATHS: readonly PathRule[] = [
  { path: CONNECT, cache: "private" },
  { path: FILES, cache: "file" },
  { path: DOWNLOAD, cache: "file" },
  { path: AI_TASK, cache: "no-store" },
];

export function unroutedPlan(c: Ctx): Plan {
  return {
    credentials: "any",
    csrf: "none",
    after: "next",
    cache: UNROUTED_PATHS.find(({ path }) => path.test(c.req.path))?.cache ?? null,
  };
}
