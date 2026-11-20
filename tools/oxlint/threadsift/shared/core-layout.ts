import { readFileSync } from "node:fs";
import { join, posix } from "node:path";

import { z } from "zod";

import { REPOSITORY_ROOT } from "./bindings.ts";

export type MessageId =
  | "higher"
  | "hidden"
  | "sibling"
  | "routeList"
  | "browser"
  | "server"
  | "unplaced"
  | "computed"
  | "computedServer";

export interface Violation {
  messageId: MessageId;
  data: Record<string, string>;
}

export type Kind = "base" | "featureCore" | "sharedHttp" | "featureHttp" | "routeList";

export interface Place {
  readonly kind: Kind;
  readonly folder: string;
  readonly feature: string | null;
  readonly name: string;
  readonly rank: number;
}

export const OPEN_FOLDERS = ["contract", "kernel", "compose"];

const CORE_ROOT = "src/core";
const SHARED_HTTP_ROOT = "src/http";
const FEATURES_ROOT = "src/features";
const BASE_FILE = /^src\/core\/([^/]+)\/([^/]+)$/u;
const FEATURE_FILE = /^src\/features\/([^/]+)\/(core|http)\/([^/]+)$/u;
const SHARED_HTTP_FILE = /^src\/http\/([^/]+)$/u;
const FEATURE_HTTP = /^src\/features\/[^/]+\/http\//u;
const ROUTE_LIST_FILES = new Set(["routes.ts", "app.ts"]);
const CONTRACT_FOLDER = "src/core/contract";
const TEST_SIDE_ROOTS = ["test/", "tools/", "smoke/"];
const BROWSER_ROOTS = ["web/", "extension/", "design/"];
export const SERVER_ROOTS = ["src/http/", "src/targets/"];
const EXTENSION_ROOT = "extension";
const EXTENSION_ALIAS = /^(?:@@?|~~?)\//u;

const NamesByFeature = z.record(z.string(), z.array(z.string()));

const LayoutSchema = z
  .object({
    order: z.array(z.string()),
    entries: NamesByFeature,
    testEntries: NamesByFeature,
  })
  .superRefine((found, context) => {
    const features = found.order.filter((folder) => !OPEN_FOLDERS.includes(folder));
    const expectedOrder = [...OPEN_FOLDERS.slice(0, 2), ...features, ...OPEN_FOLDERS.slice(2)];

    if (expectedOrder.join() !== found.order.join()) {
      context.addIssue({
        code: "custom",
        message: `order must be ${OPEN_FOLDERS.slice(0, 2).join(", ")}, the features, then ${OPEN_FOLDERS[2] ?? ""}`,
      });
    }

    for (const lists of ["entries", "testEntries"] as const) {
      const keys = Object.keys(found[lists]).toSorted();

      if (keys.join() !== features.toSorted().join()) {
        context.addIssue({
          code: "custom",
          message: `${lists} must have one key for each feature folder of order, and no other key`,
        });
      }
    }
  });

export const layout = LayoutSchema.parse(
  JSON.parse(readFileSync(join(REPOSITORY_ROOT, "tools/core-layout.json"), "utf8")),
);

const SHARED_HTTP_RANK = layout.order.length;
const FEATURE_HTTP_RANK = SHARED_HTTP_RANK + 1;
const ROUTE_LIST_RANK = SHARED_HTTP_RANK + 2;

function featureRank(feature: string): number {
  return layout.order.indexOf(feature);
}

function sharedHttpPlace(name: string): Place {
  const isRouteList = ROUTE_LIST_FILES.has(name);

  return {
    kind: isRouteList ? "routeList" : "sharedHttp",
    folder: "src/http",
    feature: null,
    name,
    rank: isRouteList ? ROUTE_LIST_RANK : SHARED_HTTP_RANK,
  };
}

function featurePlace(feature: string, half: string, name: string): Place | null {
  const rank = featureRank(feature);

  if (rank === -1 || OPEN_FOLDERS.includes(feature)) return null;

  return half === "core"
    ? { kind: "featureCore", folder: `${FEATURES_ROOT}/${feature}/core`, feature, name, rank }
    : {
        kind: "featureHttp",
        folder: `${FEATURES_ROOT}/${feature}/http`,
        feature,
        name,
        rank: FEATURE_HTTP_RANK,
      };
}

