import { EXPORT_DOWNLOAD_PATH } from "../core/export-contract.ts";
import { FILE_ROUTE } from "../core/file-keys.ts";
import { CONNECT_CALLBACK_PATH, CONNECT_START_PATH } from "../core/openrouter-contract.ts";
import type { Ctx, Plan } from "./access-steps.ts";
import type { CacheKind } from "./response-headers.ts";

interface PathRule {
  readonly path: RegExp;
  readonly ownerOnly?: true;
  readonly callbackOnly?: true;
  readonly cache?: CacheKind;
}

function literal(text: string): string {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
}

const FILES = new RegExp(`^${literal(FILE_ROUTE.slice(0, -1))}(?:/|$)`, "u");

const CONNECT = new RegExp(
  `^(?:${literal(CONNECT_START_PATH)}|${literal(CONNECT_CALLBACK_PATH)})$`,
  "u",
);

const DOWNLOAD = new RegExp(
  `^${EXPORT_DOWNLOAD_PATH.split("{id}")
    .map((part) => literal(part))
    .join("[^/]+")}$`,
  "u",
);

const UNROUTED_PATHS: readonly PathRule[] = [
  {
    path: /^\/api\/(?:(?:tokens|logout|settings|password|export|restore)(?:\/|$)|items\/[^/]+\/(?:read-state$|note$|highlights(?:\/|$))|proposals\/[^/]+\/(?:accept|reject)$)/u,
    ownerOnly: true,
  },
  { path: /^\/api\/ai-tasks\/[^/]+\/(?:result|intake)$/u, callbackOnly: true },
  { path: CONNECT, cache: "private" },
  { path: FILES, cache: "file" },
  { path: DOWNLOAD, cache: "file" },
];

export function unroutedPlan(c: Ctx): Plan {
  const rules = UNROUTED_PATHS.filter(({ path }) => path.test(c.req.path));
  const reads =
    (c.req.method === "GET" || c.req.method === "HEAD") &&
    !rules.some((rule) => rule.ownerOnly === true);

  return {
    credentials: reads ? "read" : "owner",
    csrf: true,
    after: rules.some((rule) => rule.callbackOnly === true) ? "credential" : "next",
    cache: rules.find((rule) => rule.cache !== undefined)?.cache ?? null,
  };
}
