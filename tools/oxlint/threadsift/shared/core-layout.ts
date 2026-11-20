import { readFileSync } from "node:fs";
import { join, posix } from "node:path";

import { z } from "zod";

import { REPOSITORY_ROOT } from "./bindings.ts";

export type MessageId =
  | "higher"
  | "hidden"
  | "browser"
  | "server"
  | "unplaced"
  | "computed"
  | "computedServer";

export interface Violation {
  messageId: MessageId;
  data: Record<string, string>;
}

export interface Place {
  folder: string;
  name: string;
}

export const OPEN_FOLDERS = ["contract", "kernel", "compose"];

const CORE = "src/core/";
const CONTRACT = "contract";
const TEST_SIDE_ROOTS = ["test/", "tools/", "smoke/"];
const BROWSER_ROOTS = ["web/", "extension/", "design/"];
export const SERVER_ROOTS = ["src/http/", "src/targets/"];
const EXTENSION_ROOT = "extension";
const EXTENSION_ALIAS = /^(?:@@?|~~?)\//u;

const NamesByFeature = z.record(z.string(), z.array(z.string()));

const LayoutSchema = z
  .object({
    order: z.array(z.string()),
    modules: z.record(z.string(), z.string()),
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

export function placeOf(path: string): Place | null {
  if (!path.startsWith(CORE)) return null;

  const rest = path.slice(CORE.length);
  const parts = rest.split("/");
  const [folder = "", name = ""] = parts;

  return parts.length === 2 ? { folder, name } : { folder: "", name: rest };
}

export function isPlaced({ folder, name }: Place): boolean {
  return layout.order.includes(folder) && layout.modules[name] === folder;
}

export function isCorePath(path: string): boolean {
  return path === CORE.slice(0, -1) || path.startsWith(CORE);
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

function isOpenTo(importer: string, { folder, name }: Place): boolean {
  if (OPEN_FOLDERS.includes(folder)) return true;

  const testEntries = isTestSide(importer) ? (layout.testEntries[folder] ?? []) : [];

  return (layout.entries[folder] ?? []).includes(name) || testEntries.includes(name);
}

export function isBrowserSide(importer: string): boolean {
  return BROWSER_ROOTS.some((root) => importer.startsWith(root));
}

function violationOutsideCore(importer: string, target: string, to: Place): Violation | null {
  const data = { importer, target, to: to.folder };

  if (isBrowserSide(importer)) {
    return to.folder === CONTRACT ? null : { messageId: "browser", data };
  }

  return isOpenTo(importer, to) ? null : { messageId: "hidden", data };
}

function violationInsideCore(
  importer: string,
  target: string,
  from: Place,
  to: Place,
): Violation | null {
  const data = { importer, target, from: from.folder, to: to.folder };
  const fromRank = layout.order.indexOf(from.folder);
  const toRank = layout.order.indexOf(to.folder);

  if (from.folder === to.folder || fromRank === -1 || toRank === -1) return null;

  if (toRank > fromRank) return { messageId: "higher", data };

  return isOpenTo(importer, to) ? null : { messageId: "hidden", data };
}

export function isServerPath(path: string): boolean {
  return SERVER_ROOTS.some((root) => `${path}/`.startsWith(root));
}

function violationOutsideSrcCore(importer: string, target: string): Violation | null {
  return isServerPath(target) && isBrowserSide(importer)
    ? { messageId: "server", data: { importer, target } }
    : null;
}

export function violationOf(importer: string, target: string): Violation | null {
  const to = placeOf(target);

  if (to === null) return violationOutsideSrcCore(importer, target);

  const from = placeOf(importer);

  return from === null
    ? violationOutsideCore(importer, target, to)
    : violationInsideCore(importer, target, from, to);
}