export function placeOf(path: string): Place | null {
  const [, folder = "", name = ""] = BASE_FILE.exec(path) ?? [];

  if (OPEN_FOLDERS.includes(folder)) {
    return {
      kind: "base",
      folder: `${CORE_ROOT}/${folder}`,
      feature: null,
      name,
      rank: featureRank(folder),
    };
  }

  const [, feature = "", half = "", file = ""] = FEATURE_FILE.exec(path) ?? [];

  if (feature !== "") return featurePlace(feature, half, file);

  const [, shared = ""] = SHARED_HTTP_FILE.exec(path) ?? [];

  return shared === "" ? null : sharedHttpPlace(shared);
}

export function isMisplaced(path: string): boolean {
  const underTree = [CORE_ROOT, FEATURES_ROOT, SHARED_HTTP_ROOT].some((root) =>
    path.startsWith(`${root}/`),
  );

  return underTree && placeOf(path) === null;
}

export function isCorePath(path: string): boolean {
  return (
    path === CORE_ROOT || path.startsWith(`${CORE_ROOT}/`) || path.startsWith(`${FEATURES_ROOT}/`)
  );
}

export function isTestSide(importer: string): boolean {
  return TEST_SIDE_ROOTS.some((root) => importer.startsWith(root));
}

export function resolveSpecifier(importer: string, specifier: string): string | null {
  if (specifier.startsWith(".")) return posix.join(posix.dirname(importer), specifier);

  if (importer.startsWith(`${EXTENSION_ROOT}/`) && EXTENSION_ALIAS.test(specifier)) {
    return posix.join(EXTENSION_ROOT, specifier.replace(EXTENSION_ALIAS, ""));
  }

  return null;
}

function isOpenTo(importer: string, { kind, feature, name }: Place): boolean {
  if (kind !== "featureCore" || feature === null) return true;

  const testEntries = isTestSide(importer) ? (layout.testEntries[feature] ?? []) : [];

  return (layout.entries[feature] ?? []).includes(name) || testEntries.includes(name);
}

export function isBrowserSide(importer: string): boolean {
  return BROWSER_ROOTS.some((root) => importer.startsWith(root));
}

function isHttp({ kind }: Place): boolean {
  return kind === "sharedHttp" || kind === "featureHttp" || kind === "routeList";
}

function hidden(importer: string, target: string, to: Place): Violation {
  return { messageId: "hidden", data: { importer, target, to: to.feature ?? "" } };
}

function violationOutside(importer: string, target: string, to: Place): Violation | null {
  const data = { importer, target, to: to.folder };

  if (isBrowserSide(importer)) {
    if (isHttp(to)) return { messageId: "server", data };

    return to.folder === CONTRACT_FOLDER ? null : { messageId: "browser", data };
  }

  if (to.kind === "featureHttp") return { messageId: "routeList", data };

  return isOpenTo(importer, to) ? null : hidden(importer, target, to);
}

function violationInside(
  importer: string,
  target: string,
  from: Place,
  to: Place,
): Violation | null {
  const data = { importer, target, from: from.folder, to: to.folder };

  if (from.kind === "featureHttp" && to.kind === "featureHttp" && from.feature !== to.feature) {
    return { messageId: "sibling", data };
  }

  if (to.rank > from.rank) return { messageId: "higher", data };

  if (from.feature !== null && from.feature === to.feature) return null;

  return isOpenTo(importer, to) ? null : hidden(importer, target, to);
}

export function isServerPath(path: string): boolean {
  return SERVER_ROOTS.some((root) => `${path}/`.startsWith(root)) || FEATURE_HTTP.test(path);
}

function violationOutsideTree(importer: string, target: string): Violation | null {
  return isServerPath(target) && isBrowserSide(importer)
    ? { messageId: "server", data: { importer, target } }
    : null;
}

export function violationOf(importer: string, target: string): Violation | null {
  const to = placeOf(target);

  if (to === null) return violationOutsideTree(importer, target);

  const from = placeOf(importer);

  return from === null
    ? violationOutside(importer, target, to)
    : violationInside(importer, target, from, to);
}
